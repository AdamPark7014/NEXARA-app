/**
 * Siembra una semana de operación realista (del lunes a hoy, hora de México) con los usuarios reales
 * de la empresa: clientes en Puebla, actividades en cada etapa con evidencias y fotos, asistencia,
 * comidas, trayectorias GPS, salidas de zona, chat (canales y directos) y notificaciones.
 *
 * Todo lo que crea queda anotado en un manifiesto en el volumen de uploads del servidor:
 *   <UPLOADS_ROOT>/demo/<LOTE>/manifest.json   (ids por modelo + archivos + valores previos)
 * `purgar-demo.js` borra exactamente eso. Las fotos de relleno viven en <UPLOADS_ROOT>/demo/<LOTE>/.
 * No se envían push: las notificaciones se insertan como filas.
 *
 * Simulación por defecto (no escribe nada). Solo escribe con CONFIRMAR=SI.
 *
 *   docker exec -i -w /app/apps/api nexara-api node - < apps/api/scripts/demo-semana/sembrar-semana.js
 *   docker exec -i -e CONFIRMAR=SI -w /app/apps/api nexara-api node - < apps/api/scripts/demo-semana/sembrar-semana.js
 *
 * Variables (o --nombre=valor): COMPANY_ID (defecto: empresa principal), LOTE (defecto demo-AAAAMMDD),
 * SEMILLA (42), OFICINA_LAT / OFICINA_LNG (punto de checada), SIN_GPS_EN_CURSO=SI (no guarda GPS de
 * entrada en actividades abiertas, para que la geocerca real no mida teléfonos contra ellas).
 * Autoprueba sin base de datos: node sembrar-semana.js --autoprueba
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ─────────────────────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────────────────────

function opt(name) {
  const pref = `--${name.toLowerCase()}=`;
  const hit = process.argv.find((a) => a.toLowerCase().startsWith(pref));
  if (hit) return hit.slice(pref.length);
  const env = process.env[name.toUpperCase()];
  return env != null && String(env).trim() !== '' ? String(env).trim() : null;
}
const flag = (name) =>
  process.argv.includes(`--${name}`) || String(opt(name) || '').toUpperCase() === 'SI' || opt(name) === '1';

const APLICAR = String(opt('CONFIRMAR') || '').toUpperCase() === 'SI';
const AUTOPRUEBA = flag('autoprueba') || flag('self-test');
const TZ = (process.env.WORKDAY_TZ || '').trim() || 'America/Mexico_City';

const ORG = {
  ceo: 'gerencia@nexara.com.mx',
  developer: 'developer@nexara.com.mx',
  claudia: 'claudia.bernal@nexara.com.mx',
  play: 'play.review@nexara.com.mx',
  david: 'operaciones@nexara.com.mx',
  luis: 'direccion.operaciones@nexara.com.mx',
  antonio: 'jose.ramirez@nexara.com.mx',
  carolina: 'soporte@nexara.com.mx',
  alejandro: 'alejandro.gonzalez@nexara.com.mx',
  roberto: 'roberto.vivanco@nexara.com.mx',
  daniela: 'daniela.hernandez@nexara.com.mx',
  monica: 'soluciones@nexara.com.mx',
  joan: 'joan.sanchez@nexara.com.mx',
  israel: 'israel.ramos@nexara.com.mx',
  juan: 'juan.gonzalez@nexara.com.mx',
  josue: 'infraestructura@nexara.com.mx',
};
const NO_EMPLEADOS = [ORG.ceo, ORG.developer, ORG.claudia, ORG.play];
const norm = (e) => String(e || '').trim().toLowerCase();

// ─────────────────────────────────────────────────────────────────────────────
// Tiempo (zona de la jornada)
// ─────────────────────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0');
const FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
function partes(d) {
  const p = FMT.formatToParts(d);
  const v = (t) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return { y: v('year'), mo: v('month'), d: v('day'), h: v('hour') % 24, mi: v('minute'), s: v('second') };
}
function claveDia(d) {
  const p = partes(d);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
}
function desfase(d) {
  const p = partes(d);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - (d.getTime() - d.getMilliseconds());
}
/** Instante de un reloj local (minutos desde medianoche) en el día `key`. */
function enHora(key, minutos) {
  const [y, mo, d] = key.split('-').map(Number);
  const local = Date.UTC(y, mo - 1, d, 0, 0, 0) + Math.round(minutos * 60) * 1000;
  let t = local - desfase(new Date(local));
  t = local - desfase(new Date(t));
  return new Date(t);
}
function minutosDelDia(d) {
  const p = partes(d);
  return p.h * 60 + p.mi + p.s / 60;
}
function columnaFecha(key) {
  const [y, mo, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d));
}
function diaSemana(key) {
  const [y, mo, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}
function sumarDias(key, n) {
  const [y, mo, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10);
}
const masMin = (d, m) => new Date(d.getTime() + Math.round(m * 60_000));
const minDate = (...ds) => new Date(Math.min(...ds.filter(Boolean).map((d) => d.getTime())));
const maxDate = (...ds) => new Date(Math.max(...ds.filter(Boolean).map((d) => d.getTime())));

// ─────────────────────────────────────────────────────────────────────────────
// Azar determinista
// ─────────────────────────────────────────────────────────────────────────────

function azar(seed) {
  let a = Number(seed) >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    r,
    int: (x, y) => x + Math.floor(r() * (y - x + 1)),
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    chance: (p) => r() < p,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Textos como los escribe la API
// ─────────────────────────────────────────────────────────────────────────────

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y']);
function nombreCorto(nombre) {
  const limpio = String(nombre || '').trim().replace(/\s+/g, ' ');
  if (!limpio) return '';
  const palabras = limpio.split(' ');
  if (palabras.length <= 2) return limpio;
  const partesN = [];
  let pendientes = [];
  for (const w of palabras) {
    if (PARTICULAS.has(w.toLowerCase())) {
      pendientes.push(w);
      continue;
    }
    partesN.push([...pendientes, w].join(' '));
    pendientes = [];
  }
  if (pendientes.length) {
    if (partesN.length) partesN[partesN.length - 1] = `${partesN[partesN.length - 1]} ${pendientes.join(' ')}`;
    else partesN.push(pendientes.join(' '));
  }
  if (partesN.length <= 2) return partesN.join(' ');
  const primerApellido = partesN.length === 3 ? partesN[1] : partesN[partesN.length - 2];
  return `${partesN[0]} ${primerApellido}`;
}
const persona = (n, respaldo = 'Alguien del equipo') => nombreCorto(n) || respaldo;
const unir = (...xs) => xs.map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean).join(' · ');

const HORA = new Intl.DateTimeFormat('es-MX', { timeZone: TZ, hour12: true, hour: 'numeric', minute: '2-digit' });
const FECHA = new Intl.DateTimeFormat('es-MX', {
  timeZone: TZ,
  hour12: true,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});
function periodo(v) {
  const p = String(v).toLowerCase().replace(/[\s.]/g, '');
  if (p.startsWith('a')) return 'a. m.';
  if (p.startsWith('p')) return 'p. m.';
  return v;
}
function horaAviso(d) {
  const p = HORA.formatToParts(d);
  const v = (t) => p.find((x) => x.type === t)?.value ?? '';
  return `${v('hour')}:${v('minute')} ${periodo(v('dayPeriod'))}`;
}
function fechaAviso(d) {
  const p = FECHA.formatToParts(d);
  const v = (t) => (p.find((x) => x.type === t)?.value ?? '').replace(/\.$/, '');
  return `${v('weekday')} ${v('day')} ${v('month')}, ${horaAviso(d)}`;
}
/** Vista previa del chat (menciones y enlaces a su etiqueta, sin emojis). */
function preview(body) {
  const clean = String(body || '')
    .replace(/\[@?([^\]\n]+)\]\(user:\d+\)/g, '@$1')
    .replace(/\[([^\]\n]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\p{Extended_Pictographic}️?\s?/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > 140 ? `${clean.slice(0, 137)}…` : clean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Archivos de relleno (PNG y PDF válidos, sin dependencias)
// ─────────────────────────────────────────────────────────────────────────────

const CRC_TABLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLA[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(tipo, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(tipo, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const COLORES = {
  entrada: [52, 101, 164],
  evidencia: [46, 125, 90],
  salida: [196, 110, 38],
  asistencia: [96, 108, 118],
  comida: [201, 160, 44],
  zona: [170, 58, 58],
};
/** Foto de relleno 240×180: fondo por tipo, marco y franjas que varían por índice. */
function pngRelleno(tipo, indice) {
  const w = 240;
  const h = 180;
  const [br, bg, bb] = COLORES[tipo] || [90, 90, 90];
  const var1 = (indice * 37) % 60;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const fila = y * (w * 3 + 1);
    raw[fila] = 0;
    for (let x = 0; x < w; x++) {
      let r = br;
      let g = bg;
      let b = bb;
      const marco = x < 8 || y < 8 || x >= w - 8 || y >= h - 8;
      const franja = ((x + y + var1) >> 4) % 2 === 0;
      const sol = (x - 60 - var1) ** 2 + (y - 60) ** 2 < 400;
      const suelo = y > 120 + ((x * (indice % 5)) >> 5) % 20;
      if (marco) [r, g, b] = [235, 235, 235];
      else if (sol) [r, g, b] = [250, 230, 150];
      else if (suelo) [r, g, b] = [r * 0.55, g * 0.55, b * 0.55];
      else if (franja) [r, g, b] = [r * 0.88, g * 0.88, b * 0.88];
      const o = fila + 1 + x * 3;
      raw[o] = Math.round(r);
      raw[o + 1] = Math.round(g);
      raw[o + 2] = Math.round(b);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const ascii = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/([()\\])/g, '\\$1');
/** Hoja de servicio PDF de una página con los datos de la visita. */
function pdfHoja(lineas) {
  const texto = ['BT', '/F1 16 Tf', '56 740 Td', `(${ascii(lineas[0])}) Tj`, '/F1 11 Tf'];
  for (const l of lineas.slice(1)) texto.push('0 -20 Td', `(${ascii(l)}) Tj`);
  texto.push('ET');
  const stream = texto.join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// ─────────────────────────────────────────────────────────────────────────────
// Geografía
// ─────────────────────────────────────────────────────────────────────────────

function distanciaM(a, b) {
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h))));
}
function desplazar(p, metros, rumboGrados) {
  const r = (rumboGrados * Math.PI) / 180;
  const dLat = (metros * Math.cos(r)) / 111_320;
  const dLng = (metros * Math.sin(r)) / (111_320 * Math.cos((p.lat * Math.PI) / 180));
  return { lat: Number((p.lat + dLat).toFixed(7)), lng: Number((p.lng + dLng).toFixed(7)) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo: clientes ficticios en Puebla
// ─────────────────────────────────────────────────────────────────────────────

const CLIENTES = [
  {
    clave: 'arcadia', nombre: 'Constructora Arcadia Angelópolis', legal: 'Constructora Arcadia Angelópolis, S.A. de C.V.',
    rfc: 'CAA150612KP3', sectores: ['PROYECTO'], giro: 'Construcción', dueño: 'josue', contacto: 'Ing. Rodrigo Tamayo',
    tel: '222 555 0141', dir: 'Blvd. Atlixcáyotl 5210, Reserva Territorial Atlixcáyotl', cp: '72830', ciudad: 'San Andrés Cholula',
    sucursales: [{ nombre: 'Torre Alba (obra)', num: '001', dir: 'Blvd. Atlixcáyotl 5210, Reserva Territorial Atlixcáyotl', lat: 19.0268, lng: -98.2361 }],
    proyecto: { titulo: 'Torre Alba: CCTV y cableado estructurado', tipo: 'PROYECTO_INTEGRAL', alcance: 'Cableado cat6 niveles 1 a 5, 32 cámaras IP y control de acceso en lobby.' },
  },
  {
    clave: 'colegio', nombre: 'Colegio Bosques de Zavaleta', legal: 'Colegio Bosques de Zavaleta, A.C.', rfc: 'CBZ030822H57',
    sectores: ['CORPORATIVO'], giro: 'Educación', dueño: 'luis', contacto: 'Lic. Patricia Olvera', tel: '222 555 0186',
    dir: 'Calz. Zavaleta 3310, Santa Cruz Buenavista', cp: '72150', ciudad: 'Puebla',
    sucursales: [{ nombre: 'Campus Zavaleta', num: '001', dir: 'Calz. Zavaleta 3310, Santa Cruz Buenavista', lat: 19.0666, lng: -98.2291 }],
  },
  {
    clave: 'clinica', nombre: 'Clínica Santa Lucía', legal: 'Servicios Médicos Santa Lucía de Puebla, S.C.', rfc: 'SMS110405R21',
    sectores: ['CORPORATIVO', 'COMERCIAL'], giro: 'Salud', dueño: 'luis', contacto: 'Dr. Hugo Cárdenas', tel: '222 555 0122',
    dir: 'Av. Juárez 2915, La Paz', cp: '72160', ciudad: 'Puebla',
    sucursales: [
      { nombre: 'Sucursal La Paz', num: '001', dir: 'Av. Juárez 2915, La Paz', lat: 19.0543, lng: -98.2262 },
      { nombre: 'Sucursal Angelópolis', num: '002', dir: 'Blvd. Niño Poblano 2510, Reserva Territorial Atlixcáyotl', lat: 19.0301, lng: -98.2327 },
    ],
  },
  {
    clave: 'logistica', nombre: 'Logística Integral del Centro', legal: 'Logística Integral del Centro, S.A. de C.V.', rfc: 'LIC180119BN4',
    sectores: ['PROYECTO'], giro: 'Logística', dueño: 'david', contacto: 'Ing. Mariana Pacheco', tel: '222 555 0177',
    dir: 'Carretera Federal México-Puebla km 117, Parque Industrial', cp: '72710', ciudad: 'Cuautlancingo',
    sucursales: [{ nombre: 'CEDIS Cuautlancingo', num: '001', dir: 'Carretera Federal México-Puebla km 117, Parque Industrial', lat: 19.0922, lng: -98.2662 }],
    proyecto: { titulo: 'CEDIS Cuautlancingo: control de acceso y videovigilancia', tipo: 'CONTROL_ACCESO', alcance: 'Control de acceso en andenes, 12 cámaras de patio y enlace de fibra entre naves.' },
  },
  {
    clave: 'hotel', nombre: 'Hotel Portal de Analco', legal: 'Operadora Hotelera Portal de Analco, S.A. de C.V.', rfc: 'OHP140930QX8',
    sectores: ['CORPORATIVO', 'COMERCIAL'], giro: 'Hotelería', dueño: 'antonio', contacto: 'Lic. Fernando Rosas', tel: '222 555 0163',
    dir: 'Calle 5 Sur 504, Centro', cp: '72000', ciudad: 'Puebla',
    sucursales: [{ nombre: 'Hotel Centro Histórico', num: '001', dir: 'Calle 5 Sur 504, Centro', lat: 19.0407, lng: -98.1938 }],
  },
  {
    clave: 'autos', nombre: 'Automotriz Volcanes', legal: 'Automotriz Volcanes de Puebla, S.A. de C.V.', rfc: 'AVP090714JM2',
    sectores: ['CORPORATIVO'], giro: 'Automotriz', dueño: 'luis', contacto: 'C.P. Laura Benítez', tel: '222 555 0119',
    dir: 'Blvd. Hermanos Serdán 780, San Rafael Poniente', cp: '72029', ciudad: 'Puebla',
    sucursales: [{ nombre: 'Agencia Hermanos Serdán', num: '001', dir: 'Blvd. Hermanos Serdán 780, San Rafael Poniente', lat: 19.0741, lng: -98.2418 }],
  },
  {
    clave: 'farmacias', nombre: 'Farmacias del Portal', legal: 'Farmacéutica del Portal Poblano, S.A. de C.V.', rfc: 'FPP120301LS9',
    sectores: ['COMERCIAL', 'CORPORATIVO'], giro: 'Farmacias', dueño: 'monica', contacto: 'Lic. Andrea Solís', tel: '222 555 0158',
    dir: 'Av. 5 de Mayo 1802, Centro', cp: '72000', ciudad: 'Puebla',
    sucursales: [
      { nombre: 'Sucursal 5 de Mayo', num: '001', dir: 'Av. 5 de Mayo 1802, Centro', lat: 19.0468, lng: -98.2007 },
      { nombre: 'Sucursal La Noria', num: '002', dir: 'Calle 21 Sur 3905, La Noria', lat: 19.0299, lng: -98.2098 },
    ],
  },
  {
    clave: 'lacteos', nombre: 'Lácteos San Andrés', legal: 'Industrializadora de Lácteos San Andrés, S.A. de C.V.', rfc: 'ILS070227TT6',
    sectores: ['PROYECTO', 'CORPORATIVO'], giro: 'Alimentos', dueño: 'david', contacto: 'Ing. Ernesto Galindo', tel: '222 555 0134',
    dir: 'Camino Real a Cholula 4402', cp: '72810', ciudad: 'San Andrés Cholula',
    sucursales: [{ nombre: 'Planta San Andrés Cholula', num: '001', dir: 'Camino Real a Cholula 4402', lat: 19.0512, lng: -98.2951 }],
    proyecto: { titulo: 'Planta San Andrés: site de comunicaciones y videoportero', tipo: 'CABLEADO_ESTRUCTURADO', alcance: 'Rack de 42U, organización de site, videoportero y cerraduras magnéticas.' },
  },
  {
    clave: 'universidad', nombre: 'Centro Universitario Cholula Sur', legal: 'Centro Universitario Cholula Sur, S.C.', rfc: 'CUC160815P40',
    sectores: ['CORPORATIVO'], giro: 'Educación', dueño: 'antonio', contacto: 'Mtro. Javier Lozano', tel: '222 555 0195',
    dir: 'Blvd. Forjadores 1520, Tlaxcalancingo', cp: '72820', ciudad: 'San Andrés Cholula',
    sucursales: [{ nombre: 'Campus Tlaxcalancingo', num: '001', dir: 'Blvd. Forjadores 1520, Tlaxcalancingo', lat: 19.0317, lng: -98.2764 }],
  },
  {
    clave: 'animas', nombre: 'Plaza Las Ánimas', legal: 'Inmobiliaria Plaza Las Ánimas, S.A. de C.V.', rfc: 'IPA190503GH1',
    sectores: ['COMERCIAL'], giro: 'Inmobiliario', dueño: 'daniela', contacto: 'Arq. Sofía Merino', tel: '222 555 0102',
    dir: 'Blvd. Circunvalación 1402, Las Ánimas', cp: '72400', ciudad: 'Puebla', status: 'Prospecto',
    // Solo comercial: la API no le crea cliente de servicio; su ubicación se usa en las visitas.
    ubicacion: { lat: 19.0476, lng: -98.2398 },
    sucursales: [],
  },
];

const DISPOSITIVOS = [
  { resumen: 'Móvil · Android · NEXARA App', amable: 'Galaxy A54 (Android 14) · app NEXARA' },
  { resumen: 'Móvil · iOS · NEXARA App', amable: 'iPhone 13 (iOS 18.1) · app NEXARA' },
  { resumen: 'Móvil · Android · NEXARA App', amable: 'Redmi Note 13 (Android 14) · app NEXARA' },
  { resumen: 'Móvil · Android · NEXARA App', amable: 'moto g84 (Android 14) · app NEXARA' },
  { resumen: 'Móvil · iOS · NEXARA App', amable: 'iPhone 15 (iOS 18.2) · app NEXARA' },
  { resumen: 'Escritorio · Windows · Chrome', amable: 'Chrome en Windows' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Generador (puro: no toca la base, lo usa también la autoprueba)
// ─────────────────────────────────────────────────────────────────────────────

const R = (modelo, clave) => ({ $ref: `${modelo}:${clave}` });
const TK = (modelo, clave) => `{{${modelo}:${clave}}}`;

function resolverEquipo(roster) {
  const porEmail = new Map(roster.map((u) => [norm(u.email), u]));
  const get = (k) => porEmail.get(ORG[k]) || null;
  const uniq = (xs) => {
    const vistos = new Set();
    return xs.filter((u) => u && !vistos.has(u.id) && vistos.add(u.id));
  };
  const empleados = roster.filter((u) => !NO_EMPLEADOS.includes(norm(u.email)));
  const ceo = get('ceo');
  const ceoIds = [ceo, get('claudia')].filter(Boolean).map((u) => u.id);
  let campo = uniq([get('joan'), get('israel'), get('juan'), ...empleados.filter((u) => u.roleKey === 'ing_campo')]);
  let soporte = uniq([
    get('carolina'),
    get('alejandro'),
    get('roberto'),
    ...empleados.filter((u) => u.roleKey === 'ing_soporte' && norm(u.email) !== ORG.antonio),
  ]);
  const coordObra =
    get('david') || get('josue') || empleados.find((u) => ['coord_operaciones', 'arquitecto'].includes(u.roleKey)) || null;
  const encargadoObra = get('josue') || coordObra;
  const coordServ =
    get('luis') || empleados.find((u) => u.roleKey === 'coord_operaciones' && u !== coordObra) || null;
  const liderSoporte = get('antonio');
  let comerciales = uniq([get('daniela'), get('monica'), ...empleados.filter((u) => ['vendedor', 'coord_ventas'].includes(u.roleKey))]);
  const jefes = new Set([coordObra, encargadoObra, coordServ, liderSoporte].filter(Boolean).map((u) => u.id));
  if (!campo.length && !soporte.length) {
    const resto = empleados.filter((u) => !jefes.has(u.id) && !comerciales.includes(u));
    campo = resto.slice(0, Math.ceil(resto.length / 2));
    soporte = resto.slice(campo.length);
  }
  if (!soporte.length) soporte = campo;
  if (!campo.length) campo = soporte;
  if (!comerciales.length) comerciales = empleados.filter((u) => !jefes.has(u.id)).slice(0, 1);
  // Roberto solo atiende servicios: fuera de tareas y proyectos.
  const soporteGeneral = soporte.filter((u) => norm(u.email) !== ORG.roberto);
  const director = ceo || coordObra || coordServ || empleados[0] || null;
  return {
    ceo, ceoIds, director, empleados, campo, soporte, soporteGeneral: soporteGeneral.length ? soporteGeneral : soporte,
    coordObra, encargadoObra, coordServ, liderSoporte, comerciales,
    daniela: get('daniela'), monica: get('monica'),
  };
}

function generar(ctx) {
  const rnd = azar(ctx.seed);
  const now = ctx.now;
  const hoyKey = claveDia(now);
  const nowMin = minutosDelDia(now);
  const eq = resolverEquipo(ctx.roster);
  if (eq.empleados.length < 2) throw new Error('Se necesitan al menos 2 empleados activos en la empresa');
  const porId = new Map(ctx.roster.map((u) => [u.id, u]));
  const nombre = (id) => porId.get(id)?.nombre || '';
  const lote = ctx.lote;
  const urlBase = `/uploads/demo/${lote}`;
  const oficina = ctx.oficina || { lat: 19.0452, lng: -98.2296 };

  // Días de la semana: del lunes a hoy (lunes a sábado se trabaja).
  const dow = diaSemana(hoyKey);
  const desdeLunes = dow === 0 ? 6 : dow - 1;
  const dias = [];
  for (let i = desdeLunes; i >= 0; i--) {
    const k = sumarDias(hoyKey, -i);
    if (diaSemana(k) !== 0) dias.push(k);
  }
  const hoyLaboral = diaSemana(hoyKey) !== 0 ? hoyKey : null;

  const plan = {
    dias, hoy: hoyKey, filas: [], gps: [], avisos: [], archivos: [], justificaciones: [], cancelaciones: [],
    advertencias: [], resumen: {}, actividades: [], chat: { canales: [], miembros: [], mensajes: [], reacciones: [] },
  };
  const fila = (modelo, datos, clave) => {
    plan.filas.push(clave ? { modelo, clave, datos } : { modelo, datos });
  };

  // ── archivos
  let nArchivo = 0;
  function archivo(tipo, etiqueta, pdfLineas) {
    nArchivo += 1;
    const ext = pdfLineas ? 'pdf' : 'png';
    const nombreArchivo = `${String(nArchivo).padStart(4, '0')}-${tipo}.${ext}`;
    plan.archivos.push({ nombre: nombreArchivo, tipo, indice: nArchivo, etiqueta, pdf: pdfLineas || null });
    return `${urlBase}/${nombreArchivo}`;
  }

  // ── notificaciones
  const cadena = (uid) => {
    const out = [];
    const vistos = new Set([uid]);
    let cur = porId.get(uid)?.managerId ?? null;
    while (cur != null && !vistos.has(cur)) {
      if (porId.has(cur)) out.push(cur);
      vistos.add(cur);
      cur = porId.get(cur)?.managerId ?? null;
    }
    return out;
  };
  const revisores = (uid) => [...new Set([...eq.ceoIds, ...cadena(uid)])].filter((x) => x !== uid);
  function aviso(userId, a) {
    if (!userId || !porId.has(userId)) return;
    if (a.trigger != null && a.trigger === userId) return;
    let at = a.at > now ? now : a.at;
    const edadH = (now - at) / 3.6e6;
    const leida = rnd.chance(edadH > 20 ? 0.88 : edadH > 4 ? 0.6 : 0.2);
    const readAt = leida ? minDate(now, masMin(at, rnd.int(2, 95))) : null;
    plan.avisos.push({
      modelo: 'notification',
      datos: {
        userId,
        type: a.type,
        category: a.category,
        title: String(a.title).slice(0, 200),
        message: a.message,
        triggerUserId: a.trigger ?? null,
        relatedEntityId: a.entidad ?? null,
        entityType: a.entityType ?? null,
        relatedUrl: a.url ?? null,
        priority: a.priority || 'normal',
        isRead: leida,
        readAt,
        companyId: ctx.companyId,
        createdAt: at,
      },
    });
  }
  const avisarVarios = (ids, a) => [...new Set(ids)].forEach((id) => aviso(id, a));

  // ── agenda por persona y día (minutos locales)
  const ocupado = new Map();
  const eventos = new Map();
  const k = (uid, dia) => `${uid}|${dia}`;
  function marcarEvento(uid, dia, desde, hasta) {
    const e = eventos.get(k(uid, dia)) || { min: Infinity, max: -Infinity };
    e.min = Math.min(e.min, desde);
    e.max = Math.max(e.max, hasta);
    eventos.set(k(uid, dia), e);
  }
  function libre(uids, dia, s, e) {
    if (s < 520 || e > 1050) return false;
    if (s < 965 && e > 890) return false; // ventana de comida 14:50–16:05
    if (dia === hoyLaboral && e > nowMin - 5) return false;
    for (const uid of uids) {
      if (ctx.ocupados.has(k(uid, dia))) return false;
      for (const [a, b] of ocupado.get(k(uid, dia)) || []) if (s < b + 15 && e > a - 15) return false;
    }
    return true;
  }
  function colocar(uids, atras, span) {
    for (let i = dias.length - 1 - Math.min(atras, dias.length - 1); i >= 0; i--) {
      const dia = dias[i];
      const candidatos = [570 + rnd.int(0, 20), 735 + rnd.int(0, 15), 975 + rnd.int(0, 10)];
      if (dia === hoyLaboral) candidatos.push(Math.floor(nowMin - span - 8 - rnd.int(0, 25)));
      for (const s of candidatos) {
        if (libre(uids, dia, s, s + span)) {
          for (const uid of uids) {
            const lista = ocupado.get(k(uid, dia)) || [];
            lista.push([s, s + span]);
            ocupado.set(k(uid, dia), lista);
          }
          return { dia, inicio: s, indice: i };
        }
      }
    }
    return null;
  }
  const diaAnterior = (dia) => {
    const i = dias.indexOf(dia);
    return i > 0 ? dias[i - 1] : null;
  };
  function diaFuturo(n) {
    let dia = hoyKey;
    let pasos = n;
    if (n === 0 && hoyLaboral && nowMin < 900) return { dia: hoyKey, inicio: 975 };
    if (pasos === 0) pasos = 1;
    while (pasos > 0) {
      dia = sumarDias(dia, 1);
      if (diaSemana(dia) !== 0) pasos -= 1;
    }
    return { dia, inicio: rnd.pick([570, 600, 735, 975]) };
  }
  /** Momento de asignación: la tarde del día hábil previo, o temprano ese día; nunca después de `limite`. */
  function momentoAsignacion(dia, limite) {
    // Día fuera de la semana laboral (domingo o futuro): se asignó el último día hábil por la tarde.
    const previo = dias.includes(dia) ? diaAnterior(dia) : dias[dias.length - 1] || null;
    const base = previo ? enHora(previo, rnd.int(990, 1075)) : enHora(dia, rnd.int(485, 505));
    let t = minDate(base, masMin(limite, -40));
    const lunes = enHora(dias[0], 480);
    if (t < lunes) t = minDate(masMin(limite, -25), maxDate(lunes, masMin(limite, -60)));
    return minDate(t, now);
  }

  // ── clientes
  const clientes = new Map();
  const dueño = (clave) =>
    ({ josue: eq.encargadoObra, luis: eq.coordServ, david: eq.coordObra, antonio: eq.liderSoporte, monica: eq.monica, daniela: eq.daniela }[clave] ||
      eq.director);
  for (const c of CLIENTES) {
    const creado = enHora(sumarDias(hoyKey, -rnd.int(25, 70)), rnd.int(600, 1080));
    const provisiona = c.sectores.includes('PROYECTO') || c.sectores.includes('CORPORATIVO');
    if (provisiona) {
      fila('serviceClient', {
        name: c.legal, contactName: c.contacto, contactPhone: c.tel, address: `${c.dir}, C.P. ${c.cp}`, city: c.ciudad,
        state: 'Puebla', country: 'México', accountCode: c.rfc, isActive: true, companyId: ctx.companyId, createdAt: creado, updatedAt: creado,
      }, c.clave);
      c.sucursales.forEach((s, i) =>
        fila('serviceClientBranch', {
          clientId: R('serviceClient', c.clave), branchNumber: s.num, name: s.nombre, address: s.dir, city: c.ciudad, state: 'Puebla',
          country: 'México', latitud: s.lat, longitud: s.lng, isActive: true, companyId: ctx.companyId, createdAt: creado, updatedAt: creado,
        }, `${c.clave}-${i}`),
      );
    }
    fila('salesClient', {
      name: c.nombre, legalName: c.legal, taxId: c.rfc, fiscalAddress: `${c.dir}, ${c.ciudad}, Pue.`, fiscalZipCode: c.cp, fiscalRegime: '601',
      billingPhone: c.tel, industry: c.giro, status: c.status || 'Activo', notes: `Contacto: ${c.contacto}.`,
      ownerId: dueño(c.dueño)?.id ?? null, serviceClientId: provisiona ? R('serviceClient', c.clave) : null, companyId: ctx.companyId,
      createdAt: creado, updatedAt: creado,
    }, c.clave);
    for (const sector of c.sectores) {
      fila('salesClientSector', { salesClientId: R('salesClient', c.clave), sector, companyId: ctx.companyId, createdAt: creado });
    }
    if (c.proyecto && provisiona && (eq.coordObra || eq.director)) {
      const inicio = enHora(sumarDias(hoyKey, -rnd.int(18, 35)), 540);
      fila('operationalProject', {
        title: c.proyecto.titulo, description: c.proyecto.alcance, projectType: c.proyecto.tipo, scopeSummary: c.proyecto.alcance, siteCount: 1,
        status: 'ACTIVE', vendorId: (eq.coordObra || eq.director).id, clientId: R('serviceClient', c.clave), companyId: ctx.companyId,
        startDate: inicio, endDate: enHora(sumarDias(hoyKey, rnd.int(20, 45)), 1080), createdAt: inicio, updatedAt: inicio,
      }, c.clave);
      for (const ing of eq.campo.slice(0, 3)) {
        fila('projectEngineer', { projectId: R('operationalProject', c.clave), engineerId: ing.id, assignedAt: inicio });
      }
    }
    clientes.set(c.clave, { ...c, provisiona });
  }
  plan.resumen.clientes = CLIENTES.length;

  // ── actividades
  const pasosDe = (kind) =>
    kind === 'servicio'
      ? ['ENTRY_PHOTO', 'EVIDENCE_PHOTOS', 'SERVICE_SHEET_PDF', 'SERVICE_SHEET_DATA', 'EXIT_PHOTO']
      : ['ENTRY_PHOTO', 'EVIDENCE_PHOTOS', 'SERVICE_SHEET_DATA', 'EXIT_PHOTO'];
  const NOMBRE_PASO = {
    ENTRY_PHOTO: 'foto de entrada', EVIDENCE_PHOTOS: 'fotos en sitio', SERVICE_SHEET_PDF: 'hoja de servicio PDF',
    SERVICE_SHEET_DATA: 'formulario', EXIT_PHOTO: 'foto de salida',
  };
  let an = ctx.anInicio;
  const actividades = new Map();
  const sinGpsEnCurso = Boolean(ctx.sinGpsEnCurso);

  function construir(sc) {
    const kind = sc.kind;
    const cli = sc.cliente ? clientes.get(sc.cliente) : null;
    const suc = cli?.sucursales?.[sc.sucursal || 0] || null;
    const sitio = suc ? { lat: suc.lat, lng: suc.lng } : cli?.ubicacion || oficina;
    const ejecutores = (sc.ejecutores || []).filter(Boolean);
    const repartidores = (sc.repartidores || []).filter(Boolean);
    if (!sc.creador || !sc.responsable || (sc.estado !== 'pendiente' && sc.estado !== 'cancelada' && !ejecutores.length)) {
      plan.advertencias.push(`Se omite «${sc.titulo}»: falta alguien del equipo en la base`);
      return;
    }
    const estado = sc.estado;
    const spans = { entrada: 20, entradaZona: 55, tres: 125, porValidar: 160, finalizada: 160, correccion: 160, devueltaPasos: 160, devueltaTodo: 160, reasignada: 90 };
    let dia;
    let inicioMin;
    if (estado === 'pendiente') {
      const f = diaFuturo(sc.futuro || 0);
      dia = f.dia;
      inicioMin = f.inicio;
    } else if (estado === 'cancelada') {
      dia = dias[Math.max(0, dias.length - 1 - (sc.atras || 0))];
      inicioMin = 735;
      if (dia === hoyLaboral && nowMin < 660) dia = diaAnterior(dia) || dia;
    } else {
      const lugar = colocar(ejecutores.map((u) => u.id), sc.atras || 0, spans[sc.alerta === 'abierta' ? 'entradaZona' : estado] || 120);
      if (!lugar) {
        plan.advertencias.push(`Se omite «${sc.titulo}»: no hubo hueco en la agenda de la semana`);
        return;
      }
      dia = lugar.dia;
      inicioMin = lugar.inicio;
    }
    const numero = `${ctx.anPrefijo}${String(an).padStart(ctx.anAncho, '0')}`;
    an += 1;
    const clave = sc.clave;
    const estimado = { servicio: 120, obra: 240, proyecto: 180, tarea: 90, comercial: 60 }[kind];
    const maximo = estimado + rnd.pick([60, 90, 120]);
    const programada = enHora(dia, Math.round((inicioMin - (estado === 'pendiente' ? 0 : rnd.int(0, 15))) / 15) * 15);
    const llegada = estado === 'pendiente' || estado === 'cancelada' ? programada : enHora(dia, inicioMin + rnd.int(0, 4));
    const limiteAsignacion = estado === 'pendiente' ? minDate(now, masMin(programada, -60)) : llegada;
    const asignada = momentoAsignacion(estado === 'pendiente' && dia > hoyKey ? hoyKey : dia, limiteAsignacion);
    const vence = masMin(programada, maximo);
    const cliNombre = cli?.nombre || null;
    const url = `/erp/actividades/${TK('activity', clave)}`;
    const urlEv = `/erp/actividades/${TK('activity', clave)}/evidencias`;
    const tipoTicket = { servicio: sc.correctivo ? 'CORRECTIVO' : 'PREVENTIVO', obra: 'INSTALACION', proyecto: 'INSTALACION', tarea: 'OTRO', comercial: 'OTRO' }[kind];
    const act = {
      anNumber: numero, titulo: sc.titulo, descripcion: sc.descripcion || null, indicaciones: sc.indicaciones || null,
      estatus: 'Pendiente', prioridad: sc.prioridad || 'Media', activityType: cli?.provisiona ? 'CLIENT' : 'INTERNAL',
      ticketType: tipoTicket, ticketTypeCustom: kind === 'comercial' ? 'COMERCIAL' : kind === 'tarea' ? sc.subtipo || 'Otro' : null,
      workType: 'ISSUE', projectId: sc.proyecto && cli?.proyecto ? R('operationalProject', cli.clave) : null,
      clientId: cli?.provisiona ? R('serviceClient', cli.clave) : null,
      branchName: suc?.nombre || null, branchNumber: suc?.num || null, branchCity: cli?.provisiona ? cli.ciudad : null,
      branchState: cli?.provisiona ? 'Puebla' : null, branchAddress: suc?.dir || null,
      tiempoEstimadoMin: estimado, tiempoMaximoMin: maximo, creadoPorId: sc.creador.id, responsableId: sc.responsable.id,
      fechaAsignacion: asignada, fechaInicio: programada, fechaMaxima: vence, fechaEntregaEsperada: vence,
      coreKind: kind, assignmentCharge: sc.cargo || null, evidencePhotoRequired: sc.fotos || 3, companyId: ctx.companyId,
    };
    const info = { clave, numero, titulo: sc.titulo, cliente: cliNombre, dia, llegada, programada, fin: null, revision: null, responsable: sc.responsable };
    actividades.set(clave, info);

    // Equipo y avisos de asignación / despacho
    const asignados = [];
    const creador = sc.creador;
    const esDespacho = sc.cargo === 'despacho';
    const reparten = new Set(esDespacho ? [sc.responsable.id, ...repartidores.map((u) => u.id)] : []);
    const nota = esDespacho ? `Cupo: ${Math.max(1, ejecutores.length)} persona${ejecutores.length === 1 ? '' : 's'}.` : null;
    asignados.push({ userId: sc.responsable.id, rol: 'LEAD', asignadoAt: asignada, asignadoPorId: creador.id, indicaciones: nota });
    const cuando = fechaAviso(programada);
    aviso(sc.responsable.id, {
      type: 'ACTIVITY_ASSIGNED', category: 'activities', title: `Nueva actividad: ${sc.titulo}`,
      message: unir(`${persona(creador.nombre, 'Sistema')} te la asignó`, cliNombre, cuando), trigger: creador.id,
      entidad: R('activity', clave), entityType: 'Activity', url, priority: 'high', at: asignada,
    });
    avisarVarios(revisores(sc.responsable.id).filter((id) => id !== creador.id), {
      type: 'ACTIVITY_ASSIGNED', category: 'activities',
      title: `${persona(creador.nombre, 'Sistema')} asignó ${sc.titulo} a ${persona(sc.responsable.nombre, 'alguien del equipo')}`,
      message: unir(cliNombre, cuando) || 'Sin fecha programada', trigger: creador.id, entidad: R('activity', clave), entityType: 'Activity', url, at: asignada,
    });
    let t = asignada;
    let anterior = sc.responsable;
    const limiteDespacho = estado === 'pendiente' ? now : masMin(llegada, -8);
    const despachar = (miembro, rol) => {
      t = minDate(limiteDespacho, masMin(t, rnd.int(8, 35)));
      const reparte = esDespacho && rol === 'LEAD';
      asignados.push({ userId: miembro.id, rol, asignadoAt: t, asignadoPorId: anterior.id, indicaciones: reparte ? nota : null });
      aviso(miembro.id, {
        type: 'ACTIVITY_ASSIGNED', category: 'activities',
        title: reparte ? `Actividad por repartir: ${sc.titulo}` : `Nueva actividad: ${sc.titulo}`,
        message: reparte ? unir(`${persona(anterior.nombre)} te la pasó para repartir a tu equipo`, cliNombre) : unir(`${persona(anterior.nombre)} te la asignó`, cliNombre),
        trigger: anterior.id, entidad: R('activity', clave), entityType: 'Activity', url, priority: 'high', at: t,
      });
      avisarVarios([...eq.ceoIds, sc.responsable.id].filter((id) => id !== miembro.id && id !== anterior.id), {
        type: 'ACTIVITY_ASSIGNED', category: 'activities', title: `${persona(anterior.nombre)} pasó ${sc.titulo} a ${persona(miembro.nombre)}`,
        message: unir(cliNombre, reparte ? 'La reparte a su equipo' : 'La ejecuta directamente'), trigger: anterior.id,
        entidad: R('activity', clave), entityType: 'Activity', url, at: t,
      });
      if (reparte) anterior = miembro;
    };
    if (!sc.sinDespachar) {
      for (const r of repartidores) despachar(r, 'LEAD');
      for (const e of ejecutores) if (e.id !== sc.responsable.id && !(sc.reasignar && e.id === sc.reasignar.a.id)) despachar(e, esDespacho ? 'TECNICO' : 'TECNICO');
    }

    // Reasignación antes de iniciar (quien la recibe la continúa)
    let reasignacion = null;
    if (sc.reasignar) {
      const { de, a, por, motivo } = sc.reasignar;
      const tR = maxDate(masMin(asignada, 20), minDate(masMin(llegada, -rnd.int(30, 55)), now));
      reasignacion = { de, a, por, motivo, at: tR };
      act.responsableId = a.id;
      act.fechaAsignacion = tR;
      info.responsable = a;
      const previo = asignados.find((x) => x.userId === de.id);
      if (previo) previo.retiradoAt = tR;
      asignados.push({ userId: a.id, rol: 'LEAD', asignadoAt: tR, asignadoPorId: null, indicaciones: null });
      const base = { type: 'ACTIVITY_ASSIGNED', category: 'activities', trigger: por.id, entidad: R('activity', clave), entityType: 'Activity', url, at: tR };
      const mot = `Motivo: ${motivo}`;
      aviso(a.id, { ...base, title: `Te reasignaron ${sc.titulo}`, message: unir(`${persona(por.nombre)} te la pasó`, cliNombre, mot), priority: 'high' });
      aviso(de.id, { ...base, title: `${sc.titulo} pasó a ${persona(a.nombre)}`, message: unir(`${persona(por.nombre)} la reasignó`, 'Ya no estás en el equipo', mot) });
      avisarVarios([...eq.ceoIds, creador.id].filter((id) => id !== a.id && id !== de.id), {
        ...base, title: `${persona(por.nombre)} reasignó ${sc.titulo}`, message: unir(`De ${persona(de.nombre)} a ${persona(a.nombre)}`, cliNombre, mot),
      });
    }

    // Evidencias por persona que ejecuta
    const pasos = pasosDe(kind);
    const evidencias = [];
    const revisor = sc.revisor || sc.responsable;
    const ejecutoresReales = sc.reasignar ? [sc.reasignar.a] : ejecutores;
    const conEvidencia = new Set(asignados.filter((x) => !reparten.has(x.userId) || x.rol !== 'LEAD').map((x) => x.userId));
    if (!esDespacho) conEvidencia.add(sc.responsable.id);
    if (esDespacho) for (const id of reparten) conEvidencia.delete(id);
    if (sc.sinDespachar) conEvidencia.clear();

    let ultimoFin = null;
    let revisionFinal = null;
    let puntuaciones = [];
    let algunoInicio = false;

    for (const userId of conEvidencia) {
      const u = porId.get(userId);
      const ejecuta = ejecutoresReales.some((e) => e.id === userId) && !['pendiente', 'cancelada'].includes(estado);
      const creadaEn = asignados.find((x) => x.userId === userId)?.asignadoAt || asignada;
      const ev = { activityId: R('activity', clave), userId, companyId: ctx.companyId, status: 'ENTRY_PHOTO', reviewStatus: 'PENDING', createdAt: creadaEn, updatedAt: creadaEn };
      if (!ejecuta) {
        evidencias.push(ev);
        continue;
      }
      algunoInicio = true;
      const orden = ejecutoresReales.findIndex((e) => e.id === userId);
      const t0 = masMin(llegada, orden * rnd.int(2, 6));
      const origen = desplazar(sitio, rnd.int(3, 12), rnd.int(0, 359));
      const abierta = ['entrada', 'tres', 'reasignada', 'devueltaPasos', 'devueltaTodo'].includes(estado);
      const guardaGps = !(sinGpsEnCurso && abierta);
      ev.entryPhotoUrl = archivo('entrada', `${numero} entrada ${persona(u?.nombre)}`);
      ev.entryLatitude = guardaGps ? origen.lat : null;
      ev.entryLongitude = guardaGps ? origen.lng : null;
      ev.entryPhotoUploadedAt = t0;
      ev.status = 'EVIDENCE_PHOTOS';
      ev.updatedAt = t0;
      const tiempos = { t0 };
      const destinatariosAvance = [...new Set([...revisores(userId), sc.responsable.id, creador.id, ...asignados.filter((x) => x.rol === 'LEAD' && !x.retiradoAt).map((x) => x.userId)])].filter((id) => id !== userId);
      const avance = (title, message, at, priority = 'normal') =>
        avisarVarios(destinatariosAvance, { type: 'ACTIVITY_STARTED', category: 'activities', title, message, trigger: userId, entidad: R('activity', clave), entityType: 'Activity', url, priority, at });
      avance(`${persona(u?.nombre)} inició ${sc.titulo}`, unir(cliNombre, `Llegó a las ${horaAviso(t0)}`), t0, 'high');

      const hasta = { entrada: 1, tres: 3, reasignada: 2 }[estado] ?? 5;
      const nPasos = kind === 'servicio' ? hasta : Math.min(hasta, 4);
      let tt = t0;
      const fotos = sc.fotos || 3;
      const datosForm = formulario(kind, sc, cli, suc);
      if (nPasos >= 2) {
        tt = masMin(tt, rnd.int(35, 60));
        tiempos.t1 = tt;
        ev.evidencePhotos = [];
        ev.evidencePhotosGeo = [];
        for (let i = 0; i < fotos; i++) {
          ev.evidencePhotos.push(archivo('evidencia', `${numero} evidencia ${i + 1}`));
          const g = desplazar(origen, rnd.int(4, 30), rnd.int(0, 359));
          ev.evidencePhotosGeo.push({ latitude: g.lat, longitude: g.lng, capturedAt: masMin(tt, -(fotos - i) * rnd.int(3, 7)).toISOString() });
        }
        ev.evidencePhotosUploadedAt = tt;
        ev.status = kind === 'servicio' ? 'SERVICE_SHEET_PDF' : 'SERVICE_SHEET_DATA';
        avance(`${persona(u?.nombre)} subió ${fotos} fotos de evidencia`, unir(sc.titulo, cliNombre), tt);
      }
      if (kind === 'servicio' && nPasos >= 3) {
        tt = masMin(tt, rnd.int(12, 22));
        tiempos.t2 = tt;
        ev.serviceSheetPdfUrl = archivo('hoja', `${numero} hoja`, [
          'Hoja de servicio', `Folio: ${numero}`, `Actividad: ${sc.titulo}`, `Cliente: ${cliNombre || '-'}`, `Sucursal: ${suc?.nombre || '-'}`,
          `Tecnico: ${u?.nombre || '-'}`, `Fecha: ${claveDia(tt)} ${horaAviso(tt)}`, `Trabajo: ${sc.hecho || '-'}`, `Recibe: ${cli?.contacto || '-'}`,
        ]);
        ev.serviceSheetUploadedAt = tt;
        ev.status = 'SERVICE_SHEET_DATA';
        avance(`${persona(u?.nombre)} subió la hoja de servicio`, unir(sc.titulo, cliNombre), tt);
      }
      const pasoForm = kind === 'servicio' ? 4 : 3;
      if (nPasos >= pasoForm) {
        tt = masMin(tt, rnd.int(6, 12));
        tiempos.t3 = tt;
        ev.serviceSheetData = datosForm;
        ev.serviceSheetCompletedAt = tt;
        ev.status = 'EXIT_PHOTO';
        avance(`${persona(u?.nombre)} llenó el formulario de servicio`, unir(sc.titulo, cliNombre), tt);
      }
      if (nPasos >= pasos.length) {
        tt = masMin(tt, rnd.int(8, 15));
        tiempos.t4 = tt;
        const salida = desplazar(origen, rnd.int(2, 18), rnd.int(0, 359));
        ev.exitPhotoUrl = archivo('salida', `${numero} salida ${persona(u?.nombre)}`);
        ev.exitLatitude = salida.lat;
        ev.exitLongitude = salida.lng;
        ev.exitPhotoUploadedAt = tt;
        ev.status = 'COMPLETED';
        ev.completedAt = tt;
        ultimoFin = maxDate(ultimoFin || tt, tt);
        avisarVarios([...new Set([...revisores(userId), sc.responsable.id, ...asignados.filter((x) => x.rol === 'LEAD').map((x) => x.userId)])], {
          type: 'EVIDENCE_SUBMITTED', category: 'evidences', title: `${sc.titulo} lista para revisión`, message: `${persona(u?.nombre)} envió sus evidencias`,
          trigger: userId, entidad: R('activity', clave), entityType: 'Activity', url: urlEv, priority: 'high', at: tt,
        });
      }
      ev.updatedAt = tt;
      const finTrabajo = tt;
      marcarEvento(userId, dia, minutosDelDia(t0) - 30, minutosDelDia(finTrabajo) + 5);

      // Trayecto y puntos GPS mientras trabaja (dentro de ~40 m)
      const hoyAbierta = dia === hoyLaboral && !ev.completedAt;
      const finGps = hoyAbierta ? masMin(now, -rnd.int(1, 6)) : finTrabajo;
      const enCamino = desplazar(sitio, rnd.int(900, 2500), rnd.int(0, 359));
      plan.gps.push(gps(userId, null, enCamino, masMin(t0, -rnd.int(18, 28)), rnd.int(28, 46), dia));
      plan.gps.push(gps(userId, null, desplazar(sitio, rnd.int(250, 600), rnd.int(0, 359)), masMin(t0, -rnd.int(5, 9)), rnd.int(12, 25), dia));
      const alerta = sc.alerta && orden === 0 ? planAlerta(sc.alerta, tiempos, finGps) : null;
      for (let tp = masMin(t0, rnd.int(3, 8)); tp <= finGps; tp = masMin(tp, rnd.int(12, 22))) {
        const fuera = alerta && tp >= alerta.detectado && (!alerta.regreso || tp < alerta.regreso);
        const p = fuera ? desplazar(origen, rnd.int(125, alerta.max), alerta.rumbo) : desplazar(origen, rnd.int(3, 38), rnd.int(0, 359));
        plan.gps.push(gps(userId, R('activity', clave), p, tp, fuera ? rnd.int(2, 9) : rnd.int(0, 2), dia));
      }
      if (alerta) registrarAlerta(alerta, { clave, sc, userId, u, origen, cliNombre, dia });

      evidencias.push({ ...ev, _tiempos: tiempos, _datosForm: datosForm });
    }

    // Revisión según estado
    const avisoRevision = (userId, aprobada, notas, score, at, extra = {}) => {
      const cerrada = Boolean(extra.cerrada);
      const pasosTxt = (extra.pasos || []).map((s) => NOMBRE_PASO[s] || s).join(', ');
      const quien = persona(revisor.nombre, 'Tu supervisor');
      const accion = aprobada
        ? cerrada ? `${quien} aprobó las evidencias` : `${quien} aprobó la evidencia`
        : extra.todo ? `${quien} pidió rehacer toda la evidencia` : `${quien} pidió corregir: ${pasosTxt}`;
      avisarVarios([sc.responsable.id, userId, ...eq.ceoIds].filter((id) => id !== revisor.id), {
        type: aprobada ? 'EVIDENCE_APPROVED' : 'EVIDENCE_REJECTED', category: 'evidences',
        title: aprobada ? (cerrada ? `${sc.titulo} finalizada` : `Evidencia aprobada: ${sc.titulo}`) : `Evidencia devuelta: ${sc.titulo}`,
        message: unir(accion, `Calificación ${score} de 5`, `Observaciones: ${notas}`), entidad: R('activity', clave), entityType: 'Activity',
        url: urlEv, priority: aprobada ? 'normal' : 'high', at,
      });
    };
    const momentoRevision = (fin) => {
      let r = masMin(fin, rnd.int(35, 150));
      if (minutosDelDia(r) > 1110) {
        const siguiente = dias[dias.indexOf(claveDia(fin)) + 1];
        r = siguiente ? enHora(siguiente, rnd.int(545, 620)) : masMin(fin, 25);
      }
      return minDate(r, masMin(now, -3));
    };

    const completadas = evidencias.filter((e) => e.status === 'COMPLETED');
    const revisiones = [];
    if (['finalizada', 'correccion', 'devueltaPasos', 'devueltaTodo'].includes(estado)) {
      for (const ev of completadas) {
        const at = maxDate(masMin(ev.completedAt, 10), momentoRevision(ev.completedAt));
        const score = sc.score || rnd.pick([4, 5, 5]);
        const snap = snapshot(ev);
        if (estado === 'finalizada') {
          const notas = sc.notasRevision || rnd.pick(['Buen trabajo, evidencias completas y claras.', 'Todo en orden. Gracias por el reporte detallado.', 'Correcto, fotos bien tomadas y hoja firmada.']);
          revisiones.push({ activityId: R('activity', clave), companyId: ctx.companyId, evidenceUserId: ev.userId, reviewerId: revisor.id, decision: 'APROBADA', notes: notas, score, snapshot: snap, createdAt: at });
          Object.assign(ev, { reviewStatus: 'APPROVED', reviewNotes: notas, reviewedById: revisor.id, reviewedAt: at, eficienciaScore: score, updatedAt: at });
          puntuaciones.push(score);
          revisionFinal = maxDate(revisionFinal || at, at);
          ev._aviso = () => avisoRevision(ev.userId, true, notas, score, at, { cerrada: true });
        } else if (estado === 'devueltaTodo') {
          const notas = sc.notasRevision;
          revisiones.push({ activityId: R('activity', clave), companyId: ctx.companyId, evidenceUserId: ev.userId, reviewerId: revisor.id, decision: 'DEVUELTA_TODO', steps: pasos, notes: notas, score: 2, snapshot: snap, createdAt: at });
          for (const campoEv of ['entryPhotoUrl', 'entryLatitude', 'entryLongitude', 'entryPhotoUploadedAt', 'evidencePhotosUploadedAt', 'serviceSheetPdfUrl', 'serviceSheetUploadedAt', 'serviceSheetCompletedAt', 'exitPhotoUrl', 'exitLatitude', 'exitLongitude', 'exitPhotoUploadedAt', 'completedAt']) ev[campoEv] = null;
          ev.evidencePhotos = [];
          delete ev.evidencePhotosGeo;
          delete ev.serviceSheetData;
          Object.assign(ev, { status: 'ENTRY_PHOTO', reviewStatus: 'REJECTED', rejectedStep: 'ENTRY_PHOTO', rejectedSteps: pasos, reviewNotes: notas, reviewedById: revisor.id, reviewedAt: at, eficienciaScore: 2, updatedAt: at });
          ev._aviso = () => avisoRevision(ev.userId, false, notas, 2, at, { todo: true });
        } else {
          const pasosDev = sc.pasos;
          const notas = sc.notasRevision;
          const score1 = 3;
          revisiones.push({ activityId: R('activity', clave), companyId: ctx.companyId, evidenceUserId: ev.userId, reviewerId: revisor.id, decision: 'DEVUELTA_PASOS', steps: pasosDev, notes: notas, score: score1, snapshot: snap, createdAt: at });
          const primero = pasos.find((p) => pasosDev.includes(p));
          Object.assign(ev, { reviewStatus: 'REJECTED', rejectedStep: primero, rejectedSteps: pasosDev, status: primero, reviewNotes: notas, reviewedById: revisor.id, reviewedAt: at, eficienciaScore: score1, updatedAt: at });
          const avisoDev = () => avisoRevision(ev.userId, false, notas, score1, at, { pasos: pasosDev });
          if (estado === 'correccion') {
            const siguiente = dias[dias.indexOf(claveDia(at)) + 1];
            let tc = siguiente ? enHora(siguiente, rnd.int(560, 610)) : masMin(at, 45);
            tc = minDate(tc, masMin(now, -4));
            if (tc <= masMin(at, 10)) tc = minDate(masMin(at, 30), now);
            if (pasosDev.includes('EXIT_PHOTO')) {
              ev.exitPhotoUrl = archivo('salida', `${numero} salida corregida`);
              ev.exitPhotoUploadedAt = tc;
            }
            if (pasosDev.includes('EVIDENCE_PHOTOS')) {
              ev.evidencePhotos = ev.evidencePhotos.map((_, i) => archivo('evidencia', `${numero} evidencia corregida ${i + 1}`));
              ev.evidencePhotosUploadedAt = tc;
            }
            Object.assign(ev, { status: 'COMPLETED', reviewStatus: 'PENDING', rejectedStep: null, correctionSubmittedAt: tc, updatedAt: tc, completedAt: tc });
            delete ev.rejectedSteps;
            ev._aviso = () => {
              avisoDev();
              avisarVarios([...new Set([...revisores(ev.userId), sc.responsable.id])], {
                type: 'EVIDENCE_SUBMITTED', category: 'evidences', title: `${sc.titulo} corregida, lista para revisión`,
                message: `${persona(nombre(ev.userId))} corrigió lo que se le devolvió`, trigger: ev.userId, entidad: R('activity', clave), entityType: 'Activity', url: urlEv, priority: 'high', at: tc,
              });
            };
            ultimoFin = tc;
            marcarEvento(ev.userId, claveDia(tc), minutosDelDia(tc) - 20, minutosDelDia(tc) + 5);
          } else {
            ev._aviso = avisoDev;
          }
        }
      }
    }

    // Estatus de la actividad
    if (estado === 'pendiente') act.estatus = 'Pendiente';
    else if (estado === 'cancelada') act.estatus = 'Cancelada';
    else if (estado === 'finalizada' && completadas.length) {
      act.estatus = 'Finalizada';
      act.fechaFinalizacion = revisionFinal;
      act.eficienciaScore = Math.round((puntuaciones.reduce((a, b) => a + b, 0) / puntuaciones.length) * 20);
    } else if ((estado === 'porValidar' || estado === 'correccion') && completadas.length === evidencias.filter((e) => e.entryPhotoUrl || e.status === 'COMPLETED').length) {
      act.estatus = 'Por Validar';
    } else if (algunoInicio) act.estatus = 'En Proceso';
    info.estatus = act.estatus;
    info.fin = ultimoFin;
    info.revision = revisionFinal;

    // «Lista para revisión» a responsable y Christian cuando todo el equipo terminó
    if (['porValidar', 'finalizada', 'correccion', 'devueltaPasos', 'devueltaTodo'].includes(estado) && completadas.length) {
      // La hora en que terminó cada quien (antes de que una devolución la borre).
      const fin = (e) => e._tiempos?.t4 || e.completedAt || e.updatedAt;
      const ultimo = completadas.reduce((a, b) => (fin(a) > fin(b) ? a : b));
      const at = fin(ultimo);
      avisarVarios([...eq.ceoIds, sc.responsable.id], {
        type: 'ACTIVITY_COMPLETED', category: 'activities', title: `${sc.titulo} lista para revisión`,
        message: `El equipo terminó; ${persona(nombre(ultimo.userId))} subió la última evidencia`, trigger: ultimo.userId,
        entidad: R('activity', clave), entityType: 'Activity', url: urlEv, at,
      });
    }

    // Aviso SLA ya enviado para abiertas vencidas (así el cron no lo repite como nuevo).
    if (!['Finalizada', 'Cancelada'].includes(act.estatus) && vence < now) act.slaAlertedAt = minDate(now, masMin(vence, 3));

    fila('activity', act, clave);
    for (const a of asignados) fila('activityAssignee', { activityId: R('activity', clave), companyId: ctx.companyId, horasPlan: null, ...a });
    for (const ev of evidencias) {
      const { _tiempos, _datosForm, _aviso, ...datos } = ev;
      fila('activityEvidence', datos);
      if (_aviso) _aviso();
    }
    for (const r of revisiones) fila('activityEvidenceReview', r);
    if (reasignacion) {
      fila('activityReassignment', {
        activityId: R('activity', clave), deUsuarioId: reasignacion.de.id, aUsuarioId: reasignacion.a.id, movidaPorId: reasignacion.por.id,
        motivo: reasignacion.motivo, createdAt: reasignacion.at, companyId: ctx.companyId,
      });
    }
    if (sc.reprogramar && sc.reprogramar.por) {
      const antes = act.fechaInicio;
      const nueva = enHora(diaFuturo((sc.futuro || 1) + 1).dia, 735);
      const at = minDate(now, masMin(asignada, rnd.int(60, 240)));
      act.fechaInicio = nueva;
      act.fechaMaxima = masMin(nueva, maximo);
      act.fechaEntregaEsperada = act.fechaMaxima;
      fila('activityScheduleChange', { activityId: R('activity', clave), companyId: ctx.companyId, cambiadoPorId: sc.reprogramar.por.id, fechaAnterior: antes, fechaNueva: nueva, motivo: sc.reprogramar.motivo, createdAt: at });
      avisarVarios([sc.responsable.id, ...asignados.map((x) => x.userId), ...eq.ceoIds].filter((id) => id !== sc.reprogramar.por.id), {
        type: 'ACTIVITY_RESCHEDULED', category: 'activities', title: `${sc.titulo} reprogramada`,
        message: unir(`${persona(sc.reprogramar.por.nombre)} la movió al ${fechaAviso(nueva)}`, `Antes: ${fechaAviso(antes)}`, `Motivo: ${sc.reprogramar.motivo}`),
        trigger: sc.reprogramar.por.id, entidad: R('activity', clave), entityType: 'Activity', url: `/erp/actividades/${TK('activity', clave)}/historial`, priority: 'high', at,
      });
    }
    if (estado === 'cancelada' && sc.cancelar) {
      const at = minDate(now, maxDate(masMin(asignada, 90), enHora(dia, rnd.int(620, 690))));
      plan.cancelaciones.push({ clave, motivo: sc.cancelar.motivo, at, porId: sc.cancelar.por.id });
    }
    plan.actividades.push({ numero, titulo: sc.titulo, estatus: act.estatus, kind, responsable: persona(porId.get(act.responsableId)?.nombre), dia });
  }

  function formulario(kind, sc, cli, suc) {
    if (kind === 'servicio') return { sucursal: suc?.nombre || cli?.nombre || '', gerenteEncargado: cli?.contacto || '', queSeHizo: sc.hecho || '', observaciones: sc.obs || 'Sin observaciones' };
    if (kind === 'obra' || kind === 'proyecto') return { lugar: suc?.nombre || cli?.nombre || '', encargadoSitio: cli?.contacto || '', queSeHizo: sc.hecho || '', observaciones: sc.obs || 'Sin observaciones' };
    if (kind === 'comercial') return { queHiciste: sc.hecho || '', clienteOProyecto: cli?.nombre || '' };
    return { queHiciste: sc.hecho || '' };
  }
  function snapshot(ev) {
    const iso = (d) => (d ? d.toISOString() : null);
    return {
      entryPhotoUrl: ev.entryPhotoUrl ?? null, entryLatitude: ev.entryLatitude ?? null, entryLongitude: ev.entryLongitude ?? null,
      entryPhotoUploadedAt: iso(ev.entryPhotoUploadedAt), evidencePhotos: ev.evidencePhotos || [], evidencePhotosGeo: ev.evidencePhotosGeo ?? null,
      evidencePhotosUploadedAt: iso(ev.evidencePhotosUploadedAt), serviceSheetPdfUrl: ev.serviceSheetPdfUrl ?? null,
      serviceSheetUploadedAt: iso(ev.serviceSheetUploadedAt), serviceSheetData: ev.serviceSheetData ?? null,
      serviceSheetCompletedAt: iso(ev.serviceSheetCompletedAt), exitPhotoUrl: ev.exitPhotoUrl ?? null, exitLatitude: ev.exitLatitude ?? null,
      exitLongitude: ev.exitLongitude ?? null, exitPhotoUploadedAt: iso(ev.exitPhotoUploadedAt), completedAt: iso(ev.completedAt),
    };
  }
  function gps(usuarioId, actividadId, p, at, velocidad, dia) {
    return {
      modelo: 'locationTracking',
      datos: {
        usuarioId, actividadId, latitud: p.lat, longitud: p.lng, velocidadKmh: velocidad,
        estaActivo: dia === hoyLaboral, ultimaActualizacion: at, companyId: ctx.companyId,
      },
    };
  }

  // ── salidas de zona
  let nAlerta = 0;
  function planAlerta(tipo, tiempos, finGps) {
    const base = tiempos.t1 || tiempos.t0;
    const detectado = tipo === 'abierta' ? minDate(masMin(tiempos.t0, rnd.int(22, 32)), masMin(now, -4)) : masMin(base, rnd.int(4, 9));
    const regreso = tipo === 'abierta' ? null : minDate(masMin(detectado, rnd.int(14, 24)), finGps);
    return { tipo, detectado, regreso, rumbo: rnd.int(0, 359), max: rnd.int(160, 280) };
  }
  function registrarAlerta(al, x) {
    nAlerta += 1;
    const clave = `zona-${nAlerta}`;
    const distancia = rnd.int(118, 160);
    const primero = desplazar(x.origen, distancia, al.rumbo);
    const datos = {
      activityId: R('activity', x.clave), userId: x.userId, companyId: ctx.companyId, originLatitude: x.origen.lat, originLongitude: x.origen.lng,
      latitude: primero.lat, longitude: primero.lng, distanceM: distanciaM(x.origen, primero), maxDistanceM: Math.max(distanciaM(x.origen, primero), al.max),
      radiusM: 100, detectedAt: al.detectado, returnedAt: al.regreso, status: 'ABIERTA',
    };
    const nombreP = persona(x.u?.nombre);
    const hora = horaAviso(al.detectado);
    const url = `/erp/actividades/${TK('activity', x.clave)}`;
    const jefes = [...new Set([...revisores(x.userId), x.sc.responsable.id, x.sc.creador.id])].filter((id) => id !== x.userId);
    aviso(x.userId, {
      type: 'ACTIVITY_OUT_OF_ZONE', category: 'activities', title: 'Estás fuera de la zona de tu actividad',
      message: unir(x.sc.titulo, `Te alejaste ${datos.distanceM} m del punto de inicio (máx. 100 m) a las ${hora}`, 'Justifica el motivo con una foto'),
      entidad: R('activity', x.clave), entityType: 'Activity', url, priority: 'high', at: al.detectado,
    });
    avisarVarios(jefes, {
      type: 'ACTIVITY_OUT_OF_ZONE', category: 'activities', title: `${nombreP} salió de la zona de su actividad`,
      message: unir(x.sc.titulo, x.cliNombre, `A ${datos.distanceM} m del punto de inicio · ${hora}`), trigger: x.userId,
      entidad: R('activity', x.clave), entityType: 'Activity', url: `${url}/evidencias`, priority: 'high', at: al.detectado,
    });
    if (al.tipo === 'justificada') {
      const motivo = x.sc.motivoZona || 'Fui a la ferretería de la esquina por material que faltaba.';
      const at = minDate(now, masMin(al.regreso, rnd.int(4, 20)));
      Object.assign(datos, { status: 'JUSTIFICADA', justification: motivo, justificationPhotoUrl: archivo('zona', `justificación ${x.clave}`), justifiedAt: at });
      avisarVarios(jefes, {
        type: 'ACTIVITY_OUT_OF_ZONE', category: 'activities', title: `${nombreP} justificó su salida de zona`, message: unir(x.sc.titulo, `«${motivo.slice(0, 160)}»`),
        trigger: x.userId, entidad: R('activity', x.clave), entityType: 'Activity', url: `${url}/evidencias`, at,
      });
    }
    plan.filasZona = plan.filasZona || [];
    plan.filasZona.push({ modelo: 'activityGeofenceAlert', clave, datos });
    const finMin = minutosDelDia(al.regreso || now);
    marcarEvento(x.userId, x.dia, minutosDelDia(al.detectado), finMin);
  }

  // ── escenarios (quién, qué y en qué etapa)
  const S = eq.soporte;
  const SG = eq.soporteGeneral;
  const C = eq.campo;
  const at = (lista, i) => (lista.length ? lista[i % lista.length] : null);
  const dir = eq.director;
  const servicioDespacho = (base) => {
    const tecnico = base.tecnico;
    if (eq.coordServ && eq.liderSoporte) return { ...base, creador: eq.ceo || dir, responsable: eq.coordServ, cargo: 'despacho', repartidores: [eq.liderSoporte], ejecutores: [tecnico], revisor: base.revisor || eq.liderSoporte };
    if (eq.coordServ) return { ...base, creador: eq.ceo || dir, responsable: eq.coordServ, cargo: 'despacho', repartidores: [], ejecutores: [tecnico], revisor: eq.coordServ };
    return { ...base, creador: dir, responsable: tecnico, cargo: 'ejecucion', ejecutores: [tecnico], revisor: dir };
  };
  const servicioDirecto = (base) => {
    const jefe = eq.liderSoporte || eq.coordServ || dir;
    return { ...base, creador: jefe, responsable: base.tecnico, cargo: 'ejecucion', ejecutores: [base.tecnico], revisor: jefe };
  };
  const obraDespacho = (base) => {
    const jefe = eq.coordObra || dir;
    return { ...base, creador: base.creador || eq.ceo || jefe, responsable: jefe, cargo: jefe === dir ? 'ejecucion' : 'despacho', ejecutores: base.tecnicos, revisor: jefe };
  };
  const comercial = (base) => ({ ...base, kind: 'comercial', creador: eq.ceo || dir, responsable: base.quien, cargo: 'ejecucion', ejecutores: [base.quien], revisor: eq.ceo || dir, fotos: 2 });

  const escenarios = [
    // Finalizadas y aprobadas
    servicioDespacho({ clave: 'f1', kind: 'servicio', cliente: 'clinica', sucursal: 0, estado: 'finalizada', atras: 3, tecnico: at(S, 0), fotos: 4, prioridad: 'Media',
      titulo: 'Mantenimiento preventivo de CCTV (16 cámaras)', descripcion: 'Limpieza de domos, revisión de fuentes, balance de video y respaldo de configuración del NVR.',
      hecho: 'Limpieza de 16 cámaras, ajuste de enfoque en 3 y respaldo de configuración del NVR.', obs: 'La cámara 12 tiene la carcasa estrellada; se recomienda reemplazo.', score: 5 }),
    obraDespacho({ clave: 'f2', kind: 'obra', cliente: 'arcadia', proyecto: true, estado: 'finalizada', atras: 3, tecnicos: [at(C, 0), at(C, 1)].filter((x, i, a) => x && a.indexOf(x) === i), fotos: 4, prioridad: 'Alta',
      titulo: 'Cableado estructurado nivel 3 (24 nodos cat6)', descripcion: 'Tendido, terminación y certificación de 24 nodos cat6 en el nivel 3.',
      hecho: 'Se tendieron y certificaron 24 nodos cat6; patch panel etiquetado.', obs: 'Queda pendiente plafón en el pasillo norte (obra civil).' }),
    servicioDirecto({ clave: 'f3', kind: 'servicio', cliente: 'hotel', estado: 'finalizada', atras: 2, tecnico: at(S, 1), correctivo: true, fotos: 3, prioridad: 'Alta',
      titulo: 'Correctivo: DVR sin grabación en recepción', descripcion: 'El hotel reporta que el DVR de recepción no guarda video desde el fin de semana.',
      hecho: 'Disco lleno sin sobrescritura; se configuró sobrescritura y se verificó grabación continua.', obs: 'Sugerimos disco de 4 TB para 30 días de retención.' }),
    { clave: 'f4', kind: 'tarea', subtipo: 'Compra de material', estado: 'finalizada', atras: 2, creador: eq.coordObra || dir, responsable: at(C, 2), cargo: 'ejecucion', ejecutores: [at(C, 2)], revisor: eq.coordObra || dir, fotos: 2, prioridad: 'Media',
      titulo: 'Compra de material: UTP cat6 y canaleta', descripcion: '2 bobinas de UTP cat6, 30 tramos de canaleta 20×10 y cinchos.', hecho: 'Se compraron 2 bobinas UTP cat6, 30 canaletas y 2 bolsas de cinchos. Ticket en evidencias.' },
    comercial({ clave: 'f5', cliente: 'animas', estado: 'finalizada', atras: 1, quien: at(eq.comerciales, 0), prioridad: 'Media',
      titulo: 'Visita comercial: propuesta de videovigilancia', descripcion: 'Presentar propuesta de 24 cámaras para estacionamiento y pasillos.', hecho: 'Se presentó la propuesta al administrador; pide una segunda opción con cámaras 4K en accesos.' }),
    obraDespacho({ clave: 'f6', kind: 'proyecto', cliente: 'logistica', proyecto: true, estado: 'finalizada', atras: 1, tecnicos: [at(C, 1)], fotos: 4, prioridad: 'Alta', alerta: 'justificada',
      motivoZona: 'Fui a la ferretería de enfrente por taquetes y cinchos que faltaron; regresé en 15 minutos.',
      titulo: 'Instalación de control de acceso en andenes', descripcion: 'Lectoras de proximidad y botón de salida en andenes 1 a 3.', hecho: 'Se instalaron 3 lectoras, 3 botones de salida y se dieron de alta 18 tarjetas.' }),
    servicioDespacho({ clave: 'f7', kind: 'servicio', cliente: 'universidad', estado: 'finalizada', atras: 1, tecnico: at(S, 2), fotos: 3, prioridad: 'Media',
      titulo: 'Revisión de enlaces y switch PoE en campus', descripcion: 'Intermitencia en cámaras del edificio B.', hecho: 'Se reemplazó un patch cord dañado y se reinició el puerto 14 del switch PoE.', obs: 'El switch del edificio B trabaja al 85% de su presupuesto PoE.' }),
    // Por validar
    servicioDespacho({ clave: 'v1', kind: 'servicio', cliente: 'autos', estado: 'porValidar', atras: 1, tecnico: at(S, 0), fotos: 3, prioridad: 'Media',
      titulo: 'Mantenimiento preventivo de NVR y discos', hecho: 'Revisión de salud de discos y actualización de firmware del NVR.', obs: 'El disco 2 marca sectores dañados; cotizar reemplazo.' }),
    obraDespacho({ clave: 'v2', kind: 'obra', cliente: 'lacteos', proyecto: true, estado: 'porValidar', atras: 0, tecnicos: [at(C, 0)], fotos: 4, prioridad: 'Alta',
      titulo: 'Montaje de rack y organizador en site', hecho: 'Rack de 42U anclado, organizadores horizontales y reacomodo de 36 patch cords.' }),
    servicioDirecto({ clave: 'v3', kind: 'servicio', cliente: 'colegio', estado: 'correccion', atras: 1, tecnico: at(SG, 1), fotos: 3, pasos: ['EXIT_PHOTO'], prioridad: 'Media',
      notasRevision: 'La foto de salida está movida y no se ve el gabinete cerrado. Tómala de nuevo por favor.',
      titulo: 'Ajuste de ángulos y máscaras de privacidad', hecho: 'Se ajustaron 6 cámaras del patio y se configuraron máscaras hacia las casas vecinas.' }),
    comercial({ clave: 'v4', cliente: 'farmacias', sucursal: 1, estado: 'porValidar', atras: 0, quien: at(eq.comerciales, 1), prioridad: 'Media',
      titulo: 'Levantamiento comercial en sucursal La Noria', hecho: 'Levantamiento de 8 puntos de cámara y 2 accesos; fotos del mostrador y almacén.' }),
    // Devueltas
    obraDespacho({ clave: 'd1', kind: 'proyecto', cliente: 'logistica', proyecto: true, estado: 'devueltaPasos', atras: 1, tecnicos: [at(C, 2)], fotos: 4, pasos: ['EVIDENCE_PHOTOS'], prioridad: 'Alta',
      notasRevision: 'Faltan fotos del tendido en el tramo del patio y del etiquetado en ambos extremos.',
      titulo: 'Canalización y tendido para cámaras de patio', hecho: 'Canalización de 60 m con tubo conduit y tendido de 6 cables.' }),
    { clave: 'd2', kind: 'tarea', subtipo: 'Preparación de equipo', estado: 'devueltaTodo', atras: 2, creador: eq.liderSoporte || dir, responsable: at(SG, 0), cargo: 'ejecucion', ejecutores: [at(SG, 0)], revisor: eq.liderSoporte || dir, fotos: 2, prioridad: 'Baja',
      notasRevision: 'Las fotos no corresponden a las cámaras de Clínica Santa Lucía. Repite todo con los números de serie visibles.',
      titulo: 'Preparación de equipo: 6 cámaras domo para Clínica', hecho: 'Se configuraron IP y contraseñas de 6 domos.' },
    // En proceso con 3 de 5 pasos
    servicioDespacho({ clave: 't1', kind: 'servicio', cliente: 'farmacias', sucursal: 0, estado: 'tres', atras: 0, tecnico: at(S, 2), fotos: 3, alerta: 'regreso', prioridad: 'Media',
      titulo: 'Mantenimiento de control de acceso (4 puertas)', hecho: 'Revisión de cerraduras, fuentes y lectoras de 4 puertas.' }),
    obraDespacho({ clave: 't2', kind: 'obra', cliente: 'arcadia', proyecto: true, estado: 'tres', atras: 0, tecnicos: [at(C, 1)], fotos: 4, prioridad: 'Alta',
      titulo: 'Instalación de 8 cámaras perimetrales', hecho: 'Montaje de 8 bullets en barda perimetral y tendido a gabinete.' }),
    obraDespacho({ clave: 't3', kind: 'proyecto', cliente: 'lacteos', proyecto: true, estado: 'tres', atras: 0, tecnicos: [at(C, 2)], fotos: 3, prioridad: 'Media',
      titulo: 'Configuración de videoportero y cerraduras', hecho: 'Videoportero en caseta y 2 cerraduras magnéticas configuradas.' }),
    // Solo foto de entrada
    servicioDespacho({ clave: 'e1', kind: 'servicio', cliente: 'hotel', estado: 'entrada', atras: 0, tecnico: at(S, 0), correctivo: true, fotos: 3, alerta: 'abierta', prioridad: 'Urgente',
      titulo: 'Correctivo: sin video en cámaras 5 y 7', descripcion: 'Recepción reporta pantalla negra en cámaras 5 y 7 desde anoche.' }),
    { clave: 'e2', kind: 'obra', cliente: 'logistica', proyecto: true, estado: 'entrada', atras: 0, creador: eq.encargadoObra || dir, responsable: at(C, 0), cargo: 'ejecucion', ejecutores: [at(C, 0)], revisor: eq.encargadoObra || dir, fotos: 4, prioridad: 'Media',
      titulo: 'Levantamiento para ampliación de CCTV en patio de maniobras' },
    comercial({ clave: 'e3', cliente: 'colegio', estado: 'entrada', atras: 0, quien: at(eq.comerciales, 0), prioridad: 'Baja', titulo: 'Seguimiento de cotización con administración' }),
    // Reasignada: la recibe un compañero que la continúa con su propia foto de entrada
    ...(C.length >= 2
      ? [{ clave: 'r1', kind: 'obra', cliente: 'logistica', proyecto: true, estado: 'reasignada', atras: 0, creador: eq.coordObra || dir, responsable: at(C, 1), cargo: 'ejecucion',
          ejecutores: [at(C, C.length >= 3 ? 2 : 0)], revisor: eq.coordObra || dir, fotos: 3, prioridad: 'Alta',
          reasignar: { de: at(C, 1), a: at(C, C.length >= 3 ? 2 : 0), por: eq.coordObra || dir, motivo: 'Se queda cubriendo la urgencia en Constructora Arcadia; la continúa su compañero.' },
          titulo: 'Tendido de fibra óptica entre naves' }]
      : []),
    // Cancelada
    { clave: 'c1', kind: 'servicio', cliente: 'autos', estado: 'cancelada', atras: 2, creador: eq.coordServ || dir, responsable: at(S, 1), cargo: 'ejecucion', ejecutores: [at(S, 1)], prioridad: 'Baja',
      cancelar: { por: eq.coordServ || dir, motivo: 'El cliente pidió reprogramar: el estacionamiento estará cerrado por obra civil.' },
      titulo: 'Mantenimiento preventivo de cámaras en estacionamiento' },
    // Pendientes
    { clave: 'p1', kind: 'servicio', cliente: 'universidad', estado: 'pendiente', futuro: 1, creador: eq.ceo || dir, responsable: eq.coordServ || at(S, 0), cargo: eq.coordServ ? 'despacho' : 'ejecucion',
      ejecutores: eq.coordServ ? [] : [at(S, 0)], sinDespachar: Boolean(eq.coordServ), prioridad: 'Media', titulo: 'Mantenimiento trimestral de CCTV' },
    servicioDespacho({ clave: 'p2', kind: 'servicio', cliente: 'clinica', sucursal: 1, estado: 'pendiente', futuro: 1, tecnico: at(S, 0), prioridad: 'Media',
      reprogramar: { por: eq.liderSoporte || eq.coordServ, motivo: 'El cliente pidió cambiar la visita porque ese día tiene auditoría.' },
      titulo: 'Revisión de cámaras PTZ y limpieza de domos' }),
    obraDespacho({ clave: 'p3', kind: 'obra', cliente: 'arcadia', proyecto: true, estado: 'pendiente', futuro: 2, tecnicos: [at(C, 0)], prioridad: 'Alta', titulo: 'Instalación de lectoras biométricas en accesos' }),
    { clave: 'p4', kind: 'tarea', subtipo: 'Junta', estado: 'pendiente', futuro: 0, creador: eq.ceo || dir, responsable: eq.coordObra || at(C, 0), cargo: 'ejecucion', ejecutores: [eq.coordObra || at(C, 0)], prioridad: 'Media', titulo: 'Junta de arranque con Constructora Arcadia' },
    comercial({ clave: 'p5', cliente: 'animas', estado: 'pendiente', futuro: 2, quien: at(eq.comerciales, 1), prioridad: 'Media', titulo: 'Presentación de propuesta de control de acceso' }),
  ];
  for (const sc of escenarios) construir(sc);
  plan.filas.push(...(plan.filasZona || []));
  delete plan.filasZona;
  plan.resumen.actividades = actividades.size;

  // ── ausencia (una en la semana, día pasado, alguien sin actividades ese día)
  const pasados = dias.filter((d) => d !== hoyLaboral).reverse();
  const candidatos = [...eq.soporte, ...eq.comerciales, ...eq.campo, ...eq.empleados];
  let ausencia = null;
  for (const d of pasados) {
    const libres = candidatos.filter((u) => !eventos.has(k(u.id, d)) && !ctx.ocupados.has(k(u.id, d)));
    if (libres.length) {
      ausencia = { userId: libres[0].id, dia: d };
      break;
    }
  }
  if (ausencia) {
    const jefe = cadena(ausencia.userId)[0] || eq.ceo?.id || null;
    plan.justificaciones.push({ userId: ausencia.userId, companyId: ctx.companyId, date: columnaFecha(ausencia.dia), reason: 'Cita médica en el IMSS; entrega comprobante al regresar.', justifiedById: jefe, createdAt: enHora(dias[dias.indexOf(ausencia.dia) + 1] || ausencia.dia, 560) });
    plan.resumen.ausencia = `${persona(nombre(ausencia.userId))} el ${ausencia.dia}`;
  } else {
    plan.advertencias.push('No se encontró a nadie libre para marcar una falta');
  }

  // ── asistencia, comidas e inicios de sesión
  const dispositivo = (uid) => DISPOSITIVOS[uid % 5];
  const especiales = [];
  let nAsistencia = 0;
  const jornadas = [];
  for (const u of eq.empleados) {
    for (const d of dias) {
      const kk = k(u.id, d);
      if (ctx.ocupados.has(kk)) {
        plan.advertencias.push(`Ya hay asistencia/comida de ${persona(u.nombre)} el ${d}: se respeta y no se siembra ese día`);
        continue;
      }
      if (ausencia && ausencia.userId === u.id && ausencia.dia === d) continue;
      const esHoy = d === hoyLaboral;
      const ev = eventos.get(kk);
      const contratista = u.roleKey === 'ing_campo' || /contrat|temporal|prestaci|honorari|externo|freelance|obra/i.test(u.tipoContrato || '');
      const horario = ['ceo', 'super_admin'].includes(u.roleKey) ? null : contratista ? 480 : 540;
      let entradaMin = rnd.int(470, 500);
      if (rnd.chance(0.1)) entradaMin = contratista ? rnd.int(515, 540) : rnd.int(558, 575);
      if (ev) entradaMin = Math.min(entradaMin, ev.min - 20);
      entradaMin = Math.max(entradaMin, 440);
      if (esHoy && entradaMin > nowMin - 2) continue;
      const entrada = enHora(d, entradaMin + rnd.r());
      let salidaMin = rnd.int(1050, 1110);
      if (ev) salidaMin = Math.max(salidaMin, ev.max + 12);
      jornadas.push({ u, d, esHoy, entrada, entradaMin, salidaMin, horario, ev, contratista });
    }
  }
  // Comidas a destiempo: temprano aprobada, regreso tarde pendiente, regreso tarde rechazada.
  const pasadas = jornadas.filter((j) => !j.esHoy);
  const libreComida = (j, a, b) => !(ocupado.get(k(j.u.id, j.d)) || []).some(([s, e]) => a < e + 5 && b > s - 5);
  const tomar = (pred) => {
    const j = pasadas.find((x) => !x.especial && pred(x));
    if (j) j.especial = true;
    return j;
  };
  const jA = tomar((j) => libreComida(j, 845, 910));
  if (jA) jA.especial = 'temprano';
  const jB = tomar(() => true);
  if (jB) jB.especial = 'tarde-pendiente';
  const jC = tomar(() => true);
  if (jC) jC.especial = 'tarde-rechazada';

  for (const j of jornadas) {
    const { u, d, esHoy, entrada, horario } = j;
    const disp = dispositivo(u.id);
    const hora = horaAviso(entrada);
    const retardo = horario != null && j.entradaMin > horario + 15;
    const claveEntrada = `ent-${++nAsistencia}`;
    const pOficina = desplazar(oficina, rnd.int(2, 18), rnd.int(0, 359));
    fila('attendance', {
      userId: u.id, type: 'entrada', timestamp: entrada, workDate: columnaFecha(d), deviceInfo: disp.resumen,
      photoUrl: archivo('asistencia', `entrada ${persona(u.nombre)} ${d}`), entryLatitude: pOficina.lat, entryLongitude: pOficina.lng, companyId: ctx.companyId,
    }, claveEntrada);
    plan.gps.push(gps(u.id, null, pOficina, entrada, 0, d));
    aviso(u.id, { type: 'ATTENDANCE_CHECKIN', category: 'attendance', title: 'Registraste tu entrada', message: [hora, disp.resumen].join(' · '), entidad: R('attendance', claveEntrada), entityType: 'Attendance', url: '/erp/asistencias', at: entrada });
    avisarVarios(revisores(u.id), {
      type: 'ATTENDANCE_CHECKIN', category: 'attendance',
      title: retardo ? `${persona(u.nombre)} llegó con retardo` : `${persona(u.nombre)} entró a trabajar`,
      message: retardo ? unir(hora, `Su horario inicia a las ${horario === 480 ? '8:00' : '9:00'}`) : unir(hora, disp.resumen),
      trigger: u.id, entidad: u.id, entityType: 'User', url: `/erp/hr/attendance?highlight=${u.id}`, priority: retardo ? 'high' : 'normal', at: entrada,
    });

    // Comida
    let regresoComida = null;
    const quiereComer = j.especial || rnd.chance(j.contratista ? 0.85 : 0.9);
    if (quiereComer) {
      let ci = 900 + rnd.int(0, 20);
      let co = ci + rnd.int(40, 58);
      if (j.especial === 'temprano') { ci = rnd.int(848, 858); co = ci + rnd.int(42, 50); }
      if (j.especial === 'tarde-pendiente' || j.especial === 'tarde-rechazada') { ci = 910 + rnd.int(0, 10); co = rnd.int(987, 1000); }
      co = j.especial ? co : Math.min(co, 964);
      const checkin = enHora(d, ci + rnd.r());
      const checkout = enHora(d, co + rnd.r());
      if (checkin <= now) {
        const cerrada = checkout <= now;
        const inicioVentana = enHora(d, 900);
        const finVentana = enHora(d, 960);
        const limiteRegreso = enHora(d, 965);
        const tardeEntrada = checkin < inicioVentana || checkin > finVentana;
        const tardeRegreso = cerrada && checkout > limiteRegreso;
        let notes = '';
        if (checkin < inicioVentana) notes = `Entraste a comida ${Math.round((inicioVentana - checkin) / 60000)} minutos antes`;
        else if (checkin > finVentana) notes = `Entraste a comida ${Math.round((checkin - finVentana) / 60000)} minutos después del horario permitido (4 PM)`;
        if (cerrada) notes += tardeRegreso ? `\nVolviste del almuerzo ${Math.round((checkout - limiteRegreso) / 60000)} minutos después de lo esperado` : '\nVolviste del almuerzo a horario';
        const claveComida = `comida-${u.id}-${d}`;
        const jefe = cadena(u.id)[0] || eq.ceo?.id || null;
        const datos = {
          userId: u.id, date: columnaFecha(d), checkinTime: checkin, checkoutTime: cerrada ? checkout : null,
          checkinPhotoUrl: archivo('comida', `sale a comer ${persona(u.nombre)} ${d}`), checkoutPhotoUrl: cerrada ? archivo('comida', `regresa ${persona(u.nombre)} ${d}`) : null,
          status: cerrada ? 'COMPLETED' : 'IN_PROGRESS', isCheckinLate: tardeEntrada, isCheckoutLate: tardeRegreso, notes,
          checkinJustificacion: tardeEntrada ? 'Salgo antes porque a las 3 tengo visita con cliente en Zavaleta.' : null,
          checkoutJustificacion: tardeRegreso
            ? j.especial === 'tarde-rechazada' ? 'Me quedé terminando la configuración del NVR antes de comer.' : 'Se alargó la fila en el banco al pagar el material.'
            : null,
          revisionEstado: tardeEntrada || tardeRegreso ? 'PENDIENTE' : null, companyId: ctx.companyId, createdAt: checkin, updatedAt: cerrada ? checkout : checkin,
        };
        let revisado = null;
        if (j.especial === 'temprano' && jefe) {
          revisado = { estado: 'APROBADA', notas: 'Enterado, gracias por avisar.', at: masMin(checkout, rnd.int(20, 90)) };
        } else if (j.especial === 'tarde-rechazada' && jefe) {
          revisado = { estado: 'RECHAZADA', notas: 'La configuración se deja lista antes o después de comer; avisa a tu coordinador.', at: masMin(checkout, rnd.int(30, 120)) };
        }
        if (revisado && revisado.at <= now) {
          Object.assign(datos, { revisionEstado: revisado.estado, revisionNotas: revisado.notas, revisadoPorId: jefe, revisadoAt: revisado.at, updatedAt: revisado.at });
        }
        fila('lunchBreak', datos, claveComida);
        const vigilan = revisores(u.id);
        avisarVarios(vigilan, { type: 'LUNCH_CHECKIN', category: 'lunch_breaks', title: `${persona(u.nombre)} salió a comer`, message: horaAviso(checkin), trigger: u.id, entidad: u.id, entityType: 'User', url: '/erp/asistencias?tab=comidas', at: checkin });
        if (tardeEntrada) avisarVarios(vigilan, { type: 'LUNCH_CHECKIN', category: 'lunch_breaks', title: 'Comida fuera de horario por revisar', message: `${persona(u.nombre)}: ${datos.checkinJustificacion}`, trigger: u.id, entidad: R('lunchBreak', claveComida), entityType: 'LunchBreak', url: '/erp/asistencias?tab=comidas', priority: 'high', at: checkin });
        if (cerrada) {
          regresoComida = co;
          avisarVarios(vigilan, { type: 'LUNCH_CHECKOUT', category: 'lunch_breaks', title: `${persona(u.nombre)} regresó de comer`, message: horaAviso(checkout), trigger: u.id, entidad: u.id, entityType: 'User', url: '/erp/asistencias?tab=comidas', at: checkout });
          if (tardeRegreso) avisarVarios(vigilan, { type: 'LUNCH_CHECKOUT', category: 'lunch_breaks', title: 'Comida fuera de horario por revisar', message: `${persona(u.nombre)}: ${datos.checkoutJustificacion}`, trigger: u.id, entidad: R('lunchBreak', claveComida), entityType: 'LunchBreak', url: '/erp/asistencias?tab=comidas', priority: 'high', at: checkout });
        }
        if (datos.revisadoAt) {
          const aprobada = datos.revisionEstado === 'APROBADA';
          aviso(u.id, {
            type: 'LUNCH_CHECKOUT', category: 'lunch_breaks', title: aprobada ? 'Aprobaron tu comida fuera de horario' : 'Rechazaron tu comida fuera de horario',
            message: unir(`${persona(nombre(jefe), 'Tu supervisor')} ${aprobada ? 'aprobó' : 'rechazó'} tu justificación`, `Nota: ${datos.revisionNotas}`),
            trigger: jefe, entidad: R('lunchBreak', claveComida), entityType: 'LunchBreak', url: '/erp/asistencias?tab=comidas', priority: aprobada ? 'normal' : 'high', at: datos.revisadoAt,
          });
        }
        if (tardeEntrada || tardeRegreso) especiales.push(`${persona(u.nombre)} ${d}: ${datos.revisionEstado}`);
      }
    }

    // Salida
    const salidaMin = Math.max(j.salidaMin, (regresoComida || 0) + 30);
    const salida = enHora(d, salidaMin + rnd.r());
    const cerrada = !esHoy || salida <= now;
    if (cerrada) {
      const claveSalida = `sal-${nAsistencia}`;
      const pSalida = desplazar(oficina, rnd.int(2, 25), rnd.int(0, 359));
      fila('attendance', {
        userId: u.id, type: 'salida', timestamp: salida, workDate: columnaFecha(d), deviceInfo: disp.resumen,
        photoUrl: archivo('asistencia', `salida ${persona(u.nombre)} ${d}`), exitLatitude: pSalida.lat, exitLongitude: pSalida.lng, companyId: ctx.companyId,
      }, claveSalida);
      fila('attendanceDay', { userId: u.id, date: columnaFecha(d), totalMinutes: Math.ceil((salida - entrada) / 60000), lastEntryAt: null, isOpen: false, companyId: ctx.companyId });
      aviso(u.id, { type: 'ATTENDANCE_CHECKOUT', category: 'attendance', title: 'Registraste tu salida', message: [horaAviso(salida), disp.resumen].join(' · '), entidad: R('attendance', claveSalida), entityType: 'Attendance', url: '/erp/asistencias', at: salida });
      avisarVarios(revisores(u.id), { type: 'ATTENDANCE_CHECKOUT', category: 'attendance', title: `${persona(u.nombre)} terminó su jornada`, message: horaAviso(salida), trigger: u.id, entidad: u.id, entityType: 'User', url: `/erp/hr/attendance?highlight=${u.id}`, at: salida });
    } else {
      fila('attendanceDay', { userId: u.id, date: columnaFecha(d), totalMinutes: 0, lastEntryAt: entrada, isOpen: true, companyId: ctx.companyId });
    }
  }
  plan.resumen.jornadas = jornadas.length;
  plan.resumen.comidasADestiempo = especiales;

  // Avisos de inicio de sesión
  const conEntrada = jornadas.filter((j) => j.entrada <= now);
  for (let i = 0; i < Math.min(7, conEntrada.length); i++) {
    const j = conEntrada[Math.floor((i * conEntrada.length) / 7)];
    const disp = dispositivo(j.u.id);
    const atL = masMin(j.entrada, -rnd.int(4, 18));
    aviso(j.u.id, {
      type: 'ATTENDANCE_CHECKIN', category: 'security', title: `Nuevo inicio de sesión en ${disp.amable.split(' · ')[0].replace(/ \(.*\)$/, '')}`,
      message: `Iniciaste sesión desde ${disp.amable} el ${fechaAviso(atL)}. Si no fuiste tú, cambia tu contraseña y avisa a administración.`,
      entityType: 'auth', url: '/erp/my-profile', at: atL,
    });
  }

  generarChat({ plan, ctx, eq, rnd, now, dias, actividades, porId, aviso, hoyLaboral, nowMin });

  plan.resumen.archivos = plan.archivos.length;
  plan.resumen.notificaciones = plan.avisos.length;
  plan.resumen.puntosGps = plan.gps.length;
  plan.resumen.alertasZona = plan.filas.filter((f) => f.modelo === 'activityGeofenceAlert').length;
  return plan;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat
// ─────────────────────────────────────────────────────────────────────────────

function generarChat(g) {
  const { plan, ctx, eq, rnd, now, dias, actividades, porId, aviso } = g;
  const email = new Map(ctx.roster.map((u) => [norm(u.email), u]));
  const p = (k) => email.get(ORG[k]) || null;
  const ceo = eq.ceo;
  const D = eq.coordObra;
  const L = eq.coordServ;
  const A = eq.liderSoporte;
  const J = eq.encargadoObra !== eq.coordObra ? eq.encargadoObra : null;
  const S = eq.soporte;
  const C = eq.campo;
  const DA = p('daniela') || eq.comerciales[0] || null;
  const MO = p('monica') || eq.comerciales[1] || null;
  const c = (i) => (C.length ? C[i % C.length] : null);
  const s = (i) => (S.length ? S[i % S.length] : null);
  const men = (u) => (u ? `[@${nombreCorto(u.nombre)}](user:${u.id})` : null);
  const enlace = (clave) => {
    const a = actividades.get(clave);
    return a ? `[${a.numero} · ${a.titulo}](/erp/actividades/${TK('activity', clave)})` : null;
  };
  const diaIdx = (i) => {
    const lunes = dias[0];
    const key = sumarDias(lunes, i);
    return dias.includes(key) ? key : null;
  };
  const mensajes = [];
  let n = 0;
  /** Agrega un mensaje si existen autor, enlaces y el momento ya pasó. */
  function m(canal, cuando, autor, partesTexto, extra = {}) {
    if (!autor || !cuando || cuando > now) return null;
    if (partesTexto.some((x) => x == null)) return null;
    const clave = `m${++n}`;
    const msg = { clave, canal, autor, at: cuando, body: partesTexto.join(''), reacciones: (extra.reacciones || []).filter((r) => r[0] && r[0].id !== autor.id), padre: extra.padre || null };
    mensajes.push(msg);
    return msg;
  }
  const hora = (i, min) => {
    const key = diaIdx(i);
    return key ? enHora(key, min + rnd.int(0, 3) + rnd.r()) : null;
  };
  const tras = (clave, campo, minutos) => {
    const a = actividades.get(clave);
    const base = a?.[campo];
    return base ? masMin(base, minutos) : null;
  };

  // #operaciones
  m('operaciones', hora(0, 478), D, [`Buenos días. Esta semana seguimos con la obra de Constructora Arcadia y arrancamos en Logística Integral del Centro. `, men(c(0)), ' ', men(c(1)), ' hoy van a Arcadia.'], { reacciones: [[c(0), '👍'], [c(1), '👍']] });
  m('operaciones', hora(0, 490), L, ['Servicios del día: ', enlace('f1'), '. ', men(A), ' ¿a quién se la pasas?']);
  m('operaciones', hora(0, 494), A, ['Va ', men(s(0)), ', ya tiene la ruta. ', men(s(1)), ' queda libre para correctivos.'], { reacciones: [[L, '✅']] });
  m('operaciones', hora(0, 760), c(1), ['Rack del nivel 3 montado, falta peinar y etiquetar. Subo fotos al terminar.'], { reacciones: [[D, '💪']] });
  m('operaciones', hora(0, 1040), J || D, ['Recordatorio: la foto de salida se toma en el mismo punto donde iniciaron; a más de 100 m la app no la deja registrar.'], { reacciones: [[A, '👍'], [c(2), '👀']] });
  m('operaciones', hora(1, 485), D, [men(c(2)), ' antes de salir pasa al almacén por las 2 bobinas de UTP cat6 y la canaleta. ', enlace('f4')]);
  m('operaciones', hora(1, 492), c(2), ['Enterado, voy para allá.']);
  m('operaciones', tras('f3', 'fin', 12), s(1), ['Hotel Portal de Analco: el DVR no grababa por disco lleno. Ya configuré sobrescritura y quedó grabando.'], { reacciones: [[A, '🔥'], [L, '👍']] });
  m('operaciones', tras('f3', 'revision', 4), A, [men(s(1)), ' buen diagnóstico. Aprobé las evidencias de ', enlace('f3'), '.']);
  m('operaciones', hora(1, 1065), D, ['Mañana a las 9:30 arrancamos canalización en el patio de Logística. Lleven arnés y conos.'], { reacciones: [[c(2), '👍']] });
  m('operaciones', hora(2, 480), L, [men(A), ' el colegio reporta que las cámaras del patio ven hacia las casas vecinas. Hay que ajustar ángulos y máscaras.']);
  m('operaciones', hora(2, 487), A, ['La toma ', men(s(1)), ' hoy.']);
  m('operaciones', tras('d1', 'llegada', 25), c(2), ['En Logística no nos dejan pasar por el andén 4, vamos por la caseta 2.']);
  m('operaciones', tras('d1', 'llegada', 31), D, ['Ok, avísenme si les piden responsiva.']);
  const devuelta = m('operaciones', tras('f6', 'revision', 20), D, [men(c(1)), ' aprobé ', enlace('f6'), '. Vi la salida de zona justificada, todo bien.']);
  if (devuelta) devuelta.reacciones.push([c(1), '🙌']);
  m('operaciones', hora(3, 482), D, ['Hoy: ', enlace('t2'), ' en Arcadia y ', enlace('v2'), ' en Lácteos San Andrés.']);
  m('operaciones', tras('e1', 'llegada', -35), L, [men(s(0)), ' ', enlace('e1'), ': el hotel dice que las cámaras 5 y 7 siguen sin video.']);
  m('operaciones', tras('e1', 'llegada', -30), s(0), ['Voy en camino, llego en 25 minutos.'], { reacciones: [[L, '👍']] });
  m('operaciones', tras('v2', 'fin', 6), c(0), ['Rack de Lácteos terminado y organizado. Ya subí evidencias para revisión.'], { reacciones: [[D, '💪'], [ceo, '👏']] });
  m('operaciones', hora(3, 660), ceo, ['Buen avance esta semana. Prioridad hoy: cerrar lo que está por validar.'], { reacciones: [[L, '👍'], [D, '👍'], [A, '👍']] });
  m('operaciones', hora(4, 485), D, ['Viernes: cerramos pendientes de Arcadia. A las 5 p. m. junta de cierre.']);
  m('operaciones', hora(5, 540), J || D, ['Sábado medio día: guardia de servicios con ', men(s(2)), '.']);

  // #general
  m('general', hora(0, 510), DA, ['Buenos días a todos. Ya está el garrafón nuevo en la cocina.'], { reacciones: [[MO, '🙌']] });
  const llaves = m('general', hora(0, 970), MO, ['¿Alguien dejó unas llaves con llavero rojo en recepción?']);
  if (llaves) m('general', masMin(llaves.at, 8), c(2), ['Son mías, ahorita paso. Gracias, Mónica.'], { padre: llaves.clave });
  const cargador = m('general', hora(1, 860), c(0), ['¿Alguien trae cargador tipo C? Me quedé sin pila en Arcadia.']);
  if (cargador) m('general', masMin(cargador.at, 6), s(2), ['Yo traigo uno en la camioneta, te lo paso en la tarde.'], { padre: cargador.clave });
  m('general', hora(2, 810), DA, ['Llegó paquetería para operaciones, está en recepción.'], { reacciones: [[D, '👀']] });
  m('general', hora(3, 520), MO, ['Hay café de Xicotepec en la cocina, sírvanse.'], { reacciones: [[s(0), '☕'], [c(1), '🙌'], [DA, '❤️']] });

  // #anuncios
  m('anuncios', hora(0, 540), ceo, ['Equipo: las comidas fuera de 3 a 4 p. m. deben justificarse en la app. Su jefe directo las aprueba o rechaza.'], { reacciones: [[DA, '✅'], [MO, '✅'], [D, '👍']] });
  m('anuncios', hora(2, 555), MO, ['El viernes a las 5 p. m. es la junta de cierre semanal en la sala de juntas. Traigan pendientes y evidencias al día.'], { reacciones: [[D, '👍'], [L, '👍'], [A, '👍']] });

  // Directos
  const dm = (a, b) => (a && b && a.id !== b.id ? `dm-${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}` : null);
  const hablar = (a, b, cuando, lineas) => {
    const canal = dm(a, b);
    if (!canal || !cuando) return;
    let t = cuando;
    for (const [quien, texto, espera] of lineas) {
      const autor = quien === 'a' ? a : b;
      m(canal, t, autor, [texto]);
      t = masMin(t, espera || rnd.int(4, 14));
    }
  };
  hablar(D, c(0), tras('f2', 'llegada', 70), [['a', '¿Cómo va el cableado del nivel 3?'], ['b', 'Van 18 de 24 nodos. Antes de comer quedan los 24.'], ['a', 'Perfecto. Etiqueta ambos extremos y sube las fotos.', 90], ['b', 'Listo, 24 nodos certificados. Ya subí evidencias.']]);
  hablar(L, A, hora(1, 500), [['a', 'El cliente de Clínica Santa Lucía quiere cambiar la revisión de PTZ por una auditoría.'], ['b', 'Va, la reprogramo en la app y le aviso a Carolina.']]);
  hablar(A, s(0), tras('v1', 'fin', 20), [['a', '¿Te dio tiempo de revisar los discos del NVR en Volcanes?'], ['b', 'Sí, el disco 2 marca sectores dañados. Lo dejé anotado en la hoja de servicio.'], ['a', 'Gracias, lo cotizamos con Daniela.']]);
  hablar(ceo, D, hora(2, 1120), [['a', '¿Cómo vamos con Arcadia para la entrega del nivel 3?'], ['b', 'Cableado y rack listos; faltan las 8 cámaras perimetrales. Si no llueve cerramos el jueves.', 15], ['a', 'Excelente, avísame si necesitas otra camioneta.']]);
  hablar(DA, MO, hora(3, 570), [['a', '¿Ya tienes la propuesta para Plaza Las Ánimas?'], ['b', 'Casi, me falta el costo de las lectoras. Te la paso antes de la 1.']]);
  hablar(J, c(2), hora(1, 1085), [['a', 'Mañana revisa que las lectoras biométricas lleguen completas.'], ['b', 'Sí, inge. Ya confirmé con almacén.']]);
  hablar(A, s(1), tras('v3', 'fin', 10), [['a', 'Te devolví la foto de salida del colegio, salió movida.'], ['b', 'Ya vi, mañana temprano paso a tomarla de nuevo.'], ['a', 'Gracias.']]);
  hablar(ceo, L, hora(3, 600), [['a', 'Luis, ¿qué pasó con el mantenimiento del estacionamiento de Volcanes?'], ['b', 'Lo cancelaron por obra civil; quedamos de reprogramar en dos semanas.']]);

  // Canales, miembros, lecturas, reacciones y menciones
  const canalesUsados = [...new Set(mensajes.map((x) => x.canal))];
  const todos = ctx.roster.map((u) => u.id);
  const creadorCanal = (ceo || D || L || eq.empleados[0]).id;
  const inicioSemana = enHora(dias[0], 420);
  for (const canal of canalesUsados) {
    const msgs = mensajes.filter((x) => x.canal === canal).sort((a, b) => a.at - b.at);
    const raiz = msgs.filter((x) => !x.padre);
    const ultimo = raiz[raiz.length - 1] || msgs[msgs.length - 1];
    let miembros;
    let datos;
    let asegurar;
    if (canal.startsWith('dm-')) {
      const [, a, b] = canal.split('-').map(Number);
      miembros = [a, b];
      const primero = msgs[0];
      const otro = primero.autor.id === a ? b : a;
      asegurar = { dmKey: `${a}:${b}` };
      datos = { kind: 'DIRECT', dmKey: `${a}:${b}`, name: porId.get(otro)?.nombre || `Usuario ${otro}`, topic: 'Mensaje directo', createdById: primero.autor.id, createdAt: masMin(primero.at, -1), updatedAt: ultimo.at };
    } else {
      const meta = {
        general: { topic: 'Conversación del equipo', description: 'Canal abierto para toda la organización' },
        anuncios: { topic: 'Avisos importantes del equipo', description: 'Comunicados y novedades' },
        operaciones: { topic: 'Coordinación diaria de campo y servicios', description: 'Despacho, avances y dudas de las actividades del día' },
      }[canal];
      miembros = canal === 'operaciones' ? [...new Set([...(ceo ? [ceo.id] : []), ...eq.empleados.map((u) => u.id)])] : todos;
      asegurar = { slug: canal };
      datos = { kind: 'PUBLIC', slug: canal, name: canal, topic: meta.topic, description: meta.description, createdById: canal === 'operaciones' ? (D || ceo || eq.empleados[0]).id : creadorCanal, createdAt: masMin(inicioSemana, -rnd.int(20, 60) * 1440), updatedAt: ultimo.at };
    }
    datos.lastMessageAt = ultimo.at;
    datos.lastMessagePreview = preview(ultimo.body);
    datos.companyId = ctx.companyId;
    plan.chat.canales.push({ clave: canal, asegurar, datos });
    for (const uid of miembros) {
      const propios = raiz.filter((x) => x.autor.id === uid);
      let lastReadAt;
      if (ultimo.autor.id === uid) lastReadAt = ultimo.at;
      else if (rnd.chance(0.55)) lastReadAt = minDate(now, masMin(ultimo.at, rnd.int(1, 120)));
      else {
        const pendientes = rnd.int(1, Math.min(4, raiz.length));
        const ref = raiz[raiz.length - 1 - pendientes];
        lastReadAt = ref ? masMin(ref.at, 1) : propios[0]?.at || null;
      }
      plan.chat.miembros.push({ canal, userId: uid, lastReadAt, joinedAt: datos.createdAt });
    }
    for (const x of msgs) {
      plan.chat.mensajes.push({ clave: x.clave, canal, datos: { authorId: x.autor.id, kind: 'TEXT', body: x.body, createdAt: x.at, updatedAt: x.at, companyId: ctx.companyId }, padre: x.padre });
      let tr = x.at;
      const vistos = new Set();
      for (const [u, emoji] of x.reacciones) {
        if (!u || vistos.has(`${u.id}${emoji}`)) continue;
        vistos.add(`${u.id}${emoji}`);
        tr = masMin(tr, rnd.int(1, 25));
        if (tr > now) break;
        plan.chat.reacciones.push({ mensaje: x.clave, datos: { userId: u.id, emoji, createdAt: tr } });
      }
      if (!canal.startsWith('dm-')) {
        const re = /\]\(user:(\d+)\)/g;
        let mm;
        const ids = new Set();
        while ((mm = re.exec(x.body))) ids.add(Number(mm[1]));
        for (const uid of ids) {
          aviso(uid, {
            type: 'CHAT_MENTION', category: 'chat', title: `${nombreCorto(x.autor.nombre) || x.autor.nombre} te mencionó en #${canal}`,
            message: preview(x.body).slice(0, 140) || 'Te mencionaron en el chat', trigger: x.autor.id,
            entidad: R('chatMessage', x.clave), entityType: 'chat_message',
            url: `/erp/chat?channel=${TK('chatChannel', canal)}&msg=${TK('chatMessage', x.clave)}`, at: x.at,
          });
        }
      }
    }
  }
  plan.resumen.mensajesChat = plan.chat.mensajes.length;
  plan.resumen.canales = plan.chat.canales.map((x) => (x.clave.startsWith('dm-') ? 'directo' : `#${x.clave}`));
}

// ─────────────────────────────────────────────────────────────────────────────
// Escritura en base (solo con CONFIRMAR=SI)
// ─────────────────────────────────────────────────────────────────────────────

function resolver(v, refs) {
  if (v == null || v instanceof Date) return v;
  if (Array.isArray(v)) return v.map((x) => resolver(x, refs));
  if (typeof v === 'object') {
    if (v.$ref) {
      const id = refs.get(v.$ref);
      if (id == null) throw new Error(`Referencia sin resolver: ${v.$ref}`);
      return id;
    }
    const o = {};
    for (const [key, x] of Object.entries(v)) o[key] = resolver(x, refs);
    return o;
  }
  if (typeof v === 'string' && v.includes('{{')) {
    return v.replace(/\{\{([A-Za-z]+:[^}]+)\}\}/g, (_, r) => {
      const id = refs.get(r);
      if (id == null) throw new Error(`Referencia sin resolver: ${r}`);
      return String(id);
    });
  }
  return v;
}

async function escribir(tx, plan, ctx) {
  const refs = new Map();
  const ids = {};
  const anotar = (modelo, id) => (ids[modelo] = ids[modelo] || []).push(id);
  const previos = { canales: [], miembros: [] };

  async function crear(modelo, datos, clave) {
    const r = await tx[modelo].create({ data: resolver(datos, refs), select: { id: true } });
    anotar(modelo, r.id);
    if (clave) refs.set(`${modelo}:${clave}`, r.id);
    return r.id;
  }
  async function crearMuchos(modelo, filas) {
    const data = filas.map((f) => resolver(f, refs));
    for (let i = 0; i < data.length; i += 300) {
      const parte = data.slice(i, i + 300);
      if (typeof tx[modelo].createManyAndReturn === 'function') {
        const r = await tx[modelo].createManyAndReturn({ data: parte, select: { id: true } });
        r.forEach((x) => anotar(modelo, x.id));
      } else {
        for (const d of parte) anotar(modelo, (await tx[modelo].create({ data: d, select: { id: true } })).id);
      }
    }
  }

  for (const f of plan.filas) await crear(f.modelo, f.datos, f.clave);

  // Cancelación con motivo, solo si la base ya tiene esas columnas.
  const colsActividad = await tx.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'Activity' AND column_name IN ('cancelReason','cancelledAt','cancelledById')`,
  );
  if (colsActividad.length === 3) {
    for (const c of plan.cancelaciones) {
      await tx.$executeRawUnsafe(`UPDATE "Activity" SET "cancelReason" = $1, "cancelledAt" = $2, "cancelledById" = $3 WHERE id = $4`, c.motivo, c.at, c.porId, refs.get(`activity:${c.clave}`));
    }
  }

  // Justificación de falta, solo si existe la tabla y sus columnas obligatorias son las conocidas.
  const colsJust = await tx.$queryRawUnsafe(
    `SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'attendance_justifications'`,
  );
  if (colsJust.length && plan.justificaciones.length) {
    const conocidas = ['userId', 'companyId', 'date', 'reason', 'justifiedById', 'createdAt', 'updatedAt'];
    const nombres = colsJust.map((c) => c.column_name);
    const obligatorias = colsJust.filter((c) => c.is_nullable === 'NO' && c.column_default == null && c.column_name !== 'id').map((c) => c.column_name);
    if (obligatorias.every((c) => conocidas.includes(c))) {
      for (const j of plan.justificaciones) {
        const valores = { ...j, updatedAt: j.createdAt };
        const cols = conocidas.filter((c) => nombres.includes(c));
        const r = await tx.$queryRawUnsafe(
          `INSERT INTO "attendance_justifications" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
          ...cols.map((c) => valores[c]),
        );
        anotar('attendance_justifications', r[0].id);
      }
    }
  }

  // Chat: canales (se reutilizan si ya existen), miembros, mensajes y reacciones.
  const creados = new Set();
  for (const canal of plan.chat.canales) {
    const existente = await tx.chatChannel.findFirst({ where: { companyId: ctx.companyId, ...canal.asegurar } });
    if (existente) {
      refs.set(`chatChannel:${canal.clave}`, existente.id);
      if (!existente.lastMessageAt || existente.lastMessageAt < canal.datos.lastMessageAt) {
        previos.canales.push({ id: existente.id, lastMessageAt: existente.lastMessageAt, lastMessagePreview: existente.lastMessagePreview });
        await tx.chatChannel.update({ where: { id: existente.id }, data: { lastMessageAt: canal.datos.lastMessageAt, lastMessagePreview: canal.datos.lastMessagePreview, isArchived: false } });
      }
    } else {
      await crear('chatChannel', canal.datos, canal.clave);
      creados.add(canal.clave);
    }
  }
  const miembrosNuevos = [];
  for (const mb of plan.chat.miembros) {
    const channelId = refs.get(`chatChannel:${mb.canal}`);
    if (!creados.has(mb.canal)) {
      const actual = await tx.chatChannelMember.findUnique({ where: { channelId_userId: { channelId, userId: mb.userId } } });
      if (actual) {
        previos.miembros.push({ id: actual.id, lastReadAt: actual.lastReadAt });
        await tx.chatChannelMember.update({ where: { id: actual.id }, data: { lastReadAt: mb.lastReadAt } });
        continue;
      }
    }
    miembrosNuevos.push({ channelId, userId: mb.userId, role: 'member', lastReadAt: mb.lastReadAt, joinedAt: mb.joinedAt });
  }
  await crearMuchos('chatChannelMember', miembrosNuevos);
  const ordenados = [...plan.chat.mensajes].sort((a, b) => (a.padre ? 1 : 0) - (b.padre ? 1 : 0));
  for (const msg of ordenados) {
    await crear('chatMessage', { ...msg.datos, channelId: R('chatChannel', msg.canal), parentId: msg.padre ? R('chatMessage', msg.padre) : null }, msg.clave);
  }
  await crearMuchos('chatMessageReaction', plan.chat.reacciones.map((r) => ({ ...r.datos, messageId: R('chatMessage', r.mensaje) })));

  await crearMuchos('locationTracking', plan.gps.map((g) => g.datos));
  await crearMuchos('notification', plan.avisos.map((a) => a.datos));
  return { ids, previos };
}

// ─────────────────────────────────────────────────────────────────────────────
// Autoprueba (sin base de datos)
// ─────────────────────────────────────────────────────────────────────────────

function rosterDePrueba() {
  const base = [
    ['Christian Eduardo Del Pozo Sánchez', ORG.ceo, 'ceo', null],
    ['Adam Del Pozo', ORG.developer, 'ceo', null],
    ['David Morales Zenón', ORG.david, 'coord_operaciones', 1],
    ['Luis Joel Aguilar Castillo', ORG.luis, 'coord_operaciones', 1],
    ['José Antonio Ramírez', ORG.antonio, 'ing_soporte', 1],
    ['Carolina Juárez Álvarez', ORG.carolina, 'ing_soporte', 5],
    ['Alejandro González Bustamante', ORG.alejandro, 'ing_soporte', 5],
    ['Daniela Hernández', ORG.daniela, 'administrativo', 1],
    ['Josué Teodulo Cervantes Arellano', ORG.josue, 'arquitecto', 1],
    ['Mónica García Guzmán', ORG.monica, 'administrativo', 1],
    ['Joan Sebastián Sánchez Espinoza', ORG.joan, 'ing_campo', 3],
    ['Israel Ramos Lima', ORG.israel, 'ing_campo', 3],
    ['Juan José González', ORG.juan, 'ing_campo', 3],
    ['Roberto Vivanco', ORG.roberto, 'ing_soporte', 5],
  ];
  return base.map(([nombreU, email, roleKey, managerId], i) => ({ id: i + 1, nombre: nombreU, email, roleKey, managerId, tipoContrato: null }));
}

function autoprueba() {
  const errores = [];
  const ok = (cond, msg) => {
    if (!cond) errores.push(msg);
  };
  ok(nombreCorto('Christian Eduardo Del Pozo Sánchez') === 'Christian Del Pozo', 'nombreCorto de Christian');
  ok(nombreCorto('Israel Ramos Lima') === 'Israel Ramos', 'nombreCorto de Israel');
  const png = pngRelleno('entrada', 3);
  ok(png.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'firma PNG');
  ok(crc32(Buffer.from('IEND')) === 0xae426082, 'CRC32 de IEND');
  const pdf = pdfHoja(['Hoja de servicio', 'Cliente: Clínica (prueba)']);
  ok(pdf.slice(0, 8).toString() === '%PDF-1.4' && pdf.toString('latin1').includes('%%EOF'), 'PDF válido');
  ok(enHora('2026-09-17', 480).toISOString() === '2026-09-17T14:00:00.000Z', 'enHora 8:00 México = 14:00 UTC');
  ok(Math.abs(distanciaM({ lat: 19.04, lng: -98.2 }, desplazar({ lat: 19.04, lng: -98.2 }, 150, 45)) - 150) <= 2, 'desplazar 150 m');

  const momentos = ['2026-09-17T19:30:00Z', '2026-09-17T13:10:00Z', '2026-09-14T22:00:00Z', '2026-09-19T23:50:00Z', '2026-09-20T18:00:00Z'];
  for (const iso of momentos) {
    const now = new Date(iso);
    const ctx = { roster: rosterDePrueba(), companyId: 1, now, seed: 42, lote: 'demo-prueba', anInicio: 1, anPrefijo: 'AN-', anAncho: 4, ocupados: new Set() };
    const plan = generar(ctx);
    const plan2 = generar({ ...ctx, ocupados: new Set() });
    const etiqueta = `[${iso}]`;
    ok(JSON.stringify(plan) === JSON.stringify(plan2), `${etiqueta} determinista con la misma semilla`);
    const modelos = (m) => plan.filas.filter((f) => f.modelo === m);
    ok(modelos('salesClient').length >= 8 && modelos('salesClient').length <= 12, `${etiqueta} 8–12 clientes`);
    ok(modelos('serviceClientBranch').every((b) => b.datos.latitud > 18.9 && b.datos.latitud < 19.2 && b.datos.longitud < -98.1 && b.datos.longitud > -98.4), `${etiqueta} sucursales en Puebla`);
    const acts = modelos('activity');
    ok(acts.length >= (dias(plan) >= 3 ? 20 : 8), `${etiqueta} actividades suficientes (${acts.length})`);
    const futuros = new Set(['fechaInicio', 'fechaMaxima', 'fechaEntregaEsperada', 'endDate', 'fechaNueva', 'fechaAnterior']);
    const revisarFechas = (obj, donde) => {
      for (const [kk, v] of Object.entries(obj)) {
        if (v instanceof Date && !futuros.has(kk) && v > now) errores.push(`${etiqueta} ${donde}.${kk} en el futuro (${v.toISOString()})`);
      }
    };
    [...plan.filas, ...plan.avisos, ...plan.gps].forEach((f) => revisarFechas(f.datos, f.modelo));
    plan.chat.mensajes.forEach((x) => revisarFechas(x.datos, 'chatMessage'));
    plan.chat.reacciones.forEach((x) => revisarFechas(x.datos, 'reaction'));
    // Asistencia coherente
    const porPersonaDia = new Map();
    for (const f of modelos('attendance')) {
      const kk = `${f.datos.userId}|${f.datos.workDate.toISOString()}|${f.datos.type}`;
      ok(!porPersonaDia.has(kk), `${etiqueta} asistencia duplicada ${kk}`);
      porPersonaDia.set(kk, f.datos.timestamp);
    }
    for (const [kk, ts] of porPersonaDia) {
      if (kk.endsWith('|salida')) {
        const entrada = porPersonaDia.get(kk.replace(/\|salida$/, '|entrada'));
        ok(entrada && entrada < ts, `${etiqueta} salida después de entrada ${kk}`);
      }
    }
    for (const f of modelos('attendanceDay')) {
      const cerrado = !f.datos.isOpen;
      const kk = `${f.datos.userId}|${f.datos.date.toISOString()}`;
      const e = porPersonaDia.get(`${kk}|entrada`);
      const s = porPersonaDia.get(`${kk}|salida`);
      ok(cerrado ? s && Math.ceil((s - e) / 60000) === f.datos.totalMinutes : !s && f.datos.lastEntryAt, `${etiqueta} AttendanceDay coherente ${kk}`);
    }
    // Evidencias: GPS cerca del sitio y salida dentro de 100 m
    for (const f of modelos('activityEvidence')) {
      const d = f.datos;
      if (d.entryLatitude != null && d.exitLatitude != null) {
        ok(distanciaM({ lat: d.entryLatitude, lng: d.entryLongitude }, { lat: d.exitLatitude, lng: d.exitLongitude }) < 100, `${etiqueta} salida a menos de 100 m`);
      }
    }
    const alertas = modelos('activityGeofenceAlert');
    if (dias(plan) >= 3) {
      ok(alertas.length >= 2 && alertas.length <= 3, `${etiqueta} 2–3 alertas de zona (${alertas.length})`);
      ok(alertas.filter((a) => a.datos.status === 'JUSTIFICADA').length === 1, `${etiqueta} una alerta justificada`);
      ok(plan.justificaciones.length === 1, `${etiqueta} una falta`);
    }
    ok(alertas.every((a) => a.datos.distanceM > 100), `${etiqueta} alertas a más de 100 m`);
    const estados = new Set(acts.map((a) => a.datos.estatus));
    if (dias(plan) >= 3) for (const e of ['Pendiente', 'En Proceso', 'Por Validar', 'Finalizada', 'Cancelada']) ok(estados.has(e), `${etiqueta} hay actividades ${e}`);
    ok(plan.chat.mensajes.length >= (dias(plan) >= 3 ? 30 : 5), `${etiqueta} mensajes de chat (${plan.chat.mensajes.length})`);
    // Todas las referencias existen
    const claves = new Set([
      ...plan.filas.filter((f) => f.clave).map((f) => `${f.modelo}:${f.clave}`),
      ...plan.chat.canales.map((c) => `chatChannel:${c.clave}`),
      ...plan.chat.mensajes.map((x) => `chatMessage:${x.clave}`),
    ]);
    const refsTexto = JSON.stringify([plan.filas, plan.avisos, plan.gps, plan.chat]);
    for (const mm of refsTexto.matchAll(/"\$ref":"([^"]+)"/g)) ok(claves.has(mm[1]), `${etiqueta} referencia inexistente ${mm[1]}`);
    for (const mm of refsTexto.matchAll(/\{\{([A-Za-z]+:[^}]+)\}\}/g)) ok(claves.has(mm[1]), `${etiqueta} enlace inexistente ${mm[1]}`);
    const fake = new Map([...claves].map((c, i) => [c, i + 1]));
    try {
      resolver(plan.avisos.map((a) => a.datos), fake);
      resolver(plan.filas.map((f) => f.datos), fake);
    } catch (err) {
      errores.push(`${etiqueta} ${err.message}`);
    }
    console.log(`${etiqueta} días=${plan.dias.length} actividades=${acts.length} jornadas=${plan.resumen.jornadas} avisos=${plan.avisos.length} gps=${plan.gps.length} mensajes=${plan.chat.mensajes.length} archivos=${plan.archivos.length} advertencias=${plan.advertencias.length}`);
  }
  if (errores.length) {
    console.error(`\nAUTOPRUEBA FALLÓ (${errores.length}):`);
    for (const e of [...new Set(errores)].slice(0, 40)) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('\nAutoprueba correcta.');
}
function dias(plan) {
  return plan.dias.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Principal
// ─────────────────────────────────────────────────────────────────────────────

function loadPrisma() {
  try {
    return require(require.resolve('@prisma/client', { paths: [process.cwd()] }));
  } catch {
    return require('@prisma/client');
  }
}
function uploadsRoot() {
  const env = (process.env.UPLOADS_ROOT || process.env.UPLOAD_ROOT || '').trim();
  if (env) return path.resolve(env);
  for (const c of ['/app/uploads', path.resolve(process.cwd(), '..', '..', 'uploads')]) if (fs.existsSync(c)) return c;
  return path.resolve(process.cwd(), '..', '..', 'uploads');
}

async function main() {
  if (AUTOPRUEBA) return autoprueba();
  const { PrismaClient } = loadPrisma();
  const prisma = new PrismaClient();
  try {
    const companyRaw = opt('COMPANY_ID');
    const company = companyRaw
      ? await prisma.companyProfile.findUnique({ where: { id: Number(companyRaw) } })
      : (await prisma.companyProfile.findFirst({ where: { isPrimary: true }, orderBy: { id: 'asc' } })) ||
        (await prisma.companyProfile.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } }));
    if (!company) throw new Error('No se encontró la empresa');
    const now = new Date();
    const lote = opt('LOTE') || `demo-${claveDia(now).replace(/-/g, '')}`;
    if (!/^[A-Za-z0-9_-]{3,60}$/.test(lote)) throw new Error('LOTE solo admite letras, números, guion y guion bajo');
    const raiz = uploadsRoot();
    const carpeta = path.join(raiz, 'demo', lote);
    const manifiesto = path.join(carpeta, 'manifest.json');
    if (fs.existsSync(manifiesto)) throw new Error(`El lote ${lote} ya se sembró (${manifiesto}). Purga con purgar-demo.js o usa otro LOTE.`);

    let usuarios = await prisma.user.findMany({
      where: { isActive: true, companyMemberships: { some: { companyId: company.id } } },
      select: { id: true, nombre: true, email: true, roleKey: true, managerId: true, tipoContrato: true },
      orderBy: { id: 'asc' },
    });
    if (!usuarios.length) {
      usuarios = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, nombre: true, email: true, roleKey: true, managerId: true, tipoContrato: true }, orderBy: { id: 'asc' } });
    }

    // Semana y filas reales que no se deben pisar (una entrada/comida por persona y día).
    const lunes = (() => {
      const hoy = claveDia(now);
      const dow = diaSemana(hoy);
      return sumarDias(hoy, -(dow === 0 ? 6 : dow - 1));
    })();
    const desde = enHora(lunes, 0);
    const ocupados = new Set();
    const [asis, diasA, comidas] = await Promise.all([
      prisma.attendance.findMany({ where: { companyId: company.id, timestamp: { gte: desde } }, select: { userId: true, timestamp: true } }),
      prisma.attendanceDay.findMany({ where: { companyId: company.id, date: { gte: columnaFecha(lunes) } }, select: { userId: true, date: true } }),
      prisma.lunchBreak.findMany({ where: { companyId: company.id, date: { gte: columnaFecha(lunes) } }, select: { userId: true, date: true } }),
    ]);
    asis.forEach((a) => ocupados.add(`${a.userId}|${claveDia(a.timestamp)}`));
    [...diasA, ...comidas].forEach((a) => ocupados.add(`${a.userId}|${a.date.toISOString().slice(0, 10)}`));

    const ultimos = await prisma.$queryRawUnsafe(
      `SELECT "anNumber" FROM "Activity" WHERE "companyId" = $1 AND "anNumber" ~ '\\d+$' ORDER BY CAST(substring("anNumber" FROM '(\\d+)$') AS INTEGER) DESC LIMIT 1`,
      company.id,
    );
    let anPrefijo = 'AN-';
    let anAncho = 4;
    let anInicio = 1;
    const mm = ultimos[0]?.anNumber?.match(/^(.*?)(\d+)$/);
    if (mm) {
      anPrefijo = mm[1] || 'AN-';
      anAncho = mm[2].length || 4;
      anInicio = Number(mm[2]) + 1;
    }
    const actividadesPrevias = await prisma.activity.count({ where: { companyId: company.id, deletedAt: null } });
    const oficina = opt('OFICINA_LAT') && opt('OFICINA_LNG') ? { lat: Number(opt('OFICINA_LAT')), lng: Number(opt('OFICINA_LNG')) } : null;

    const ctx = {
      roster: usuarios, companyId: company.id, now, seed: Number(opt('SEMILLA') || 42), lote, anInicio, anPrefijo, anAncho, ocupados,
      oficina, sinGpsEnCurso: flag('SIN_GPS_EN_CURSO'),
    };
    const plan = generar(ctx);

    const conteo = {};
    for (const f of [...plan.filas, ...plan.gps, ...plan.avisos]) conteo[f.modelo] = (conteo[f.modelo] || 0) + 1;
    conteo.chatChannel = plan.chat.canales.length;
    conteo.chatChannelMember = plan.chat.miembros.length;
    conteo.chatMessage = plan.chat.mensajes.length;
    conteo.chatMessageReaction = plan.chat.reacciones.length;

    console.log('════════════════════════════════════════════════════════════');
    console.log(` Semana demo · empresa ${company.id} (${company.tradeName || company.legalName}) · lote ${lote}`);
    console.log(` Modo: ${APLICAR ? 'ESCRIBIR (CONFIRMAR=SI)' : 'SIMULACIÓN — no se escribe nada'}`);
    console.log(` Días: ${plan.dias.join(', ')} · ahora ${fechaAviso(now)} · ${usuarios.length} usuarios activos`);
    console.log(` Archivos en: ${carpeta}`);
    console.log('════════════════════════════════════════════════════════════');
    if (actividadesPrevias) console.log(`\n  AVISO: la empresa ya tiene ${actividadesPrevias} actividades (¿se corrió purgar-operacion.js?). Los folios siguen desde ${anPrefijo}${String(anInicio).padStart(anAncho, '0')}.`);
    console.log('\n  Filas por modelo:');
    for (const [modelo, n] of Object.entries(conteo)) console.log(`    ${String(n).padStart(6)}  ${modelo}`);
    console.log('\n  Actividades:');
    for (const a of plan.actividades) console.log(`    ${a.numero}  ${a.estatus.padEnd(11)} ${a.kind.padEnd(9)} ${a.dia}  ${a.titulo} → ${a.responsable}`);
    console.log('\n  Resumen:', JSON.stringify(plan.resumen, null, 2).replace(/\n/g, '\n  '));
    if (!ctx.sinGpsEnCurso) {
      console.log('\n  Nota: las actividades en curso llevan GPS de entrada; si un teléfono real manda ubicación lejos del sitio, la geocerca de la API');
      console.log('  puede abrir alertas y avisos reales sobre ellas. Para evitarlo: SIN_GPS_EN_CURSO=SI.');
    }
    if (plan.advertencias.length) {
      console.log('\n  Advertencias:');
      for (const w of plan.advertencias) console.log(`    - ${w}`);
    }
    if (!APLICAR) {
      console.log('\n  Nada se escribió. Para aplicar: docker exec -i -e CONFIRMAR=SI ... node - < sembrar-semana.js');
      return;
    }

    const inicio = Date.now();
    const { ids, previos } = await prisma.$transaction((tx) => escribir(tx, plan, ctx), { timeout: 15 * 60_000, maxWait: 60_000 });
    const datosManifiesto = {
      lote, companyId: company.id, creadoAt: new Date().toISOString(), carpeta: `demo/${lote}`, ids, previos,
      archivos: plan.archivos.map((a) => a.nombre), resumen: plan.resumen,
    };
    try {
      fs.mkdirSync(carpeta, { recursive: true });
      fs.writeFileSync(manifiesto, JSON.stringify(datosManifiesto, null, 2));
    } catch (err) {
      console.error(`\nNo se pudo escribir el manifiesto (${err.message}). GUARDA ESTE JSON para purgar después:`);
      console.log(JSON.stringify(datosManifiesto));
    }
    let escritos = 0;
    for (const a of plan.archivos) {
      try {
        fs.writeFileSync(path.join(carpeta, a.nombre), a.pdf ? pdfHoja(a.pdf) : pngRelleno(a.tipo, a.indice));
        escritos += 1;
      } catch (err) {
        console.error(`  No se pudo escribir ${a.nombre}: ${err.message}`);
      }
    }
    const total = Object.values(ids).reduce((s, x) => s + x.length, 0);
    console.log(`\n  Listo: ${total} filas y ${escritos} archivos en ${Math.round((Date.now() - inicio) / 1000)} s.`);
    console.log(`  Manifiesto: ${manifiesto}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(AUTOPRUEBA ? '\nERROR en la autoprueba.' : '\nERROR — la transacción se revirtió, no se escribió nada.');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
