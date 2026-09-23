"use client";
import BrandMap from "./BrandMap";

/** Mapa de Contacto: el mapa de marca (MapLibre + OpenFreeMap, paleta del sitio). */
export default function Map() {
  return <BrandMap overlay={false} />;
}
