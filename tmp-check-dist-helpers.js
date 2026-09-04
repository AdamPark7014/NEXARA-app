const d = require('/app/apps/api/dist/hikvision-isapi/isapi.discovery.js');
const a = require('/app/apps/api/dist/hikvision-isapi/isapi-acs.js');
console.log(
  'discovery',
  [
    'enableMotionDetection',
    'enableFieldDetection',
    'enableNvrParkingVehicleDetection',
    'readHttpNotificationHosts',
  ]
    .map((k) => `${k}=${typeof d[k]}`)
    .join(' '),
);
console.log('acs probeAcsIdentityCaps', typeof a.probeAcsIdentityCaps);
