const path = require('path');
const Module = require('module');
process.env.NODE_PATH = '/app/node_modules';
Module._initPaths();
const { PrismaClient } = require('@prisma/client');
const dist = '/app/apps/api/dist';
const { decryptSecret } = require(path.join(dist, 'integra/integra-secrets.js'));
const { HikvisionIsapiClient } = require(path.join(dist, 'hikvision-isapi/isapi.client.js'));
const p = new PrismaClient();

(async () => {
  const site = await p.integraSite.findFirst({ where: { id: 1 } });
  const user = decryptSecret(site.appKeyEnc);
  const pass = decryptSecret(site.appSecretEnc);
  const nvr = new HikvisionIsapiClient({
    host: 'http://192.168.9.34',
    username: user,
    password: pass,
    scope: 'nvr-hosts',
  });

  // capabilities
  try {
    const { buffer } = await nvr.getBinary('/ISAPI/Event/notification/httpHosts/capabilities');
    console.log('CAPS', buffer.toString('utf8').replace(/\s+/g, ' ').slice(0, 1200));
  } catch (e) {
    console.log('CAPS_ERR', String(e.message).slice(0, 160));
  }

  const variants = [
    // A: like camera but XML format, no images
    `<HttpHostNotification><id>1</id><url>/api/integra/hik/1/b91b95c98798c7ff6596e942</url><protocolType>HTTPS</protocolType><parameterFormatType>XML</parameterFormatType><addressingFormatType>hostname</addressingFormatType><hostName>integra.nexara.com.mx</hostName><portNo>443</portNo><httpAuthenticationMethod>none</httpAuthenticationMethod></HttpHostNotification>`,
    // B: JSON like camera without images
    `<HttpHostNotification><id>1</id><url>/api/integra/hik/1/b91b95c98798c7ff6596e942</url><protocolType>HTTPS</protocolType><parameterFormatType>JSON</parameterFormatType><addressingFormatType>hostname</addressingFormatType><hostName>integra.nexara.com.mx</hostName><portNo>443</portNo><httpAuthenticationMethod>none</httpAuthenticationMethod></HttpHostNotification>`,
    // C: with xmlns isapi
    `<?xml version="1.0" encoding="UTF-8"?><HttpHostNotification version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema"><id>1</id><url>/api/integra/hik/1/b91b95c98798c7ff6596e942</url><protocolType>HTTPS</protocolType><parameterFormatType>XML</parameterFormatType><addressingFormatType>hostname</addressingFormatType><hostName>integra.nexara.com.mx</hostName><portNo>443</portNo><httpAuthenticationMethod>none</httpAuthenticationMethod></HttpHostNotification>`,
    // D: ipaddress format - won't work for hostname but test
  ];

  for (let i = 0; i < variants.length; i++) {
    try {
      await nvr.put('/ISAPI/Event/notification/httpHosts/1', variants[i]);
      console.log('OK_VARIANT', i);
      break;
    } catch (e) {
      console.log('FAIL_VARIANT', i, String(e.message).slice(0, 120));
    }
  }

  const { buffer } = await nvr.getBinary('/ISAPI/Event/notification/httpHosts');
  console.log('NOW', buffer.toString('utf8').replace(/\s+/g, ' ').slice(0, 800));
  nvr.close();
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
