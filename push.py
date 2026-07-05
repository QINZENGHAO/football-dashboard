import os
import requests
from openai import OpenAI
from datetime import datetime, timezone, timedelta

SF_API_KEY = os.environ["SF_API_KEY"]

tz = timezone(timedelta(hours=8))
now = datetime.now(tz)
date_str = now.strftime("%Y-%m-%d %H:%M")

client = OpenAI(
    api_key=SF_API_KEY,
    base_url="https://api.siliconflow.cn/v1"
)

# 今日北单真实赛事（07-05）
TODAY_MATCHES = """
[韩职联 第16轮 18:30]
FC首尔 vs 仁川联 | 欧赔 主4.15 平3.26 客2.20 | 让球(-1)
光州FC vs 蔚山HD | 欧赔 主3.23 平3.73 客2.36 | 让球(1)
金泉尚武 vs 济州SK | 欧赔 主2.55 平3.24 客3.32 | 让球(1)
金海FC vs 首尔衣恋 | 欧赔 主3.09 平4.04 客2.32 | 让球(-1)
金浦FC vs 忠南牙山FC | 欧赔 主4.45 平3.48 客2.04 | 让球(1)
庆南FC vs 天安城 | 欧赔 主2.38 平3.21 客3.72 | 让球(-1)
全南天龙 vs 釜山IPark | 欧赔 主2.21 平3.60 客3.68 | 让球(1)

[瑞典超 第11轮]
卡尔马 vs 厄尔格里特 | 欧赔 主2.39 平4.42 客2.80 | 20:00
哥德堡 vs AIK索尔纳 | 欧赔 主2.44 平3.63 客3.17 | 20:00
埃尔夫斯堡 vs 哈马比 | 欧赔 主1.84 平5.85 客3.47 | 22:30

[挪威甲 第14轮]
奥德 vs 海于格松 | 欧赔 主4.13 平4.54 客1.85 | 22:00

[瑞超 第13轮]
MP米凯利 vs 哈卡 | 欧赔 主3.68 平3.88 客2.12 | 23:30

[2026世界杯]
巴西 vs 挪威 | 欧赔 主1.88 平3.46 客4.28 | 04:00 | 巴西胜率53.2% 平25.4% 挪威21.4%
"""

msg = "你是顶级足球盘口分析师，精通欧亚盘水位解读。现在北京时间 " + date_str + "\n\n"
msg += "今日北单全部真实赛事:\n" + TODAY_MATCHES + "\n\n"
msg += "水位分析规则:\n"
msg += "1. 欧赔越低=真实概率越高（去除庄家5%抽水后反推）\n"
msg += "2. 主胜赔率<2.0=强热门，>4.0=冷门\n"
msg += "3. 平局赔率<3.5=平局概率高\n"
msg += "4. 让球(-1)=主队让1球，主队需赢2球以上才赢盘\n"
msg += "5. 让球(1)=客队让1球，客队需赢2球以上才赢盘\n\n"
msg += "请生成完整专业HTML足球北单看盘页面。\n\n"
msg += "每场比赛必须包含:\n"
msg += "- 球队名称（含国旗或联赛emoji）和开赛时间\n"
msg += "- 欧赔三方真实概率（去除5%抽水：真实概率=1/赔率/总超额）\n"
msg += "- 三方胜率彩色进度条（主队蓝/平局灰/客队金）\n"
msg += "- 让球分析（让球方向+水位信号强弱）\n"
msg += "- 大小球推荐方向\n"
msg += "- 精准比分三选: 主推/次选/保险（含概率%）\n"
msg += "- 冷门指数★☆（1-5星）\n"
msg += "- 一句话verdict总结\n\n"
msg += "页面设计:\n"
msg += "- 背景#080B0F 卡片#0D1117 边框#21262D\n"
msg += "- 金色#F0B429 绿#3FB950 红#F85149 蓝#58A6FF 紫#BC8CFF\n"
msg += "- 顶部: 2026北单看盘标题 + 实时北京时间（JS每秒刷新）\n"
msg += "- 顶部统计栏: 今日13场 / 世界杯1场 / 冷门预警数\n"
msg += "- 按联赛分组，每组有联赛标题\n"
msg += "- 三方胜率进度条CSS动画（0.8s ease-out）\n"
msg += "- 冷门3星以上整卡红色左边框3px\n"
msg += "- 世界杯场次金色左边框突出显示\n"
msg += "- 最大宽度920px居中\n"
msg += "- 手机响应式\n"
msg += "- 零外部依赖\n\n"
msg += "只输出完整HTML从<!DOCTYPE html>开始，无任何解释。"

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

print("完成！字符数: " + str(len(html)))
