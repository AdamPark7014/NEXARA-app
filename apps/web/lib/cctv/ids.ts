let contador = 0;

/** Id corto y único en la sesión: `m-lq3k2-7`. */
export function nuevoId(prefijo: string): string {
  contador = (contador + 1) % 1_000_000;
  return `${prefijo}-${Date.now().toString(36)}-${contador.toString(36)}`;
}
