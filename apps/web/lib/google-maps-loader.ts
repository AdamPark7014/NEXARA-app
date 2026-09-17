/**
 * Cargador único del SDK de Google Maps.
 *
 * Había tres copias del mismo cargador (`app/components/Map.tsx`,
 * `components/ClientLocationPicker.tsx`, `components/GpsMap.tsx`), las tres con
 * `libraries=places,marker` y las tres capaces de inyectar su propia etiqueta
 * `<script>`: dos mapas en la misma página cargaban el SDK dos veces y, peor,
 * arrastraban Places a pantallas que no buscan direcciones.
 *
 * Aquí el script se inyecta una sola vez, sin `libraries=`, y cada pantalla pide
 * lo que necesita con `importLibrary`. Places solo se descarga donde hay
 * autocompletado de direcciones.
 *
 * Cargar el script no se factura; lo que se factura es instanciar un mapa
 * (`Dynamic Maps`). Por eso nadie debería llamar aquí «por si acaso»: se llama
 * cuando el mapa se va a ver de verdad.
 */

const SCRIPT_ID = 'google-maps-script';

export type MapsLibrary = 'maps' | 'marker' | 'places' | 'geometry';

type MapsApi = {
  Map?: new (element: HTMLElement, options: Record<string, unknown>) => unknown;
  importLibrary?: (library: string) => Promise<Record<string, unknown>>;
  [key: string]: unknown;
};

declare global {
  interface Window {
    google?: { maps: MapsApi };
    __nexaraGoogleMapsReady?: () => void;
  }
}

export const googleMapsApiKey = (): string =>
  (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '').trim();

export const googleMapsMapId = (): string =>
  (process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || '').trim();

export const isGoogleMapsConfigured = (): boolean => Boolean(googleMapsApiKey());

let scriptPromise: Promise<MapsApi> | null = null;
const libraryPromises = new Map<MapsLibrary, Promise<Record<string, unknown>>>();

/** Diagnóstico: cuántas veces se inyectó el script en esta pestaña. Debe ser 0 o 1. */
let scriptInjections = 0;
export const googleMapsScriptInjections = (): number => scriptInjections;

/** Solo para pruebas. */
export const __resetGoogleMapsLoader = () => {
  scriptPromise = null;
  libraryPromises.clear();
  scriptInjections = 0;
};

const injectScript = (key: string): Promise<MapsApi> =>
  new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      // Otro bundle ya lo puso: esperar, nunca añadir un segundo.
      if (window.google?.maps) {
        resolve(window.google.maps);
        return;
      }
      existing.addEventListener('load', () => {
        if (window.google?.maps) resolve(window.google.maps);
        else reject(new Error('Google Maps no se inicializó correctamente'));
      }, { once: true });
      existing.addEventListener('error', () => reject(new Error('Error al cargar Google Maps')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    // Sin `libraries=`: cada pantalla importa la suya con `importLibrary`.
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__nexaraGoogleMapsReady`;
    script.async = true;
    script.defer = true;

    const settle = () => {
      if (window.google?.maps) resolve(window.google.maps);
      else reject(new Error('Google Maps no se inicializó correctamente'));
    };

    window.__nexaraGoogleMapsReady = settle;
    script.addEventListener('error', () => reject(new Error('Error al cargar Google Maps')), { once: true });
    // Red de seguridad: si el callback no llega, mirar el objeto global.
    script.addEventListener('load', () => window.setTimeout(settle, 150), { once: true });

    scriptInjections += 1;
    document.head.appendChild(script);
  });

/**
 * Carga el SDK (una sola vez) y las librerías pedidas.
 *
 * Pide `places` únicamente desde la pantalla que busca direcciones.
 */
export const loadGoogleMaps = async (libraries: MapsLibrary[] = []): Promise<MapsApi> => {
  if (typeof window === 'undefined') throw new Error('Google Maps solo carga en el navegador');
  const key = googleMapsApiKey();
  if (!key) throw new Error('API key no configurada');

  if (!scriptPromise) {
    scriptPromise = injectScript(key).catch((error) => {
      // Un fallo no debe dejar la promesa envenenada para siempre.
      scriptPromise = null;
      throw error;
    });
  }

  const maps = await scriptPromise;

  await Promise.all(libraries.map(async (library) => {
    if (!libraryPromises.has(library)) {
      const pending = typeof maps.importLibrary === 'function'
        ? maps.importLibrary(library)
        : Promise.resolve({});
      libraryPromises.set(library, pending.catch((error) => {
        libraryPromises.delete(library);
        throw error;
      }));
    }
    await libraryPromises.get(library);
  }));

  return maps;
};

/** El constructor `Map`, ya sea del objeto global o de `importLibrary('maps')`. */
export const loadMapConstructor = async (): Promise<
  new (element: HTMLElement, options: Record<string, unknown>) => unknown
> => {
  const maps = await loadGoogleMaps(['maps']);
  if (typeof maps.Map === 'function') return maps.Map;
  const library = await maps.importLibrary?.('maps');
  const ctor = library?.['Map'];
  if (typeof ctor === 'function') {
    return ctor as new (element: HTMLElement, options: Record<string, unknown>) => unknown;
  }
  throw new Error('Google Maps Map no disponible');
};
