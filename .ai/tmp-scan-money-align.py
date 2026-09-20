import re
from pathlib import Path

roots = [
    Path(r"C:/dev/apps/NEXARA-app/apps/web/app/(panels)/erp/contabilidad"),
    Path(r"C:/dev/apps/NEXARA-app/apps/web/components/erp/ContabilidadInvoicesView.tsx"),
    Path(r"C:/dev/apps/NEXARA-app/apps/web/components/erp/CarteraView.tsx"),
    Path(r"C:/dev/apps/NEXARA-app/apps/web/components/erp/reportes-contabilidad.tsx"),
]
files = []
for r in roots:
    if r.is_file():
        files.append(r)
    else:
        files.extend([p for p in r.rglob("*.tsx") if "spec" not in p.name])

# Find objects that look like Column defs: have key+label and Money in render
obj_re = re.compile(
    r"\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}",
    re.DOTALL,
)

results = []
for f in files:
    text = f.read_text(encoding="utf-8")
    lines = text.splitlines()
    # walk brace-balanced objects that contain both key: and <Money
    stack = []
    for idx, ch in enumerate(text):
        if ch == "{":
            stack.append(idx)
        elif ch == "}" and stack:
            start = stack.pop()
            if len(stack) < 2:  # only mid-depth objects
                continue
            chunk = text[start : idx + 1]
            if "<Money" not in chunk:
                continue
            if not re.search(r"\bkey\s*:", chunk):
                continue
            if not re.search(r"\brender\s*:", chunk) and "Money" not in chunk:
                continue
            # must be a column-like object: key near start, preferably label
            if not re.search(r"^\{\s*key\s*:", chunk, re.DOTALL):
                # allow key not first if comment precedes
                if not re.search(r"key\s*:\s*[\"'][^\"']+[\"']", chunk):
                    continue
            # skip if this is a metric { label, value: <Money } without column key pattern used with DataTable
            # Column objects typically have label: and (align|numeric|render|width)
            if not re.search(r"\blabel\s*:", chunk):
                continue
            # exclude Metric-like: value: <Money without render
            if re.search(r"\bvalue\s*:", chunk) and not re.search(r"\brender\s*:", chunk):
                continue
            keys = re.findall(r"key\s*:\s*[\"']([^\"']+)[\"']", chunk)
            if not keys:
                continue
            # if nested columns, take the innermost key that precedes Money
            money_pos = chunk.find("<Money")
            keys_before = [
                m
                for m in re.finditer(r"key\s*:\s*[\"']([^\"']+)[\"']", chunk)
                if m.start() < money_pos
            ]
            if not keys_before:
                continue
            key = keys_before[-1].group(1)
            # slice from that key to Money for flags
            slice_chunk = chunk[keys_before[-1].start() : money_pos]
            has_align = bool(re.search(r"align\s*:\s*[\"']right[\"']", slice_chunk))
            has_numeric = bool(re.search(r"numeric\s*:\s*true", slice_chunk))
            if has_align and has_numeric:
                continue
            # line number of Money
            prefix = text[: start + money_pos]
            line_no = prefix.count("\n") + 1
            miss = []
            if not has_align:
                miss.append("align")
            if not has_numeric:
                miss.append("numeric")
            rel = str(f).replace("C:\\dev\\apps\\NEXARA-app\\", "").replace("\\", "/")
            results.append((rel, line_no, key, "+".join(miss), chunk[:120].replace("\n", " ")))

# dedupe
seen = set()
for rel, line_no, key, miss, preview in results:
    sig = (rel, line_no, key, miss)
    if sig in seen:
        continue
    seen.add(sig)
    print(f"{rel}:{line_no} key={key} missing={miss}")
    print(f"  preview: {preview[:100]}")
print("TOTAL", len(seen))
