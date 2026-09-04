#!/bin/bash
set -eu
echo "=== peers with routes ==="
tailscale status --json > /tmp/ts.json
python3 <<'PY'
import json
d=json.load(open('/tmp/ts.json'))
print('Backend', d.get('BackendState'))
print('Self', d.get('Self',{}).get('HostName'), d.get('Self',{}).get('TailscaleIPs'))
print('Self AllowedIPs', d.get('Self',{}).get('AllowedIPs'))
print('Self PrimaryRoutes', d.get('Self',{}).get('PrimaryRoutes'))
print('--- peers ---')
for p in d.get('Peer',{}).values():
    name=p.get('HostName')
    print(f"{name} online={p.get('Online')} ips={p.get('TailscaleIPs')}")
    print(f"  PrimaryRoutes={p.get('PrimaryRoutes')}")
    print(f"  AllowedIPs={p.get('AllowedIPs')}")
    print(f"  ExitNode={p.get('ExitNode')} Relay={p.get('Relay')} Active={p.get('Active')}")
PY
echo "=== ip route all ==="
ip route
echo "=== try via nas as gateway? ==="
# Does the NAS have the subnet?
ping -c1 -W2 192.168.9.34 || true
# traceroute first hops
traceroute -n -w 2 -m 8 192.168.9.34 2>&1 | head -15 || true
echo "=== curl ACL / routes from API ==="
# check if route is approved - look at netmap
tailscale debug netmap 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); 
prs=d.get("PacketFilter") 
print("has netmap keys", list(d)[:20])
for p in d.get("Peers") or d.get("Peers") or []:
  pass
# PeerRoutes
print("PeerRoutes", d.get("PeerRoutes"))
print("SelfNode", (d.get("SelfNode") or {}).get("Hostinfo",{}).get("RoutableIPs") or (d.get("SelfNode") or {}).get("PrimaryRoutes"))
' 2>&1 | head -40
