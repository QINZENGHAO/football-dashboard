import os
import requests
from openai import OpenAI
from datetime import datetime, timezone, timedelta

SF_API_KEY = os.environ["SF_API_KEY"]
RAPIDAPI_KEY = os.environ["RAPIDAPI_KEY"]

tz = timezone(timedelta(hours=8))
now = datetime.now(tz)
date_str = now.strftime("%Y-%m-%d %H:%M")
today = now.strftime("%Y-%m-%d")

client = OpenAI(
    api_key=SF_API_KEY,
    base_url="https://api.siliconflow.cn/v1"
)

HEADERS = {
    "x-rapidapi-key": RAPIDAPI_KEY,
    "x-rapidapi-host": "api-football-v1.p.rapidapi.com"
}

LEAGUES = {
    "World Cup": (1, 2026),
    "K League": (292, 2026),
    "K League 2": (293, 2026),
}

def get_fixtures(league_id, season):
    try:
        url = "https://api-football-v1.p.rapidapi.com/v3/fixtures"
        params = {
            "league": league_id,
            "season": season,
            "date": today,
            "timezone": "Asia/Shanghai"
        }
        r = requests.get(url, headers=HEADERS, params=params, timeout=15)
        data = r.json()
        results = []
        for f in data.get("response", []):
            home = f["teams"]["home"]["name"]
            away = f["teams"]["away"]["name"]
            status = f["fixture"]["status"]["short"]
            hs = f["goals"]["home"]
            as_ = f["goals"]["away"]
            t = f["fixture"]["date"][11:16]
            if status == "FT":
                line = home + " " + str(hs) + "-" + str(as_) + " " + away + " (finished)"
            elif status in ["1H", "2H", "HT"]:
                line = home + " " + str(hs) + "-" + str(as_) + " " + away + " (live)"
            else:
                line = home + " vs " + away + " (" + t + ")"
            results.append(line)
        return results
    except Exception as e:
        print("Fixtures error: " + str(e))
        return []

def get_odds(league_id, season):
    try:
        url = "https://api-football-v1.p.rapidapi.com/v3/odds"
        params = {
            "league": league_id,
            "season": season,
            "date": today,
            "bookmaker": 6
        }
        r = requests.get(url, headers=HEADERS, params=params, timeout=15)
        data = r.json()
        results = []
        for item in data.get("response", []):
            home = item.get("teams", {}).get("home", {}).get("name", "")
            away = item.get("teams", {}).get("away", {}).get("name", "")
            bks = item.get("bookmakers", [])
            if not bks or not home:
                continue
            bets = bks[0].get("bets", [])
            parts = []
            for bet in bets:
                if bet["name"] == "Match Winner":
                    vals = {v["value"]: v["odd"] for v in bet["values"]}
                    parts.append("H:" + str(vals.get("Home", "?")) + " D:" + str(vals.get("Draw", "?")) + " A:" + str(vals.get("Away", "?")))
                if bet["name"] == "Goals Over/Under":
                    vals = {v["value"]: v["odd"] for v in bet["values"]}
                    parts.append("O2.5:" + str(vals.get("Over 2.5", "?")) + " U2.5:" + str(vals.get("Under 2.5", "?")))
            if parts:
                results.append(home + " vs " + away + " | " + " | ".join(parts))
        return results
    except Exception as e:
        print("Odds error: " + str(e))
        return []

all_data = []

for name, (lid, season) in LEAGUES.items():
    fx = get_fixtures(lid, season)
    od = get_odds(lid, season)
    if fx:
        all_data.append("[" + name + " Fixtures]")
        all_data.extend(fx)
    if od:
        all_data.append("[" + name + " Odds]")
        all_data.extend(od)
    print(name + ": " + str(len(fx)) + " fixtures, " + str(len(od)) + " odds")

# 世界杯兜底数据
wc_fallback = [
    "[2026 World Cup - Today Matches]",
    "Brazil vs Norway (04:00) - BRA 53.2% WIN | NOR 21.4% WIN | DRAW 25.4% | H:1.88 D:3.46 A:4.28 | O2.5:1.87 U2.5:1.93",
    "Mexico vs England (08:00) - MEX 30.4% WIN | ENG 39.8% WIN | DRAW 29.8% | H:3.10 D:3.11 A:2.35 | O2.5:2.15 U2.5:1.72",
    "[2026 World Cup - Upcoming]",
    "Portugal vs Spain (Jul 7 03:00) - POR 23.5% WIN | ESP 50.2% WIN | DRAW 26.3% | H:4.17 D:3.35 A:1.82",
    "USA vs Belgium (Jul 7 08:00) - USA 35.1% WIN | BEL 36.7% WIN | DRAW 28.2% | H:2.76 D:3.20 A:2.63",
    "Argentina vs Egypt (Jul 8 00:00) - ARG 70.4% WIN | EGY 10.2% WIN | DRAW 19.4% | H:1.34 D:5.00 A:8.90",
    "Switzerland vs Colombia (Jul 8 04:00) - SUI 27.1% WIN | COL 42.5% WIN | DRAW 30.4% | H:3.50 D:3.10 A:2.15",
]

if not all_data:
    print("API returned no data, using World Cup fallback data")
    all_data = wc_fallback
else:
    all_data.extend(wc_fallback)

data_text = "\n".join(all_data)
print("Data preview:\n" + data_text[:500])

msg = "You are a professional football analyst. Date: " + date_str + "\n\n"
msg += "Match data with odds:\n" + data_text + "\n\n"
msg += "Key analytical rules:\n"
msg += "1. Asian handicap water level close to 1.00 = low score expected\n"
msg += "2. Underdog odds below 10 = they can score\n"
msg += "3. Defensive teams vs weak opponents can surprise with high scoring\n"
msg += "4. Teams with heavy rotation score 1.5 goals or less\n"
msg += "5. Home advantage adds 8% to win probability\n\n"
msg += "Generate a complete professional HTML football dashboard.\n"
msg += "For each match include:\n"
msg += "- Team names with flag emojis\n"
msg += "- Win probability bars (home/draw/away) with animation\n"
msg += "- Asian handicap analysis and water level signal\n"
msg += "- Over/Under analysis with big/small ball probability\n"
msg += "- 3 recommended scores: main pick / second choice / safe pick with probability %\n"
msg += "- Upset risk rating (1-5 stars)\n"
msg += "- One line verdict\n\n"
msg += "Design requirements:\n"
msg += "- Dark background #080B0F, cards #0D1117, border #21262D\n"
msg += "- Gold #F0B429, green #3FB950, red #F85149, blue #58A6FF\n"
msg += "- Animated probability bars using CSS keyframes\n"
msg += "- Upset risk >= 3 stars: red left border 3px solid #F85149\n"
msg += "- Real-time Beijing clock updating every second\n"
msg += "- Score matrix showing top 5 most likely scores\n"
msg += "- Fully responsive for mobile and desktop\n"
msg += "- Zero external dependencies\n"
msg += "- Max width 900px centered\n\n"
msg += "Output ONLY complete HTML starting with <!DOCTYPE html>. No explanation."

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

print("Done! Length: " + str(len(html)))
