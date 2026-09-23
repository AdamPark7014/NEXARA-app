/**
 * Tipos para la variante CSP de MapLibre (sin worker inline en blob:).
 * Es el mismo API que `maplibre-gl`; solo cambia el empaquetado.
 */
declare module "maplibre-gl/dist/maplibre-gl-csp" {
  import maplibregl from "maplibre-gl";
  export * from "maplibre-gl";
  export default maplibregl;
}
