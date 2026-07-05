import os
import requests
from openai import OpenAI
from datetime import datetime, timezone, timedelta

SF_API_KEY = os.environ["SF_API_KEY"]
ODDS_API_KEY = "a35f3bdb2c7921b336a60525900d40a3"

tz = timezone(timedelta(hours=8))
now = datetime.now(tz)
date_str = now.strftime("%Y-%m-%d %H:%M")
today = now.strftime("%Y-%m-%d")

client = OpenAI(
    api_key=SF_API_KEY,
    base_url="https://api.siliconflow.cn/v1"
)

# 北单/竞彩覆盖的主要联赛sport key
SPORTS = [
    "soccer_world_cup",
    "soccer_south_korea_k_league_1",
    "soccer_south_korea_k_league_2",
    "soccer_epl",
    "soccer_spain_la_liga",
    "soccer_germany_bundesliga",
    "soccer_italy_serie_a",
    "soccer_france_ligue_one",
    "soccer_netherlands_eredivisie",
    "soccer_portugal_primeira_liga",
    "soccer_usa_mls",
    "soccer_japan_j_league",
    "soccer_australia_aleague",
    "soccer_turkey_super_league",
    "soccer_norway_eliteserien",
    "soccer_sweden_allsvenskan",
    "soccer_denmark_superliga",
    "soccer_finland_veikkausliiga",
    "soccer_ireland_premier_division",
    "soccer_belgium_first_div",
    "soccer_scotland_premiership",
]

def get_odds(sport):
    try:
        url = "https://api.the-odds-api.com/v4/sports/" + sport + "/odds/"
        params = {
            "apiKey": ODDS_API_KEY,
            "regions": "eu,asia",
            "markets": "h2h,asian_handicap,totals",
            "oddsFormat": "decimal",
            "dateFormat": "iso",
        }
        r = requests.get(url, params=params, timeout=15)
        if r.status_code != 200:
            return []
        data = r.json()
        results = []
        for game in data:
            home = game.get("home_team", "")
            away = game.get("away_team", "")
            commence = game.get("commence_time", "")
            # 转换为北京时间
            try:
                from datetime import datetime as dt
                utc_time = dt.fromisoformat(commence.replace("Z", "+00:00"))
                bj_time = utc_time.astimezone(tz)
                time_str = bj_time.strftime("%m-%d %H:%M")
            except:
                time_str = commence[:16]

            # 只取今天的比赛
            if today not in time_str and today not in commence:
                try:
                    if bj_time.strftime("%Y-%m-%d") != today:
                        continue
                except:
                    continue

            h2h = ""
            asian = ""
            total = ""

            for bk in game.get("bookmakers", []):
                for market in bk.get("markets", []):
                    if market["key"] == "h2h" and not h2h:
                        odds_vals = {o["name"]: o["price"] for o in market["outcomes"]}
                        h2h = "欧赔 主" + str(odds_vals.get(home, "?")) + " 平" + str(odds_vals.get("Draw", "?")) + " 客" + str(odds_vals.get(away, "?"))
                    if market["key"] == "asian_handicap" and not asian:
                        outs = market["outcomes"][:2] if market["outcomes"] else []
                        if len(outs) >= 2:
                            asian = "亚盘 " + str(outs[0].get("point", "")) + "@" + str(outs[0].get("price", "")) + " / " + str(outs[1].get("point", "")) + "@" + str(outs[1].get("price", ""))
                    if market["key"] == "totals" and not total:
                        outs = {o["name"]: o["price"] for o in market["outcomes"]}
                        total = "大小球 大@" + str(outs.get("Over", "?")) + " 小@" + str(outs.get("Under", "?"))

            line = "[" + time_str + "] " + home + " vs " + away
            if h2h:
                line += " | " + h2h
            if asian:
                line += " | " + asian
            if total:
                line += " | " + total
            results.append(line)
        return results
    except Exception as e:
        print("Error " + sport + ": " + str(e))
        return []

print("开始拉取数据: " + date_str)
all_matches = []

for sport in SPORTS:
    matches = get_odds(sport)
    if matches:
        sport_name = sport.replace("soccer_", "").replace("_", " ").title()
        all_matches.append("\n[" + sport_name + "]")
        all_matches.extend(matches)
        print(sport_name + ": " + str(len(matches)) + " 场")

data_text = "\n".join(all_matches) if all_matches else "今日暂无赛事数据"
print("\n数据预览:\n" + data_text[:800])

msg = "你是顶级足球盘口分析师，精通欧亚盘、水位解读、大小球分析。现在北京时间 " + date_str + "\n\n"
msg += "今日全部赛事数据（含欧赔+亚盘+大小球）:\n" + data_text + "\n\n"
msg += "已验证规律:\n"
msg += "1. 亚盘水位接近1.00意味着比分偏小\n"
msg += "2. 弱队欧赔低于10.0必须考虑进球可能\n"
msg += "3. 平手盘水位0.82以下是极强主队信号\n"
msg += "4. 受让方水位越低代表庄家越看好强队\n"
msg += "5. 防守型球队参与的比赛小球概率更高\n\n"
msg += "请生成完整专业HTML足球看盘页面，要求:\n\n"
msg += "内容要求（每场必须包含）:\n"
msg += "- 球队名称+国旗emoji\n"
msg += "- 欧赔三方真实概率（去除5%抽水反推）\n"
msg += "- 亚盘水位信号解读（强/中/弱信号）\n"
msg += "- 大小球概率分析\n"
msg += "- 精准比分三选: 主推/次选/保险（含概率%）\n"
msg += "- 冷门指数: ★☆标注1-5星\n"
msg += "- 一句话verdict\n\n"
msg += "设计要求:\n"
msg += "- 背景#080B0F 卡片#0D1117 边框#21262D\n"
msg += "- 金色#F0B429 绿#3FB950 红#F85149 蓝#58A6FF\n"
msg += "- 三方胜率进度条（CSS动画从0增长）\n"
msg += "- 大小球双色条（绿大球/红小球）\n"
msg += "- 冷门3星以上红色左边框3px\n"
msg += "- 顶部实时北京时间时钟（JS每秒刷新）\n"
msg += "- 顶部统计栏: 今日场次/高信心场/冷门预警\n"
msg += "- 按联赛分组显示\n"
msg += "- 最大宽度900px居中\n"
msg += "- 完全响应式\n"
msg += "- 零外部依赖\n\n"
msg += "只输出完整HTML，从<!DOCTYPE html>开始，无任何解释文字。"

response = client.chat.completions.create(
    model="Qwen/Qwen2.5-72B-Instruct",
    messages=[{"role": "user", "content": msg}],
    max_tokens=8000,
    temperature=0.1
)

html = response.choices[0].message.content.strip()

for tag in ["```html", "```HTML", "```"]:
    if tag in html:
        parts = html.split(tag)
        html = (parts[1] if len(parts) >= 3 else parts[-1]).strip()
        break

idx = html.find("<!DOCTYPE")
if idx > 0:
    html = html[idx:]

os.makedirs("output", exist_ok=True)
with open("output/index.html", "w", encoding="utf-8") as f:
    f.write(html)

print("生成完成！字符数: " + str(len(html)))
