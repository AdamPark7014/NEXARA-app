fetch("http://127.0.0.1:3001/api/integra/cameras")
  .then((r) => r.json())
  .then(async (d) => {
    const cams = d.items || [];
    console.log("cams", cams.length);
    for (const c of cams) {
      const n = c.name || "";
      if (/meeting|ptz/i.test(n) || c.isPtz) {
        console.log(n, c.sourceIp, "ptz=" + c.isPtz, "audio=" + c.hasAudio);
      }
    }
    const ips = new Set(
      cams.filter((c) => /meeting/i.test(c.name || "")).map((c) => c.sourceIp).filter(Boolean),
    );
    ips.add("192.168.9.178");
    const ev = await (await fetch("http://127.0.0.1:3001/api/integra/push/events?sinceMs=180000&limit=80")).json();
    const items = ev.items || [];
    const hist = {};
    for (const e of items.filter((x) => x.eventType === "fielddetection")) {
      const n = (e.targets || []).length;
      hist[n] = (hist[n] || 0) + 1;
    }
    console.log("fd hist", hist);
    for (const e of items) {
      if (!ips.has(e.deviceIp)) continue;
      console.log(e.id, e.eventType, e.deviceIp, "n=" + (e.targets || []).length, JSON.stringify(e.targets || []).slice(0, 120));
    }
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
