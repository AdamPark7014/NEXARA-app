/**
 * Eval de la IA del Diseñador que convierte una frase en datos.
 *
 *   npm run eval:sitio -w apps/api [-- --solo s03,e02]
 *
 * Frases escritas para la prueba, de cómo le habla a esto alguien a quien le cuesta el sistema: cortas, sin
 * tecnicismos y con faltas. Se revisa por código. Vigila sobre todo que no invente. Va por la puerta con el
 * token de pruebas (`comun.ts`).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ClaudeService } from '../claude/claude.service.js';
import { limpiarFicha } from '../../cctv-disenos/ficha-ia.js';
import { completarAreas, limpiarSitio, peticionDescripcion, peticionSitio } from '../../cctv-disenos/sitio-ia.js';
import { DIR_RESULTADOS, asegurarPresupuesto, cargarLlave, gastado, registrarGasto } from './comun.js';

type CasoSitio = { id: string; frase: string; espera: Record<string, unknown>; tipos?: string[]; sinInventar?: string[] };

const SITIOS: CasoSitio[] = [
  { id: 's01', frase: 'bodega de 40 por 25 con oficinas al frente y patio de maniobras, 12 camaras', espera: { anchoM: 40, fondoM: 25, camaras: 12 }, tipos: ['bodega', 'oficina', 'patio'], sinInventar: ['accesos', 'sismica', 'sirena', 'alturaM'] },
  { id: 's02', frase: 'una tienda', espera: {}, tipos: ['tienda'], sinInventar: ['anchoM', 'fondoM', 'camaras', 'accesos', 'sismica', 'sirena'] },
  { id: 's03', frase: 'escuela de dos pisos con 20 camaras dahua y alerta sismica', espera: { camaras: 20, marca: 'dahua', sismica: 1 }, tipos: ['patio'], sinInventar: ['anchoM', 'sirena', 'accesos'] },
  { id: 's04', frase: 'oficinas de 300 metros, sala de juntas, recepcion y site. control de acceso en la entrada y en el site', espera: { accesos: 2 }, tipos: ['oficina', 'sala', 'recepcion', 'ti'], sinInventar: ['camaras', 'sismica'] },
  { id: 's05', frase: 'nave industrial de 6 metros de alto con estacionamiento y barrera vehicular', espera: { alturaM: 6, barrera: true }, tipos: ['bodega', 'estacionamiento'], sinInventar: ['camaras', 'anchoM'] },
  { id: 's06', frase: 'taller mecanico chico, 4 camaras, guardar 15 dias', espera: { camaras: 4, grabacionDias: 15 }, tipos: ['bodega'], sinInventar: ['accesos', 'sirena'] },
  { id: 's07', frase: 'almacen de 20x30 mas una oficina de 5x4 y un cuarto de ti', espera: {}, tipos: ['bodega', 'oficina', 'ti'], sinInventar: ['camaras'] },
  { id: 's08', frase: 'dos sirenas y tres alertas sismicas en un edificio de oficinas', espera: { sirena: 2, sismica: 3 }, tipos: ['oficina'], sinInventar: ['camaras', 'accesos'] },
  { id: 's09', frase: 'colegio con patio, 10 salones en planta baja y laboratorio arriba', espera: {}, tipos: ['patio', 'aula'], sinInventar: ['camaras', 'barrera'] },
  { id: 's10', frase: 'quiero 3 camaras en la caja y 5 en el piso de venta de mi tienda', espera: {}, tipos: ['tienda'], sinInventar: ['anchoM'] },
  { id: 's11', frase: 'restaurante con cocina, comedor, y estacionamiento afuera', espera: {}, tipos: ['estacionamiento'], sinInventar: ['camaras', 'accesos', 'sismica'] },
  { id: 's12', frase: 'bodega hikvision 8 camaras', espera: { camaras: 8, marca: 'hikvision' }, tipos: ['bodega'], sinInventar: ['accesos'] },
  { id: 's13', frase: 'bodega de 36 por 22 con oficinas al frente, recepcion, sala de juntas, cuarto de ti y patio de maniobras con barrera. 14 camaras dahua, acceso en la recepcion y en el site, dos alertas sismicas y dos sirenas, guardar 45 dias', espera: { anchoM: 36, fondoM: 22, camaras: 14, marca: 'dahua', accesos: 2, sismica: 2, sirena: 2, grabacionDias: 45, barrera: true }, tipos: ['bodega', 'oficina', 'recepcion', 'sala', 'ti', 'patio'] },
  { id: 's14', frase: 'nave de 50 x 30 con un cuarto de servidores y una oficina', espera: { anchoM: 50, fondoM: 30 }, tipos: ['bodega', 'ti', 'oficina'], sinInventar: ['camaras'] },
  { id: 's15', frase: 'tienda de 20 por 15 con bodega atras y caja al frente', espera: { anchoM: 20, fondoM: 15 }, tipos: ['tienda', 'bodega'], sinInventar: ['camaras'] },
];

type CasoEquipo = { id: string; frase: string; tipo: string; marca?: string; campos: Record<string, number | string>; sinInventar: string[] };

const EQUIPOS: CasoEquipo[] = [
  { id: 'e01', frase: 'domo dahua de 5 mp blanco lente 2.8', tipo: 'domo', marca: 'dahua', campos: { pxHoriz: 2592, pxVert: 1944, focalesMm: '2.8' }, sinInventar: ['irM', 'pesoG', 'diametroMm', 'poeW', 'ip'] },
  { id: 'e02', frase: 'bala negra de 4 megapixeles', tipo: 'bala', campos: { pxHoriz: 2560, pxVert: 1440 }, sinInventar: ['irM', 'focalesMm', 'pesoG', 'altoMm'] },
  { id: 'e03', frase: 'grabador de 16 canales provision', tipo: 'nvr', marca: 'provision', campos: { canales: 16 }, sinInventar: ['bahias', 'mbpsEntrada', 'anchoMm'] },
  { id: 'e04', frase: 'switch tp-link de 24 puertos poe 250 watts', tipo: 'switch', marca: 'tp-link', campos: { puertos: 24, poeTotalW: 250 }, sinInventar: ['anchoMm', 'pesoG', 'wattsMax'] },
  { id: 'e05', frase: 'lectora de rostro zkteco', tipo: 'terminal', marca: 'zkteco', campos: {}, sinInventar: ['altoMm', 'pantallaPulgadas', 'poeW'] },
  { id: 'e06', frase: 'pluma vehicular de 6 metros', tipo: 'barrera', campos: { plumaM: 6 }, sinInventar: ['wattsMax', 'pesoG'] },
  { id: 'e07', frase: 'receptor de alerta sismica sasmex', tipo: 'sismica', marca: 'sasmex', campos: {}, sinInventar: ['alcanceM', 'decibeles'] },
  { id: 'e08', frase: 'servidor dell de 2u', tipo: 'servidor', marca: 'dell', campos: { unidades: 2 }, sinInventar: ['bahias', 'wattsMax'] },
];

function argumentos(): Record<string, string> {
  const salida: Record<string, string> = {};
  const lista = process.argv.slice(2);
  for (let i = 0; i < lista.length; i += 2) salida[lista[i].replace(/^--/, '')] = lista[i + 1];
  return salida;
}

const igual = (esperado: unknown, real: unknown) => {
  if (typeof esperado === 'number') return Number(real) === esperado;
  if (typeof esperado === 'boolean') return real === esperado;
  return String(real ?? '').toLowerCase().replace(/\s/g, '').includes(String(esperado).toLowerCase().replace(/\s/g, ''));
};

async function main() {
  const args = argumentos();
  console.log(cargarLlave());
  asegurarPresupuesto();
  const claude = new ClaudeService();
  const solo = args.solo?.split(',').map((x) => x.trim());
  const entra = (id: string) => !solo || solo.includes(id);
  const medidas: Array<{ id: string; fallas: string[]; usd: number; ms: number; salida: number }> = [];

  for (const c of SITIOS.filter((x) => entra(x.id))) {
    const t0 = Date.now();
    const { datos, uso } = await claude.json<Record<string, unknown>>({ ...peticionSitio(c.frase), proceso: 'eval-cctv-sitio', companyId: 0 });
    registrarGasto('cctv-sitio', uso.usdAprox ?? 0);
    const s = completarAreas(limpiarSitio(datos), c.frase) as unknown as Record<string, unknown> & { areas: Array<{ tipo: string }> };
    const fallas: string[] = [];
    for (const [k, v] of Object.entries(c.espera)) if (!igual(v, s[k])) fallas.push(`${k}: esperaba ${JSON.stringify(v)}, dijo ${JSON.stringify(s[k])}`);
    for (const t of c.tipos ?? []) if (!s.areas.some((a) => a.tipo === t)) fallas.push(`falta área ${t}: ${s.areas.map((a) => a.tipo).join(',')}`);
    for (const k of c.sinInventar ?? []) if (s[k]) fallas.push(`inventó ${k}: ${JSON.stringify(s[k])}`);
    medidas.push({ id: c.id, fallas, usd: uso.usdAprox ?? 0, ms: Date.now() - t0, salida: uso.tokensSalida });
  }

  for (const c of EQUIPOS.filter((x) => entra(x.id))) {
    const t0 = Date.now();
    const { datos, uso } = await claude.json<Record<string, unknown>>({ ...peticionDescripcion(c.frase), proceso: 'eval-cctv-equipo', companyId: 0 });
    registrarGasto('cctv-equipo', uso.usdAprox ?? 0);
    const f = limpiarFicha(datos, 0);
    const fallas: string[] = [];
    if (f.tipo !== c.tipo) fallas.push(`tipo: esperaba ${c.tipo}, dijo ${f.tipo}`);
    if (c.marca && !igual(c.marca, f.marca)) fallas.push(`marca: esperaba ${c.marca}, dijo ${f.marca}`);
    const de = (k: string) => f.datos.find((d) => d.campo === k)?.valor;
    for (const [k, v] of Object.entries(c.campos)) if (!igual(v, de(k))) fallas.push(`${k}: esperaba ${v}, dijo ${de(k) ?? 'nada'}`);
    for (const k of c.sinInventar) if (de(k) !== undefined) fallas.push(`inventó ${k}: ${de(k)}`);
    medidas.push({ id: c.id, fallas, usd: uso.usdAprox ?? 0, ms: Date.now() - t0, salida: uso.tokensSalida });
  }

  for (const m of medidas) {
    console.log(`${m.fallas.length ? 'MAL' : 'OK '} ${m.id}  ${(m.ms / 1000).toFixed(1)} s  US$${m.usd}  salida ${m.salida}`);
    for (const x of m.fallas) console.log(`      ${x}`);
  }
  const bien = medidas.filter((m) => !m.fallas.length).length;
  const tiempos = medidas.map((m) => m.ms).sort((a, b) => a - b);
  const costo = medidas.reduce((a, m) => a + m.usd, 0) / Math.max(medidas.length, 1);
  const resumen = { fecha: new Date().toISOString(), bien, total: medidas.length, usdPorLlamada: Number(costo.toFixed(6)), p50s: tiempos[Math.floor(tiempos.length / 2)] / 1000, p95s: tiempos[Math.floor(tiempos.length * 0.95)] / 1000, fallas: medidas.filter((m) => m.fallas.length).map((m) => ({ id: m.id, fallas: m.fallas })) };
  console.log(`\n${bien}/${medidas.length} perfectas, US$${resumen.usdPorLlamada} por llamada, p50 ${resumen.p50s} s, p95 ${resumen.p95s} s. Gastado en pruebas: ${gastado()}`);
  if (!solo) {
    mkdirSync(DIR_RESULTADOS, { recursive: true });
    writeFileSync(join(DIR_RESULTADOS, 'sitio.json'), `${JSON.stringify(resumen, null, 2)}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
