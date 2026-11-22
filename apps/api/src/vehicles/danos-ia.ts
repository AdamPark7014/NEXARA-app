/**
 * Comparación antes/después con IA: la foto de salida contra la de devolución, vista por vista.
 *
 * La IA propone; Liz decide. Nada de lo que sale de aquí cobra a nadie ni abre una incidencia por sí
 * solo: queda como `VehicleDamageFinding` PROPUESTO hasta que una persona lo confirma o lo descarta.
 * Los descartes guardan su motivo para que el criterio se afine con el tiempo.
 *
 * Módulo puro: prompt, esquema, pares y limpieza. La llamada vive en `danos-vehiculo.service.ts`.
 */
import { ETIQUETA_SLOT, esSlotChecklist } from './checklist-entrega.js';
import { etiquetaSlotGuiado, SLOT_KM_GASOLINA } from './captura-guiada.js';

/** Ver un rayón pide buen ojo: Sonnet. Una devolución cuesta unos centavos de dólar. */
export const MODELO_DANOS = 'claude-sonnet-5-5';
/** Por debajo de esto, la IA no está segura: no se le enseña a Liz. */
export const CONFIANZA_MINIMA = 0.5;
export const TOPE_HALLAZGOS = 8;
/** La puerta acepta 2 MB por petición: 6 pares (12 fotos) a 768 px caben con holgura. */
export const PARES_POR_LLAMADA = 6;
export const ANCHO_FOTO_DANOS = 768;

/** El acercamiento al odómetro no muestra daños: no se compara. */
const SIN_COMPARAR = new Set<string>([SLOT_KM_GASOLINA]);

export type FotoComparable = { slot: string; url: string };

export type ParFotos = { zona: string; etiqueta: string; salidaUrl: string; devolucionUrl: string };

export function etiquetaZona(zona: string): string {
  if (esSlotChecklist(zona)) return ETIQUETA_SLOT[zona];
  return etiquetaSlotGuiado(zona) ?? zona;
}

/**
 * Pares salida/devolución de la misma vista. Solo se comparan vistas que existen en los dos momentos
 * (una salida con checklist viejo y devolución guiada no tienen vistas en común salvo el tablero).
 */
export function paresParaComparar(
  salida: ReadonlyArray<FotoComparable>,
  devolucion: ReadonlyArray<FotoComparable>,
  version: number,
): ParFotos[] {
  const deSalida = new Map(salida.filter((f) => f?.slot && f?.url).map((f) => [f.slot, f.url]));
  const pares: ParFotos[] = [];
  for (const f of devolucion) {
    if (!f?.slot || !f?.url) continue;
    // En el checklist de 7 fotos el «tablero» es el del odómetro; en la guiada es el tablero completo.
    if (SIN_COMPARAR.has(f.slot) || (version < 2 && f.slot === 'tablero')) continue;
    const antes = deSalida.get(f.slot);
    if (!antes) continue;
    pares.push({ zona: f.slot, etiqueta: etiquetaZona(f.slot), salidaUrl: antes, devolucionUrl: f.url });
  }
  return pares;
}

export function enLotes<T>(lista: readonly T[], tamano = PARES_POR_LLAMADA): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) lotes.push(lista.slice(i, i + tamano));
  return lotes;
}

export const PROMPT_DANOS = `Revisas fotos de una camioneta de trabajo para encontrar daños NUEVOS: los que se ven al devolverla y no estaban al salir.

Las fotos llegan en pares de la misma vista: primero la de SALIDA y luego la de DEVOLUCIÓN. El texto dice qué vista es cada par.

Cuenta como daño nuevo, si en la devolución se ve y en la salida no:
- rayones, raspones, abolladuras, golpes, pintura saltada;
- vidrios, espejos o faros estrellados o rotos; piezas flojas, caídas o faltantes (tapones, molduras, antena);
- llantas ponchadas o muy bajas; rines golpeados;
- en el interior: vestiduras rotas, quemadas o manchadas, piezas del tablero rotas, testigos de falla encendidos que antes no estaban.

No cuentes:
- polvo, lodo, agua, hojas o suciedad que se quita lavando;
- reflejos, sombras, cambios de luz o de ángulo; objetos sueltos dentro (herramienta, bolsas);
- algo que ya estaba en la foto de salida, aunque se vea distinto por la luz;
- algo que no se alcanza a ver bien en alguna de las dos fotos.

Para cada daño nuevo devuelve: par (el número del par), descripcion (corta, concreta: qué y dónde, p. ej. «rayón de unos 20 cm en la puerta trasera derecha»), severidad (leve: estético; media: requiere taller; grave: afecta la seguridad o el uso) y confianza de 0 a 1.

Si no ves daños nuevos, devuelve hallazgos vacío. Es mejor no reportar que inventar.`;

export const ESQUEMA_DANOS: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['hallazgos'],
  properties: {
    hallazgos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['par', 'descripcion', 'severidad', 'confianza'],
        properties: {
          par: { type: 'integer' },
          descripcion: { type: 'string' },
          severidad: { type: 'string', enum: ['leve', 'media', 'grave'] },
          confianza: { type: 'number' },
        },
      },
    },
  },
};

/**
 * El texto que acompaña un lote: qué vista es cada par y en qué orden van las fotos. [contexto] es lo
 * aprendido de las revisiones de Liz (`contextoAprendido`); va antes de los pares.
 */
export function textoDelLote(pares: ReadonlyArray<ParFotos>, contexto?: string | null): string {
  const lineas = pares.map(
    (p, i) => `Par ${i + 1}: ${p.etiqueta}. Foto ${i * 2 + 1} = salida, foto ${i * 2 + 2} = devolución.`,
  );
  const previo = contexto?.trim() ? `${contexto.trim()}\n\n` : '';
  return `${previo}${lineas.join('\n')}\n\nCompara cada par y dime los daños nuevos.`;
}

/* ── Lo que la IA aprende de las revisiones de Liz ─────────────────────── */

/** Una revisión anterior de Liz, tal como se lee de `vehicle_damage_findings`. */
export type RevisionPrevia = {
  zona: string;
  descripcion: string;
  estatus: string;
  motivoDescarte: string | null;
  notaRevision: string | null;
  vehicleAssetId: number | null;
  /** Estatus de la incidencia que abrió al confirmarse (`CERRADA` = ya se reparó). */
  incidenciaEstatus: string | null;
};

export const TOPE_CONOCIDOS = 12;
export const TOPE_ERRORES = 8;

const ETIQUETA_MOTIVO: Record<string, string> = {
  YA_ESTABA: 'ya estaba al salir',
  REFLEJO_O_SUCIEDAD: 'reflejo, sombra o suciedad',
  NO_ES_DANO: 'no es un daño',
  OTRO: 'otro motivo',
};

/** Una línea, sin saltos ni comillas angulares, y corta: es texto que escribió una persona. */
function renglon(texto: string | null | undefined, max = 160): string {
  return String(texto ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[«»"]/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Lo que la IA debe saber antes de comparar, sacado de lo que Liz ya decidió:
 *
 * - daños conocidos de ESTA unidad (confirmados con la incidencia sin cerrar, o descartados porque «ya
 *   estaba al salir»): no se vuelven a proponer en cada devolución;
 * - errores recientes de la IA en cualquier unidad (reflejos, suciedad, «no es daño»): no repetirlos.
 *
 * Las revisiones llegan de la más reciente a la más vieja. `null` = no hay nada que enseñar.
 */
export function contextoAprendido(previas: ReadonlyArray<RevisionPrevia>, vehicleAssetId: number | null): string | null {
  const conocidos: string[] = [];
  const errores: string[] = [];
  const vistos = new Set<string>();
  for (const r of previas) {
    const descripcion = renglon(r.descripcion);
    if (!descripcion) continue;
    const llave = `${r.zona}|${descripcion.toLowerCase()}`;
    if (vistos.has(llave)) continue;
    const mismaUnidad = vehicleAssetId != null && r.vehicleAssetId === vehicleAssetId;
    const vista = etiquetaZona(r.zona);
    if (mismaUnidad && r.estatus === 'CONFIRMADO' && r.incidenciaEstatus !== 'CERRADA') {
      if (conocidos.length < TOPE_CONOCIDOS) {
        conocidos.push(`- ${vista}: ${descripcion} (ya registrado)`);
        vistos.add(llave);
      }
    } else if (mismaUnidad && r.estatus === 'DESCARTADO' && r.motivoDescarte === 'YA_ESTABA') {
      if (conocidos.length < TOPE_CONOCIDOS) {
        conocidos.push(`- ${vista}: ${descripcion} (ya estaba al salir)`);
        vistos.add(llave);
      }
    } else if (
      r.estatus === 'DESCARTADO' &&
      (r.motivoDescarte === 'REFLEJO_O_SUCIEDAD' || r.motivoDescarte === 'NO_ES_DANO' || (r.motivoDescarte === 'OTRO' && renglon(r.notaRevision)))
    ) {
      if (errores.length < TOPE_ERRORES) {
        const nota = renglon(r.notaRevision, 120);
        const motivo = ETIQUETA_MOTIVO[r.motivoDescarte ?? ''] ?? 'descartado';
        errores.push(`- ${vista}: '${descripcion}' → ${motivo}${nota ? ` (nota: ${nota})` : ''}`);
        vistos.add(llave);
      }
    }
  }
  const partes: string[] = [];
  if (conocidos.length) {
    partes.push(`Daños que esta unidad ya tenía; no los reportes como nuevos:\n${conocidos.join('\n')}`);
  }
  if (errores.length) {
    partes.push(
      `Reportes que la persona que revisa descartó en otras devoluciones; no repitas ese tipo de error:\n${errores.join('\n')}`,
    );
  }
  return partes.length ? partes.join('\n\n') : null;
}

export type HallazgoLimpio = {
  zona: string;
  descripcion: string;
  severidad: 'leve' | 'media' | 'grave';
  confianza: number;
  fotoSalidaUrl: string;
  fotoDevolucionUrl: string;
};

/** Lo que respondió la IA para un lote → hallazgos que sí se le enseñan a Liz. */
export function limpiarHallazgos(datos: unknown, pares: ReadonlyArray<ParFotos>): HallazgoLimpio[] {
  const lista = (datos as { hallazgos?: unknown })?.hallazgos;
  if (!Array.isArray(lista)) return [];
  const limpios: HallazgoLimpio[] = [];
  for (const h of lista) {
    if (!h || typeof h !== 'object') continue;
    const o = h as Record<string, unknown>;
    const par = Number(o['par']);
    if (!Number.isInteger(par) || par < 1 || par > pares.length) continue;
    const confianza = Number(o['confianza']);
    if (!Number.isFinite(confianza) || confianza < CONFIANZA_MINIMA) continue;
    const severidad = o['severidad'];
    if (severidad !== 'leve' && severidad !== 'media' && severidad !== 'grave') continue;
    const descripcion = String(o['descripcion'] ?? '').trim().slice(0, 500);
    if (!descripcion) continue;
    const p = pares[par - 1];
    limpios.push({
      zona: p.zona,
      descripcion,
      severidad,
      confianza: Math.min(1, Math.round(confianza * 100) / 100),
      fotoSalidaUrl: p.salidaUrl,
      fotoDevolucionUrl: p.devolucionUrl,
    });
  }
  return limpios.sort((a, b) => b.confianza - a.confianza).slice(0, TOPE_HALLAZGOS);
}

export const MOTIVOS_DESCARTE = ['YA_ESTABA', 'REFLEJO_O_SUCIEDAD', 'NO_ES_DANO', 'OTRO'] as const;
export type MotivoDescarte = (typeof MOTIVOS_DESCARTE)[number];

export const QUIEN_PAGA = ['EMPRESA', 'RESPONSABLE', 'SEGURO'] as const;
export const TIPOS_INCIDENCIA = ['DANO', 'MULTA', 'FALLA', 'KM_SIN_REGISTRO', 'RETRASO', 'OTRO'] as const;
export const ESTATUS_INCIDENCIA = ['ABIERTA', 'EN_REPARACION', 'CERRADA'] as const;
