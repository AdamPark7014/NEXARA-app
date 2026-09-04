const path = require("path");
const { PrismaClient } = require("@prisma/client");
const dist = "/app/apps/api/dist";
const { decryptSecret } = require(path.join(dist, "integra/integra-secrets.js"));
const { HikvisionIsapiClient } = require(path.join(dist, "hikvision-isapi/isapi.client.js"));
const { setChannelAudio } = require(path.join(dist, "hikvision-isapi/isapi.discovery.js"));

const p = new PrismaClient();

async function main() {
  const site = await p.integraSite.findFirst({ where: { id: 1 } });
  const user = decryptSecret(site.appKeyEnc);
  const pass = decryptSecret(site.appSecretEnc);

  const cams = await p.integraCamera.findMany({
    where: { siteId: 1 },
    select: { cameraIndexCode: true, name: true, raw: true },
  });

  for (const cam of cams) {
    const raw = (cam.raw && typeof cam.raw === "object" ? cam.raw : {}) as any;
    const ip = raw.source?.ipAddress;
    if (!ip || String(ip).startsWith("192.168.254.")) continue;
    const client = new HikvisionIsapiClient({
      host: `http://${ip}`,
      username: user,
      password: pass,
      timeoutMs: 12000,
      scope: `audio-fix-${ip}`,
    });
    let changed = false;
    for (const ch of ["101", "102"]) {
      try {
        if (await setChannelAudio(client, ch, true)) changed = true;
      } catch (e) {
        console.log(cam.name, ch, "ERR", String(e.message || e).slice(0, 120));
      }
    }
    if (changed) {
      await p.integraCamera.update({
        where: {
          siteId_cameraIndexCode: { siteId: 1, cameraIndexCode: cam.cameraIndexCode },
        },
        data: { raw: { ...raw, hasAudio: true } },
      });
    }
    console.log(JSON.stringify({ name: cam.name, ip, changed }));
  }
  await p.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
