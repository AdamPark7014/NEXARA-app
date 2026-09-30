const s = require('fs').readFileSync('C:/dev/apps/NEXARA-app/node_modules/@prisma/client/runtime/library.js', 'utf8');
const needle = process.argv[2];
let i = -1;
let n = 0;
while ((i = s.indexOf(needle, i + 1)) >= 0 && n < Number(process.argv[3] || 4)) {
  console.log('---', i, s.slice(Math.max(0, i - Number(process.argv[4] || 300)), i + Number(process.argv[5] || 500)));
  n++;
}
