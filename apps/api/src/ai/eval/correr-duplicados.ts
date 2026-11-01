/**
 * Eval de clientes repetidos: cuánto detecta el código solo y cuánto suma Claude.
 *
 *   npm run eval:duplicados -w apps/api -- [--sin-ia] [--solo-alta] [--modelo haiku] [--max-usd 0.05] [--real pares.json]
 *
 * Cada caso pasa primero por `clientesParecidos` (0 tokens). A la IA solo llega lo que el código no
 * resolvió con confianza alta, con la misma petición de producción y por la puerta con el token de
 * pruebas. Se califica en código: aciertos (halló al esperado) y avisos falsos (nombró a otro).
 *
 * `--real` lee un JSON local con `{ padron, casos }` de la empresa real; el repo es público y esos
 * pares no se guardan en git. Resultado en `resultados/duplicados.json`, solo con cifras si es real.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ClaudeService } from '../claude/claude.service.js';
import { clientesParecidos } from '../../ventas/clientes-parecidos.js';
import { limpiarDuplicados, peticionDuplicados, type CoincidenciaIa, type FichaPadron } from '../duplicados/duplicados-ia.js';
import { CASOS_DUPLICADOS, PADRON_EVAL, type CasoDuplicado } from './casos-duplicados.js';
import { DIR_RESULTADOS, MODELOS, argumentos, asegurarPresupuesto, cargarLlave, costoLlamada, enParalelo, registrarGasto, restante } from './comun.js';

type Fila = {
  caso: string;
  clase: CasoDuplicado['clase'];
  nombre: string;
  esperados: number[];
  codigo: number[];
  codigoAlta: boolean;
  ia: number[] | null;
  ms: number | null;
  usd: number | null;
  error?: string;
};

type Marcador = { casos: number; conRepetido: number; aciertos: number; sinRepetido: number; limpios: number; avisosFalsos: number };

function calificar(filas: Fila[], ids: (f: Fila) => number[]): Marcador {
  const m: Marcador = { casos: filas.length, conRepetido: 0, aciertos: 0, sinRepetido: 0, limpios: 0, avisosFalsos: 0 };
  for (const f of filas) {
    const dio = ids(f);
    const falsos = dio.filter((id) => !f.esperados.includes(id));
    if (falsos.length) m.avisosFalsos += 1;
    if (f.esperados.length) {
      m.conRepetido += 1;
      if (dio.some((id) => f.esperados.includes(id))) m.aciertos += 1;
    } else {
      m.sinRepetido += 1;
      if (!dio.length) m.limpios += 1;
    }
  }
  return m;
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10} %` : '—');

async function main() {
  const args = argumentos();
  const real = args.real ? (JSON.parse(readFileSync(args.real, 'utf8')) as { padron: FichaPadron[]; casos: CasoDuplicado[] }) : null;
  const padron = real?.padron ?? PADRON_EVAL;
  const casos = real?.casos ?? CASOS_DUPLICADOS;
  const conIa = args['sin-ia'] === undefined;
  const modelo = MODELOS[args.modelo ?? 'haiku'];
  const maxUsd = Number(args['max-usd'] ?? 0.1);
  const etiqueta = args.etiqueta ?? (real ? 'real' : 'repo');

  const parciales = casos.map((c) => {
    const parecidos = clientesParecidos({ nombre: c.nombre }, padron);
    return {
      caso: c,
      codigo: parecidos.map((p) => p.cliente.id),
      codigoAlta: parecidos.some((p) => p.confianza === 'alta'),
    };
  });

  const paraIa = conIa ? parciales.filter((p) => !p.codigoAlta) : [];
  let claude: ClaudeService | null = null;
  if (paraIa.length) {
    console.log(`Llave: ${cargarLlave()}`);
    asegurarPresupuesto();
    const tokens = Math.ceil(peticionDuplicados('x', padron).usuario.length / 3) + 500;
    const estimado = costoLlamada(modelo, { entrada: tokens, salida: 80 }) * paraIa.length;
    console.log(`A la IA: ${paraIa.length} de ${parciales.length} casos · ${modelo} · ~US$${estimado.toFixed(4)} · quedan US$${restante().toFixed(2)} del libro`);
    if (estimado > maxUsd) throw new Error(`El costo estimado pasa de --max-usd ${maxUsd}`);
    claude = new ClaudeService();
  }

  const respuestas = new Map<string, { ids: number[]; ms: number; usd: number | null; error?: string; coincidencias?: CoincidenciaIa[] }>();
  if (claude) {
    const cliente = claude;
    await enParalelo(paraIa, Number(args.concurrencia ?? 4), async ({ caso }) => {
      const inicio = Date.now();
      try {
        const p = peticionDuplicados(caso.nombre, padron);
        const { datos, uso } = await cliente.json<{ coincidencias: CoincidenciaIa[] }>({ ...p, modelo, reintentos: 5, timeoutMs: 90_000, proceso: 'eval-duplicados', companyId: 0 });
        const coincidencias = limpiarDuplicados(datos, padron).filter((c) => !args['solo-alta'] || c.seguridad === 'alta');
        registrarGasto(`duplicados ${args.modelo ?? 'haiku'}`, uso.usdAprox);
        respuestas.set(caso.id, { ids: coincidencias.map((c) => c.id), ms: Date.now() - inicio, usd: uso.usdAprox, coincidencias });
      } catch (e) {
        respuestas.set(caso.id, { ids: [], ms: Date.now() - inicio, usd: null, error: (e as Error).message });
      }
    });
  }

  const filas: Fila[] = parciales.map(({ caso, codigo, codigoAlta }) => {
    const r = respuestas.get(caso.id);
    return {
      caso: caso.id,
      clase: caso.clase,
      nombre: caso.nombre,
      esperados: caso.esperados,
      codigo,
      codigoAlta,
      ia: r ? r.ids : null,
      ms: r?.ms ?? null,
      usd: r?.usd ?? null,
      ...(r?.error ? { error: r.error } : {}),
    };
  });

  const soloCodigo = calificar(filas, (f) => f.codigo);
  const conClaude = calificar(filas, (f) => [...new Set([...f.codigo, ...(f.ia ?? [])])]);
  const tiempos = filas.flatMap((f) => (f.ms != null ? [f.ms] : [])).sort((a, b) => a - b);
  const usd = filas.reduce((s, f) => s + (f.usd ?? 0), 0);
  const nombreDe = (id: number) => padron.find((c) => c.id === id)?.name ?? `#${id}`;

  const linea = (titulo: string, m: Marcador) =>
    `${titulo}: halla ${m.aciertos}/${m.conRepetido} repetidos (${pct(m.aciertos, m.conRepetido)}) · limpios ${m.limpios}/${m.sinRepetido} (${pct(m.limpios, m.sinRepetido)}) · casos con aviso falso ${m.avisosFalsos}`;
  console.log(linea('Solo código', soloCodigo));
  if (conIa) console.log(linea('Código + IA', conClaude));
  if (tiempos.length) {
    console.log(`IA: ${tiempos.length} llamadas · p50 ${tiempos[Math.floor(tiempos.length / 2)]} ms · p95 ${tiempos[Math.floor(tiempos.length * 0.95)]} ms · US$${(usd / tiempos.length).toFixed(6)} por llamada`);
  }
  for (const f of filas) {
    const final = [...new Set([...f.codigo, ...(f.ia ?? [])])];
    const falsos = final.filter((id) => !f.esperados.includes(id));
    const falta = f.esperados.length > 0 && !final.some((id) => f.esperados.includes(id));
    if (falsos.length || falta || f.error) {
      console.log(
        `  ${f.caso} [${f.clase}] «${f.nombre}»: esperado [${f.esperados.map(nombreDe).join(', ')}] · código [${f.codigo.map(nombreDe).join(', ')}] · ia [${(f.ia ?? []).map(nombreDe).join(', ')}]${f.error ? ` · error ${f.error}` : ''}`,
      );
    }
  }

  if (!real) {
    mkdirSync(DIR_RESULTADOS, { recursive: true });
    writeFileSync(
      join(DIR_RESULTADOS, 'duplicados.json'),
      JSON.stringify({ fecha: new Date().toISOString(), etiqueta, modelo, soloCodigo, conClaude, msP50: tiempos[Math.floor(tiempos.length / 2)] ?? null, usdPorLlamada: tiempos.length ? Number((usd / tiempos.length).toFixed(6)) : null, filas }, null, 2) + '\n',
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
