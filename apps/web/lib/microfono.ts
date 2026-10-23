"use client";

/**
 * Elegir un micrófono que de verdad suene.
 *
 * Caso real (Adam, 23-10-2026): `getUserMedia({ audio })` le entregaba «Line 1 (Virtual Audio
 * Cable)», un cable virtual con la pista silenciada y nivel 0.000000, aunque el predeterminado de
 * Windows era el Realtek. La junta se grababa en silencio y se sabía hasta concluir.
 *
 * Ahora cada micrófono se mide ~1 s antes de usarlo: si la pista viene `muted` o el nivel es cero
 * exacto, se prueba el siguiente (el recordado → el del navegador → «default» → «communications»
 * → cada entrada real; los virtuales solo si no hay otra cosa) y se recuerda el que funcionó.
 */

export type Dispositivo = { deviceId: string; label: string; kind?: string };

export type Medicion = { muted: boolean; pico: number };

const CLAVE = "nexara.microfono";

/** Entradas que no son un micrófono: cables virtuales y mezclas de lo que suena en la PC. */
const VIRTUAL = /virtual|cable|stereo mix|mezcla est[eé]reo|voicemeeter|vb-audio|loopback/i;

export const esVirtual = (label: string) => VIRTUAL.test(label);

/** «default» y «communications» son alias de Chrome en Windows, no dispositivos. */
export const esAlias = (deviceId: string) => deviceId === "default" || deviceId === "communications";

/** La pista sirve si no viene silenciada y algo llegó (ruido de fondo incluido): cero exacto = cable muerto. */
export const conSenal = (m: Medicion) => !m.muted && m.pico > 0;

/**
 * Qué probar después del primer intento, en orden y sin repetir: «default», «communications»,
 * cada entrada real y, solo si no hay ninguna real, las virtuales.
 */
export function siguientesCandidatos(dispositivos: Dispositivo[], probados: Set<string | null>): string[] {
  const entradas = dispositivos.filter((d) => (d.kind ?? "audioinput") === "audioinput" && d.deviceId);
  const ids = new Set(entradas.map((d) => d.deviceId));
  const reales = entradas.filter((d) => !esAlias(d.deviceId) && !esVirtual(d.label)).map((d) => d.deviceId);
  const virtuales = entradas.filter((d) => !esAlias(d.deviceId) && esVirtual(d.label)).map((d) => d.deviceId);
  const orden = [
    ...(ids.has("default") ? ["default"] : []),
    ...(ids.has("communications") ? ["communications"] : []),
    ...reales,
    ...(reales.length ? [] : virtuales),
  ];
  return [...new Set(orden)].filter((id) => !probados.has(id));
}

/** El dispositivo real detrás de una pista (no el alias), para recordarlo. */
export function dispositivoDePista(etiqueta: string, deviceId: string | undefined, dispositivos: Dispositivo[]): Dispositivo | null {
  if (deviceId && !esAlias(deviceId)) {
    const exacto = dispositivos.find((d) => d.deviceId === deviceId);
    if (exacto) return exacto;
  }
  // «Predeterminado - Varios micrófonos (Realtek)» → «Varios micrófonos (Realtek)».
  const limpia = etiqueta.replace(/^(predeterminado|default|comunicaciones|communications)\s*-\s*/i, "").trim();
  return dispositivos.find((d) => !esAlias(d.deviceId) && d.label === limpia) ?? null;
}

type Dependencias = {
  abrir: (deviceId: string | null) => Promise<MediaStream>;
  medir: (stream: MediaStream) => Promise<Medicion>;
  listar: () => Promise<Dispositivo[]>;
  recordado: string | null;
  recordar: (deviceId: string) => void;
};

export type Eleccion = {
  stream: MediaStream;
  dispositivo: Dispositivo | null;
  /** Ningún micrófono dio señal: se usa el mejor disponible y la pantalla avisa. */
  sinSenal: boolean;
};

const pista = (s: MediaStream) => s.getAudioTracks()[0];
const soltar = (s: MediaStream) => s.getTracks().forEach((t) => t.stop());

/**
 * Prueba micrófonos hasta dar con uno que suene. Devuelve el primero con señal; si ninguno la
 * tiene, el primero que abrió que no sea virtual (o el que haya) con `sinSenal`.
 */
export async function elegirMicrofono(dep: Dependencias): Promise<Eleccion> {
  const probados = new Set<string | null>();
  let respaldo: { stream: MediaStream; virtual: boolean } | null = null;
  let dispositivos: Dispositivo[] = [];
  let ultimoError: unknown = null;

  const intentar = async (deviceId: string | null): Promise<Eleccion | null> => {
    probados.add(deviceId);
    let stream: MediaStream;
    try {
      stream = await dep.abrir(deviceId);
    } catch (e) {
      ultimoError = e;
      return null;
    }
    const t = pista(stream);
    probados.add(t?.getSettings?.().deviceId ?? deviceId);
    const medicion = await dep.medir(stream);
    if (!dispositivos.length) dispositivos = await dep.listar().catch(() => []);
    const dispositivo = dispositivoDePista(t?.label ?? "", t?.getSettings?.().deviceId, dispositivos);
    if (conSenal(medicion)) {
      if (dispositivo) dep.recordar(dispositivo.deviceId);
      return { stream, dispositivo, sinSenal: false };
    }
    const virtual = esVirtual(t?.label ?? "");
    if (!respaldo || (respaldo.virtual && !virtual)) {
      if (respaldo) soltar(respaldo.stream);
      respaldo = { stream, virtual };
    } else {
      soltar(stream);
    }
    return null;
  };

  const primeros: Array<string | null> = dep.recordado ? [dep.recordado, null] : [null];
  for (const id of primeros) {
    const r = await intentar(id);
    if (r) return soltarRespaldo(r, respaldo);
  }
  for (const id of siguientesCandidatos(dispositivos, probados)) {
    const r = await intentar(id);
    if (r) return soltarRespaldo(r, respaldo);
  }
  if (respaldo) {
    const t = pista((respaldo as { stream: MediaStream }).stream);
    return {
      stream: (respaldo as { stream: MediaStream }).stream,
      dispositivo: dispositivoDePista(t?.label ?? "", t?.getSettings?.().deviceId, dispositivos),
      sinSenal: true,
    };
  }
  throw ultimoError ?? new Error("No se pudo abrir ningún micrófono.");
}

function soltarRespaldo(r: Eleccion, respaldo: { stream: MediaStream } | null): Eleccion {
  if (respaldo && respaldo.stream !== r.stream) soltar(respaldo.stream);
  return r;
}

// ── Navegador ───────────────────────────────────────────────────────────

export const AUDIO = { echoCancellation: true, noiseSuppression: true, channelCount: 1 } as const;

export function abrirDispositivo(deviceId: string | null): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: deviceId ? { ...AUDIO, deviceId: { exact: deviceId } } : { ...AUDIO },
  });
}

/** Pico del audio durante ~`ms` (AnalyserNode). Un contexto que no arranca cuenta como «con señal». */
export async function medirNivel(stream: MediaStream, ms = 1_000): Promise<Medicion> {
  const t = stream.getAudioTracks()[0];
  const muted = Boolean(t?.muted) || t?.enabled === false;
  const Ctx = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as
    | typeof AudioContext
    | undefined;
  if (!Ctx) return { muted, pico: 1 };
  const ctx = new Ctx();
  try {
    if (ctx.state !== "running") await ctx.resume().catch(() => undefined);
    if (ctx.state !== "running") return { muted, pico: 1 }; // sin poder medir, no se descarta
    const fuente = ctx.createMediaStreamSource(stream);
    const analizador = ctx.createAnalyser();
    analizador.fftSize = 2048;
    fuente.connect(analizador);
    const datos = new Float32Array(analizador.fftSize);
    let pico = 0;
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      await new Promise((r) => setTimeout(r, 80));
      analizador.getFloatTimeDomainData(datos);
      for (let i = 0; i < datos.length; i++) pico = Math.max(pico, Math.abs(datos[i]));
    }
    fuente.disconnect();
    return { muted, pico };
  } finally {
    void ctx.close().catch(() => undefined);
  }
}

export async function listarMicrofonos(): Promise<Dispositivo[]> {
  const todos = await navigator.mediaDevices.enumerateDevices();
  return todos.filter((d) => d.kind === "audioinput").map((d) => ({ deviceId: d.deviceId, label: d.label || "Micrófono", kind: d.kind }));
}

export function microfonoRecordado(): string | null {
  try {
    return window.localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

export function recordarMicrofono(deviceId: string) {
  try {
    window.localStorage.setItem(CLAVE, deviceId);
  } catch {
    /* sin almacenamiento: se vuelve a medir la próxima vez */
  }
}

/** En el navegador: elige con las piezas reales. */
export const elegirMicrofonoNavegador = () =>
  elegirMicrofono({
    abrir: abrirDispositivo,
    medir: (s) => medirNivel(s),
    listar: listarMicrofonos,
    recordado: microfonoRecordado(),
    recordar: recordarMicrofono,
  });

/** Nombre corto para mostrar: sin el prefijo de alias. */
export const nombreMicrofono = (label: string | null | undefined) =>
  (label ?? "").replace(/^(predeterminado|default|comunicaciones|communications)\s*-\s*/i, "").trim() || "el micrófono";
