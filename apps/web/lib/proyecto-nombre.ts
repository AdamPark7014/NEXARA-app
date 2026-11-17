/** La sugerencia siempre se muestra antes de usarse; nunca sustituye lo escrito. */
const normalizar = (v: string) => v.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
  .replace(/\bs\.?\s*a\.?\s*de\s*c\.?\s*v\.?/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
const palabras = (v: string) => normalizar(v).split(/\s+/).filter((p) => p && !["de", "del", "la", "el", "los", "las", "y", "en", "a", "para", "con"].includes(p));
export function nombreProyectoValido(titulo: string, cliente = ""): boolean {
  const t = titulo.trim().replace(/\s+/g, " ");
  const c = palabras(cliente);
  return t.length >= 12 && t.split(" ").length >= 3 && palabras(t).filter((p) => !c.includes(p)).length >= 2;
}
export function sugerirNombreProyecto(tipo: string, cliente: string): string {
  if (!cliente.trim()) return "";
  if (/CCTV|cámara|videovigilancia/i.test(tipo)) return `Instalación de cámaras ${cliente}`;
  if (/manten/i.test(tipo)) return `Mantenimiento de equipos ${cliente}`;
  if (/acceso/i.test(tipo)) return `Instalación de control de acceso ${cliente}`;
  if (/red|cableado|wifi/i.test(tipo)) return `Instalación de infraestructura de red ${cliente}`;
  return `Implementación de soluciones ${cliente}`;
}
