/**
 * En qué va el negocio, de la cotización al cobro. La misma cadena se ve desde la cotización y desde
 * el proyecto (Mapa de Core, Bloque A). Módulo puro para poder probarlo.
 */

export type EstadoPaso = "done" | "current" | "pending";
export type PasoHilo = { id: string; label: string; hint: string; state: EstadoPaso; href?: string };

export type HiloFactura = { estado: "SIN_FACTURA" | "BORRADOR" | "FACTURADA"; id: number | null; folio: string | null };
export type HiloCobro = { estado: "PENDIENTE" | "PARCIAL" | "PAGADA" };

const DIA = 24 * 60 * 60 * 1000;

export function diasDesde(fecha: string | null | undefined, ahora = new Date()): number | null {
  if (!fecha) return null;
  const t = new Date(fecha).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((ahora.getTime() - t) / DIA));
}

/** El día en que pasó algo, en México: a las 8 de la noche en UTC ya sería mañana. */
export function diaDelHecho(fecha: string | null | undefined, conAnio = false): string | null {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    ...(conAnio ? { year: "numeric" } : {}),
    timeZone: "America/Mexico_City",
  });
}

/** «WhatsApp», «correo»…: cómo salió la cotización, para decirlo en una frase. */
export function medioDeEnvio(enviadaPor: string | null | undefined): string | null {
  switch (enviadaPor) {
    case "WHATSAPP":
      return "WhatsApp";
    case "CORREO_CORE":
    case "CORREO_EXTERNO":
      return "correo";
    case "EN_PERSONA":
      return "en persona";
    default:
      return null;
  }
}

/** «Salió por WhatsApp hace 6 días.» Sin medio o sin fecha, dice solo lo que se sabe. */
export function salioEnPalabras(
  enviadaPor: string | null | undefined,
  sentAt: string | null | undefined,
  ahora = new Date(),
): string {
  const medio = medioDeEnvio(enviadaPor);
  const como = medio === "en persona" ? "Se entregó en persona" : medio ? `Salió por ${medio}` : "Salió";
  const dias = diasDesde(sentAt, ahora);
  if (dias === null) return `${como}.`;
  if (dias === 0) return `${como} hoy.`;
  if (dias === 1) return `${como} ayer.`;
  return `${como} hace ${dias} días.`;
}

/** La respuesta del medio de aceptación más probable: cómo salió suele ser cómo contestan. */
export function medioProbableDeAceptacion(
  enviadaPor: string | null | undefined,
  signedAt: string | null | undefined,
): "FIRMA" | "WHATSAPP" | "CORREO" | "EN_PERSONA" | null {
  if (signedAt) return "FIRMA";
  switch (enviadaPor) {
    case "WHATSAPP":
      return "WHATSAPP";
    case "CORREO_CORE":
    case "CORREO_EXTERNO":
      return "CORREO";
    case "EN_PERSONA":
      return "EN_PERSONA";
    default:
      return null;
  }
}

/** «por WhatsApp», para la fecha en que se aceptó. */
export function aceptoEnPalabras(via: string | null | undefined): string | null {
  switch (via) {
    case "FIRMA":
      return "firmó el enlace";
    case "WHATSAPP":
      return "por WhatsApp";
    case "CORREO":
      return "por correo";
    case "EN_PERSONA":
      return "en persona";
    default:
      return null;
  }
}

/** Lo que queda en el historial: el motivo elegido y, si se agregó, la nota. */
export function motivoDePerdida(motivo: string, nota: string): string {
  const extra = nota.trim();
  return extra ? `${motivo}. ${extra}` : motivo;
}

/**
 * Factura y cobro, los dos últimos pasos de la cadena. `ganada` dice si ya debería aparecer en
 * «Por facturar»: antes de eso, la factura todavía no le toca a nadie.
 */
export function pasosDeFacturaYCobro(
  factura: HiloFactura | null | undefined,
  cobro: HiloCobro | null | undefined,
  ganada: boolean,
): PasoHilo[] {
  const f = factura?.estado ?? "SIN_FACTURA";
  const c = cobro?.estado ?? "PENDIENTE";
  const facturada = f === "FACTURADA";
  return [
    {
      id: "factura",
      label: "Factura",
      hint: facturada
        ? factura?.folio || "Facturada"
        : f === "BORRADOR"
          ? "En borrador"
          : ganada
            ? "En Por facturar"
            : "Pendiente",
      state: facturada ? "done" : "pending",
      href: factura?.id ? `/erp/invoicing/${factura.id}` : undefined,
    },
    {
      id: "cobro",
      label: "Cobro",
      hint: c === "PAGADA" ? "Pagada" : c === "PARCIAL" ? "Cobro parcial" : facturada ? "Por cobrar" : "Pendiente",
      state: c === "PAGADA" ? "done" : "pending",
    },
  ];
}

/** Un solo paso «en curso»: el primero que falta. Los que siguen esperan su turno. */
export function conUnSoloActual<T extends { state: EstadoPaso }>(pasos: T[]): T[] {
  let visto = false;
  return pasos.map((p) => {
    if (p.state === "done") return p;
    if (visto) return { ...p, state: "pending" as const };
    visto = true;
    return { ...p, state: "current" as const };
  });
}

type ProyectoParaSaber = {
  status: string;
  endDate?: string | null;
  cotizacion?: { id: number } | null;
  scopeItems: unknown[];
  activities: unknown[];
  members: unknown[];
  requirements: unknown[];
  factura?: HiloFactura | null;
};

export type SiguientePaso = { titulo: string; texto: string; accion: "actividad" | "facturar" | null };

function plural(n: number, uno: string, varios: string) {
  return n === 1 ? `${n} ${uno}` : `${n} ${varios}`;
}

/** Lo que le toca al proyecto ahora, si algo le toca. Sin aviso cuando ya va caminando. */
export function siguientePasoDeProyecto(p: ProyectoParaSaber): SiguientePaso | null {
  if (p.status === "CANCELLED") return null;
  if (p.status === "COMPLETED") {
    if (!p.cotizacion || p.factura?.estado === "FACTURADA") return null;
    return {
      titulo: "Siguiente paso: facturar",
      texto: "El trabajo ya se entregó y su cotización sigue en Por facturar.",
      accion: "facturar",
    };
  }
  if (p.activities.length === 0) {
    const partidas = p.cotizacion && p.scopeItems.length ? p.scopeItems.length : 0;
    return {
      titulo: "Siguiente paso: programar el trabajo",
      texto: partidas
        ? `${partidas === 1 ? "La partida ya está" : `Las ${partidas} partidas ya están`} en el alcance. Falta decidir quién hace qué y cuándo.`
        : "Falta decidir quién hace qué y cuándo.",
      accion: "actividad",
    };
  }
  if (p.status === "PLANNED") {
    return {
      titulo: "Siguiente paso: arrancar",
      texto: `Ya ${p.activities.length === 1 ? "hay 1 actividad programada" : `hay ${plural(p.activities.length, "actividad", "actividades")} programadas`}. Márcalo cuando empiece el trabajo.`,
      accion: null,
    };
  }
  return null;
}

export type Faltante = { etiqueta: string; pestana: "resumen" | "equipo" | "requerimientos" };

/** Lo que todavía no se ha capturado. Quien lo lleva cuenta como una persona: «equipo» es que haya otra. */
export function faltaDeProyecto(p: ProyectoParaSaber): Faltante[] {
  if (p.status === "CANCELLED" || p.status === "COMPLETED") return [];
  const falta: Faltante[] = [];
  if (!p.endDate) falta.push({ etiqueta: "Fecha de entrega", pestana: "resumen" });
  if (p.members.length <= 1) falta.push({ etiqueta: "Equipo de trabajo", pestana: "equipo" });
  if (p.requirements.length === 0) falta.push({ etiqueta: "Requerimientos del sitio", pestana: "requerimientos" });
  return falta;
}
