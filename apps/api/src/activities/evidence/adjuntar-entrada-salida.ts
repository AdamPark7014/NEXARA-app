/**
 * Excepción, por actividad y con vencimiento, a la regla de que la foto de entrada y la de
 * salida solo se toman con la cámara en vivo (ver el comentario de `evidencia-adjunto.ts` en la
 * web). Dirección la abre para un caso puntual — alguien que ya trae las fotos tomadas en sitio y
 * las adjunta después, fuera de sitio — y se cierra sola al vencer: no es una puerta permanente.
 */

/** Misma llave para leerla (`ventanaAdjuntarEntradaSalida`) y para escribirla (el script SQL). */
export function claveVentanaAdjuntar(activityId: number): string {
  return `evidence.allow_attach:${activityId}`;
}

export type VentanaAdjuntar = { abierta: boolean; hasta: Date | null };

/** Valor guardado (fecha ISO) → ¿sigue abierta la ventana? Cualquier cosa rara = cerrada. */
export function ventanaAdjuntarEntradaSalida(valor: string | null | undefined, ahora: Date): VentanaAdjuntar {
  const texto = String(valor ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(texto)) {
    return { abierta: false, hasta: null };
  }
  const hasta = new Date(texto);
  if (Number.isNaN(hasta.getTime())) return { abierta: false, hasta: null };
  return { abierta: ahora.getTime() < hasta.getTime(), hasta };
}
