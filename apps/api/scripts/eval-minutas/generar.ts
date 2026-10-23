/**
 * Genera una vez las transcripciones de prueba (Sonnet) a partir del guion de cada junta y
 * revisa que traigan las pistas de cada acuerdo. Se versionan en `transcripciones/<id>.txt`:
 * el eval siempre califica sobre el mismo texto.
 *
 *   cd apps/api
 *   node -r ./scripts/ts-node-js-ext.js -r ts-node/register/transpile-only scripts/eval-minutas/generar.ts [--juntas m1,m2] [--forzar]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { JUNTAS, PERSONAS, type Junta } from './casos.js';
import {
  DIR_TRANSCRIPCIONES,
  argumentos,
  asegurarPresupuesto,
  cargarLlave,
  clienteEval,
  enParalelo,
  plano,
  registrarGasto,
  textoDe,
  usdDe,
} from './comun.js';
import { fechaLarga } from '../../src/meetings/minuta-ia.js';

const MODELO = 'claude-sonnet-5-5';
/** Español hablado en junta: ~135 palabras por minuto. */
export const PALABRAS_POR_MINUTO = 135;

const SISTEMA = `Escribes transcripciones de prueba para evaluar un sistema que redacta minutas de juntas de NEXARA, empresa mexicana de seguridad electrónica (CCTV, control de acceso, redes, alarmas, servicio de campo) con sede en Puebla. Recibes el guion de una junta y devuelves solo el texto, sin títulos, comentarios ni marcas.

El texto debe parecer la salida de un transcriptor automático (whisper) de una junta presencial grabada con un celular:
- Texto corrido en párrafos largos, SIN nombres de quién habla (whisper no distingue voces). Se sabe quién es quién solo porque se llaman por nombre de pila o apodo («Beto, ¿tú?», «sí, yo lo mando»).
- Español de México hablado y realista: muletillas (este, o sea, eh, ajá, ¿no?), frases cortadas, repeticiones, interrupciones, temas que se cruzan y regresan.
- Puntuación irregular y algunos errores de reconocimiento en palabras que no sean pistas (p. ej. «en ve erre» por NVR, «Tocs» por Tox, «po» por PoE, «jik vision» por Hikvision). Las cifras a veces en letra y a veces en número.
- Cubre todos los puntos del guion. Cada compromiso se dice de forma natural pero sin duda de quién lo hace y para cuándo, con la misma expresión de fecha del guion («el viernes», «mañana», «el 29»).
- No agregues compromisos, decisiones, fechas, cifras ni responsables que no estén en el guion. La plática de relleno no contiene compromisos de trabajo.
- Lo que el guion dice que nadie toma queda sin dueño: se menciona y se cambia de tema.
- Incluye literalmente cada palabra de «pistas».
- La longitud importa (es una prueba de juntas largas): llega a la cantidad de palabras pedida con discusión técnica sin compromisos nuevos, repeticiones, digresiones y plática.`;

function asistentes(j: Junta): string {
  return j.asistentesIds
    .map((id) => PERSONAS.find((p) => p.id === id)!)
    .map((p) => `- ${p.nombre} (${p.puesto})`)
    .join('\n');
}

async function generar(j: Junta, forzar: boolean): Promise<string> {
  const archivo = join(DIR_TRANSCRIPCIONES, `${j.id}.txt`);
  if (existsSync(archivo) && !forzar) return `${j.id}: ya existe`;
  asegurarPresupuesto(0.15);
  const mitades = j.guion.split(/^---$/m).map((s) => s.trim());
  // Sonnet se queda en ~60 % de lo pedido: se pide de más para llegar a la duración real.
  const palabrasPorMitad = Math.round((j.minutos * PALABRAS_POR_MINUTO * 1.6) / mitades.length);
  const pistas = [...new Set(j.acuerdos.flatMap((a) => a.pistas))].join(', ');
  let texto = '';
  let usd = 0;
  for (let i = 0; i < mitades.length; i++) {
    const pedido = [
      `Título: ${j.titulo}`,
      `Fecha: ${fechaLarga(j.fecha)}`,
      `Asistentes:\n${asistentes(j)}`,
      j.agenda ? `Agenda:\n${j.agenda}` : null,
      mitades.length > 1
        ? `Esta es la parte ${i + 1} de ${mitades.length} de la junta (≈ ${palabrasPorMitad} palabras).${
            i > 0 ? ` Continúa justo donde terminó la parte anterior, sin saludo ni resumen. Final de la parte anterior:\n«…${texto.split(/\s+/).slice(-120).join(' ')}»` : ' Termina a media plática: la junta sigue.'
          }`
        : `Duración: ${j.minutos} minutos (≈ ${palabrasPorMitad} palabras).`,
      `Pistas (literales): ${pistas}`,
      `Guion:\n${mitades[i]}`,
    ]
      .filter(Boolean)
      .join('\n\n');
    const r = await clienteEval()
      .messages.stream({
        model: MODELO,
        max_tokens: 24_000,
        system: SISTEMA,
        messages: [{ role: 'user', content: pedido }],
        output_config: { effort: 'low' },
      })
      .finalMessage();
    usd += usdDe(MODELO, r.usage);
    texto += (texto ? '\n' : '') + textoDe(r);
  }
  registrarGasto('generar transcripciones (sonnet)', usd);
  mkdirSync(DIR_TRANSCRIPCIONES, { recursive: true });
  writeFileSync(archivo, texto.trim() + '\n', 'utf8');
  const palabras = texto.split(/\s+/).filter(Boolean).length;
  const faltan = [...new Set(j.acuerdos.flatMap((a) => a.pistas))].filter((p) => !plano(texto).includes(plano(p)));
  return `${j.id}: ${palabras} palabras (meta ${j.minutos * PALABRAS_POR_MINUTO}) · $${usd.toFixed(3)}${faltan.length ? ` · FALTAN PISTAS: ${faltan.join(', ')}` : ''}`;
}

async function main() {
  const a = argumentos();
  console.log(`Llave: ${cargarLlave()}`);
  const juntas = a.juntas ? JUNTAS.filter((j) => a.juntas.split(',').includes(j.id)) : JUNTAS;
  const lineas = await enParalelo(juntas, 4, (j) => generar(j, a.forzar === 'si').catch((e) => `${j.id}: ERROR ${(e as Error).message}`));
  for (const l of lineas) console.log(l);
  for (const j of juntas) {
    const f = join(DIR_TRANSCRIPCIONES, `${j.id}.txt`);
    if (existsSync(f)) console.log(`${j.id} existe · ${readFileSync(f, 'utf8').split(/\s+/).length} palabras`);
  }
}

if (require.main === module) void main();
