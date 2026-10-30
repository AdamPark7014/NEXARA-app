#!/usr/bin/env node
/**
 * Aprobación por lote de evidencias en espera de revisión (Adam, 29-10-2026: «guarda en la db las 90 actividades
 * más viejas que falten de revisión»). Corre dentro del contenedor de la API y llama a su propio endpoint
 * `POST /api/me/revisiones/aprobar-lote`, que aplica la misma regla del botón «Aprobar» y manda un aviso por persona:
 *
 *   docker cp aprobar-revisiones-lote.cjs nexara-api:/app/apps/api/
 *   docker cp lista.json nexara-api:/tmp/lista.json
 *   docker exec -w /app/apps/api nexara-api node aprobar-revisiones-lote.cjs /tmp/lista.json            # simulacro
 *   docker exec -w /app/apps/api nexara-api node aprobar-revisiones-lote.cjs /tmp/lista.json --escribir # aprueba
 *
 * `lista.json`: `{ revisorId, observaciones, calificacion, items: [{ activityId, userId }] }`.
 * Sin contraseña: firma un token de 10 minutos para `revisorId` con el `JWT_SECRET` del contenedor (no se imprime).
 * Antes y después lee los KPI del mes de los coordinadores para ver qué cambió. Imprime un JSON con el resultado.
 */
const fs = require('node:fs');
const jwt = require('jsonwebtoken');

const BASE = `http://127.0.0.1:${process.env.PORT || 3001}/api`;
const COORDINADORES = [8, 39];

async function llamar(token, metodo, ruta, cuerpo) {
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${metodo} ${ruta} → ${r.status}: ${datos?.message ?? ''}`);
  return datos;
}

/** Índice, pilares y revisiones en plazo de cada coordinador, y el índice del equipo (sin nombres ni montos). */
async function kpisCoordinadores(token, desde, hasta) {
  const k = await llamar(token, 'GET', `/me/kpis/equipo?desde=${desde}&hasta=${hasta}`);
  const pilares = (t) => Object.fromEntries((t?.pilares ?? []).map((p) => [p.id, p.pct]));
  const salida = { equipo: { indice: k.equipo?.totales?.cumplimientoPct ?? null, pilares: pilares(k.equipo?.totales) } };
  for (const id of COORDINADORES) {
    const t = k.personas.find((p) => p.persona.id === id)?.totales;
    salida[`coordinador_${id}`] = t
      ? { indice: t.cumplimientoPct, pilares: pilares(t), revisiones: t.equipo?.revisiones ?? null }
      : null;
  }
  return salida;
}

async function main() {
  const [archivo, bandera] = process.argv.slice(2);
  if (!archivo) throw new Error('Falta la lista (JSON)');
  const lista = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  const items = Array.isArray(lista.items) ? lista.items : [];
  if (!lista.revisorId || !items.length) throw new Error('La lista necesita revisorId e items');
  if (!process.env.JWT_SECRET) throw new Error('Sin JWT_SECRET en el contenedor');

  const token = jwt.sign({ sub: Number(lista.revisorId) }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const hoy = new Date().toISOString().slice(0, 10);
  const mes = `${hoy.slice(0, 7)}-01`;
  const resultado = { escribir: bandera === '--escribir', items: items.length, antes: await kpisCoordinadores(token, mes, hoy) };

  if (!resultado.escribir) {
    resultado.nota = 'Simulacro: no se aprobó nada. Repite con --escribir.';
    console.log(JSON.stringify(resultado, null, 1));
    return;
  }

  const aprobadas = [];
  const fallidas = [];
  for (let i = 0; i < items.length; i += 100) {
    const r = await llamar(token, 'POST', '/me/revisiones/aprobar-lote', {
      items: items.slice(i, i + 100),
      observaciones: lista.observaciones,
      calificacion: lista.calificacion,
    });
    aprobadas.push(...r.aprobadas);
    fallidas.push(...r.fallidas);
  }
  resultado.aprobadas = aprobadas;
  resultado.fallidas = fallidas;
  resultado.despues = await kpisCoordinadores(token, mes, hoy);
  console.log(JSON.stringify(resultado, null, 1));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
