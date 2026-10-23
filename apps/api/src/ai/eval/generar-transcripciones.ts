/**
 * Genera una vez las transcripciones de prueba del eval de actas a partir del guion de cada
 * escenario (`casos-actas.ts`) y revisa que traigan las pistas de cada acuerdo. Se guardan en
 * `transcripciones/<id>.txt` y se versionan: el eval siempre califica sobre el mismo texto.
 *
 *   node -r ts-node/register/transpile-only src/ai/eval/generar-transcripciones.ts [--casos r01,r02] [--forzar] [--modelo haiku]
 *
 * Por la puerta con el token de pruebas y con Haiku 5.5 salvo que se pida otro (`--modelo sonnet`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESCENARIOS_ACTA, type EscenarioActa } from './casos-actas.js';
import { PERSONAS } from './catalogo.js';
import {
  DIR_EVAL,
  argumentos,
  asegurarPresupuesto,
  cargarLlave,
  clienteEval,
  enParalelo,
  modeloDe,
  plano,
  registrarGasto,
  textoDe,
  usoDe,
} from './comun.js';

/** Haiku 5.5 por omisión; `--modelo` cambia. */
let MODELO = modeloDe(undefined);
const PALABRAS_POR_MINUTO = 130;
export const DIR_TRANSCRIPCIONES = join(DIR_EVAL, 'transcripciones');

const SISTEMA = `Escribes transcripciones de prueba para evaluar un sistema que redacta actas de reunión de NEXARA, empresa mexicana de seguridad electrónica (CCTV, control de acceso, redes, alarmas, servicio de campo) con sede en Puebla. Recibes un escenario y devuelves solo el texto, sin títulos, comentarios ni marcas.

Reglas:
- Español de México hablado y realista: muletillas (este, o sea, eh, ajá, ¿no?), frases cortadas, repeticiones, interrupciones y temas que se cruzan.
- Cubre todos los puntos del guion. Cada compromiso se dice de forma natural pero sin duda sobre quién lo hace y para cuándo, con la misma expresión de fecha del guion («el viernes», «en dos semanas»). Las personas se llaman entre sí por nombre de pila o apodo.
- No agregues compromisos, decisiones, fechas ni responsables que no estén en el guion. La plática de relleno no contiene compromisos de trabajo.
- Lo que el guion dice que nadie toma queda sin dueño: se menciona y se cambia de tema.
- Incluye literalmente cada palabra de «pistas».
- La longitud importa (es una prueba de juntas largas): llega a la cantidad de palabras pedida alargando con plática de relleno, discusión técnica sin compromisos, repeticiones y digresiones.

Formatos:
- whisper: salida de un transcriptor automático. Texto corrido en párrafos largos, sin nombres de quién habla, puntuación irregular y algunos errores de reconocimiento en palabras que no sean pistas (p. ej. «en ve erre» por NVR, «Tocs» por Tox, «po» por PoE).
- vtt: transcripción de videollamada ya sin tiempos: una intervención por línea con «Nombre Apellido: texto».
- notas: apuntes tecleados con prisa durante la junta: viñetas, abreviaturas (p/, q, x, tmb), a veces sin acentos.`;

function diaSemana(fecha: string): string {
  return new Intl.DateTimeFormat('es-MX', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${fecha}T12:00:00Z`));
}

function pedido(e: EscenarioActa): string {
  const asistentes = e.asistentesIds
    .map((id) => PERSONAS.find((p) => p.id === id)!)
    .map((p) => `- ${p.nombre} (${p.puesto})`)
    .join('\n');
  const pistas = [...new Set(e.acuerdos.flatMap((a) => a.pistas))].join(', ');
  return [
    `Título: ${e.titulo}`,
    `Fecha: ${diaSemana(e.fecha)} ${e.fecha}`,
    `Asistentes:\n${asistentes}`,
    e.agenda ? `Agenda: ${e.agenda}` : null,
    `Duración: ${e.minutos} minutos (≈ ${e.minutos * PALABRAS_POR_MINUTO} palabras)`,
    `Formato: ${e.formato}`,
    `Pistas: ${pistas}`,
    `Guion:\n${e.guion}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Pistas que no aparecen en el texto (sin acentos ni mayúsculas). */
export function pistasFaltantes(e: EscenarioActa, texto: string): string[] {
  const t = plano(texto);
  return [...new Set(e.acuerdos.flatMap((a) => a.pistas))].filter((p) => !t.includes(plano(p)));
}

export function leerTranscripcion(id: string): string {
  return readFileSync(join(DIR_TRANSCRIPCIONES, `${id}.txt`), 'utf8');
}

async function generar(e: EscenarioActa): Promise<string> {
  asegurarPresupuesto(0.1);
  const palabras = e.minutos * PALABRAS_POR_MINUTO;
  const r = await clienteEval().messages.create({
    model: MODELO,
    max_tokens: Math.min(16_000, Math.round(palabras * 2.2) + 2_000),
    system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: pedido(e) }],
    output_config: { effort: 'low' },
  });
  const uso = usoDe(MODELO, r);
  registrarGasto(`generar transcripciones (${MODELO.replace('claude-', '')})`, uso.usdAprox);
  if (r.stop_reason !== 'end_turn') throw new Error(`${e.id}: stop_reason ${r.stop_reason}`);
  const texto = textoDe(r);
  const n = texto.split(/\s+/).length;
  console.log(`${e.id}: ${n} palabras (objetivo ${palabras}) · ${uso.tokensSalida} tokens · $${uso.usdAprox}`);
  return texto;
}

const palabrasDe = (t: string) => t.split(/\s+/).filter(Boolean).length;

/** Si quedó corta, pide continuaciones (sin compromisos nuevos) hasta ~85 % del objetivo. */
async function alargar(e: EscenarioActa, texto: string): Promise<string> {
  const objetivo = e.minutos * PALABRAS_POR_MINUTO;
  for (let vuelta = 0; vuelta < 3 && palabrasDe(texto) < objetivo * 0.85; vuelta++) {
    asegurarPresupuesto(0.1);
    const faltan = objetivo - palabrasDe(texto);
    const r = await clienteEval().messages.create({
      model: MODELO,
      max_tokens: Math.min(16_000, Math.round(faltan * 2.2) + 2_000),
      system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
      messages: [
        { role: 'user', content: pedido(e) },
        { role: 'assistant', content: texto },
        {
          role: 'user',
          content: `Quedó corta. Escribe la continuación (unas ${faltan} palabras, mismo formato, sin repetir lo anterior) como si la junta siguiera antes de despedirse: más discusión, dudas, relleno y digresiones. No agregues compromisos, decisiones, fechas ni pendientes nuevos. Devuelve solo el texto nuevo.`,
        },
      ],
      output_config: { effort: 'low' },
    });
    registrarGasto(`generar transcripciones (${MODELO.replace('claude-', '')})`, usoDe(MODELO, r).usdAprox);
    if (r.stop_reason !== 'end_turn') break;
    texto = `${texto}\n\n${textoDe(r)}`;
    console.log(`${e.id}: alargada a ${palabrasDe(texto)} palabras (objetivo ${objetivo})`);
  }
  return texto;
}

async function main() {
  const args = argumentos();
  MODELO = modeloDe(args.modelo);
  console.log(`Llave: ${cargarLlave()} · modelo ${MODELO}`);
  mkdirSync(DIR_TRANSCRIPCIONES, { recursive: true });
  const ids = args.casos ? args.casos.split(',') : null;
  const elegidos = ESCENARIOS_ACTA.filter((e) => !ids || ids.includes(e.id));
  // --alargar: solo extiende las que ya existen y quedaron cortas.
  if (args.alargar) {
    await enParalelo(elegidos.filter((e) => existsSync(join(DIR_TRANSCRIPCIONES, `${e.id}.txt`))), 4, async (e) => {
      const previo = leerTranscripcion(e.id).trim();
      const texto = await alargar(e, previo);
      if (texto !== previo) writeFileSync(join(DIR_TRANSCRIPCIONES, `${e.id}.txt`), texto + '\n');
    });
    return;
  }
  const escenarios = elegidos.filter((e) => args.forzar || !existsSync(join(DIR_TRANSCRIPCIONES, `${e.id}.txt`)));
  await enParalelo(escenarios, 4, async (e) => {
    let texto = await generar(e);
    let faltan = pistasFaltantes(e, texto);
    if (faltan.length) {
      console.log(`${e.id}: faltan pistas ${faltan.join(', ')}; se genera otra vez`);
      texto = await generar(e);
      faltan = pistasFaltantes(e, texto);
    }
    texto = await alargar(e, texto);
    writeFileSync(join(DIR_TRANSCRIPCIONES, `${e.id}.txt`), texto + '\n');
    if (faltan.length) console.log(`${e.id}: AÚN faltan pistas ${faltan.join(', ')} — revisar a mano`);
  });
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
