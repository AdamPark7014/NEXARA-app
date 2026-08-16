import {
  EXTENSIONLESS_CONTENT_TYPE,
  isInlineExtension,
  uploadHeadersFor,
} from './upload-content-type.js';

describe('archivos que se muestran en el navegador', () => {
  it('sirve las imágenes con su tipo real', () => {
    expect(uploadHeadersFor('/uploads/foto.jpg').contentType).toBe('image/jpeg');
    expect(uploadHeadersFor('/uploads/foto.PNG').contentType).toBe('image/png');
    expect(uploadHeadersFor('/uploads/foto.webp').contentType).toBe('image/webp');
  });

  it('los PDF se ven sin descargar: la app enlaza comprobantes y reportes', () => {
    const h = uploadHeadersFor('/uploads/factura.pdf');
    expect(h.contentType).toBe('application/pdf');
    expect(h.contentDisposition).toBeUndefined();
  });

  it('no pone Content-Disposition a lo permitido', () => {
    expect(uploadHeadersFor('/uploads/foto.jpg').contentDisposition).toBeUndefined();
  });

  it('los avatares antiguos sin extensión siguen siendo imagen', () => {
    // Ya existen en disco; cambiarles el tipo los romperia.
    expect(uploadHeadersFor('/uploads/avatars/abc123').contentType).toBe(
      EXTENSIONLESS_CONTENT_TYPE,
    );
  });
});

describe('lo que podría ejecutar código se descarga, no se muestra', () => {
  it('un SVG NO se sirve como imagen', () => {
    // Era el agujero: un `.svg` pasa un filtro de "solo imagenes" porque el
    // mimetype lo pone el cliente, y un SVG puede llevar <script> dentro.
    const h = uploadHeadersFor('/uploads/clients/logo.svg');
    expect(h.contentType).toBe('application/octet-stream');
    expect(h.contentDisposition).toContain('attachment');
  });

  it('un HTML se descarga', () => {
    for (const nombre of ['x.html', 'x.htm', 'x.xhtml']) {
      const h = uploadHeadersFor(`/uploads/${nombre}`);
      expect(h.contentType).toBe('application/octet-stream');
      expect(h.contentDisposition).toContain('attachment');
    }
  });

  it('scripts y documentos con macros también', () => {
    for (const nombre of ['x.js', 'x.mjs', 'x.xml', 'x.php', 'x.docm']) {
      expect(uploadHeadersFor(`/uploads/${nombre}`).contentType).toBe('application/octet-stream');
    }
  });

  it('una extensión desconocida se descarga en vez de adivinarse', () => {
    expect(uploadHeadersFor('/uploads/x.raro').contentType).toBe('application/octet-stream');
  });

  it('la doble extensión no engaña: manda la última', () => {
    const h = uploadHeadersFor('/uploads/foto.png.svg');
    expect(h.contentType).toBe('application/octet-stream');
  });

  it('mayúsculas no evaden la lista', () => {
    expect(uploadHeadersFor('/uploads/x.SVG').contentType).toBe('application/octet-stream');
    expect(uploadHeadersFor('/uploads/x.HtMl').contentType).toBe('application/octet-stream');
  });
});

describe('la cabecera de descarga no se puede inyectar', () => {
  it('quita comillas y saltos del nombre', () => {
    const h = uploadHeadersFor('/uploads/mal"o\r\nX-Inyectado: 1.svg');
    expect(h.contentDisposition).not.toContain('"o');
    expect(h.contentDisposition).not.toContain('\r');
    expect(h.contentDisposition).not.toContain('\n');
  });

  it('funciona igual con separadores de Windows', () => {
    expect(uploadHeadersFor('C:\\uploads\\clients\\logo.svg').contentType).toBe(
      'application/octet-stream',
    );
  });

  it('un nombre que queda vacío tras sanear no rompe la cabecera', () => {
    const h = uploadHeadersFor('/uploads/@@@.svg');
    expect(h.contentDisposition).toMatch(/filename="[^"]+"/);
  });
});

describe('lista blanca', () => {
  it('svg no está, y es deliberado', () => {
    expect(isInlineExtension('.svg')).toBe(false);
  });

  it('los formatos de imagen habituales sí', () => {
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']) {
      expect(isInlineExtension(ext)).toBe(true);
    }
  });
});
