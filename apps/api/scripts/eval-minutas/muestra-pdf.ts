/**
 * PDF de muestra con una minuta del eval (sin llamar a la IA): para revisar el diseño.
 *
 *   node -r ./scripts/ts-node-js-ext.js -r ts-node/register/transpile-only scripts/eval-minutas/muestra-pdf.ts \
 *     <detalle.json de .ai/eval-minutas> <salida.pdf>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generarMinutaPdf } from '../../src/meetings/minuta-pdf.js';
import { transcripcionConMarcas, type Minuta, type ParteTexto } from '../../src/meetings/minuta-ia.js';
import { JUNTAS, PERSONAS } from './casos.js';
import { DIR_TRANSCRIPCIONES } from './comun.js';
import { PALABRAS_POR_MINUTO } from './generar.js';

async function main() {
  const [detalle, salida] = process.argv.slice(2);
  const d = JSON.parse(readFileSync(detalle, 'utf8')) as { junta: string; minuta: Minuta };
  const j = JUNTAS.find((x) => x.id === d.junta)!;
  const palabras = readFileSync(join(DIR_TRANSCRIPCIONES, `${j.id}.txt`), 'utf8').split(/\s+/).filter(Boolean);
  const partes: ParteTexto[] = [];
  for (let i = 0; i * PALABRAS_POR_MINUTO < palabras.length; i++) {
    partes.push({
      parte: i + 1,
      estado: 'LISTA',
      texto: palabras.slice(i * PALABRAS_POR_MINUTO, (i + 1) * PALABRAS_POR_MINUTO).join(' '),
      inicioMs: i * 60_000,
      duracionMs: 60_000,
    });
  }
  const pdf = await generarMinutaPdf({
    id: 128,
    tipo: j.tipo,
    titulo: d.minuta.tituloSugerido ?? j.titulo,
    fecha: new Date(`${j.fecha}T00:00:00Z`),
    horaInicio: '10:00',
    facilitador: { nombre: PERSONAS.find((p) => p.id === j.asistentesIds[0])?.nombre },
    asistentes: j.asistentesIds.map((id) => ({ asistio: true, user: { nombre: PERSONAS.find((p) => p.id === id)!.nombre } })),
    minuta: d.minuta,
    duracionMs: partes.length * 60_000,
    transcripcion: transcripcionConMarcas(partes),
  });
  writeFileSync(salida, pdf);
  console.log(`${salida} · ${(pdf.length / 1024).toFixed(0)} KB`);
}

void main();
