import os
import re

roots = [
    r"C:\dev\apps\NEXARA-app\apps\web\app\(panels)\erp\contabilidad",
    r"C:\dev\apps\NEXARA-app\apps\web\components\finance",
]
rx = re.compile(
    "["
    "\U0001F300-\U0001FAFF"
    "\U00002700-\U000027BF"
    "\U00002600-\U000026FF"
    "\U00002300-\U000023FF"
    "\U0001F900-\U0001F9FF"
    "\U0001F600-\U0001F64F"
    "\U0001F680-\U0001F6FF"
    "\uFE0F"
    "\u200D"
    "]+"
)
# Also catch isolated symbols often used as "emoji icons" in UI copy
rx2 = re.compile(r"[✓✔✗✘★☆●○◆◇■□▲△▼▽→←↑↓•·▸►◀▶⚠⚡★♥♦♣♠]")
exts = {".tsx", ".ts", ".jsx", ".js", ".css", ".mdx", ".html"}
hits = []
for root in roots:
    if not os.path.isdir(root):
        print("MISSING", root)
        continue
    for dirpath, _, files in os.walk(root):
        for f in files:
            if os.path.splitext(f)[1].lower() not in exts:
                continue
            path = os.path.join(dirpath, f)
            text = open(path, encoding="utf-8").read()
            for i, line in enumerate(text.splitlines(), 1):
                found = []
                for m in rx.finditer(line):
                    s = m.group()
                    if any(ord(c) not in (0xFE0F, 0x200D) for c in s):
                        found.append(s)
                for m in rx2.finditer(line):
                    found.append(m.group())
                if found:
                    hits.append((path, i, found, line.strip()[:220]))

print(f"HITS={len(hits)}")
for path, i, found, line in hits:
    print(f"{path}:{i}: {found!r}")
    print(f"  {line}")
