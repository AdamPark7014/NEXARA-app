/**
 * Eval de «Redactar con IA»: qué tan seguido escribe algo que hay que quitar y si lo que queda sirve.
 *
 *   npm run eval:redactar -w apps/api -- [--modelo haiku] [--solo cctv-con-obra] [--real casos.json] [--ver si] [--max-usd 0.2]
 *
 * Cada caso corre con la misma petición que producción y por la puerta con el token de pruebas. Se
 * califica en código: forma, longitud, frases vacías, modelos nombrados y lo que `revisarRedaccion`
 * tuvo que quitar. `--real` lee `{ casos }` de un JSON local: el repo es público, así que de ahí solo
 * salen cifras. `--detalle salida.json` guarda el texto de cada caso para leerlo a mano; con datos
 * reales, fuera del repo.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { puntosPorOmision } from '../../cotizaciones/alcance-por-omision.js';
import { grupoDePartida } from '../../cotizaciones/partidas-grupos.js';
import { peticionRedactar, revisarRedaccion, type SalidaRedactar } from '../cotizar/redactar-ia.js';
import { CASOS_REDACTAR, type CasoRedactar } from './casos-redactar.js';
import { DIR_RESULTADOS, argumentos, asegurarPresupuesto, cargarLlave, clienteEval, enParalelo, modeloDe, plano, registrarGasto, textoDe, usoDe } from './comun.js';

const VACIAS = /solucion tecnologica|de vanguardia|\bmoderna\b|mejor desempeno|riesgos operativos|confiable y moderna|altamente/;

const palabras = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

type Nota = { fallas: string[]; quitadas: string[]; modelos: number; modelosEsperados: number };

function calificar(caso: CasoRedactar, cruda: SalidaRedactar): Nota {
  const fallas: string[] = [];
  const { salida, quitadas } = revisarRedaccion(cruda, caso);
  if (cruda.puntos?.length !== 4) fallas.push(`puntos ${cruda.puntos?.length}`);
  if (!salida.intro) fallas.push('intro vacía');
  if (!salida.resultado) fallas.push('resultado vacío');
  if (!salida.beneficios.length) fallas.push('sin beneficios');
  if (cruda.beneficios.length > 3) fallas.push(`beneficios ${cruda.beneficios.length}`);
  if (palabras(cruda.intro) > 70) fallas.push(`intro de ${palabras(cruda.intro)} palabras`);
  if (palabras(cruda.resultado) > 40) fallas.push(`resultado de ${palabras(cruda.resultado)} palabras`);
  if (palabras(cruda.proyecto) > 10) fallas.push(`proyecto de ${palabras(cruda.proyecto)} palabras`);
  const todo = [cruda.proyecto, cruda.intro, cruda.resultado, ...cruda.beneficios, ...cruda.puntos.flatMap((p) => [p.texto, ...p.vinetas])].join(' \n ');
  const vacia = VACIAS.exec(plano(todo));
  if (vacia) fallas.push(`frase vacía «${vacia[0]}»`);

  // Los modelos de los equipos principales deben salir en la especificación, tras la revisión.
  const especificacion = plano(JSON.stringify(salida.puntos[2] ?? ''));
  const conModelo = caso.partidas.filter((p) => grupoDePartida(p) === 'EQUIPOS' && String(p.model ?? '').trim()).slice(0, 5);
  const nombrados = conModelo.filter((p) => especificacion.includes(plano(String(p.model))));
  return { fallas, quitadas, modelos: nombrados.length, modelosEsperados: conModelo.length };
}

async function main() {
  const args = argumentos();
  const modelo = modeloDe(args.modelo);
  cargarLlave();
  const real = args.real ? (JSON.parse(readFileSync(args.real, 'utf8')) as { casos: CasoRedactar[] }).casos : null;
  const solo = args.solo?.split(',');
  const casos = (real ?? CASOS_REDACTAR).filter((c) => !solo || solo.includes(c.id));

  const filas = await enParalelo(casos, Number(args.paralelo ?? 3), async (caso) => {
    asegurarPresupuesto(0.01);
    const titulos = puntosPorOmision(caso.partidas).map((p) => p.titulo);
    const p = peticionRedactar({ partidas: caso.partidas, segmento: caso.segmento, indicacion: caso.indicacion, titulos });
    const t0 = Date.now();
    try {
      const r = await clienteEval().messages.create(
        {
          model: modelo,
          max_tokens: p.maxTokens,
          system: [{ type: 'text', text: p.sistema[0]!, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: p.usuario }],
          ...(modelo.includes('haiku') ? { thinking: { type: 'disabled' as const } } : {}),
          output_config: { effort: p.esfuerzo, format: { type: 'json_schema', schema: p.esquema } },
        },
        { headers: { 'x-proceso': 'eval-cotizacion-redactar' } },
      );
      const ms = Date.now() - t0;
      const uso = usoDe(modelo, r);
      registrarGasto(`redactar ${caso.id}`, uso.usdAprox);
      if (r.stop_reason !== 'end_turn') return { caso, ms, uso, nota: { fallas: [`stop_reason ${r.stop_reason}`], quitadas: [], modelos: 0, modelosEsperados: 0 }, cruda: null };
      const cruda = JSON.parse(textoDe(r)) as SalidaRedactar;
      return { caso, ms, uso, nota: calificar(caso, cruda), cruda };
    } catch (e) {
      return { caso, ms: null, uso: null, nota: { fallas: [`error ${e instanceof Error ? e.message.slice(0, 80) : 'desconocido'}`], quitadas: [], modelos: 0, modelosEsperados: 0 }, cruda: null };
    }
  });

  const tiempos = filas.flatMap((f) => (f.ms != null ? [f.ms] : [])).sort((a, b) => a - b);
  const usos = filas.flatMap((f) => (f.uso ? [f.uso] : []));
  const usd = usos.reduce((s, u) => s + (u.usdAprox ?? 0), 0);
  const limpios = filas.filter((f) => !f.nota.fallas.length).length;
  const sinQuitar = filas.filter((f) => !f.nota.quitadas.length).length;
  const motivos = new Map<string, number>();
  for (const f of filas) for (const q of f.nota.quitadas) {
    const clave = q.replace(/ .*$/, '');
    motivos.set(clave, (motivos.get(clave) ?? 0) + 1);
  }
  const modelos = filas.reduce((s, f) => s + f.nota.modelos, 0);
  const modelosEsperados = filas.reduce((s, f) => s + f.nota.modelosEsperados, 0);

  console.log(`${modelo} · ${filas.length} casos · sin fallas ${limpios}/${filas.length} · sin nada que quitar ${sinQuitar}/${filas.length} · modelos nombrados ${modelos}/${modelosEsperados}`);
  console.log(`Quitado por la revisión: ${[...motivos].map(([k, n]) => `${k} ${n}`).join(' · ') || 'nada'}`);
  if (usos.length) {
    console.log(`p50 ${tiempos[Math.floor(tiempos.length / 2)]} ms · p95 ${tiempos[Math.floor(tiempos.length * 0.95)]} ms · máx ${tiempos[tiempos.length - 1]} ms · US$${(usd / usos.length).toFixed(5)} por llamada · entrada ${Math.round(usos.reduce((s, u) => s + u.tokensEntrada + u.tokensCacheLeidos, 0) / usos.length)} · salida ${Math.round(usos.reduce((s, u) => s + u.tokensSalida, 0) / usos.length)}`);
  }
  for (const f of filas) {
    if (f.nota.fallas.length) console.log(`  ${f.caso.id}: ${f.nota.fallas.join('; ')}`);
    if (args.ver && f.nota.quitadas.length) console.log(`  ${f.caso.id} quitó: ${f.nota.quitadas.join(', ')}`);
    // Lo real se queda en cifras: el texto solo se enseña en los casos inventados.
    if (args.ver === 'todo' && !real && f.cruda) console.log(JSON.stringify(f.cruda, null, 1));
  }

  if (args.detalle) {
    writeFileSync(args.detalle, JSON.stringify(filas.map((f) => ({ id: f.caso.id, partidas: f.caso.partidas.map((p) => `${p.qty} ${p.name}`), quitadas: f.nota.quitadas, cruda: f.cruda })), null, 1));
  }

  if (!real && !solo) {
    mkdirSync(DIR_RESULTADOS, { recursive: true });
    writeFileSync(
      join(DIR_RESULTADOS, 'redactar.json'),
      JSON.stringify(
        {
          fecha: new Date().toISOString(),
          modelo,
          casos: filas.length,
          sinFallas: limpios,
          sinNadaQueQuitar: sinQuitar,
          modelosNombrados: `${modelos}/${modelosEsperados}`,
          quitado: Object.fromEntries(motivos),
          msP50: tiempos[Math.floor(tiempos.length / 2)] ?? null,
          msP95: tiempos[Math.floor(tiempos.length * 0.95)] ?? null,
          usdPorLlamada: usos.length ? Number((usd / usos.length).toFixed(6)) : null,
          fallas: filas.filter((f) => f.nota.fallas.length).map((f) => ({ id: f.caso.id, fallas: f.nota.fallas })),
        },
        null,
        2,
      ) + '\n',
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
