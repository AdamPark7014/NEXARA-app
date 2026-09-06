import { integraApi } from "./_lib";

/**
 * Apertura del muro: N cámaras, un solo punto de decisión.
 *
 * ## El endpoint de lote SÍ existe (comprobado el 06-09-2026)
 *
 * `POST integra/cameras/streams/batch`, con cuerpo
 * `{ cameraIds: string[], audio?: boolean, quality?: 'main' | 'sub' }` y tope de
 * 40 ids. Lo acaba de publicar el trabajo de automatización de `apps/api`
 * (`integra.controller.ts` → `IntegraArtemisService.streamsEnLote` →
 * `IntegraMediaService.liveStreamsEnLote`), así que aquí se usa en vez de
 * inventar nada.
 *
 * Lo importante de su contrato: **los fallos vienen dentro de la respuesta**,
 * cámara por cámara (`ok` + `error`). Que la séptima no esté en el espejo no
 * puede dejar sin video a las otras doce — que es exactamente el «no se ven
 * todas» que costó sangre arreglar en el muro.
 *
 * ## Y aun así se conserva el camino de una en una
 *
 * El endpoint es nuevo: contra un backend que todavía no lo tenga desplegado
 * devuelve 404. Si la llamada al lote **se cae entera**, se abre cámara por
 * cámara como siempre. Mejor N viajes que un muro vacío. Un fallo *por cámara*
 * dentro de una respuesta buena no dispara ese respaldo: eso es un resultado
 * legítimo, no una avería.
 */

/** Lo mínimo que hace falta para nombrar una cámara en un aviso de fallo. */
export type CamaraAbrible = { id: string; name?: string };

export type FalloApertura = { name: string; reason: string };

export type ResultadoLote<S> = {
  abiertos: S[];
  fallos: FalloApertura[];
};

/** Lo que devuelve la API por cada cámara, en lote o de una en una. */
export type RespuestaStream = {
  hls: string | null;
  rtsp: string | null;
  note?: string;
  provider?: string;
  stream?: Record<string, unknown>;
  hasAudio?: boolean;
  audio?: boolean;
  streamName?: string;
};

export type ItemLote = {
  cameraIndexCode: string;
  ok: boolean;
  stream: RespuestaStream | null;
  error: string | null;
};

export type RespuestaLote = {
  total: number;
  ok: number;
  failed: number;
  items: ItemLote[];
};

/** ¿Hay endpoint de lote en la API? Sí. Ver el bloque de arriba. */
export const LOTE_DISPONIBLE = true;

/** El tope que valida el backend (`@ArrayMaxSize(40)`). */
export const LOTE_MAX = 40;

export const RUTA_LOTE = "integra/cameras/streams/batch";

function motivo(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error) return error;
  return "no respondió";
}

function nombreDe(camara: CamaraAbrible): string {
  return camara.name || camara.id;
}

/**
 * Reparte la respuesta del lote sobre las cámaras que se pidieron.
 *
 * Es puro a propósito: es la parte con reglas —el orden de entrada manda porque
 * decide qué celda ocupa cada cámara, el backend deduplica ids y puede devolver
 * menos elementos de los que se pidieron, y una cámara que no aparece en la
 * respuesta es un fallo, no un silencio—.
 */
export function repartirRespuestaLote<C extends CamaraAbrible, S>(
  camaras: readonly C[],
  respuesta: RespuestaLote,
  construir: (camara: C, stream: RespuestaStream) => S,
): ResultadoLote<S> {
  const porId = new Map<string, ItemLote>();
  for (const item of respuesta.items ?? []) {
    if (item && typeof item.cameraIndexCode === "string") porId.set(item.cameraIndexCode, item);
  }
  const abiertos: S[] = [];
  const fallos: FalloApertura[] = [];
  for (const camara of camaras) {
    const item = porId.get(camara.id);
    if (!item) {
      fallos.push({ name: nombreDe(camara), reason: "no vino en la respuesta del lote" });
      continue;
    }
    if (!item.ok || !item.stream) {
      fallos.push({ name: nombreDe(camara), reason: item.error || "no respondió" });
      continue;
    }
    abiertos.push(construir(camara, item.stream));
  }
  return { abiertos, fallos };
}

/**
 * Pide el lote a la API. Lanza si la petición entera se cae — el que llama
 * decide si eso justifica caer al camino de una en una.
 */
export async function pedirLoteApi<C extends CamaraAbrible, S>(
  camaras: readonly C[],
  construir: (camara: C, stream: RespuestaStream) => S,
  opciones?: { audio?: boolean; quality?: "main" | "sub" },
): Promise<ResultadoLote<S>> {
  const respuesta = await integraApi<RespuestaLote>(RUTA_LOTE, {
    method: "POST",
    body: JSON.stringify({
      cameraIds: camaras.map((c) => c.id),
      ...(opciones?.audio ? { audio: true } : {}),
      ...(opciones?.quality ? { quality: opciones.quality } : {}),
    }),
  });
  return repartirRespuestaLote(camaras, respuesta, construir);
}

/**
 * Abre los streams de todas las cámaras dadas: un viaje si el lote responde,
 * N viajes en paralelo si no.
 *
 * @param camaras   Las candidatas, ya en el orden en que deben ocupar el muro.
 * @param abrirUna  `POST integra/cameras/:id/stream` para una cámara.
 * @param abrirLote El camino de lote. Si se omite —o si el muro pide más de
 *                  `LOTE_MAX`, que el backend rechazaría— se va directo al
 *                  camino de una en una.
 *
 * El orden del resultado respeta el de entrada, que es lo que decide qué celda
 * ocupa cada cámara.
 */
export async function abrirStreamsEnLote<C extends CamaraAbrible, S>(
  camaras: readonly C[],
  abrirUna: (camara: C) => Promise<S>,
  abrirLote?: (camaras: readonly C[]) => Promise<ResultadoLote<S>>,
): Promise<ResultadoLote<S>> {
  if (camaras.length === 0) return { abiertos: [], fallos: [] };

  if (abrirLote && camaras.length <= LOTE_MAX) {
    try {
      return await abrirLote(camaras);
    } catch {
      // El lote entero se cayó (404 en un backend sin desplegar, red, 500).
      // Se abre una a una: mejor N viajes que un muro vacío.
    }
  }

  const resultados = await Promise.allSettled(camaras.map((c) => abrirUna(c)));
  const abiertos: S[] = [];
  const fallos: FalloApertura[] = [];
  resultados.forEach((r, i) => {
    if (r.status === "fulfilled") {
      abiertos.push(r.value);
      return;
    }
    fallos.push({ name: nombreDe(camaras[i]), reason: motivo(r.reason) });
  });
  return { abiertos, fallos };
}
