#!/bin/sh
set -e
docker exec nexara-api wget -qO- 'http://127.0.0.1:3001/api/integra/cameras' > /tmp/cams.json
docker exec nexara-api wget -qO- 'http://127.0.0.1:3001/api/integra/push/events?sinceMs=180000&limit=100' > /tmp/ev.json
docker exec nexara-api python3 -c '
import json
from collections import Counter
cams=(json.load(open("/tmp/cams.json")).get("items") or [])
meeting=[c for c in cams if "meeting" in (c.get("name") or "").lower() or (c.get("sourceIp")=="192.168.9.178")]
print("=== Meeting/PTZ cams ===")
for c in cams:
  n=(c.get("name") or "")
  if "meeting" in n.lower() or "ptz" in n.lower() or c.get("isPtz"):
    print(n, "ip=", c.get("sourceIp"), "audio=", c.get("hasAudio"), "ptz=", c.get("isPtz"))
ips={c.get("sourceIp") for c in meeting if c.get("sourceIp")} or {"192.168.9.178"}
events=json.load(open("/tmp/ev.json")).get("items") or []
print("=== meeting events 180s ===")
for e in events:
  if e.get("deviceIp") not in ips: continue
  t=e.get("targets") or []
  print(e.get("id"), e.get("eventType"), (e.get("occurredAt") or "")[:19], "n=", len(t), t[:3])
print("fd hist", dict(Counter(len(e.get("targets") or []) for e in events if e.get("eventType")=="fielddetection")))
'
