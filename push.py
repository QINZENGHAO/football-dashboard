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

data_text = "\n".join(all_data) if all_data else "No data today"
print("Preview: " + data_text[:300])

msg = "You are a professional football analyst. Date: " + date_str + "\n\n"
msg += "Match data:\n" + data_text + "\n\n"
msg += "Rules learned from this tournament:\n"
msg += "1. Odds close to 1.00 means low score\n"
msg += "2. Underdog odds below 10 means they can score\n"
msg += "3. Defensive teams vs weak opponents can explode offensively\n"
msg += "4. Heavy rotation teams score 1.5 goals or less\n\n"
msg += "Generate a complete HTML football dashboard.\n"
msg += "For each match include: win probabilities with progress bars, Asian handicap analysis, over/under analysis, 3 recommended scores with probability, upset risk rating.\n"
msg += "Design: dark background #080B0F, gold #F0B429, green #3FB950, red #F85149, cards #0D1117.\n"
msg += "Animated probability bars, responsive layout, real-time clock, zero external dependencies.\n"
msg += "High upset risk matches get red left border.\n"
msg += "Output ONLY complete HTML starting with <!DOCTYPE html>. No explanation text."

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
