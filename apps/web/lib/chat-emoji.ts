/**
 * Catálogo de emojis del chat — propio, sin dependencias.
 *
 * Por qué no `emoji-mart` ni `emoji-picker-react`: la librería más ligera de las
 * dos ronda los 50 KB comprimidos de código **más** un JSON de datos de ~60 KB
 * que se descarga aparte, para traer 1 800 emojis con nombres en inglés. Aquí se
 * escriben mensajes de trabajo en español: una lista curada de ~170 con palabras
 * clave en español pesa ~6 KB dentro del bundle que ya se sirve, se busca por
 * «pulgar», «listo» o «cámara», y no añade ni red ni licencia que auditar.
 *
 * Si algún día hace falta el set Unicode completo, el contrato de este módulo
 * (`EMOJI_GROUPS`, `searchEmoji`) es el mismo que expondría un adaptador de
 * `emoji-mart`, así que el cambio queda aislado.
 */

export type EmojiEntry = {
  /** El carácter tal cual se inserta o se manda como reacción. */
  char: string;
  /** Nombre corto en español, el que lee un lector de pantalla. */
  name: string;
  /** Palabras clave adicionales para la búsqueda. */
  keywords: string;
};

export type EmojiGroup = {
  id: string;
  label: string;
  /** Emoji que representa al grupo en la fila de pestañas. */
  icon: string;
  emojis: EmojiEntry[];
};

function g(icon: string, id: string, label: string, raw: Array<[string, string, string?]>): EmojiGroup {
  return {
    id,
    label,
    icon,
    emojis: raw.map(([char, name, keywords]) => ({ char, name, keywords: keywords ?? "" })),
  };
}

export const EMOJI_GROUPS: EmojiGroup[] = [
  g("😀", "caras", "Caras", [
    ["😀", "sonrisa", "feliz contento"],
    ["😃", "sonrisa grande", "feliz alegre"],
    ["😄", "risa", "feliz alegre"],
    ["😁", "sonrisa dientes", "feliz"],
    ["😆", "carcajada", "risa jaja"],
    ["😅", "risa nerviosa", "sudor alivio"],
    ["😂", "llorando de risa", "jaja chistoso"],
    ["🙂", "sonrisa leve", "ok bien"],
    ["🙃", "al revés", "ironía sarcasmo"],
    ["😉", "guiño", "complicidad"],
    ["😊", "sonrojo", "amable gracias"],
    ["😇", "angelito", "inocente"],
    ["😍", "ojos de corazón", "amor encanta"],
    ["😘", "beso", "amor"],
    ["😎", "lentes de sol", "genial cool"],
    ["🤓", "nerd", "estudio"],
    ["🤔", "pensando", "duda pregunta"],
    ["🤨", "ceja levantada", "duda sospecha"],
    ["😐", "cara neutra", "sin comentarios"],
    ["😴", "dormido", "sueño cansado"],
    ["😮", "asombro", "sorpresa wow"],
    ["😯", "sorprendido", "wow"],
    ["😢", "triste", "llanto pena"],
    ["😭", "llorando", "triste"],
    ["😤", "resoplando", "molesto enojo"],
    ["😡", "enojado", "molesto furia"],
    ["🥵", "acalorado", "calor"],
    ["🥶", "congelado", "frío"],
    ["🤯", "explota la cabeza", "sorpresa"],
    ["😱", "grito", "susto miedo"],
    ["🤝", "apretón de manos", "trato acuerdo"],
    ["🥳", "fiesta", "celebra felicidades"],
    ["🤒", "enfermo", "incapacidad"],
    ["🤐", "boca cerrada", "silencio"],
    ["🫡", "saludo militar", "enterado entendido"],
    ["🥲", "sonrisa con lágrima", "alivio"],
  ]),
  g("👍", "gestos", "Gestos", [
    ["👍", "pulgar arriba", "ok bien de acuerdo"],
    ["👎", "pulgar abajo", "mal desacuerdo"],
    ["👏", "aplauso", "bravo felicidades"],
    ["🙌", "manos arriba", "celebra"],
    ["🙏", "por favor", "gracias ruego"],
    ["💪", "músculo", "fuerza ánimo"],
    ["✌️", "amor y paz", "victoria"],
    ["🤞", "dedos cruzados", "suerte"],
    ["👌", "perfecto", "ok bien"],
    ["🤙", "llámame", "teléfono"],
    ["👋", "saludo", "hola adiós"],
    ["✍️", "escribiendo", "firma nota"],
    ["👀", "ojos", "mirando revisando"],
    ["🫶", "corazón con manos", "cariño gracias"],
    ["☝️", "dedo arriba", "atención"],
    ["👉", "señala", "aquí mira"],
  ]),
  g("❤️", "corazones", "Corazones", [
    ["❤️", "corazón rojo", "amor"],
    ["🧡", "corazón naranja", "amor"],
    ["💛", "corazón amarillo", "amor"],
    ["💚", "corazón verde", "amor"],
    ["💙", "corazón azul", "amor"],
    ["💜", "corazón morado", "amor"],
    ["🖤", "corazón negro", "amor"],
    ["🤍", "corazón blanco", "amor"],
    ["💔", "corazón roto", "tristeza"],
    ["💯", "cien", "perfecto todo bien"],
    ["✨", "destellos", "brillo nuevo"],
    ["🔥", "fuego", "excelente genial"],
  ]),
  g("🛠️", "trabajo", "Trabajo", [
    ["✅", "listo", "hecho ok completado"],
    ["❌", "no", "error cancelado"],
    ["⚠️", "advertencia", "cuidado alerta"],
    ["📌", "fijado", "pin importante"],
    ["📍", "ubicación", "mapa sitio"],
    ["🗓️", "calendario", "fecha agenda"],
    ["⏰", "alarma", "hora recordatorio"],
    ["⏳", "pendiente", "espera tiempo"],
    ["📝", "nota", "apunte reporte"],
    ["📄", "documento", "archivo hoja"],
    ["📊", "gráfica", "reporte datos"],
    ["📈", "sube", "crece ventas"],
    ["📉", "baja", "cae pérdida"],
    ["💼", "portafolio", "trabajo negocio"],
    ["🧾", "recibo", "factura gasto"],
    ["💰", "dinero", "pago cobro"],
    ["💳", "tarjeta", "pago"],
    ["🔑", "llave", "acceso clave"],
    ["🔒", "candado", "seguro privado"],
    ["🛠️", "herramientas", "mantenimiento"],
    ["🔧", "llave inglesa", "reparar"],
    ["🪛", "desarmador", "reparar tornillo"],
    ["🪜", "escalera", "altura instalación"],
    ["📷", "cámara", "foto evidencia"],
    ["📸", "foto con flash", "evidencia"],
    ["🎥", "video", "grabación cctv"],
    ["🖥️", "monitor", "computadora"],
    ["📱", "celular", "teléfono app"],
    ["☎️", "teléfono", "llamada"],
    ["📡", "antena", "señal red"],
    ["🔌", "enchufe", "corriente energía"],
    ["🔋", "batería", "carga"],
    ["💡", "idea", "foco propuesta"],
    ["🚚", "camión", "entrega envío"],
    ["🚗", "carro", "vehículo traslado"],
    ["🏢", "edificio", "oficina cliente"],
    ["🏗️", "obra", "construcción"],
    ["🧰", "caja de herramientas", "equipo"],
    ["🧑‍🔧", "técnico", "instalador"],
    ["🦺", "chaleco", "seguridad campo"],
    ["⛑️", "casco", "seguridad obra"],
  ]),
  g("🎉", "celebra", "Celebración", [
    ["🎉", "fiesta", "felicidades logro"],
    ["🎊", "confeti", "celebra"],
    ["🏆", "trofeo", "ganamos logro"],
    ["🥇", "primer lugar", "oro ganador"],
    ["⭐", "estrella", "favorito destacado"],
    ["🌟", "estrella brillante", "destacado"],
    ["🎯", "en el blanco", "meta objetivo"],
    ["🚀", "cohete", "lanzamiento rápido"],
    ["🎁", "regalo", "premio"],
    ["🍰", "pastel", "cumpleaños"],
    ["🥂", "brindis", "celebra"],
    ["🤩", "emocionado", "wow increíble"],
  ]),
  g("🍕", "comida", "Comida", [
    ["☕", "café", "descanso break"],
    ["🍵", "té", "descanso"],
    ["🥤", "refresco", "bebida"],
    ["💧", "agua", "hidratación"],
    ["🍕", "pizza", "comida"],
    ["🌮", "taco", "comida"],
    ["🌯", "burrito", "comida"],
    ["🍔", "hamburguesa", "comida"],
    ["🍗", "pollo", "comida"],
    ["🥗", "ensalada", "comida sana"],
    ["🍎", "manzana", "fruta"],
    ["🍺", "cerveza", "convivio"],
  ]),
  g("🌤️", "clima", "Clima y lugares", [
    ["☀️", "sol", "despejado calor"],
    ["🌤️", "sol entre nubes", "clima"],
    ["☁️", "nublado", "clima"],
    ["🌧️", "lluvia", "clima mojado"],
    ["⛈️", "tormenta", "clima rayos"],
    ["❄️", "nieve", "frío"],
    ["🌪️", "tornado", "clima"],
    ["🌙", "luna", "noche turno"],
    ["🌎", "mundo", "global"],
    ["🗺️", "mapa", "ruta"],
    ["🚧", "obras", "precaución cierre"],
    ["🏠", "casa", "domicilio"],
  ]),
  g("🔣", "simbolos", "Símbolos", [
    ["➕", "más", "agregar"],
    ["➖", "menos", "quitar"],
    ["✔️", "palomita", "hecho"],
    ["❓", "pregunta", "duda"],
    ["❗", "exclamación", "urgente"],
    ["🔁", "repetir", "ciclo"],
    ["🔔", "campana", "aviso notificación"],
    ["🔕", "silenciado", "sin avisos"],
    ["🆕", "nuevo", "reciente"],
    ["🆗", "ok", "bien"],
    ["🔴", "rojo", "detenido crítico"],
    ["🟡", "amarillo", "pendiente"],
    ["🟢", "verde", "en orden listo"],
    ["🔵", "azul", "informativo"],
  ]),
];

const TODOS: EmojiEntry[] = EMOJI_GROUPS.flatMap((grupo) => grupo.emojis);

/** Nombre accesible del emoji (para `aria-label` y anuncios). */
export function emojiName(char: string): string {
  return TODOS.find((e) => e.char === char)?.name ?? "emoji";
}

function normaliza(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Búsqueda por nombre y palabras clave, sin acentos. */
export function searchEmoji(query: string, limit = 48): EmojiEntry[] {
  const q = normaliza(query.trim());
  if (!q) return [];
  const empieza: EmojiEntry[] = [];
  const contiene: EmojiEntry[] = [];
  for (const e of TODOS) {
    if (e.char === query) {
      empieza.unshift(e);
      continue;
    }
    const heno = normaliza(`${e.name} ${e.keywords}`);
    if (heno.startsWith(q) || heno.includes(` ${q}`)) empieza.push(e);
    else if (heno.includes(q)) contiene.push(e);
  }
  return [...empieza, ...contiene].slice(0, limit);
}

export const EMOJI_RECENTS_KEY = "nexara.chat.emoji.recientes";
const RECENTS_MAX = 24;

export function loadRecentEmoji(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(EMOJI_RECENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function pushRecentEmoji(char: string, actuales: string[]): string[] {
  const next = [char, ...actuales.filter((c) => c !== char)].slice(0, RECENTS_MAX);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(EMOJI_RECENTS_KEY, JSON.stringify(next));
    } catch {
      /* modo privado: los recientes son un lujo, no se rompe el picker */
    }
  }
  return next;
}

/**
 * «Stickers» de la casa.
 *
 * Decisión tomada y explicada en el reporte: un juego de stickers **subidos por
 * el usuario** es un módulo aparte (almacenamiento, cuota, moderación, permisos
 * por empresa, borrado). Lo que da el valor que pedía Adam sin nada de eso es un
 * juego fijo que se manda de un toque y se pinta en grande: un mensaje cuyo
 * cuerpo es solo emoji se renderiza a tamaño sticker, tal como en WhatsApp.
 *
 * Cero almacenamiento, cero API nueva, y los mensajes viejos que ya eran solo
 * emoji se ven bien de forma retroactiva.
 */
export const STICKERS: EmojiEntry[] = [
  { char: "👍", name: "De acuerdo", keywords: "ok" },
  { char: "✅", name: "Listo", keywords: "hecho" },
  { char: "🙏", name: "Gracias", keywords: "porfavor" },
  { char: "👀", name: "Lo estoy viendo", keywords: "revisando" },
  { char: "🚀", name: "Vamos", keywords: "rapido" },
  { char: "🎉", name: "Felicidades", keywords: "celebra" },
  { char: "🔥", name: "Excelente", keywords: "genial" },
  { char: "💪", name: "Con todo", keywords: "fuerza" },
  { char: "🫡", name: "Enterado", keywords: "recibido" },
  { char: "☕", name: "En descanso", keywords: "break" },
  { char: "🤔", name: "Lo dudo", keywords: "duda" },
  { char: "🆘", name: "Necesito ayuda", keywords: "auxilio" },
  { char: "🏆", name: "Bien hecho", keywords: "logro" },
  { char: "❤️", name: "Me encanta", keywords: "amor" },
  { char: "😂", name: "Me dio risa", keywords: "chistoso" },
  { char: "🦺", name: "En campo", keywords: "trabajo sitio" },
];

/** Modificadores que no cuentan como glifo propio (tono de piel, ZWJ, VS16). */
const MODIFICADORES = /[‍️︎⃣]|[\u{1f3fb}-\u{1f3ff}]/u;

/**
 * ¿El mensaje es solo emoji (hasta tres)? Entonces se pinta en grande.
 *
 * Esto es lo que convierte un emoji suelto en «sticker» sin subir un solo
 * archivo. Un mensaje con texto alrededor nunca entra aquí.
 */
export function isJumboEmoji(body: string): boolean {
  const texto = (body ?? "").trim();
  if (!texto || texto.length > 24) return false;
  let glifos = 0;
  for (const c of texto) {
    if (/\s/.test(c)) continue;
    if (MODIFICADORES.test(c)) continue;
    if (!/\p{Extended_Pictographic}/u.test(c)) return false;
    glifos++;
    if (glifos > 3) return false;
  }
  return glifos > 0;
}
