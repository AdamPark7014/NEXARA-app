#!/usr/bin/env python3
"""Probe Meeting Room fielddetection targets on prod API (localhost)."""
import json
import urllib.request

BASE = "http://127.0.0.1:4000"

def get(path: str):
    with urllib.request.urlopen(BASE + path, timeout=12) as r:
        return json.load(r)

cams = get("/integra/cameras").get("items") or []
meeting = [c for c in cams if "meeting" in (c.get("name") or "").lower()]
print("=== Meeting Room cams ===")
for c in meeting:
    print(c.get("name"), "ip=", c.get("sourceIp"), "hasAudio=", c.get("hasAudio"), "ptz=", c.get("isPtz"))

ips = {c.get("sourceIp") for c in meeting if c.get("sourceIp")}
if not ips:
    ips = {"192.168.9.178"}

events = get("/integra/push/events?sinceMs=120000&limit=80").get("items") or []
print("=== events last 120s for meeting ips ===")
for e in events:
    if e.get("deviceIp") not in ips:
        continue
    t = e.get("targets") or []
    print(
        e.get("id"),
        e.get("eventType"),
        e.get("deviceIp"),
        (e.get("occurredAt") or "")[:19],
        "nTargets=",
        len(t),
        t,
    )

print("=== target-count histogram (all fielddetection 120s) ===")
from collections import Counter
hist = Counter()
for e in events:
    if e.get("eventType") != "fielddetection":
        continue
    hist[len(e.get("targets") or [])] += 1
print(dict(hist))
