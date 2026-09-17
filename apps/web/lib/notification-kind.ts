/**
 * Clasificación visual de notificaciones Core (sin emojis).
 *
 * La API históricamente mandaba títulos con emoji al inicio («📌 Te reasignaron…»).
 * La web los limpia con `stripLeadingEmoji` y elige un icono profesional según
 * categoría + texto (ver components/ui/NotificationKindIcon.tsx).
 */

export type NotificationKind =
  | "entrada"
  | "salida"
  | "comida"
  | "actividad_nueva"
  | "inicio"
  | "fotos"
  | "documento"
  | "formulario"
  | "reasignada"
  | "reprogramada"
  | "despacho"
  | "por_revisar"
  | "correccion"
  | "aprobada"
  | "devuelta"
  | "rechazada"
  | "atraso"
  | "vencida"
  | "fuera_zona"
  | "cliente"
  | "chat"
  | "ubicacion"
  | "viatico"
  | "perfil"
  | "general";

const LEADING_EMOJI_RE =
  /^(?:[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]|\s)+/u;

/** Quita emojis (y espacios) al inicio de un texto: «✅ Aprobada» → «Aprobada». */
export function stripLeadingEmoji(text: string | null | undefined): string {
  if (!text) return "";
  const out = text.replace(LEADING_EMOJI_RE, "");
  return out || text;
}

function norm(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function notificationKind(category?: string | null, title?: string | null): NotificationKind {
  const c = norm(category);
  const t = norm(stripLeadingEmoji(title));

  if (c === "chat") return "chat";
  // ACTIVITY_OUT_OF_ZONE (push `icon: fuera_zona`): «Estás fuera de la zona…», «X salió de la zona…»,
  // «X justificó su salida de zona». Va antes de «salida» para no confundirse con el checador.
  if (
    t.includes("fuera de la zona") ||
    t.includes("fuera de zona") ||
    t.includes("salio de la zona") ||
    t.includes("salida de zona") ||
    t.includes("salida de la zona")
  ) {
    return "fuera_zona";
  }
  // SALES_CLIENT_CREATED (push `icon: cliente`): «Ana López agregó el cliente Plaza Dorada».
  if (t.includes("agrego el cliente") || (c === "sales" && t.includes("nuevo cliente"))) return "cliente";
  if (c.startsWith("lunch") || t.includes("comida")) return "comida";
  if (c === "sla-breach" || t.includes("vencid")) return "vencida";
  if (c === "sla-alert" || t.includes("atras") || t.includes("retras")) return "atraso";
  if (c === "attendance") {
    if (t.includes("salida")) return "salida";
    if (t.includes("ubicaci") || t.includes("gps")) return "ubicacion";
    return "entrada";
  }
  if (c === "profile") return "perfil";
  if (c === "viatics" || t.includes("viatico")) return "viatico";

  if (t.includes("reasign") || t.includes("paso a ")) return "reasignada";
  if (t.includes("reprogram")) return "reprogramada";
  if (t.includes("devuel")) return "devuelta";
  if (t.includes("correcc") || t.includes("corrig")) return "correccion";
  if (t.includes("rechaz") || t.includes("no autorizad")) return "rechazada";
  if (
    t.includes("por aprobar") ||
    t.includes("por revisar") ||
    t.includes("por validar") ||
    t.includes("revision") ||
    t.includes("pendiente")
  ) {
    return "por_revisar";
  }
  if (t.includes("aprobad") || t.includes("finalizad")) return "aprobada";
  if (t.includes("despach") || t.includes("repart")) return "despacho";
  if (t.includes("formulario")) return "formulario";
  if (t.includes("hoja de servicio") || t.includes("pdf") || t.includes("documento")) return "documento";
  if (t.includes("foto") || t.includes("evidencia") || c.startsWith("evidence")) return "fotos";
  if (t.includes("inici") || t.includes("en proceso") || t.includes("comenz")) return "inicio";
  if (t.includes("ubicaci") || t.includes("gps")) return "ubicacion";
  if (t.includes("entrada") || t.includes("check-in")) return "entrada";
  if (t.includes("salida") || t.includes("check-out")) return "salida";
  if (t.includes("nueva actividad") || t.includes("asign") || c.startsWith("activit")) return "actividad_nueva";
  if (c === "approval") return "por_revisar";
  return "general";
}
