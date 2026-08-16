/**
 * Tipo de contenido con el que se sirve un archivo de `/uploads`.
 *
 * El problema: los veinte puntos de subida generan el nombre en el servidor
 * —bien— pero toman la **extensión del nombre que envía el usuario**, y varios
 * sólo validan `file.mimetype`, que es la cabecera `Content-Type` que pone el
 * cliente y por tanto se falsifica sin esfuerzo.
 *
 * Con eso, un archivo llamado `foto.svg` enviado como `image/png` pasa el
 * filtro "sólo imágenes" y queda en disco con extensión `.svg`. Al servirlo,
 * `express.static` deduce `image/svg+xml` de la extensión, el navegador lo
 * renderiza… y un SVG puede llevar `<script>` dentro. Lo mismo con `.html`.
 * Eso es JavaScript ejecutándose en el origen de la API, con la sesión de quien
 * abra el enlace.
 *
 * `X-Content-Type-Options: nosniff` no lo evita: el tipo no se está adivinando,
 * se está declarando correctamente. Lo que hay que cambiar es qué se declara.
 *
 * Por eso la decisión se toma **aquí, al servir**, y no en cada filtro de
 * subida: es el único sitio por el que pasan los veinte puntos de entrada y,
 * además, los archivos que ya están en disco desde antes.
 */

/**
 * Extensiones que se sirven con su tipo real porque el navegador no puede
 * ejecutar nada dentro de ellas.
 *
 * `.svg` **no está** a propósito: es un formato de imagen legítimo, pero
 * permite scripts. Si algún día hace falta mostrarlos, la vía es sanearlos al
 * subirlos, no declararlos `image/svg+xml` aquí.
 */
export const INLINE_CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  // El visor de PDF del navegador corre aislado y la aplicación enlaza
  // comprobantes y reportes para verlos sin descargar.
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
};

/**
 * Avatares antiguos guardados sin extensión. Ya existen en disco, así que
 * seguirlos sirviendo como imagen evita romperlos.
 */
export const EXTENSIONLESS_CONTENT_TYPE = 'image/jpeg';

export type UploadHeaders = {
  contentType: string;
  /** Presente sólo cuando el archivo debe descargarse en vez de mostrarse. */
  contentDisposition?: string;
};

/** Nombre seguro para la cabecera: sin comillas, saltos ni rutas. */
function sanitizeFilename(nombre: string): string {
  return nombre.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'archivo';
}

/**
 * Cabeceras con las que servir un archivo subido.
 *
 * Lo que no está en la lista blanca se entrega como binario y **forzando la
 * descarga**: así un `.svg` o un `.html` que se hayan colado no se renderizan,
 * y por tanto no ejecutan nada.
 */
export function uploadHeadersFor(filePath: string): UploadHeaders {
  const nombre = filePath.split(/[\\/]/).pop() ?? '';
  const punto = nombre.lastIndexOf('.');
  const ext = punto > 0 ? nombre.slice(punto).toLowerCase() : '';

  if (!ext) return { contentType: EXTENSIONLESS_CONTENT_TYPE };

  const permitido = INLINE_CONTENT_TYPES[ext];
  if (permitido) return { contentType: permitido };

  return {
    contentType: 'application/octet-stream',
    contentDisposition: `attachment; filename="${sanitizeFilename(nombre)}"`,
  };
}

/** ¿Se mostraría en el navegador, o se descarga? Útil para pruebas y avisos. */
export function isInlineExtension(ext: string): boolean {
  return Object.prototype.hasOwnProperty.call(INLINE_CONTENT_TYPES, ext.toLowerCase());
}
