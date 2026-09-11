# -*- coding: utf-8 -*-
import re, json
from collections import Counter

src = open(r"C:\dev\apps\NEXARA-app\apps\web\lib\access-matrix.ts", encoding="utf-8").read()
pat = re.compile(
    r'id:\s*"([^"]+)",\s*panel:\s*PANELS\.(\w+),\s*path:\s*"([^"]+)",\s*'
    r'label:\s*"([^"]+)",\s*description:\s*"([^"]+)",[\s\S]*?'
    r'group:\s*"([^"]+)",\s*visible:\s*(true|false)',
    re.M,
)
rows = []
for m in pat.finditer(src):
    rows.append(
        {
            "id": m.group(1),
            "panel": m.group(2).lower(),
            "path": m.group(3),
            "label": m.group(4),
            "description": m.group(5),
            "group": m.group(6),
            "visible": m.group(7) == "true",
        }
    )
out = r"C:\dev\apps\NEXARA-app\.ai\modules-catalog.json"
open(out, "w", encoding="utf-8").write(json.dumps(rows, ensure_ascii=False, indent=2))
print("modules", len(rows), dict(Counter(r["panel"] for r in rows)))
