/**
 * `href` para una URL que escribió una persona (comprobantes, planos, documentos de cartera).
 *
 * La CSP permite scripts en línea: un comprobante guardado como `javascript:fetch(...)` corría con
 * la sesión de quien le diera clic (React 19 ya bloquea ese `href`, pero el enlace quedaba muerto).
 * Solo pasan http(s), rutas del mismo sitio y `blob:`/`mailto:`/`tel:`; lo demás no se vuelve enlace.
 */
export function enlaceSeguro(url?: string | null): string | undefined {
  const v = String(url ?? "").trim();
  if (!v) return undefined;
  // Los navegadores ignoran tabuladores y saltos dentro de una URL (`java\tscript:`).
  if (/[\u0000-\u001f\u007f]/.test(v)) return undefined;
  if (v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\")) return v;
  try {
    const parsed = new URL(v);
    if (["https:", "http:", "blob:", "mailto:", "tel:"].includes(parsed.protocol)) return v;
  } catch {
    return undefined;
  }
  return undefined;
}
