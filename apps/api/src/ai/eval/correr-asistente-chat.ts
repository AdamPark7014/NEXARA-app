/**
 * Eval del asistente del chat (#general): cuánto resuelve el código y qué tan bien contesta la IA.
 *
 *   npm run eval:asistente-chat -w apps/api -- [--casos i01,i02] [--sin-juez] [--max-usd 0.05] [--concurrencia 1]
 *
 * 1. Casos `codigo`: se pasan por `detectarIntencion`; deben caer en la regla esperada (0 tokens).
 * 2. Casos `ia`: se manda exactamente la petición de producción (`peticionAsistenteChat` +
 *    `ClaudeService.json`, proceso `eval-asistente-chat`) por la puerta con el token de pruebas, y se
 *    revisa en código: fuera de tema, tema de la guía, largo, palabras obligatorias y prohibidas. Con
 *    juez (Haiku, por omisión) se revisa además que no invente pantallas, botones ni políticas.
 *
 * Antes de llamar se imprime el costo estimado; si pasa de `--max-usd` o del tope de
 * `resultados/gasto.json`, no corre. Resultado en `resultados/asistente-chat.json`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ClaudeService, type UsoClaude } from '../claude/claude.service.js';
import { detectarIntencion } from '../asistente-chat/intenciones.js';
import {
  CONFIG_ASISTENTE_CHAT,
  ENCABEZADO_CONOCIMIENTO,
  PROMPT_ASISTENTE_CHAT,
  limpiarSalida,
  peticionAsistenteChat,
  type SalidaAsistenteChat,
} from '../asistente-chat/asistente-chat-ia.js';
import { CASOS_ASISTENTE_CHAT, type CasoAsistenteChat } from './casos-asistente-chat.js';
import {
  DIR_RESULTADOS,
  MODELOS,
  PresupuestoAgotado,
  argumentos,
  asegurarPresupuesto,
  cargarLlave,
  clienteEval,
  costoLlamada,
  enParalelo,
  plano,
  registrarGasto,
  restante,
  textoDe,
  usoDe,
} from './comun.js';

type Revision = { nombre: string; ok: boolean; detalle?: string };
type Resultado = {
  caso: string;
  tipo: 'codigo' | 'ia';
  pregunta: string;
  ruta: string;
  revisiones: Revision[];
  puntaje: number;
  juez?: { inventa: boolean; nota: number; comentario: string } | null;
  salida?: SalidaAsistenteChat;
  uso?: UsoClaude | null;
  ms?: number;
  error?: string;
};

const JUEZ_SISTEMA = `Calificas la respuesta de un asistente interno de la plataforma NEXARA Core. Recibes la GUÍA (lo único que el asistente sabe), la pregunta y la respuesta.
Revisa solo:
- inventa: true si la respuesta afirma pantallas, botones, menús, políticas, horarios, permisos o datos que NO están en la guía (decir que la guía no lo cubre o mandar a preguntar a su jefe no es inventar).
- nota: 1 a 5, qué tan útil y correcta es para un empleado (5 = clara, correcta, breve).
- comentario: una frase con el problema principal o «sin problemas».`;

const JUEZ_ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['inventa', 'nota', 'comentario'],
  properties: {
    inventa: { type: 'boolean' },
    nota: { type: 'integer', enum: [1, 2, 3, 4, 5] },
    comentario: { type: 'string' },
  },
};

async function juzgar(pregunta: string, respuesta: string) {
  asegurarPresupuesto(0.02);
  const r = await clienteEval().messages.create({
    model: MODELOS.haiku,
    max_tokens: 400,
    system: [{ type: 'text', text: JUEZ_SISTEMA, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `GUÍA:\n${PROMPT_ASISTENTE_CHAT.split(`${ENCABEZADO_CONOCIMIENTO}\n`)[1] ?? ''}`,
            cache_control: { type: 'ephemeral' },
          },
          { type: 'text', text: `Pregunta: ${pregunta}\nRespuesta: ${respuesta}` },
        ],
      },
    ],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: JUEZ_ESQUEMA } },
  });
  registrarGasto('juez asistente-chat (haiku)', usoDe(MODELOS.haiku, r).usdAprox);
  return JSON.parse(textoDe(r)) as { inventa: boolean; nota: number; comentario: string };
}

function revisarIA(caso: Extract<CasoAsistenteChat, { tipo: 'ia' }>, s: SalidaAsistenteChat): Revision[] {
  const r: Revision[] = [{ nombre: 'fuera de tema', ok: s.fueraDeTema === caso.fueraDeTema, detalle: String(s.fueraDeTema) }];
  if (caso.fueraDeTema) return r;
  if (caso.temas) r.push({ nombre: 'tema', ok: caso.temas.includes(s.tema), detalle: String(s.tema) });
  r.push({ nombre: 'breve', ok: s.respuesta.length > 0 && s.respuesta.length <= 420, detalle: `${s.respuesta.length} car.` });
  const texto = plano(s.respuesta);
  if (caso.debeDecir) {
    const faltan = caso.debeDecir.filter((p) => !texto.includes(plano(p)));
    r.push({ nombre: 'dice lo necesario', ok: !faltan.length, detalle: faltan.length ? `sin ${faltan.join(', ')}` : undefined });
  }
  if (caso.noDebeDecir) {
    const sobran = caso.noDebeDecir.filter((p) => texto.includes(plano(p)));
    r.push({ nombre: 'no inventa (lista)', ok: !sobran.length, detalle: sobran.join(', ') || undefined });
  }
  return r;
}

async function main() {
  const args = argumentos();
  const filtro = args.casos ? new Set(args.casos.split(',')) : null;
  const casos = CASOS_ASISTENTE_CHAT.filter((c) => !filtro || filtro.has(c.id));
  const conJuez = args['sin-juez'] !== 'si';
  const concurrencia = Math.max(1, Number(args.concurrencia) || 4);

  const casosIA = casos.filter((c) => c.tipo === 'ia');
  // ~2.3K de entrada (guía) y ~120 de salida por caso; el juez, otro tanto.
  const estimado = casosIA.length * (costoLlamada(CONFIG_ASISTENTE_CHAT.modelo, { entrada: 2_400, salida: 150 }, true) * (conJuez ? 2 : 1));
  const tope = Math.min(Number(args['max-usd']) || 0.05, restante());
  console.log(`Asistente del chat · ${casos.length} casos (${casosIA.length} con IA) · estimado ~$${estimado.toFixed(4)} · tope $${tope.toFixed(4)}`);
  if (estimado > tope) throw new PresupuestoAgotado(`El estimado ($${estimado.toFixed(4)}) pasa del tope ($${tope.toFixed(4)}).`);
  if (casosIA.length) console.log(`Llave: ${cargarLlave()}`);

  const claude = new ClaudeService();
  const resultados = await enParalelo(casos, concurrencia, async (caso): Promise<Resultado> => {
    const ruta = detectarIntencion(caso.pregunta).tipo;
    if (caso.tipo === 'codigo') {
      const revisiones = [{ nombre: 'regla', ok: ruta === caso.intencion, detalle: ruta }];
      return { caso: caso.id, tipo: 'codigo', pregunta: caso.pregunta, ruta, revisiones, puntaje: revisiones[0]!.ok ? 1 : 0 };
    }
    const inicio = Date.now();
    try {
      asegurarPresupuesto(0.01);
      const p = peticionAsistenteChat(caso.pregunta, caso.rol ?? 'tecnico');
      const { datos, uso } = await claude.json<SalidaAsistenteChat>({ ...p, proceso: 'eval-asistente-chat', companyId: 0 });
      const ms = Date.now() - inicio;
      registrarGasto('eval asistente-chat (haiku)', uso.usdAprox);
      const salida = limpiarSalida(datos);
      const revisiones = revisarIA(caso, salida);
      const juez = conJuez && !caso.fueraDeTema ? await juzgar(caso.pregunta, salida.respuesta) : null;
      if (juez) revisiones.push({ nombre: 'juez: no inventa', ok: !juez.inventa, detalle: juez.comentario });
      const puntaje = revisiones.filter((r) => r.ok).length / revisiones.length;
      return { caso: caso.id, tipo: 'ia', pregunta: caso.pregunta, ruta, revisiones, puntaje, juez, salida, uso, ms };
    } catch (e) {
      return {
        caso: caso.id,
        tipo: 'ia',
        pregunta: caso.pregunta,
        ruta,
        revisiones: [],
        puntaje: 0,
        error: e instanceof Error ? e.message : String(e),
        ms: Date.now() - inicio,
      };
    }
  });

  for (const r of resultados) {
    const fallas = r.revisiones.filter((x) => !x.ok).map((x) => `${x.nombre}${x.detalle ? ` (${x.detalle})` : ''}`);
    const marca = r.error ? 'ERROR' : r.puntaje === 1 ? 'ok' : `${Math.round(r.puntaje * 100)}%`;
    const extra = r.tipo === 'ia' ? ` · regla: ${r.ruta} · ${r.ms} ms · $${r.uso?.usdAprox ?? '?'}` : '';
    console.log(`${r.caso} [${marca}]${extra} — ${r.pregunta}${fallas.length ? `\n     ✗ ${fallas.join('; ')}` : ''}${r.error ? `\n     ${r.error}` : ''}`);
    if (r.salida && !r.salida.fueraDeTema) console.log(`     → [${r.salida.tema}] ${r.salida.respuesta}`);
  }

  const codigo = resultados.filter((r) => r.tipo === 'codigo');
  const ia = resultados.filter((r) => r.tipo === 'ia' && !r.error);
  const tiempos = ia.map((r) => r.ms ?? 0).sort((a, b) => a - b);
  const pct = (q: number) => tiempos[Math.min(tiempos.length - 1, Math.floor(q * tiempos.length))] ?? 0;
  const costo = ia.reduce((s, r) => s + (r.uso?.usdAprox ?? 0), 0);
  const resumen = {
    fecha: new Date().toISOString(),
    modelo: CONFIG_ASISTENTE_CHAT.modelo,
    codigo: { casos: codigo.length, aciertos: codigo.filter((r) => r.puntaje === 1).length },
    ia: {
      casos: resultados.filter((r) => r.tipo === 'ia').length,
      errores: resultados.filter((r) => r.error).length,
      perfectos: ia.filter((r) => r.puntaje === 1).length,
      puntajeMedio: ia.length ? Number((ia.reduce((s, r) => s + r.puntaje, 0) / ia.length).toFixed(3)) : null,
      inventos: ia.filter((r) => r.juez?.inventa).length,
      notaJuez: ia.some((r) => r.juez) ? Number((ia.reduce((s, r) => s + (r.juez?.nota ?? 0), 0) / ia.filter((r) => r.juez).length).toFixed(2)) : null,
      p50ms: pct(0.5),
      p95ms: pct(0.95),
      usdPorLlamada: ia.length ? Number((costo / ia.length).toFixed(6)) : null,
      tokensEntradaMedios: ia.length ? Math.round(ia.reduce((s, r) => s + (r.uso?.tokensEntrada ?? 0) + (r.uso?.tokensCacheLeidos ?? 0), 0) / ia.length) : null,
      tokensSalidaMedios: ia.length ? Math.round(ia.reduce((s, r) => s + (r.uso?.tokensSalida ?? 0), 0) / ia.length) : null,
    },
    resultados: resultados.map(({ salida, ...r }) => ({ ...r, respuesta: salida?.respuesta, tema: salida?.tema })),
  };
  mkdirSync(DIR_RESULTADOS, { recursive: true });
  writeFileSync(join(DIR_RESULTADOS, 'asistente-chat.json'), JSON.stringify(resumen, null, 2) + '\n');
  console.log(`\nCódigo: ${resumen.codigo.aciertos}/${resumen.codigo.casos} por regla (0 tokens).`);
  console.log(
    `IA: ${resumen.ia.perfectos}/${resumen.ia.casos} perfectos · puntaje ${resumen.ia.puntajeMedio} · inventos ${resumen.ia.inventos} · nota juez ${resumen.ia.notaJuez} · p50 ${resumen.ia.p50ms} ms · p95 ${resumen.ia.p95ms} ms · $${resumen.ia.usdPorLlamada}/llamada`,
  );
}

main().catch((e) => {
  console.error(e instanceof PresupuestoAgotado ? e.message : e);
  process.exit(1);
});
