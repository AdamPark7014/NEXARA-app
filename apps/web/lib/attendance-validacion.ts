/**
 * Checadas marcadas: lo que la web enseña de la validación del servidor.
 *
 * El servidor acepta el fichaje aunque no pueda comprobarlo todo (la app que la
 * gente tiene instalada no manda los campos nuevos) y deja dicho qué pasó:
 * `validacion`, `motivoValidacion`, `fueraDeSitio`, `offline`, `cierreAutomatico`
 * y las correcciones de hora. Aquí sólo se traduce a insignias.
 *
 * Contrato: `.ai/CONTRATO-VIERNES.md` sección A.
 */

export type ValidacionChecada = "OK" | "PENDIENTE" | "REVISAR";

export type CorreccionChecada = {
  antes: string;
  despues: string;
  motivo: string;
  por?: { id: number; nombre?: string | null } | null;
  at: string;
};

export type ChecadaValidable = {
  id?: number;
  type?: string;
  timestamp?: string;
  validacion?: ValidacionChecada | string | null;
  motivoValidacion?: string | null;
  fueraDeSitio?: boolean | null;
  distanciaSitioM?: number | null;
  sitioNombre?: string | null;
  offline?: boolean | null;
  cierreAutomatico?: boolean | null;
  accuracyM?: number | null;
  correcciones?: CorreccionChecada[] | null;
  /** Solo entradas: ✓ / ✗ que marcó el jefe al revisar la foto; null = sin revisar. */
  uniformeOk?: boolean | null;
  uniformeRevisadoPorId?: number | null;
  uniformeRevisadoAt?: string | null;
};

export type InsigniaChecada = {
  clave: "offline" | "revisar" | "fuera-sitio" | "cierre" | "corregida";
  texto: string;
  color: string;
  /** Detalle para el `title` del elemento (motivo completo, quién corrigió…). */
  detalle?: string;
};

export const COLOR_INSIGNIA = {
  offline: "#0891b2",
  revisar: "#d97706",
  fueraSitio: "#dc2626",
  cierre: "#7c3aed",
  corregida: "#2563eb",
} as const;

/** Mínimo del motivo al corregir una hora (mismo número que exige la API). */
export const MOTIVO_CORRECCION_MINIMO = 10;

/** Insignias de una checada, en el orden en que se leen. */
export function insigniasChecada(checada?: ChecadaValidable | null): InsigniaChecada[] {
  if (!checada) return [];
  const out: InsigniaChecada[] = [];

  if (checada.offline) {
    out.push({
      clave: "offline",
      texto: "Sin conexión",
      color: COLOR_INSIGNIA.offline,
      detalle: "Se capturó sin conexión y se mandó después.",
    });
  }

  if (checada.validacion === "REVISAR" && checada.motivoValidacion) {
    out.push({
      clave: "revisar",
      texto: `Revisar: ${checada.motivoValidacion}`,
      color: COLOR_INSIGNIA.revisar,
      detalle: checada.motivoValidacion,
    });
  } else if (checada.validacion === "REVISAR") {
    out.push({ clave: "revisar", texto: "Revisar", color: COLOR_INSIGNIA.revisar });
  }

  if (checada.fueraDeSitio) {
    const metros = checada.distanciaSitioM;
    out.push({
      clave: "fuera-sitio",
      texto: metros != null ? `Fuera de sitio · ${metros} m` : "Fuera de sitio",
      color: COLOR_INSIGNIA.fueraSitio,
      detalle: checada.sitioNombre ? `Sitio más cercano: ${checada.sitioNombre}` : undefined,
    });
  }

  if (checada.cierreAutomatico) {
    out.push({
      clave: "cierre",
      texto: "Cierre automático",
      color: COLOR_INSIGNIA.cierre,
      detalle: "Nadie registró la salida: la puso el sistema.",
    });
  }

  const correcciones = checada.correcciones ?? [];
  if (correcciones.length) {
    const ultima = correcciones[correcciones.length - 1];
    out.push({
      clave: "corregida",
      texto: "Corregida",
      color: COLOR_INSIGNIA.corregida,
      detalle: `${ultima.por?.nombre ? `${ultima.por.nombre}: ` : ""}${ultima.motivo}`,
    });
  }

  return out;
}

/** La checada más reciente de un tipo, con sus marcas. */
export function checadaDelTipo(
  lista: ChecadaValidable[] | undefined | null,
  tipo: "entrada" | "salida",
): ChecadaValidable | undefined {
  const filtradas = (lista ?? []).filter((c) => c.type === tipo && c.timestamp);
  if (!filtradas.length) return undefined;
  return filtradas.reduce((max, c) => ((c.timestamp ?? "") > (max.timestamp ?? "") ? c : max));
}

/** ¿Hay algo que un jefe deba mirar en las checadas del día? */
export function requiereRevision(lista?: ChecadaValidable[] | null): boolean {
  return (lista ?? []).some((c) => c.validacion === "REVISAR" || c.fueraDeSitio);
}

/**
 * Por qué el navegador no dio la ubicación, en el código que entiende el API (`ubicacionFalla`).
 * `GeolocationPositionError`: 1 permiso negado, 2 posición no disponible (una PC sin GPS ni Wi-Fi
 * útil), 3 tiempo agotado. Cualquier otra cosa es un error genérico.
 */
export function fallaDeGeolocalizacion(err: unknown): "PERMISO_NEGADO" | "NO_DISPONIBLE" | "SIN_SENAL" | "ERROR" {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === 1) return "PERMISO_NEGADO";
  if (code === 2) return "NO_DISPONIBLE";
  if (code === 3) return "SIN_SENAL";
  return "ERROR";
}

/** Un tramo con la ubicación apagada o sin permiso (`sinUbicacion` de `attendance/hierarchy/range`). */
export type TramoSinUbicacion = {
  estado: "APAGADA" | "SIN_PERMISO";
  desde: string;
  /** null: nadie avisó que se volvió a encender. */
  hasta: string | null;
  minutos: number;
};

const horaMx = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", hour: "numeric", minute: "2-digit" });

function horaTramo(iso: string): string {
  return horaMx.format(new Date(iso)).replace(/\s?a\.\s?m\./, " a.m.").replace(/\s?p\.\s?m\./, " p.m.");
}

/**
 * Aviso de Asistencias para un teléfono con la ubicación apagada (Adam, 08-10: «que nos registre
 * si hay algún dispositivo con la ubicación apagada»). Rojo si sigue apagada; ámbar si ya volvió.
 * `esHoy` false: un tramo sin cierre en un día pasado no «sigue», solo no avisó cuándo se encendió.
 */
export function avisoUbicacion(
  tramos: TramoSinUbicacion[] | undefined,
  esHoy: boolean,
): { texto: string; tono: "danger" | "warning"; detalle: string } | null {
  if (!tramos?.length) return null;
  const nombre = (t: TramoSinUbicacion) => (t.estado === "SIN_PERMISO" ? "sin permiso de ubicación" : "ubicación apagada");
  const detalle = tramos
    .map((t) => `${horaTramo(t.desde)}–${t.hasta ? horaTramo(t.hasta) : esHoy ? "ahora" : "sin aviso"} · ${nombre(t)}`)
    .join("\n");
  const abierto = [...tramos].reverse().find((t) => t.hasta === null);
  if (abierto && esHoy) {
    const que = abierto.estado === "SIN_PERMISO" ? "Sin permiso de ubicación" : "Ubicación apagada";
    return { texto: `${que} desde ${horaTramo(abierto.desde)}`, tono: "danger", detalle };
  }
  const minutos = tramos.reduce((s, t) => s + t.minutos, 0);
  const veces = tramos.length > 1 ? `${tramos.length} veces · ` : "";
  const duracion = minutos >= 60 ? `${Math.floor(minutos / 60)} h ${minutos % 60} min` : `${minutos} min`;
  return { texto: `Ubicación apagada ${veces}${duracion}`, tono: "warning", detalle };
}
