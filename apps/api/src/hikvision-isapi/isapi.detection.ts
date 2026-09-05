/**
 * Parámetros de detección de una cámara — y el parcheo de XML que los escribe.
 *
 * Antes de esto, `enableFieldDetection` era una plantilla fija aplicada a
 * ciegas: región = fotograma completo, `sensitivityLevel` = 100 (el techo),
 * una sola zona de las cuatro que admite el equipo. Sensibilidad máxima sobre
 * todo el encuadre detecta la calle, el reflejo y el estacionamiento igual que
 * la puerta. Aquí viven los parámetros y las transformaciones puras; en
 * `isapi.discovery.ts` queda solo el ida y vuelta HTTP.
 *
 * ## Qué está documentado y qué es empírico
 *
 * El corpus del fabricante (`HIKVISION-apps/docs/API-DOCS/HIKVISION/HikGateway/
 * docs/API_Developer Guide_V1.8.0_20250109.PDF`) documenta el **payload del
 * evento**, no el endpoint que lo enciende. La familia `/ISAPI/Smart/*` NO
 * aparece en todo el corpus: funciona porque se midió contra el DS-2CD2123G2
 * de Oficinas.
 *
 * | Elemento | Evidencia |
 * |---|---|
 * | `sensitivityLevel`, rango [0,100] | **DOCUMENTADO** — Apéndice A.49 |
 * | `detectionTarget` = human/vehicle/others | **DOCUMENTADO** — Apéndice A.49 |
 * | `RegionCoordinates` positionX/Y en 0..1000 | **DOCUMENTADO** — Apéndice A.49 |
 * | `eventType` (catálogo de abajo) | **DOCUMENTADO** — Apéndice B |
 * | `GET/PUT /ISAPI/Smart/FieldDetection/{ch}` | **EMPÍRICO** — DS-2CD2123G2 |
 * | `alarmConfidence` = low/mediumLow/mediumHigh/high | **EMPÍRICO** — el equipo lo devuelve |
 * | `timeThreshold`, `startTriggerTime`, `endTriggerTime` | **EMPÍRICO** |
 * | `normalizedScreenWidth/Height` de la config | **EMPÍRICO** |
 *
 * **Regla que manda:** un tag empírico solo se ESCRIBE si el equipo lo devolvió
 * en su propia respuesta. Nunca se inserta uno que no vino. Un XML con un tag
 * que ese firmware no conoce deja la cámara sin detectar y nadie se entera.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * Catálogo de tipos de evento
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Los tipos de evento que NEXARA cablea hoy a `center` (httpHosts).
 *
 * **Este array es el único punto del sistema donde se decide qué eventos
 * existen.** Nada fuera de él llega jamás, aunque el equipo lo soporte y esté
 * encendido: `ensureSmartEventTriggersCenter` solo marca `notificationMethod =
 * center` en los `EventTrigger` cuyo `eventType` casa con esta lista, y sin
 * `center` el equipo dispara en local pero no empuja nada a NEXARA.
 *
 * Estaba escondido dentro de la función como cinco cadenas sueltas. Ahora es
 * una constante exportada, y un perfil de cámara puede ampliarla —solo con
 * valores del catálogo documentado de abajo.
 */
export const SMART_EVENT_TYPES = [
  'fielddetection',
  'linedetection',
  'facedetection',
  'VMD',
  'videoloss',
  // — Salud de la propia cámara. Ver `CAMERA_HEALTH_EVENT_TYPES` abajo.
  'shelteralarm',
  'defocus',
  'scenechangedetection',
] as const;

export type SmartEventType = (typeof SMART_EVENT_TYPES)[number];

/**
 * **El sistema se vigila a sí mismo.**
 *
 * Estos tres no detectan a nadie: detectan que la cámara ha dejado de servir.
 *
 * - `shelteralarm` — el objetivo está **tapado** (una bolsa, pintura, una mano).
 * - `defocus` — la imagen se ha ido de foco (alguien giró el anillo, o el
 *   enfoque automático se perdió).
 * - `scenechangedetection` — el encuadre ya no es el que se configuró: **la
 *   movieron**. Las zonas de detección apuntan entonces a otro sitio, así que
 *   este evento invalida en silencio todo lo demás que hace la cámara.
 *
 * Los tres están en el Apéndice B (catálogo de abajo), así que no hay nada
 * inventado. Entran en la base y no en «lo que amplía un perfil» porque no son
 * una preferencia del cliente: una cámara tapada es una cámara tapada en las
 * dieciséis.
 *
 * **Encenderlos no escribe nada nuevo en el equipo.**
 * `ensureSmartEventTriggersCenter` solo marca `notificationMethod = center` en
 * los `EventTrigger` que el equipo YA declara. Si un firmware no soporta
 * `defocus`, no hay `EventTrigger` con ese `eventType` y no pasa nada: no se
 * crea, no se inventa un tag y la cámara queda igual que estaba.
 *
 * **Sin observación en campo todavía.** `camLabel` de `integra-push.parse.ts`
 * llevaba desde el principio la etiqueta de `shelteralarm` y era código muerto:
 * el tipo nunca llegaba porque nadie lo había cableado a `center`.
 */
export const CAMERA_HEALTH_EVENT_TYPES = [
  'shelteralarm',
  'defocus',
  'scenechangedetection',
] as const;

export type CameraHealthEventType = (typeof CAMERA_HEALTH_EVENT_TYPES)[number];

/** ¿Es uno de los tres avisos de salud de cámara? Insensible a la caja. */
export function isCameraHealthEventType(v: unknown): v is CameraHealthEventType {
  if (typeof v !== 'string') return false;
  const k = v.trim().toLowerCase();
  return CAMERA_HEALTH_EVENT_TYPES.some((t) => t.toLowerCase() === k);
}

/**
 * Catálogo **documentado** del Apéndice B («Event Types») del
 * `API_Developer Guide_V1.8.0_20250109`. Es la lista completa de valores que
 * el fabricante reconoce como `eventType`; ampliar un perfil con algo que no
 * esté aquí es inventarse un enum.
 *
 * Que un tipo esté en el catálogo **no significa que el equipo lo soporte**:
 * eso lo dice `GET /ISAPI/Smart/capabilities` (ver `probeSmartCapabilities`).
 * Antes de este trabajo nadie lo había preguntado nunca, así que merodeo, zona
 * restringida, objeto abandonado y desenfoque estaban en «no verificado», que
 * no es lo mismo que «no soportado».
 *
 * Heartbeat:  heartBeat
 * Generales:  devStatusChanged · devSleep · IO · VMD · videoloss ·
 *             shelteralarm · PALMismatch · diskfull · diskerror · PIR ·
 *             batteryStatus · addressChange
 * Smart:      scenechangedetection · facedetection · fielddetection ·
 *             linedetection · regionEntrance · regionExiting ·
 *             unattendedBaggage · attendedBaggage · loitering · group ·
 *             parking · rapidMove · defocus · audioexception
 *
 * Los de «Mobile Device Events» (overSpeed, collision, rollover…) son de
 * grabadores móviles y no aplican a este parque: se dejan fuera a propósito.
 */
export const APPENDIX_B_EVENT_TYPES = [
  'heartBeat',
  'devStatusChanged',
  'devSleep',
  'IO',
  'VMD',
  'videoloss',
  'shelteralarm',
  'PALMismatch',
  'diskfull',
  'diskerror',
  'PIR',
  'batteryStatus',
  'addressChange',
  'scenechangedetection',
  'facedetection',
  'fielddetection',
  'linedetection',
  'regionEntrance',
  'regionExiting',
  'unattendedBaggage',
  'attendedBaggage',
  'loitering',
  'group',
  'parking',
  'rapidMove',
  'defocus',
  'audioexception',
] as const;

export type AppendixBEventType = (typeof APPENDIX_B_EVENT_TYPES)[number];

/** ¿Es un `eventType` del catálogo documentado? */
export function isAppendixBEventType(v: unknown): v is AppendixBEventType {
  return (
    typeof v === 'string' &&
    (APPENDIX_B_EVENT_TYPES as readonly string[]).includes(v)
  );
}

/**
 * Lista efectiva de tipos a cablear: la base más lo que amplíe el perfil.
 *
 * - Solo entran valores del Apéndice B (nada inventado).
 * - Sin duplicados y respetando el orden: primero la base, luego los extra.
 * - Comparación insensible a mayúsculas para no meter `VMD` y `vmd` dos veces.
 */
export function resolveTriggerEventTypes(
  extra?: readonly string[] | null,
  base: readonly string[] = SMART_EVENT_TYPES,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (v: string) => {
    const key = v.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(v);
  };
  for (const v of base) push(v);
  for (const v of extra ?? []) {
    const trimmed = typeof v === 'string' ? v.trim() : '';
    if (!trimmed) continue;
    // Casar contra el catálogo ignorando la caja, pero guardar la grafía
    // oficial: el firmware compara `VMD` en mayúsculas.
    const official = APPENDIX_B_EVENT_TYPES.find(
      (t) => t.toLowerCase() === trimmed.toLowerCase(),
    );
    if (official) push(official);
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Parámetros
 * ──────────────────────────────────────────────────────────────────────── */

/** `detectionTarget` — valores documentados en el Apéndice A.49. */
export const DETECTION_TARGETS = ['human', 'vehicle', 'human,vehicle'] as const;
export type DetectionTarget = (typeof DETECTION_TARGETS)[number];

/**
 * `alarmConfidence` — **EMPÍRICO**. El propio equipo devuelve el tag con
 * `opt="low,mediumLow,mediumHigh,high"` (verificado en DS-2CD2123G2-LIS2U
 * V5.7.19). No aparece en la documentación del fabricante, así que **la
 * dirección del enum no está confirmada**: lo razonable es que a más confianza
 * exigida, menos falsos positivos, pero eso hay que medirlo en UNA cámara antes
 * de moverlo en las dieciséis. Por eso el valor por defecto sigue siendo el que
 * el sistema escribía hasta hoy.
 */
export const ALARM_CONFIDENCES = ['low', 'mediumLow', 'mediumHigh', 'high'] as const;
export type AlarmConfidence = (typeof ALARM_CONFIDENCES)[number];

/**
 * Sensibilidad por defecto.
 *
 * El rango **documentado** es [0,100] (Apéndice A.49) y hasta hoy se escribía
 * **100, el techo**, en todas las cámaras. Con el máximo, cualquier variación
 * de píxeles cuenta como objetivo: es la causa directa del ruido, y combinada
 * con la región a fotograma completo garantiza los falsos positivos.
 *
 * 50 es el punto medio de la escala y, sobre todo, **es el valor que el propio
 * fabricante lleva en su mensaje de ejemplo** del Apéndice A.49
 * (`"sensitivityLevel":50`). Cuando hay que elegir un número sin poder medirlo
 * en sitio, el que trae la referencia del fabricante es mejor que uno inventado
 * y muchísimo mejor que el techo del rango.
 */
export const DEFAULT_SENSITIVITY = 50;

/** Regiones simultáneas que admite el equipo (verificado en DS-2CD2123G2). */
export const MAX_DETECTION_REGIONS = 4;

/** Vértice de un polígono, normalizado 0..1 sobre el encuadre. */
export type NormalizedPoint = { x: number; y: number };

/**
 * Polígono de detección normalizado 0..1. Se guarda así —y no en la rejilla
 * del equipo— porque cada firmware declara su propio `normalizedScreenSize`, y
 * un perfil tiene que sobrevivir a un cambio de cámara.
 */
export type NormalizedRegion = NormalizedPoint[];

/** Lo que un perfil puede ajustar de una detección. Todo opcional. */
export type DetectionTuning = {
  target?: DetectionTarget | null;
  /** 0..100. `null`/ausente → `DEFAULT_SENSITIVITY`. */
  sensitivity?: number | null;
  /** Solo se escribe si el equipo devolvió el tag. */
  alarmConfidence?: AlarmConfidence | null;
  /** Hasta 4 polígonos 0..1. Vacío/ausente → fotograma completo (compat). */
  regions?: NormalizedRegion[] | null;
  /** Segundos que el objetivo debe permanecer antes de disparar. */
  timeThresholdSec?: number | null;
};

/** Tuning con todos los huecos ya resueltos. */
export type ResolvedDetectionTuning = {
  target: DetectionTarget;
  sensitivity: number;
  alarmConfidence: AlarmConfidence;
  regions: NormalizedRegion[] | null;
  timeThresholdSec: number;
};

/* ────────────────────────────────────────────────────────────────────────────
 * Saneado
 * ──────────────────────────────────────────────────────────────────────── */

export function isDetectionTarget(v: unknown): v is DetectionTarget {
  return typeof v === 'string' && (DETECTION_TARGETS as readonly string[]).includes(v);
}

export function isAlarmConfidence(v: unknown): v is AlarmConfidence {
  return typeof v === 'string' && (ALARM_CONFIDENCES as readonly string[]).includes(v);
}

/**
 * Recorta al rango documentado [0,100] y redondea.
 *
 * `null`, `undefined` y cadena vacía se atajan a mano **antes** de `Number()`:
 * `Number(null)` es 0 y `Number('')` también, así que un perfil con la
 * sensibilidad sin fijar acabaría escribiendo 0 en el equipo —una cámara sorda—
 * en vez del valor por defecto. 0 solo se escribe si alguien lo pide.
 */
export function clampSensitivity(v: unknown, fallback = DEFAULT_SENSITIVITY): number {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Sanea polígonos venidos de la base (`Json`) o de un PATCH.
 *
 * - Coordenadas fuera de 0..1 se recortan: una región no puede salirse del
 *   encuadre y el equipo rechaza el XML si se sale de su rejilla.
 * - Menos de 3 vértices no es un polígono: se descarta.
 * - Se topa a `MAX_DETECTION_REGIONS`; lo que sobra se ignora en silencio
 *   porque el equipo solo tiene cuatro ranuras.
 * - Devuelve `null` si no queda ninguna válida, que es la señal de «usa el
 *   comportamiento de siempre» (fotograma completo).
 */
export function sanitizeRegions(
  input: unknown,
  max = MAX_DETECTION_REGIONS,
): NormalizedRegion[] | null {
  if (!Array.isArray(input)) return null;
  const out: NormalizedRegion[] = [];
  for (const raw of input) {
    if (!Array.isArray(raw)) continue;
    const pts: NormalizedPoint[] = [];
    for (const p of raw) {
      if (!p || typeof p !== 'object') continue;
      const rec = p as Record<string, unknown>;
      const x = Number(rec.x);
      const y = Number(rec.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      pts.push({ x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) });
    }
    if (pts.length >= 3) out.push(pts);
    if (out.length >= max) break;
  }
  return out.length ? out : null;
}

/** Las cuatro esquinas: lo que el sistema escribía en todas las cámaras. */
export function fullFrameRegion(): NormalizedRegion {
  return [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
}

/** Rellena los huecos de un tuning parcial con los valores de compatibilidad. */
export function resolveTuning(t?: DetectionTuning | null): ResolvedDetectionTuning {
  const timeThreshold = Number(t?.timeThresholdSec);
  return {
    target: isDetectionTarget(t?.target) ? t!.target! : 'human',
    sensitivity: clampSensitivity(t?.sensitivity),
    // Por defecto, lo que ya se escribía. Subirlo es la palanca de exactitud
    // más barata que hay, pero su dirección no está documentada: se mide antes.
    alarmConfidence: isAlarmConfidence(t?.alarmConfidence) ? t!.alarmConfidence! : 'low',
    regions: sanitizeRegions(t?.regions ?? null),
    // 0 = disparo inmediato, que es lo que se escribía hasta hoy.
    timeThresholdSec:
      Number.isFinite(timeThreshold) && timeThreshold >= 0
        ? Math.min(Math.round(timeThreshold), 3600)
        : 0,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Geometría → XML del equipo
 * ──────────────────────────────────────────────────────────────────────── */

/** Rejilla que el equipo declara en su propio XML; 1000×1000 en Oficinas. */
export function readNormalizedGrid(xml: string): { w: number; h: number } {
  return {
    w: Number(/<normalizedScreenWidth>(\d+)</.exec(xml)?.[1]) || 1000,
    h: Number(/<normalizedScreenHeight>(\d+)</.exec(xml)?.[1]) || 1000,
  };
}

/**
 * Polígono 0..1 → `<RegionCoordinatesList>` en la rejilla del equipo.
 * Documentado: `positionX`/`positionY` son enteros de la rejilla normalizada.
 */
export function regionToCoordinatesList(
  region: NormalizedRegion,
  grid: { w: number; h: number },
): string {
  const pts = region
    .map(({ x, y }) => {
      const px = Math.max(0, Math.min(grid.w, Math.round(x * grid.w)));
      const py = Math.max(0, Math.min(grid.h, Math.round(y * grid.h)));
      return `<RegionCoordinates><positionX>${px}</positionX><positionY>${py}</positionY></RegionCoordinates>`;
    })
    .join('');
  return `<RegionCoordinatesList>${pts}</RegionCoordinatesList>`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Parcheo de XML — transformaciones puras
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Un tag con su valor, **contando con que traiga atributos**.
 *
 * El equipo no devuelve `<alarmConfidence>high</alarmConfidence>` sino
 * `<alarmConfidence opt="low,mediumLow,mediumHigh,high">high</alarmConfidence>`.
 * Un regex que ignore los atributos no encuentra el tag, el parcheo se pierde
 * en silencio y la camara se queda sin ajustar sin que nadie se entere.
 */
// `String.raw` a propósito: en un template literal normal, `\s` se colapsa a
// `s` y el regex pasaría a exigir una `s` literal tras el nombre del tag.
const tagRe = (tag: string) =>
  new RegExp(String.raw`<${tag}(\s[^>]*)?>([^<]*)</${tag}>`, 'i');

/** El equipo devolvio este tag? (con o sin atributos). */
export function hasTag(xml: string, tag: string): boolean {
  return tagRe(tag).test(xml);
}

/**
 * Sustituye el valor de un tag **si ya existe**. Si no existe, no hace nada.
 *
 * Es la regla de oro de este archivo: solo se escribe lo que el equipo devolvió.
 * `alarmConfidence` y el alias viejo `sensitivity` pasan por aquí porque son
 * empíricos y no todos los firmwares los traen.
 */
export function replaceTagIfPresent(xml: string, tag: string, value: string): string {
  const re = tagRe(tag);
  const m = re.exec(xml);
  if (!m) return xml;
  // Los atributos originales se devuelven intactos: el `opt=` que manda el
  // equipo es su propia declaracion de valores validos.
  const attrs = m[1] ?? '';
  return xml.replace(re, () => `<${tag}${attrs}>${value}</${tag}>`);
}

/**
 * Sustituye el valor de un tag, y si no está lo añade antes del cierre de
 * `closingTag`. Reservado a tags que SÍ documenta el fabricante para ese nodo
 * (`sensitivityLevel`, `detectionTarget`).
 */
export function upsertTag(
  xml: string,
  tag: string,
  value: string,
  closingTag: string,
): string {
  if (hasTag(xml, tag)) return replaceTagIfPresent(xml, tag, value);
  return xml.replace(
    new RegExp(`</${closingTag}>`, 'i'),
    () => `<${tag}>${value}</${tag}></${closingTag}>`,
  );
}

/** Sustituye `<RegionCoordinatesList>` o lo añade si el nodo no lo traía. */
function setRegionPolygon(regionXml: string, poly: string): string {
  if (/<RegionCoordinatesList>[\s\S]*?<\/RegionCoordinatesList>/i.test(regionXml)) {
    return regionXml.replace(
      /<RegionCoordinatesList>[\s\S]*?<\/RegionCoordinatesList>/i,
      poly,
    );
  }
  return regionXml.replace(/<\/FieldDetectionRegion>/i, `${poly}</FieldDetectionRegion>`);
}

export type FieldDetectionPatch = {
  xml: string;
  /** Ranuras `FieldDetectionRegion` que trae el equipo. */
  slots: number;
  /** Ranuras que quedan encendidas. */
  enabled: number;
  /** `true` si el equipo devolvió `alarmConfidence` y se ha escrito. */
  wroteAlarmConfidence: boolean;
};

/**
 * Parchea el XML de `/ISAPI/Smart/FieldDetection/{ch}` con el tuning dado.
 *
 * Reparto de regiones sobre las ranuras del equipo:
 * - Sin polígonos en el perfil → **fotograma completo en la ranura 1** y el
 *   resto se deja como está. Es exactamente lo que hacía el sistema hasta hoy,
 *   así que un sitio sin perfil no cambia de comportamiento.
 * - Con polígonos → uno por ranura, en orden, hasta agotar polígonos o
 *   ranuras. Las ranuras que sobran se **apagan**: si no, la zona vieja a
 *   fotograma completo seguiría disparando y el perfil no serviría de nada.
 *
 * Devuelve el XML listo para el PUT; no habla con la red.
 */
export function patchFieldDetectionXml(
  xml: string,
  tuning?: DetectionTuning | null,
): FieldDetectionPatch | null {
  const t = resolveTuning(tuning);
  const regionBlocks = [
    ...xml.matchAll(/<FieldDetectionRegion\b[\s\S]*?<\/FieldDetectionRegion>/g),
  ];
  if (regionBlocks.length === 0) return null;

  const grid = readNormalizedGrid(xml);
  const polygons = (t.regions ?? [fullFrameRegion()]).slice(0, MAX_DETECTION_REGIONS);

  let out = xml.replace(
    /(<FieldDetection\b[^>]*>[\s\S]*?<enabled>)\s*false\s*(<\/enabled>)/i,
    '$1true$2',
  );
  // Re-armar más rápido entre disparos (firmware: start/endTriggerTime en ms).
  out = out
    .replace(/<startTriggerTime>\d+<\/startTriggerTime>/i, '<startTriggerTime>0</startTriggerTime>')
    .replace(/<endTriggerTime>\d+<\/endTriggerTime>/i, '<endTriggerTime>0</endTriggerTime>');

  let wroteAlarmConfidence = false;
  let enabled = 0;

  regionBlocks.forEach((match, i) => {
    const original = match[0];
    const polygon = polygons[i];

    // Sin perfil solo se toca la ranura 1: el resto se deja como el equipo lo
    // tenía, igual que antes. Con perfil, las ranuras sobrantes se apagan.
    if (!polygon) {
      if (t.regions) {
        const off = original.replace(/<enabled>\s*true\s*<\/enabled>/i, '<enabled>false</enabled>');
        out = out.replace(original, off);
      }
      return;
    }

    let patched = original.replace(/<enabled>\s*false\s*<\/enabled>/i, '<enabled>true</enabled>');
    // Documentados en el Apéndice A.49 para este nodo: se pueden añadir.
    patched = upsertTag(patched, 'detectionTarget', t.target, 'FieldDetectionRegion');
    patched = upsertTag(
      patched,
      'sensitivityLevel',
      String(t.sensitivity),
      'FieldDetectionRegion',
    );
    // Empíricos: solo si el equipo los devolvió.
    patched = replaceTagIfPresent(patched, 'sensitivity', String(t.sensitivity));
    patched = replaceTagIfPresent(patched, 'timeThreshold', String(t.timeThresholdSec));
    if (hasTag(patched, 'alarmConfidence')) {
      patched = replaceTagIfPresent(patched, 'alarmConfidence', t.alarmConfidence);
      wroteAlarmConfidence = true;
    }
    patched = setRegionPolygon(patched, regionToCoordinatesList(polygon, grid));
    out = out.replace(original, patched);
    enabled += 1;
  });

  return { xml: out, slots: regionBlocks.length, enabled, wroteAlarmConfidence };
}

export type LineDetectionPatch = {
  xml: string;
  lines: number;
  wroteAlarmConfidence: boolean;
};

/**
 * Parchea `/ISAPI/Smart/LineDetection/{ch}`.
 *
 * La línea sigue siendo la horizontal a mitad de encuadre salvo que el perfil
 * traiga polígonos: entonces se usa el **primer y último vértice** de cada
 * polígono como los dos extremos del segmento, que es lo único que admite un
 * `LineItem` (dos `Coordinates`). Así el mismo campo `regions` del perfil sirve
 * para las dos detecciones sin inventar una segunda estructura.
 */
export function patchLineDetectionXml(
  xml: string,
  tuning?: DetectionTuning | null,
): LineDetectionPatch | null {
  const t = resolveTuning(tuning);
  const items = [...xml.matchAll(/<LineItem\b[\s\S]*?<\/LineItem>/g)];
  if (items.length === 0) return null;

  const grid = readNormalizedGrid(xml);
  const segment = (region: NormalizedRegion | undefined): string => {
    const pts = region && region.length >= 2 ? [region[0], region[region.length - 1]] : null;
    const [a, b] = pts ?? [
      { x: 0, y: 0.5 },
      { x: 1, y: 0.5 },
    ];
    const at = (p: NormalizedPoint) =>
      `<Coordinates><positionX>${Math.max(0, Math.min(grid.w, Math.round(p.x * grid.w)))}</positionX>` +
      `<positionY>${Math.max(0, Math.min(grid.h, Math.round(p.y * grid.h)))}</positionY></Coordinates>`;
    return `<CoordinatesList>${at(a)}${at(b)}</CoordinatesList>`;
  };

  let out = xml.replace(
    /(<LineDetection\b[^>]*>[\s\S]*?<enabled>)\s*false\s*(<\/enabled>)/i,
    '$1true$2',
  );

  let wroteAlarmConfidence = false;
  items.forEach((match, i) => {
    const original = match[0];
    let patched = original
      .replace(/<enabled>\s*false\s*<\/enabled>/i, '<enabled>true</enabled>')
      .replace(
        /<detectionTarget>[^<]*<\/detectionTarget>/i,
        `<detectionTarget>${t.target}</detectionTarget>`,
      )
      .replace(
        /<sensitivityLevel>\s*\d+\s*<\/sensitivityLevel>/i,
        `<sensitivityLevel>${t.sensitivity}</sensitivityLevel>`,
      )
      .replace(
        /<directionSensitivity>[^<]*<\/directionSensitivity>/i,
        '<directionSensitivity>any</directionSensitivity>',
      );
    if (hasTag(patched, 'alarmConfidence')) {
      patched = replaceTagIfPresent(patched, 'alarmConfidence', t.alarmConfidence);
      wroteAlarmConfidence = true;
    }
    const coords = segment(t.regions?.[i]);
    patched = /<CoordinatesList>[\s\S]*?<\/CoordinatesList>/i.test(patched)
      ? patched.replace(/<CoordinatesList>[\s\S]*?<\/CoordinatesList>/i, coords)
      : patched.replace(/<\/LineItem>/i, `${coords}</LineItem>`);
    out = out.replace(original, patched);
  });

  return { xml: out, lines: items.length, wroteAlarmConfidence };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Capacidades del equipo
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Lo que `GET /ISAPI/Smart/capabilities` dice que sabe hacer una cámara.
 *
 * **EMPÍRICO**: la ruta no está en el corpus del fabricante, pero se midió
 * (`SmartCap.isSupportFieldDetection=false` en la PTZ DarkFighter, `true` en
 * las AcuSense). Cada flag es tri-estado a propósito:
 *
 * - `true` / `false` → el equipo respondió y lo dijo.
 * - `null` → **no lo dijo**, que no es lo mismo que decir que no.
 */
export type SmartCapabilities = {
  fieldDetection: boolean | null;
  lineDetection: boolean | null;
  faceDetect: boolean | null;
  regionEntrance: boolean | null;
  regionExiting: boolean | null;
  loitering: boolean | null;
  unattendedBaggage: boolean | null;
  attendedBaggage: boolean | null;
  group: boolean | null;
  defocus: boolean | null;
  sceneChange: boolean | null;
  audioException: boolean | null;
  peopleCounting: boolean | null;
  heatMap: boolean | null;
  /** Tags `isSupportX` que devolvió y aquí no se mapean (diagnóstico). */
  extra: Record<string, boolean>;
};

/**
 * Tags que se buscan en el XML de capacidades. La clave es nuestro campo; el
 * valor, los nombres `isSupportX` con los que distintos firmwares lo llaman.
 * Todos salen de lo que devuelven los equipos, no de una lista inventada.
 */
const CAPABILITY_TAGS: Record<Exclude<keyof SmartCapabilities, 'extra'>, string[]> = {
  fieldDetection: ['isSupportFieldDetection', 'isSupportFieldDetect'],
  lineDetection: ['isSupportLineDetection', 'isSupportLineDetect'],
  faceDetect: ['isSupportFaceDetect', 'isSupportFaceDetection'],
  regionEntrance: ['isSupportRegionEntrance'],
  regionExiting: ['isSupportRegionExiting'],
  loitering: ['isSupportLoitering', 'isSupportLoiteringDetection'],
  unattendedBaggage: ['isSupportUnattendedBaggage'],
  attendedBaggage: ['isSupportAttendedBaggage'],
  group: ['isSupportGroup', 'isSupportPeopleGathering'],
  defocus: ['isSupportDefocus', 'isSupportDefocusDetection'],
  sceneChange: ['isSupportSceneChangeDetection', 'isSupportScenechangeDetection'],
  audioException: ['isSupportAudioException', 'isSupportAudioDetection'],
  peopleCounting: ['isSupportPeopleCounting', 'isSupportCounting'],
  heatMap: ['isSupportHeatMap'],
};

const boolTag = (xml: string, tag: string): boolean | null => {
  const m = new RegExp(`<${tag}>\\s*([^<]*)\\s*</${tag}>`, 'i').exec(xml);
  if (!m) return null;
  const v = m[1].trim().toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return null;
};

/**
 * Lee el XML de `/ISAPI/Smart/capabilities` a una forma estable.
 *
 * Todo lo que el equipo no diga queda en `null`. Que un flag salga `null` es
 * información: significa «este firmware no declara esa capacidad», y es lo que
 * separa «no soportado» de «nadie lo ha preguntado».
 */
export function parseSmartCapabilities(xml: string): SmartCapabilities {
  const caps = {} as SmartCapabilities;
  for (const [key, tags] of Object.entries(CAPABILITY_TAGS) as Array<
    [Exclude<keyof SmartCapabilities, 'extra'>, string[]]
  >) {
    let value: boolean | null = null;
    for (const tag of tags) {
      const v = boolTag(xml, tag);
      if (v !== null) {
        value = v;
        break;
      }
    }
    caps[key] = value;
  }

  // Cualquier otro `isSupportX` que el equipo declare: se guarda tal cual para
  // no perder información que hoy no sabemos usar.
  const known = new Set(Object.values(CAPABILITY_TAGS).flat().map((t) => t.toLowerCase()));
  const extra: Record<string, boolean> = {};
  for (const m of xml.matchAll(/<(isSupport[A-Za-z0-9_]*)>\s*([^<]*)\s*<\/\1>/g)) {
    const tag = m[1];
    if (known.has(tag.toLowerCase())) continue;
    const v = m[2].trim().toLowerCase();
    if (v === 'true' || v === '1') extra[tag] = true;
    else if (v === 'false' || v === '0') extra[tag] = false;
  }
  caps.extra = extra;
  return caps;
}

/**
 * `eventType` del Apéndice B que el equipo declara soportar, según sus
 * capacidades. Solo se listan los que tienen un flag correspondiente: un
 * `null` no entra ni como sí ni como no.
 */
export function supportedEventTypesFrom(caps: SmartCapabilities): AppendixBEventType[] {
  const map: Array<[keyof SmartCapabilities, AppendixBEventType]> = [
    ['fieldDetection', 'fielddetection'],
    ['lineDetection', 'linedetection'],
    ['faceDetect', 'facedetection'],
    ['regionEntrance', 'regionEntrance'],
    ['regionExiting', 'regionExiting'],
    ['loitering', 'loitering'],
    ['unattendedBaggage', 'unattendedBaggage'],
    ['attendedBaggage', 'attendedBaggage'],
    ['group', 'group'],
    ['defocus', 'defocus'],
    ['sceneChange', 'scenechangedetection'],
    ['audioException', 'audioexception'],
  ];
  return map.filter(([key]) => caps[key] === true).map(([, ev]) => ev);
}
