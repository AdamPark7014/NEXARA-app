import { buildApiUrl } from "@/lib/api-base";

export type ListaPortal<T> = { items: T[]; error: string | null };

/**
 * Lista de un portal (cliente o sucursal). Si el servidor falla, el error viaja aparte: una lista que
 * no cargó nunca se enseña como una lista vacía.
 */
export async function leerListaPortal<T>(ruta: string, token: string, queEs: string): Promise<ListaPortal<T>> {
  try {
    const res = await fetch(buildApiUrl(ruta), { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401 || res.status === 403) {
      return { items: [], error: "Tu sesión venció o no tiene acceso. Vuelve a iniciar sesión." };
    }
    if (!res.ok) return { items: [], error: `No pudimos cargar ${queEs} (error ${res.status}). Intenta de nuevo.` };
    const data: unknown = await res.json();
    if (Array.isArray(data)) return { items: data as T[], error: null };
  } catch {
    // Sin red, o una respuesta que no es JSON: mismo aviso.
  }
  return { items: [], error: `No pudimos cargar ${queEs}. Revisa tu conexión e intenta de nuevo.` };
}
