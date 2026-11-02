/**
 * Eval de la lectura de memorias técnicas del Diseñador.
 *
 *   npm run eval:ficha -w apps/api -- --carpeta <PDFs> [--solo domo,switch] [--modelo sonnet]
 *
 * Los PDF son del fabricante: su licencia no deja redistribuirlos, así que no van en el repo. Lo que sí va
 * es la verdad de cada uno, leída a ojo de sus hojas. Sin `--carpeta` corre solo los casos escritos para la
 * prueba, que vigilan que no invente lo que el documento no dice.
 *
 * Va por la puerta con el token de pruebas (`comun.ts`). Lo que se gasta queda en `resultados/gasto.json`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ClaudeService } from '../claude/claude.service.js';
import { conPdfTemporal, imagenesDeHojas, textoDeHojas, type ImagenDeHoja } from '../../cctv-disenos/ficha-pdf.js';
import { hojasParaImagen, limpiarFicha, peticionFicha, type FichaLeida } from '../../cctv-disenos/ficha-ia.js';
import { DIR_RESULTADOS, asegurarPresupuesto, cargarLlave, gastado, modeloDe, registrarGasto } from './comun.js';

type Verdad = Record<string, unknown> & { tipo: string; modelo: string };

/** Valores que el documento sí trae. Un arreglo en un número: acepta cualquiera de esos. */
const VERDAD_REAL: Record<string, Verdad> = {
  'domo-DS-2CD1143G2-LIU.pdf': { tipo: 'domo', modelo: 'DS-2CD1143G2-LIU', pxHoriz: 2560, pxVert: 1440, sensor: '1/3', focalesMm: '2.8,4', hfovDeg: 98, vfovDeg: 54, irM: 30, diametroMm: 121.4, altoMm: 97.7, altoCarcasaMm: 50.1, radioCupulaMm: 42.4, pesoG: 550, ip: 'IP67', ik: 'IK08', poeW: 7.5, color: 'negro' },
  'turret-DS-2CD2347G2-LU-C.pdf': { tipo: 'turret', modelo: 'DS-2CD2347G2-L', pxHoriz: 2688, pxVert: 1520, sensor: '1/1.8', focalesMm: '2.8,4,6', hfovDeg: 112, vfovDeg: 61, irM: 30, diametroMm: 138.3, altoMm: 125.2, pesoG: 750, ip: 'IP67', poeW: 7.6, color: 'blanco' },
  'bala-DS-2CD1T47G3-LIUF-LSL.pdf': { tipo: 'bala', modelo: 'DS-2CD1T47G3-LIU', pxHoriz: 2560, pxVert: 1440, sensor: '1/3', focalesMm: '2.8,4', hfovDeg: 101, vfovDeg: 55, irM: 50, anchoMm: 144.6, altoMm: 197, fondoMm: 253, pesoG: 430, ip: 'IP67', poeW: 14.5, color: 'blanco', cajaTrasera: true },
  'ptz-DS-2DE4A425IWG1-E.pdf': { tipo: 'ptz', modelo: 'DS-2DE4A425IWG1-E', pxHoriz: 2560, pxVert: 1440, sensor: '1/2.8', focalMinMm: 4.8, focalMaxMm: 120, hfovDeg: 53.3, zoomOptico: 25, irM: 50, diametroMm: 169, altoMm: 161, pesoG: 2450, ip: 'IP67', wattsMax: 24, color: 'blanco' },
  'nvr-DS-7608NXI-K2D.pdf': { tipo: 'nvr', modelo: 'DS-7608NXI-K2', canales: 8, bahias: 2, mbpsEntrada: 80, anchoMm: 385, fondoMm: 315, altoMm: 52, pesoG: 1000, color: 'negro' },
  'alarma-DS-PWA96-Kit1-WE.pdf': { tipo: 'panel', modelo: 'DS-PWA96-Kit1-WE', anchoMm: 170, altoMm: 170, fondoMm: 38.6, pesoG: 557.5, color: 'blanco' },
  'barrera-DS-TMG421.pdf': { tipo: 'barrera', modelo: 'DS-TMG421', ip: 'IP54', ik: 'IK09', pesoG: 43000, wattsMax: [158, 168], plumaM: 3 },
  'switch-DS-3E0526P-E-B.pdf': { tipo: 'switch', modelo: 'DS-3E0526P-E', puertos: 24, puertosPoe: 24, poeTotalW: 370, wattsMax: 400, anchoMm: 440, altoMm: 44, fondoMm: 220.8, pesoG: 2880 },
  'terminal-DS-K1T341AM.pdf': { tipo: 'terminal', modelo: 'DS-K1T341AM', pantallaPulgadas: 4.3, altoMm: 172.5, anchoMm: 83.2, fondoMm: 22.7 },
  // Otras marcas: no solo se vende Hikvision. La del grabador y la de la terminal están en español.
  'axis-domo-P3265-LV.pdf': { tipo: 'domo', marca: 'Axis', modelo: 'P3265-LV', pxHoriz: 1920, pxVert: 1080, sensor: '1/2.8', focalMinMm: 3.4, focalMaxMm: 8.9, hfovDeg: 100, vfovDeg: 53, wattsMax: 8.9, diametroMm: 149, altoMm: 103, pesoG: 650, ip: 'IP52', ik: 'IK10' },
  'dahua-turret-IPC-HDW2441T-S.pdf': { tipo: 'turret', marca: 'Dahua', modelo: 'IPC-HDW2441T-S', pxHoriz: 2688, pxVert: 1520, sensor: '1/2.9', focalesMm: '2.8,3.6', hfovDeg: 95, vfovDeg: 52, irM: 30, diametroMm: 109.9, altoMm: 100.9, pesoG: 370, ip: 'IP67' },
  'dahua-bala-IPC-HFW2541E-S.pdf': { tipo: 'bala', marca: 'Dahua', modelo: 'IPC-HFW2541E-S', pxHoriz: 2592, pxVert: 1944, sensor: '1/2.7', focalesMm: '2.8,3.6', hfovDeg: 97, vfovDeg: 71, irM: 30, fondoMm: 192.7, ip: 'IP67' },
  'dahua-nvr-NVR4108HS-8P-4KS3.pdf': { tipo: 'nvr', marca: 'Dahua', modelo: 'NVR4108HS-8P-4KS3', canales: 8, bahias: 1, mbpsEntrada: 160, unidades: 1, anchoMm: 260, fondoMm: 232.5, altoMm: 47.6, pesoG: 920 },
  'tplink-switch-TL-SL1218MP.pdf': { tipo: 'switch', marca: 'TP-Link', modelo: 'TL-SL1218MP', puertos: 16, poeTotalW: 250, wattsMax: 299.96, anchoMm: 440, fondoMm: 180, altoMm: 44 },
  'zkteco-terminal-SpeedFaceV5L.pdf': { tipo: 'terminal', marca: 'ZKTeco', modelo: 'SpeedFace', pantallaPulgadas: 5, altoMm: 202.93, anchoMm: 91.93, fondoMm: 21.5, pesoG: 600 },
};

/** Escritos para la prueba: trampas de empaque, de unidades y de lo que no dice. */
const CASOS_ESCRITOS: Array<{ id: string; paginas: string[]; verdad: Verdad; noDebe: string[] }> = [
  {
    id: 'empaque',
    paginas: ['ACME XS-200 Network Switch\n8 port gigabit PoE switch.\n\nSpecifications\nPorts: 8 x Gigabit PoE, 2 x SFP uplink\nPoE Power Budget: 65 W\nDimensions (W × H × D): 210 × 30 × 120 mm\nWeight: 0.8 kg\n\nPackage\nPackage Dimensions: 300 × 90 × 200 mm\nPackage Weight: 1.5 kg'],
    verdad: { tipo: 'switch', modelo: 'XS-200', puertos: 8, poeTotalW: 65, anchoMm: 210, altoMm: 30, fondoMm: 120, pesoG: 800 },
    noDebe: [],
  },
  {
    id: 'sin-medidas',
    paginas: ['ACME DC-40 Dome Camera\n4 MP fixed dome network camera.\nResolution: 2560 × 1440\nLens: 2.8 mm\nProtection: IP66\n\nFor dimensions, please contact your dealer.'],
    verdad: { tipo: 'domo', modelo: 'DC-40', pxHoriz: 2560, pxVert: 1440, ip: 'IP66' },
    noDebe: ['diametroMm', 'altoMm', 'pesoG', 'poeW', 'irM', 'ik'],
  },
  {
    id: 'alerta-sismica',
    paginas: ['SASMEX receptor RS-60\nReceptor de alerta sísmica con estrobo y bocina para muro.\nPotencia del audio: 100 dB\nAlimentación: 12 VDC, 500 mA\nMedidas: 200 × 150 × 60 mm (alto × ancho × fondo)\nPeso: 1.2 kg'],
    verdad: { tipo: 'sismica', modelo: 'RS-60', decibeles: 100, altoMm: 200, anchoMm: 150, fondoMm: 60, pesoG: 1200 },
    noDebe: ['alcanceM', 'poeW'],
  },
  {
    id: 'otra-cosa',
    paginas: ['ACME TV-55 Professional Monitor\n55 inch 4K display for video walls.\nDimensions: 1230 × 710 × 60 mm\nWeight: 18 kg'],
    verdad: { tipo: 'generico', modelo: 'TV-55', anchoMm: 1230, altoMm: 710, fondoMm: 60, pesoG: 18000, pantallaPulgadas: 55 },
    noDebe: ['canales', 'puertos'],
  },
];

function argumentos(): Record<string, string> {
  const salida: Record<string, string> = {};
  const lista = process.argv.slice(2);
  for (let i = 0; i < lista.length; i += 2) salida[lista[i].replace(/^--/, '')] = lista[i + 1];
  return salida;
}

const numero = (v: unknown) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

function coincide(esperado: unknown, real: unknown): boolean {
  if (real === undefined || real === null || real === '') return false;
  if (Array.isArray(esperado)) return esperado.some((e) => coincide(e, real));
  if (typeof esperado === 'boolean') return real === esperado;
  if (typeof esperado === 'number') {
    const n = numero(real);
    return n !== null && Math.abs(n - esperado) <= Math.abs(esperado) * 0.01;
  }
  const a = String(esperado).toUpperCase().replace(/\s/g, '');
  const b = String(real).toUpperCase().replace(/\s/g, '');
  return b.includes(a) || a.includes(b);
}

function valorDe(f: FichaLeida, campo: string): unknown {
  if (campo in f && campo !== 'datos') return (f as Record<string, unknown>)[campo];
  return f.datos.find((d) => d.campo === campo)?.valor;
}

type Medida = { caso: string; total: number; bien: number; fallas: string[]; usd: number | null; ms: number; hojasImagen: number[]; kb: number; sinHoja: number };

function calificar(caso: string, f: FichaLeida, verdad: Verdad, noDebe: string[], base: Omit<Medida, 'caso' | 'total' | 'bien' | 'fallas' | 'sinHoja'>): Medida {
  const fallas: string[] = [];
  let bien = 0;
  const entradas = Object.entries(verdad);
  for (const [campo, esperado] of entradas) {
    const real = valorDe(f, campo);
    if (coincide(esperado, real)) bien++;
    else fallas.push(`${campo}: esperaba ${JSON.stringify(esperado)}, leyó ${JSON.stringify(real ?? null)}`);
  }
  for (const campo of noDebe) {
    if (valorDe(f, campo) !== undefined) fallas.push(`${campo}: inventó ${JSON.stringify(valorDe(f, campo))}`);
    else bien++;
  }
  return { caso, total: entradas.length + noDebe.length, bien, fallas, sinHoja: f.datos.filter((d) => d.hoja === null).length, ...base };
}

async function main() {
  const args = argumentos();
  console.log(cargarLlave());
  asegurarPresupuesto();
  const claude = new ClaudeService();
  const modelo = modeloDe(args.modelo);
  const medidas: Medida[] = [];
  const leidas: Record<string, FichaLeida> = {};
  const llamar = async (paginas: string[], imagenes: ImagenDeHoja[]) => {
    const t0 = Date.now();
    const { datos, uso } = await claude.json<Record<string, unknown>>({
      ...peticionFicha(paginas, imagenes.map((i) => i.hoja)),
      modelo,
      proceso: 'eval-cctv-ficha',
      companyId: 0,
      imagenes,
    });
    registrarGasto('cctv-ficha', uso.usdAprox ?? 0);
    return { f: limpiarFicha(datos, paginas.length), usd: uso.usdAprox, ms: Date.now() - t0 };
  };

  const solo = args.solo?.split(',').map((x) => x.trim()).filter(Boolean);
  const entra = (nombre: string) => !solo || solo.some((x) => nombre.includes(x));

  for (const c of CASOS_ESCRITOS) {
    if (!entra(c.id)) continue;
    const { f, usd, ms } = await llamar(c.paginas, []);
    medidas.push(calificar(`escrito:${c.id}`, f, c.verdad, c.noDebe, { usd, ms, hojasImagen: [], kb: 0 }));
  }

  if (args.carpeta) {
    for (const [archivo, verdad] of Object.entries(VERDAD_REAL)) {
      const ruta = join(args.carpeta, archivo);
      if (!entra(archivo)) continue;
      if (!existsSync(ruta)) {
        console.log(`falta ${archivo}`);
        continue;
      }
      const m = await conPdfTemporal(readFileSync(ruta), async (temporal, carpeta) => {
        const paginas = await textoDeHojas(temporal);
        const imagenes = await imagenesDeHojas(temporal, hojasParaImagen(paginas), carpeta);
        const { f, usd, ms } = await llamar(paginas, imagenes);
        leidas[archivo] = f;
        return calificar(archivo, f, verdad, [], { usd, ms, hojasImagen: imagenes.map((i) => i.hoja), kb: Math.round(imagenes.reduce((a, i) => a + i.base64.length, 0) / 1024) });
      });
      medidas.push(m);
    }
  }

  const total = medidas.reduce((a, m) => a + m.total, 0);
  const bien = medidas.reduce((a, m) => a + m.bien, 0);
  for (const m of medidas) {
    console.log(`${m.bien === m.total ? 'OK ' : 'MAL'} ${m.caso.padEnd(34)} ${m.bien}/${m.total}  ${(m.ms / 1000).toFixed(1)} s  US$${m.usd ?? '?'}  hojas ${m.hojasImagen.join(',') || '-'}  ${m.kb} KB  sin hoja ${m.sinHoja}`);
    for (const x of m.fallas) console.log(`      ${x}`);
  }
  const tiempos = medidas.map((m) => m.ms).sort((a, b) => a - b);
  const costo = medidas.reduce((a, m) => a + (m.usd ?? 0), 0);
  const resumen = {
    fecha: new Date().toISOString(),
    modelo,
    bien,
    total,
    pct: Math.round((bien / total) * 1000) / 10,
    usdPorFicha: Number((costo / medidas.length).toFixed(5)),
    p50s: tiempos[Math.floor(tiempos.length / 2)] / 1000,
    maxS: tiempos[tiempos.length - 1] / 1000,
    casos: medidas.map((m) => ({ caso: m.caso, bien: m.bien, total: m.total, fallas: m.fallas })),
  };
  console.log(`\n${bien}/${total} (${resumen.pct} %), US$${resumen.usdPorFicha} por ficha, p50 ${resumen.p50s} s, máx ${resumen.maxS} s. Gastado en pruebas: ${gastado()}`);
  mkdirSync(DIR_RESULTADOS, { recursive: true });
  // Lo leído de cada ficha del fabricante queda fuera de git.
  if (args.volcar) writeFileSync(args.volcar, JSON.stringify(leidas, null, 1));
  writeFileSync(join(DIR_RESULTADOS, 'ficha.json'), `${JSON.stringify(resumen, null, 2)}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
