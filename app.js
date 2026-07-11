// ===== CONFIG =====
const ODDS_API_KEY = 'a35f3bdb2c7921b336a60525900d40a3';
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4/sports';

// 北单覆盖联赛
const SPORTS = [
  { key: 'soccer_world_cup',              name: '世界杯',  flag: '🌍', color: '#F0B429' },
  { key: 'soccer_south_korea_k_league_1', name: '韩K联',   flag: '🇰🇷', color: '#10b981' },
  { key: 'soccer_south_korea_k_league_2', name: '韩K2联',  flag: '🇰🇷', color: '#059669' },
  { key: 'soccer_epl',                    name: '英超',    flag: '🏴', color: '#9333ea' },
  { key: 'soccer_spain_la_liga',          name: '西甲',    flag: '🇪🇸', color: '#ef4444' },
  { key: 'soccer_germany_bundesliga',     name: '德甲',    flag: '🇩🇪', color: '#f59e0b' },
  { key: 'soccer_italy_serie_a',          name: '意甲',    flag: '🇮🇹', color: '#3b82f6' },
  { key: 'soccer_france_ligue_one',       name: '法甲',    flag: '🇫🇷', color: '#1d4ed8' },
  { key: 'soccer_norway_eliteserien',     name: '挪超',    flag: '🇳🇴', color: '#0284c7' },
  { key: 'soccer_sweden_allsvenskan',     name: '瑞典超',  flag: '🇸🇪', color: '#06b6d4' },
  { key: 'soccer_finland_veikkausliiga',  name: '芬超',    flag: '🇫🇮', color: '#22c55e' },
  { key: 'soccer_ireland_premier_division', name: '爱超',  flag: '🇮🇪', color: '#16a34a' },
  { key: 'soccer_denmark_superliga',      name: '丹超',    flag: '🇩🇰', color: '#dc2626' },
  { key: 'soccer_belgium_first_div',      name: '比甲',    flag: '🇧🇪', color: '#d97706' },
  { key: 'soccer_netherlands_eredivisie', name: '荷甲',    flag: '🇳🇱', color: '#f97316' },
  { key: 'soccer_brazil_campeonato',      name: '巴西甲',  flag: '🇧🇷', color: '#15803d' },
  { key: 'soccer_usa_mls',               name: 'MLS',     flag: '🇺🇸', color: '#0ea5e9' },
  { key: 'soccer_japan_j_league',        name: '日职联',  flag: '🇯🇵', color: '#7c3aed' },
];

// ===== STATE =====
let allMatches = [];
let currentFilter = 'all';

// ===== CLOCK =====
function updateClock() {
  const now = new Date();
  const bjOffset = 8 * 60 * 60 * 1000;
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const bj = new Date(utc + bjOffset);
  const pad = n => String(n).padStart(2, '0');
  document.getElementById('clock').textContent =
    `${pad(bj.getHours())}:${pad(bj.getMinutes())}:${pad(bj.getSeconds())}`;
}
setInterval(updateClock, 1000);
updateClock();

// ===== RULES PANEL =====
function toggleRules() {
  const body = document.getElementById('rulesBody');
  const toggle = document.getElementById('rulesToggle');
  body.classList.toggle('open');
  toggle.classList.toggle('open');
}

// ===== FILTER =====
function filterLeague(key, btn) {
  currentFilter = key;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderMatches(allMatches);
}

// ===== FETCH FROM ODDSAPI =====
async function fetchOdds() {
  const btn = document.querySelector('.btn-refresh');
  const icon = document.getElementById('refreshIcon');
  btn.disabled = true;
  icon.style.animation = 'spin 0.75s linear infinite';
  icon.style.display = 'inline-block';

  showLoading('正在拉取今日赔率数据...');

  const today = getBJToday();
  const fetched = [];
  let errors = 0;

  for (const sport of SPORTS) {
    try {
      const url = `${ODDS_API_BASE}/${sport.key}/odds/?apiKey=${ODDS_API_KEY}&regions=eu,asia&markets=h2h,asian_handicap,totals&oddsFormat=decimal&dateFormat=iso`;
      const res = await fetch(url);
      if (!res.ok) { errors++; continue; }
      const data = await res.json();

      for (const game of data) {
        const bjTime = utcToBJ(game.commence_time);
        if (!bjTime || bjTime.date !== today) continue;

        const parsed = parseGame(game, sport, bjTime.time);
        if (parsed) fetched.push(parsed);
      }
    } catch (e) {
      errors++;
    }
  }

  btn.disabled = false;
  icon.style.animation = '';

  if (fetched.length === 0) {
    showError(errors > 0
      ? `API拉取失败（${errors}个联赛出错）。请检查网络或手动输入数据。`
      : '今日暂无赛事数据，可能是非赛季期间。请使用手动输入。'
    );
    return;
  }

  allMatches = fetched;
  updateStats(fetched);
  renderMatches(fetched);
}

// ===== PARSE GAME FROM API =====
function parseGame(game, sport, timeStr) {
  const home = game.home_team;
  const away = game.away_team;

  let homeOdds = null, drawOdds = null, awayOdds = null;
  let handicapLine = null, handicapHomeOdds = null, handicapAwayOdds = null;
  let totalLine = null, overOdds = null, underOdds = null;

  for (const bk of (game.bookmakers || [])) {
    for (const mkt of (bk.markets || [])) {
      if (mkt.key === 'h2h' && !homeOdds) {
        const vals = {};
        for (const o of mkt.outcomes) vals[o.name] = o.price;
        homeOdds = vals[home];
        drawOdds = vals['Draw'];
        awayOdds = vals[away];
      }
      if (mkt.key === 'asian_handicap' && !handicapLine) {
        const outs = mkt.outcomes;
        if (outs && outs.length >= 2) {
          const homeOut = outs.find(o => o.name === home) || outs[0];
          handicapLine = homeOut.point;
          handicapHomeOdds = homeOut.price;
          const awayOut = outs.find(o => o.name === away) || outs[1];
          handicapAwayOdds = awayOut.price;
        }
      }
      if (mkt.key === 'totals' && !totalLine) {
        const vals = {};
        for (const o of mkt.outcomes) vals[o.name] = o.price;
        overOdds = vals['Over'];
        underOdds = vals['Under'];
        const out = mkt.outcomes[0];
        if (out) totalLine = out.point;
      }
    }
    if (homeOdds && handicapLine !== null && totalLine !== null) break;
  }

  if (!homeOdds || !drawOdds || !awayOdds) return null;

  return buildMatch({
    league: sport.name,
    leagueColor: sport.color,
    leagueFlag: sport.flag,
    time: timeStr,
    home, away,
    homeOdds, drawOdds, awayOdds,
    handicapLine, handicapHomeOdds, handicapAwayOdds,
    totalLine, overOdds, underOdds,
    isWorldCup: sport.key === 'soccer_world_cup',
  });
}

// ===== PARSE MANUAL INPUT =====
function parseManual() {
  const text = document.getElementById('manualText').value.trim();
  if (!text) return;

  const lines = text.split('\n').filter(l => l.trim());
  const matches = [];

  for (const line of lines) {
    const m = parseManualLine(line.trim());
    if (m) matches.push(m);
  }

  if (matches.length === 0) {
    alert('未能解析任何数据，请检查格式');
    return;
  }

  allMatches = matches;
  hideManualInput();
  updateStats(matches);
  renderMatches(matches);
}

function parseManualLine(line) {
  // Format: 联赛 时间 主队 vs 客队 x.xx/x.xx/x.xx [让球]
  const parts = line.split(/\s+/);
  const vsIdx = parts.findIndex(p => p.toLowerCase() === 'vs');
  if (vsIdx < 2) return null;

  const league = parts[0];
  const time = parts[1];
  const home = parts.slice(2, vsIdx).join(' ');

  let oddsStr = '', awayParts = [], handicapStr = '';

  for (let i = vsIdx + 1; i < parts.length; i++) {
    if (parts[i].includes('/') && parts[i].split('/').length === 3) {
      oddsStr = parts[i];
      awayParts = parts.slice(vsIdx + 1, i);
      handicapStr = parts.slice(i + 1).join(' ');
      break;
    }
  }

  if (!oddsStr) return null;

  const away = awayParts.join(' ');
  const [hoStr, drStr, awStr] = oddsStr.split('/');
  const homeOdds = parseFloat(hoStr);
  const drawOdds = parseFloat(drStr);
  const awayOdds = parseFloat(awStr);

  if (isNaN(homeOdds) || isNaN(drawOdds) || isNaN(awayOdds)) return null;

  // Parse handicap
  let handicapLine = null;
  if (handicapStr.includes('-2')) handicapLine = -2;
  else if (handicapStr.includes('-1')) handicapLine = -1;
  else if (handicapStr.includes('+2')) handicapLine = 2;
  else if (handicapStr.includes('+1')) handicapLine = 1;
  else if (handicapStr.includes('平手') || handicapStr.includes('0')) handicapLine = 0;

  const sportInfo = SPORTS.find(s =>
    s.name.includes(league) || league.includes(s.name)
  ) || { color: '#7D8590', flag: '⚽' };

  return buildMatch({
    league, time, home, away,
    leagueColor: sportInfo.color,
    leagueFlag: sportInfo.flag,
    homeOdds, drawOdds, awayOdds,
    handicapLine, handicapHomeOdds: null, handicapAwayOdds: null,
    totalLine: null, overOdds: null, underOdds: null,
    isWorldCup: league.includes('世界杯'),
  });
}

// ===== BUILD MATCH OBJECT =====
function buildMatch(d) {
  // True probabilities
  const overround = 1/d.homeOdds + 1/d.drawOdds + 1/d.awayOdds;
  const homeProb = Math.round((1/d.homeOdds / overround) * 100);
  const drawProb = Math.round((1/d.drawOdds / overround) * 100);
  const awayProb = 100 - homeProb - drawProb;

  // Big/small
  const weakOdds = Math.max(d.homeOdds, d.awayOdds);
  const hotOdds  = Math.min(d.homeOdds, d.awayOdds);
  let bigProb = 52;

  // Rule: weak team odds < 10 → more goals expected
  if (weakOdds < 10 && weakOdds > 5) bigProb += 7;
  if (weakOdds <= 5 && weakOdds > 3) bigProb += 4;
  // Rule: strong hot < 1.7 → big score likely
  if (hotOdds < 1.7) bigProb += 10;
  else if (hotOdds < 2.0) bigProb += 6;
  // Rule: high draw prob → fewer goals
  if (drawProb > 30) bigProb -= 10;
  else if (drawProb > 25) bigProb -= 5;
  // Handicap boost
  if (d.handicapLine !== null) {
    if (Math.abs(d.handicapLine) >= 2) bigProb += 8;
    else if (Math.abs(d.handicapLine) >= 1) bigProb += 4;
  }
  // Rule: big score likely in over/under
  if (d.overOdds && d.underOdds) {
    const ou = 1/d.overOdds / (1/d.overOdds + 1/d.underOdds);
    bigProb = Math.round(bigProb * 0.4 + ou * 100 * 0.6);
  }

  bigProb = Math.min(83, Math.max(28, bigProb));
  const smallProb = 100 - bigProb;

  // Handicap signal
  const { signalMain, signalSub, signalClass } = analyzeHandicap(d, homeProb, awayProb, drawProb);

  // Upset risk
  const upsetRisk = calcUpset(homeProb, awayProb, drawProb, d.homeOdds, d.awayOdds, d.handicapLine);

  // Score predictions
  const scores = predictScores(homeProb, drawProb, awayProb, d.homeOdds, d.awayOdds, weakOdds, bigProb, d.handicapLine);

  // Verdict
  const verdict = generateVerdict(homeProb, drawProb, awayProb, d.homeOdds, d.awayOdds, bigProb, d.handicapLine, upsetRisk, d.home, d.away);

  // Handicap display
  let handicapDisplay = '-';
  if (d.handicapLine !== null) {
    const sign = d.handicapLine > 0 ? '+' : '';
    handicapDisplay = `主队${sign}${d.handicapLine}球`;
  }

  return {
    ...d,
    homeProb, drawProb, awayProb,
    bigProb, smallProb,
    signalMain, signalSub, signalClass,
    upsetRisk, scores, verdict,
    handicapDisplay,
  };
}

// ===== HANDICAP ANALYSIS =====
function analyzeHandicap(d, homeProb, awayProb, drawProb) {
  const { handicapLine: hl, homeOdds, awayOdds } = d;

  if (hl === null) {
    if (drawProb > 32) return { signalMain: `⚠️ 平局概率${drawProb}%偏高`, signalSub: '建议以平局为次选', signalClass: 'warn' };
    return { signalMain: '标准盘口', signalSub: '无让球信息', signalClass: '' };
  }

  // Home giving handicap (negative)
  if (hl < 0) {
    const hmOdds = homeOdds;
    if (hmOdds > 3.5) {
      return {
        signalMain: `🚨 让${Math.abs(hl)}球水位${hmOdds}偏高`,
        signalSub: '极强警示！主队无把握赢' + Math.abs(hl) + '球以上',
        signalClass: 'danger',
      };
    } else if (hmOdds < 2.0) {
      return {
        signalMain: `✅ 让${Math.abs(hl)}球水位${hmOdds}强信号`,
        signalSub: '庄家极度看好主队赢盘',
        signalClass: 'good',
      };
    } else {
      return {
        signalMain: `让${Math.abs(hl)}球 中等信号`,
        signalSub: `水位${hmOdds}，主队有一定把握`,
        signalClass: '',
      };
    }
  }

  // Away giving handicap (positive = home receiving)
  if (hl > 0) {
    const awOdds = awayOdds;
    if (awOdds < 2.0) {
      return {
        signalMain: `✅ 受让${hl}球客队仍${awOdds}热门`,
        signalSub: '客队强热门，受让后仍占优',
        signalClass: 'good',
      };
    } else {
      return {
        signalMain: `受让${hl}球盘`,
        signalSub: `客队赔率${awOdds}，均衡偏客队`,
        signalClass: '',
      };
    }
  }

  return { signalMain: '平手盘', signalSub: '双方实力接近', signalClass: '' };
}

// ===== UPSET RISK =====
function calcUpset(homeP, awayP, drawP, homeO, awayO, hl) {
  let risk = 1;
  if (drawP > 32) risk += 1;
  if (drawP > 28) risk += 0.5;
  if (Math.abs(homeP - awayP) < 12) risk += 1;
  // Handicap warning
  if (hl !== null && Math.abs(hl) >= 1) {
    const givingOdds = hl < 0 ? homeO : awayO;
    if (givingOdds > 3.5) risk += 2;
    else if (givingOdds > 2.8) risk += 1;
  }
  if (Math.max(homeO, awayO) < 8 && Math.min(homeO, awayO) > 2.5) risk += 0.5;
  return Math.min(5, Math.round(risk));
}

// ===== SCORE PREDICTION =====
function predictScores(homeP, drawP, awayP, homeO, awayO, weakO, bigP, hl) {
  const main = {}, second = {}, safe = {};

  // High draw probability
  if (drawP > 30 && Math.abs(homeP - awayP) < 18) {
    Object.assign(main,   { score: '1–1', pct: Math.min(28, drawP) });
    Object.assign(second, { score: '0–0', pct: Math.max(12, drawP - 10) });
    Object.assign(safe,   { score: homeP > awayP ? '2–1' : '1–2', pct: 12 });
    return [main, second, safe];
  }

  if (homeP > awayP + 10) {
    // Home win scenarios
    if (homeO < 1.6) {
      Object.assign(main,   { score: '3–1', pct: 20 });
      Object.assign(second, { score: '3–0', pct: 16 });
      Object.assign(safe,   { score: '2–0', pct: 14 });
    } else if (homeO < 2.0) {
      const awayGoal = weakO < 10 ? '1' : '0';
      Object.assign(main,   { score: `2–${awayGoal}`, pct: 21 });
      Object.assign(second, { score: '2–0', pct: 17 });
      Object.assign(safe,   { score: '3–1', pct: 11 });
    } else {
      Object.assign(main,   { score: '2–1', pct: 20 });
      Object.assign(second, { score: '1–0', pct: 17 });
      Object.assign(safe,   { score: '1–1', pct: 14 });
    }
  } else if (awayP > homeP + 10) {
    // Away win scenarios
    if (awayO < 1.6) {
      Object.assign(main,   { score: '0–3', pct: 19 });
      Object.assign(second, { score: '1–3', pct: 15 });
      Object.assign(safe,   { score: '0–2', pct: 14 });
    } else if (awayO < 2.0) {
      const homeGoal = weakO < 10 ? '1' : '0';
      Object.assign(main,   { score: `${homeGoal}–2`, pct: 20 });
      Object.assign(second, { score: '0–2', pct: 16 });
      Object.assign(safe,   { score: '1–3', pct: 11 });
    } else {
      Object.assign(main,   { score: '1–2', pct: 19 });
      Object.assign(second, { score: '0–1', pct: 16 });
      Object.assign(safe,   { score: '1–1', pct: 14 });
    }
  } else {
    // Close match
    if (homeP >= awayP) {
      Object.assign(main,   { score: '1–1', pct: 22 });
      Object.assign(second, { score: '2–1', pct: 17 });
      Object.assign(safe,   { score: '1–0', pct: 14 });
    } else {
      Object.assign(main,   { score: '1–1', pct: 22 });
      Object.assign(second, { score: '1–2', pct: 17 });
      Object.assign(safe,   { score: '0–1', pct: 14 });
    }
  }

  return [main, second, safe];
}

// ===== VERDICT =====
function generateVerdict(homeP, drawP, awayP, homeO, awayO, bigP, hl, upsetRisk, home, away) {
  const hotTeam = homeP > awayP ? home : away;
  const hotOdds = Math.min(homeO, awayO);

  if (drawP > 32) {
    return `平局概率${drawP}%是三方最高，小球结构为主，1–1或0–0平局是最可能结果。`;
  }

  if (hl !== null && Math.abs(hl) >= 1) {
    const givingOdds = hl < 0 ? homeO : awayO;
    if (givingOdds > 3.5) {
      const side = hl < 0 ? '主队' : '客队';
      return `⚠️ ${side}让${Math.abs(hl)}球赔率${givingOdds}极高警示，庄家对让球方没有把握，建议押对手或平局。`;
    }
  }

  if (hotOdds < 1.6) {
    return `${hotTeam}极强热门（赔率${hotOdds.toFixed(2)}），${bigP > 65 ? '大球大比分' : '小比分'}主导，弱队仍有进球可能。`;
  }

  if (upsetRisk >= 4) {
    return `冷门风险极高（${upsetRisk}星），双方实力接近，平局和冷门方均需认真考虑，建议谨慎。`;
  }

  const bigSmall = bigP > 58 ? `大球${bigP}%偏向` : `小球${100-bigP}%偏向`;
  return `${hotTeam}占优，${bigSmall}，含弱队进球结构更合理（弱队赔率规律验证率100%）。`;
}

// ===== RENDER =====
function renderMatches(matches) {
  const container = document.getElementById('matchesContainer');

  // Filter
  let filtered = matches;
  if (currentFilter !== 'all') {
    filtered = matches.filter(m => m.league.includes(currentFilter));
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div class="loading-state">
      <div style="font-size:32px">🔍</div>
      <div class="loading-text">该联赛今日暂无赛事</div>
    </div>`;
    return;
  }

  // Group by league
  const groups = {};
  for (const m of filtered) {
    if (!groups[m.league]) groups[m.league] = { color: m.leagueColor, flag: m.leagueFlag, matches: [] };
    groups[m.league].matches.push(m);
  }

  // Sort: world cup first
  const sorted = Object.entries(groups).sort(([a], [b]) => {
    if (a === '世界杯') return -1;
    if (b === '世界杯') return 1;
    return 0;
  });

  let html = '';
  for (const [league, group] of sorted) {
    html += `<div class="league-group">
      <div class="league-header">
        <div class="league-dot" style="background:${group.color}"></div>
        <div class="league-name" style="color:${group.color}">${group.flag} ${league}</div>
        <div class="league-count">${group.matches.length} 场</div>
      </div>
      <div class="league-cards">
        ${group.matches.map(m => buildCardHTML(m)).join('')}
      </div>
    </div>`;
  }

  container.innerHTML = html;

  // Animate bars after render
  requestAnimationFrame(() => {
    document.querySelectorAll('.home-bar').forEach(el => {
      el.style.width = el.dataset.width + '%';
    });
    document.querySelectorAll('.draw-bar').forEach(el => {
      el.style.width = el.dataset.width + '%';
    });
    document.querySelectorAll('.away-bar').forEach(el => {
      el.style.width = el.dataset.width + '%';
    });
    document.querySelectorAll('.big-fill').forEach(el => {
      el.style.width = el.dataset.width + '%';
    });
  });
}

function buildCardHTML(m) {
  const upsetClass = m.upsetRisk >= 4 ? 'upset-high' : m.upsetRisk >= 3 ? 'upset-med' : m.isWorldCup ? 'worldcup' : '';
  const upsetColor = m.upsetRisk >= 4 ? '#F85149' : m.upsetRisk >= 3 ? '#F0B429' : '#3FB950';
  const upsetStars = '★'.repeat(m.upsetRisk) + '☆'.repeat(5 - m.upsetRisk);

  const tagStyle = `color:${m.leagueColor};border-color:${m.leagueColor}30;background:${m.leagueColor}15`;

  const sigColor = m.signalClass === 'danger' ? '#F85149' :
                   m.signalClass === 'good'   ? '#3FB950' :
                   m.signalClass === 'warn'   ? '#F0B429' : '#7D8590';

  const [s1, s2, s3] = m.scores;

  return `
  <div class="match-card ${upsetClass}">
    <div class="card-top">
      <div class="league-tag" style="${tagStyle}">${m.league}</div>
      <div class="match-time">⏰ ${m.time}</div>
      <div class="upset-badge" style="color:${upsetColor}">${upsetStars} 冷门${m.upsetRisk}星</div>
    </div>
    <div class="card-body">
      <div class="teams">
        <div class="team home-team">${m.home}</div>
        <div class="score-vs">VS</div>
        <div class="team away-team">${m.away}</div>
      </div>

      <div class="prob-bars">
        <div class="prob-row">
          <span class="prob-label">主胜</span>
          <div class="bar-track">
            <div class="bar-fill home-bar" data-width="${m.homeProb}" style="width:0%"></div>
          </div>
          <span class="prob-val home-val">${m.homeProb}%</span>
        </div>
        <div class="prob-row">
          <span class="prob-label">平局</span>
          <div class="bar-track">
            <div class="bar-fill draw-bar" data-width="${m.drawProb}" style="width:0%"></div>
          </div>
          <span class="prob-val draw-val">${m.drawProb}%</span>
        </div>
        <div class="prob-row">
          <span class="prob-label">客胜</span>
          <div class="bar-track">
            <div class="bar-fill away-bar" data-width="${m.awayProb}" style="width:0%"></div>
          </div>
          <span class="prob-val away-val">${m.awayProb}%</span>
        </div>
      </div>

      <div class="odds-chips">
        <div class="chip">主 <span>${m.homeOdds}</span></div>
        <div class="chip">平 <span>${m.drawOdds}</span></div>
        <div class="chip">客 <span>${m.awayOdds}</span></div>
        <div class="chip chip-asian">让球 <span>${m.handicapDisplay}</span></div>
        ${m.totalLine ? `<div class="chip">大小 <span>${m.totalLine}球</span></div>` : ''}
      </div>

      <div class="analysis-grid">
        <div class="analysis-box">
          <div class="analysis-title">大小球分析</div>
          <div class="bigsmall-bar">
            <div class="big-fill" data-width="${m.bigProb}" style="width:0%"></div>
            <div class="small-fill"></div>
          </div>
          <div class="bigsmall-labels">
            <span class="big-pct">大球 ${m.bigProb}%</span>
            <span class="small-pct">小球 ${m.smallProb}%</span>
          </div>
        </div>
        <div class="analysis-box">
          <div class="analysis-title">水位信号</div>
          <div class="signal-main" style="color:${sigColor}">${m.signalMain}</div>
          <div class="signal-sub">${m.signalSub}</div>
        </div>
      </div>

      <div class="scores-section">
        <div class="scores-title">精准比分推演</div>
        <div class="scores-chips">
          <div class="score-chip main-score">
            <span class="score-tag">主推</span>
            <span class="score-val">${s1.score}</span>
            <span class="score-pct">${s1.pct}%</span>
          </div>
          <div class="score-chip second-score">
            <span class="score-tag">次选</span>
            <span class="score-val">${s2.score}</span>
            <span class="score-pct">${s2.pct}%</span>
          </div>
          <div class="score-chip safe-score">
            <span class="score-tag">保险</span>
            <span class="score-val">${s3.score}</span>
            <span class="score-pct">${s3.pct}%</span>
          </div>
        </div>
      </div>

      <div class="verdict-box">${m.verdict}</div>
    </div>
  </div>`;
}

// ===== STATS =====
function updateStats(matches) {
  document.getElementById('statTotal').textContent = matches.length;
  document.getElementById('statBig').textContent = matches.filter(m => m.bigProb > 60).length;
  document.getElementById('statDraw').textContent = matches.filter(m => m.drawProb > 30).length;
  document.getElementById('statUpset').textContent = matches.filter(m => m.upsetRisk >= 3).length;
}

// ===== DEMO DATA =====
function loadDemo() {
  const demoText = `世界杯 04:50 挪威 vs 英格兰 3.93/3.74/1.89 让+1
世界杯 08:50 阿根廷 vs 瑞士 1.68/3.61/5.53 让-1
韩K联 18:20 光州FC vs 浦项铁人 5.84/3.60/1.57 让+1
韩K2联 18:20 安山小绿人 vs 水原三星 7.26/4.53/1.35 让+1
韩K2联 18:20 大邱FC vs 城南FC 1.85/3.32/3.86 让-1
韩K2联 18:20 华城FC vs 坡州前线 1.83/3.33/3.90 让-1
挪超 19:50 腓特烈斯塔 vs 利勒斯特罗姆 2.88/3.34/2.32
芬超 19:50 拉赫蒂 vs 赫尔辛基 3.07/3.60/2.08
瑞典超 20:50 米亚尔比 vs 索尔纳 1.94/3.61/3.50
芬甲 20:50 哈卡 vs EIF埃克纳斯 1.51/4.11/5.13 让-1
爱超 23:50 戈尔韦联 vs 斯莱戈流浪者 1.68/3.77/4.43 让-1`;

  document.getElementById('manualText').value = demoText;
  showManualInput();
}

// ===== UI HELPERS =====
function showManualInput() {
  document.getElementById('manualInput').style.display = 'block';
  document.getElementById('manualInput').scrollIntoView({ behavior: 'smooth' });
}

function hideManualInput() {
  document.getElementById('manualInput').style.display = 'none';
}

function showLoading(msg) {
  document.getElementById('matchesContainer').innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <div class="loading-text">${msg}</div>
    </div>`;
}

function showError(msg) {
  document.getElementById('matchesContainer').innerHTML = `
    <div class="error-state">⚠️ ${msg}</div>
    <div class="welcome-state">
      <div class="welcome-icon">✏️</div>
      <div class="welcome-title">手动输入数据</div>
      <div class="welcome-sub">将北单赛事数据复制粘贴到下方</div>
      <div class="welcome-actions">
        <button class="btn-primary" onclick="showManualInput()">✏️ 手动输入</button>
        <button class="btn-secondary" onclick="loadDemo()">📋 加载演示</button>
      </div>
    </div>`;
}

// ===== DATE HELPERS =====
function getBJToday() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const bj = new Date(utc + 8 * 3600000);
  return bj.toISOString().slice(0, 10);
}

function utcToBJ(isoStr) {
  if (!isoStr) return null;
  try {
    const d = new Date(isoStr);
    const utc = d.getTime() + d.getTimezoneOffset() * 60000;
    const bj = new Date(utc + 8 * 3600000);
    const pad = n => String(n).padStart(2, '0');
    return {
      date: bj.toISOString().slice(0, 10),
      time: `${pad(bj.getHours())}:${pad(bj.getMinutes())}`,
    };
  } catch { return null; }
}
