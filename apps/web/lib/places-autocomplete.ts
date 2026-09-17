/**
 * Búsqueda de direcciones con el mínimo de peticiones a Places.
 *
 * El widget `google.maps.places.Autocomplete` se enganchaba al `<input>` y
 * disparaba una petición por pulsación: escribir «Av. Juárez 123, Puebla» son
 * ~25 peticiones facturadas, y seguía pidiendo después de que el usuario ya
 * había elegido. De ahí los 4,683 requests de Places del corte de 30 días.
 *
 * Aquí las peticiones las lanzamos nosotros, y solo cuando valen la pena:
 *   - mínimo 4 caracteres (menos de eso no devuelve nada útil);
 *   - 400 ms de silencio antes de preguntar;
 *   - `mx` como único país;
 *   - un «session token» por búsqueda: dentro de una sesión el autocompletado
 *     va incluido en el detalle final, así que la sesión entera se factura una
 *     vez en lugar de predicción a predicción;
 *   - en cuanto el usuario elige, la sesión se cierra y no se pregunta más
 *     (escribir después de elegir no reabre nada hasta que el texto cambia de
 *     verdad).
 *
 * Se intenta primero la API nueva (`AutocompleteSuggestion`) y se cae a la
 * clásica (`AutocompleteService`) si el SDK servido no la trae.
 */

import { loadGoogleMaps } from "@/lib/google-maps-loader";

export const MIN_QUERY_LENGTH = 4;
export const DEBOUNCE_MS = 400;
export const COUNTRY = "mx";

export type PlaceSuggestion = {
  id: string;
  label: string;
};

export type ResolvedPlace = {
  address: string;
  placeId: string;
  lat: number;
  lng: number;
};

/** ¿Merece la pena gastar una petición con este texto? */
export const isQueryWorthSearching = (raw: string): boolean =>
  normalizeQuery(raw).length >= MIN_QUERY_LENGTH;

export const normalizeQuery = (raw: string): string => raw.trim().replace(/\s+/g, " ");

type MapsAny = Record<string, any>;

export class PlacesSearch {
  private token: unknown = null;

  private tokenCtor: (new () => unknown) | null = null;

  private lastQuery = "";

  private settled = false;

  /** Peticiones realmente enviadas: la prueba de que el ahorro es real. */
  requestCount = 0;

  private async places(): Promise<MapsAny> {
    const maps = (await loadGoogleMaps(["places"])) as MapsAny;
    const places = maps['places'] ?? (await maps['importLibrary']?.("places"));
    if (!places) throw new Error("Google Places no disponible");
    return places as MapsAny;
  }

  private async sessionToken(places: MapsAny): Promise<unknown> {
    if (this.token) return this.token;
    if (!this.tokenCtor) {
      this.tokenCtor = (places['AutocompleteSessionToken'] as new () => unknown) ?? null;
    }
    this.token = this.tokenCtor ? new this.tokenCtor() : null;
    return this.token;
  }

  /** El usuario eligió (o se canceló): la siguiente búsqueda abre sesión nueva. */
  endSession(): void {
    this.token = null;
    this.settled = true;
  }

  /**
   * Predicciones para `raw`. Devuelve `[]` —sin gastar nada— si el texto es
   * corto, repite la última consulta o llega después de una elección.
   */
  async suggest(raw: string): Promise<PlaceSuggestion[]> {
    const query = normalizeQuery(raw);
    if (query.length < MIN_QUERY_LENGTH) return [];
    if (this.settled) {
      // Tras elegir, solo se reabre si el texto cambia respecto a lo elegido.
      if (query === this.lastQuery) return [];
      this.settled = false;
    }
    if (query === this.lastQuery) return [];
    this.lastQuery = query;

    const places = await this.places();
    const token = await this.sessionToken(places);
    this.requestCount += 1;

    const Suggestion = places['AutocompleteSuggestion'];
    if (Suggestion && typeof Suggestion.fetchAutocompleteSuggestions === "function") {
      const { suggestions } = await Suggestion.fetchAutocompleteSuggestions({
        input: query,
        includedRegionCodes: [COUNTRY],
        language: "es-MX",
        region: COUNTRY,
        ...(token ? { sessionToken: token } : {}),
      });
      return (suggestions ?? [])
        .map((item: MapsAny) => item['placePrediction'])
        .filter(Boolean)
        .map((prediction: MapsAny) => ({
          id: String(prediction['placeId'] ?? ""),
          label: String(prediction['text']?.toString?.() ?? prediction['text'] ?? ""),
          prediction,
        }))
        .filter((suggestion: PlaceSuggestion) => suggestion.id && suggestion.label);
    }

    const Service = places['AutocompleteService'];
    if (!Service) throw new Error("Google Places no disponible");
    const service = new Service();
    const predictions: MapsAny[] = await new Promise((resolve) => {
      service.getPlacePredictions({
        input: query,
        componentRestrictions: { country: COUNTRY },
        types: ["geocode"],
        ...(token ? { sessionToken: token } : {}),
      }, (result: MapsAny[] | null) => resolve(result ?? []));
    });
    return predictions.map((prediction) => ({
      id: String(prediction['place_id'] ?? ""),
      label: String(prediction['description'] ?? ""),
    })).filter((suggestion) => suggestion.id && suggestion.label);
  }

  /** Detalle del sitio elegido: una petición, y cierra la sesión. */
  async resolve(placeId: string): Promise<ResolvedPlace | null> {
    if (!placeId) return null;
    const places = await this.places();
    const token = this.token;
    this.requestCount += 1;

    const PlaceCtor = places['Place'];
    if (PlaceCtor) {
      const place = new PlaceCtor({ id: placeId, ...(token ? { sessionToken: token } : {}) });
      await place.fetchFields({ fields: ["formattedAddress", "location", "id"] });
      const location = place['location'];
      const lat = typeof location?.lat === "function" ? location.lat() : location?.lat;
      const lng = typeof location?.lng === "function" ? location.lng() : location?.lng;
      this.endSession();
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        address: String(place['formattedAddress'] ?? ""),
        placeId,
        lat: Number(lat),
        lng: Number(lng),
      };
    }

    const PlacesService = places['PlacesService'];
    if (!PlacesService) return null;
    const service = new PlacesService(document.createElement("div"));
    const detail: MapsAny | null = await new Promise((resolve) => {
      service.getDetails({
        placeId,
        fields: ["formatted_address", "geometry", "place_id"],
        ...(token ? { sessionToken: token } : {}),
      }, (result: MapsAny | null) => resolve(result));
    });
    this.endSession();
    const location = detail?.['geometry']?.['location'];
    if (!location) return null;
    const lat = typeof location.lat === "function" ? location.lat() : location.lat;
    const lng = typeof location.lng === "function" ? location.lng() : location.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      address: String(detail?.['formatted_address'] ?? ""),
      placeId,
      lat: Number(lat),
      lng: Number(lng),
    };
  }
}

/**
 * Coordenadas escritas a mano o pegadas de un enlace de Google Maps.
 * Cuesta cero: es el camino preferido cuando el técnico ya tiene el punto.
 */
export const parseCoordinateInput = (raw: string): { lat: number; lng: number } | null => {
  const text = raw.trim();
  if (!text) return null;

  const fromUrl = text.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/)
    || text.match(/[?&]q=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/)
    || text.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/);
  const pair = fromUrl ?? text.match(/^\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/);
  if (!pair) return null;

  const lat = Number(pair[1]);
  const lng = Number(pair[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
};
