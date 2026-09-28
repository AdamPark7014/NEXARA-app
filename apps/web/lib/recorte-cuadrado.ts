/**
 * Recorte cuadrado centrado de una foto de perfil.
 * El lado es el menor entre ancho y alto; lo que sobra se corta por igual a cada lado.
 * El archivo que se sube ya es cuadrado; la app lo muestra en círculo.
 */
export function recorteCuadradoCentrado(
  ancho: number,
  alto: number,
): { x: number; y: number; lado: number } | null {
  if (!Number.isFinite(ancho) || !Number.isFinite(alto) || ancho < 1 || alto < 1) return null;
  const lado = Math.floor(Math.min(ancho, alto));
  const x = Math.floor((ancho - lado) / 2);
  const y = Math.floor((alto - lado) / 2);
  return { x, y, lado };
}

/** Lado máximo del JPEG que se guarda como avatar. */
export const LADO_AVATAR = 512;
