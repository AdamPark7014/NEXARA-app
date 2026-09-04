#!/bin/bash
set -eu
echo "=== go2rtc network mode ==="
docker inspect nexara-go2rtc --format 'NetworkMode={{.HostConfig.NetworkMode}} Networks={{json .NetworkSettings.Networks}}'

echo "=== can api reach NVR ==="
docker exec nexara-api sh -c 'node -e "
const net=require(\"net\");
const hosts=[\"192.168.9.34\",\"192.168.9.163\",\"100.71.203.3\"];
(async()=>{
  for (const h of hosts){
    await new Promise(r=>{
      const s=net.connect({host:h,port:80,timeout:3000},()=>{console.log(h+\":80 OK\");s.end();r()});
      s.on(\"error\",e=>{console.log(h+\":80 FAIL \"+e.message);r()});
      s.on(\"timeout\",()=>{console.log(h+\":80 TIMEOUT\");s.destroy();r()});
    });
    await new Promise(r=>{
      const s=net.connect({host:h,port:554,timeout:3000},()=>{console.log(h+\":554 OK\");s.end();r()});
      s.on(\"error\",e=>{console.log(h+\":554 FAIL \"+e.message);r()});
      s.on(\"timeout\",()=>{console.log(h+\":554 TIMEOUT\");s.destroy();r()});
    });
  }
})()
"'

echo "=== can go2rtc reach NVR ==="
docker exec nexara-go2rtc sh -c 'wget -qO- --timeout=3 http://192.168.9.34/ 2>&1 | head -c 80; echo; nc -z -w 3 192.168.9.34 554 && echo 554ok || echo 554fail' 2>&1 || true

echo "=== host reach NVR ==="
timeout 3 bash -c 'echo >/dev/tcp/192.168.9.34/80' 2>/dev/null && echo host80ok || echo host80fail
timeout 3 bash -c 'echo >/dev/tcp/192.168.9.34/554' 2>/dev/null && echo host554ok || echo host554fail
ip route | head -20
tailscale status 2>/dev/null | head -20 || true

echo "=== go2rtc stream detail (no passwords) ==="
docker exec nexara-go2rtc wget -qO- http://127.0.0.1:1984/api/streams 2>/dev/null | sed 's/rtsp:\/\/[^@]*@/rtsp:\/\/***@/g' | head -c 1500
echo

echo "=== try force open one stream ==="
# Ask go2rtc for stream info which often triggers producer connect
docker exec nexara-go2rtc wget -qO- 'http://127.0.0.1:1984/api/stream.mp4?src=cam_192_168_9_34_301&duration=1' -O /tmp/t.mp4 2>&1 | head -5
ls -la /tmp/t.mp4 2>/dev/null || true
docker exec nexara-go2rtc wget -S -O- 'http://127.0.0.1:1984/api/stream.m3u8?src=cam_192_168_9_34_301' 2>&1 | head -30

echo "=== integra site health via api logs recent ==="
docker logs nexara-api --since 30m 2>&1 | grep -iE 'go2rtc|ISAPI|health|192.168.9|timeout|stream' | tail -40
