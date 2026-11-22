/**
 * El marco de todos los correos que manda la plataforma.
 *
 * Antes cada servicio traía su propia copia del HTML (seis copias) y dos correos no traían ninguna:
 * la cotización le llegaba al cliente como texto suelto. Las copias compartían tres fallas:
 *  - el logo (`logo-nexara.png`, 343×374) se pintaba a 120×40: estirado al triple;
 *  - la cabecera solo declaraba un degradado, que Outlook no pinta: letras blancas sobre blanco;
 *  - con las imágenes bloqueadas (lo normal la primera vez que alguien te escribe) no quedaba ni el nombre.
 *
 * Reglas del marco: tablas y estilos en línea (lo único que respetan todos los clientes de correo),
 * colores fijos, y todo lo que escribe una persona pasa por `escaparHtml` antes de entrar al HTML.
 */

const TINTA = '#1f2a44';
const TINTA_FUERTE = '#12233b';
const TENUE = '#45556f';
const PIE = '#5d6b82';
const FONDO = '#f5f7fb';
const CABECERA = '#0b1b2e';
const CAJA = '#f1f5fb';
const CAJA_BORDE = '#d7e1f2';
const MARCA = '#1f4aa8';
const FUENTE = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

/** `logo-nexara.png` mide 343×374: a 40 de alto son 37 de ancho. */
const EMBLEMA = { ancho: 37, alto: 40 };

/** Texto de una persona dentro del HTML del correo: un `<` suelto lo rompía y una etiqueta viajaba firmada por NEXARA. */
export function escaparHtml(texto: unknown): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Saltos de línea de un texto libre, ya escapado, como `<br />`. */
export function conSaltos(texto: unknown): string {
  return escaparHtml(String(texto ?? '').trim()).replace(/\r?\n/g, '<br />');
}

/** Dirección pública del sitio, sin diagonal final. Solo para el logo: cada correo arma sus propias ligas. */
function sitioPublico(): string {
  return (process.env['PUBLIC_WEB_URL'] || process.env['WEB_URL'] || 'https://nexara.com.mx').trim().replace(/\/+$/, '');
}

/**
 * `"NEXARA" <ventas@…>`: el buzón enseña el nombre de la empresa y no «ventas».
 * Si la dirección ya trae nombre (o no es una dirección sola), se respeta tal cual.
 */
export function remitenteConNombre(direccion: string, nombre = 'NEXARA'): string {
  const limpia = String(direccion ?? '').trim();
  return /^[^\s<>"@,;]+@[^\s<>"@,;]+$/.test(limpia) ? `"${nombre}" <${limpia}>` : limpia;
}

function logo(): string {
  const propio = (process.env['EMAIL_LOGO_URL'] || '').trim();
  // El `alt` lleva estilo: con las imágenes bloqueadas se lee «NEXARA» en blanco sobre la cabecera.
  const alterno = `color:#ffffff;font-size:18px;font-weight:700;${FUENTE}`;
  if (propio) {
    // De un logo ajeno no se sabe la proporción: solo se fija el alto.
    return `<img src="${escaparHtml(propio)}" alt="NEXARA" height="${EMBLEMA.alto}" style="display:block;border:0;height:${EMBLEMA.alto}px;width:auto;max-width:200px;${alterno}" />`;
  }
  const emblema = `${sitioPublico()}/logo-nexara.png`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="vertical-align:middle;"><img src="${escaparHtml(emblema)}" alt="" width="${EMBLEMA.ancho}" height="${EMBLEMA.alto}" style="display:block;border:0;width:${EMBLEMA.ancho}px;height:${EMBLEMA.alto}px;" /></td>
        <td style="vertical-align:middle;padding-left:10px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:2px;${FUENTE}">NEXARA</td>
      </tr></table>`;
}

export interface PartesDelCorreo {
  /** Rótulo a la derecha del logo: «Cotización», «Encuesta de servicio». Texto llano. */
  etiqueta: string;
  /** Lo que el buzón enseña junto al asunto antes de abrir el correo. Texto llano. */
  avance?: string;
  /** El cuerpo, ya en HTML: se arma con las piezas de este archivo. */
  cuerpo: string;
  /** Línea final en gris, fuera de la tarjeta. Texto llano. */
  pie?: string;
}

export function correoNexara({ etiqueta, avance, cuerpo, pie }: PartesDelCorreo): string {
  const oculto = avance
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escaparHtml(avance)}</div>`
    : '';
  const ultimaLinea = pie
    ? `<p style="margin:14px 0 0;text-align:center;font-size:12px;line-height:1.5;color:${PIE};${FUENTE}">${escaparHtml(pie)}</p>`
    : '';
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escaparHtml(etiqueta)}</title>
</head>
<body style="margin:0;padding:0;background-color:${FONDO};">
${oculto}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${FONDO}" style="background-color:${FONDO};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:16px;overflow:hidden;">
        <tr>
          <td bgcolor="${CABECERA}" style="padding:18px 24px;background-color:${CABECERA};background-image:linear-gradient(135deg,#0b1b2e,#0c243a);">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="vertical-align:middle;">${logo()}</td>
              <td align="right" style="vertical-align:middle;padding-left:12px;font-size:13px;line-height:1.4;color:#c6d7ef;${FUENTE}">${escaparHtml(etiqueta)}</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 24px 14px;font-size:15px;line-height:1.6;color:${TINTA};${FUENTE}">
${cuerpo}
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
      ${ultimaLinea}
    </td>
  </tr>
</table>
</body>
</html>`;
}

// ── Piezas del cuerpo ────────────────────────────────────────────────────────
// Reciben HTML ya armado; lo que venga de una persona se escapa antes con `escaparHtml`.

export function titulo(html: string): string {
  return `<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:700;color:${TINTA_FUERTE};${FUENTE}">${html}</h1>`;
}

export function parrafo(html: string): string {
  return `<p style="margin:0 0 14px;color:${TINTA};">${html}</p>`;
}

export function parrafoTenue(html: string): string {
  return `<p style="margin:0 0 14px;color:${TENUE};">${html}</p>`;
}

/** «Hola Ana,» con el nombre escapado; sin nombre, «Hola,». */
export function saludo(nombre?: string | null): string {
  const limpio = String(nombre ?? '').trim();
  return `<p style="margin:0 0 14px;font-size:16px;color:${TINTA};">${limpio ? `Hola ${escaparHtml(limpio)},` : 'Hola,'}</p>`;
}

/** Caja para lo que hay que leer aparte: los datos de acceso, el mensaje de alguien. */
export function recuadro(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;"><tr>
              <td bgcolor="${CAJA}" style="padding:16px;background-color:${CAJA};border:1px solid ${CAJA_BORDE};border-radius:12px;font-size:15px;line-height:1.6;color:#24324a;${FUENTE}">${html}</td>
            </tr></table>`;
}

/** Un renglón «Rótulo: valor» dentro de un recuadro. */
export function dato(rotulo: string, valorHtml: string, ultimo = false): string {
  return `<p style="margin:0 0 ${ultimo ? 0 : 6}px;"><strong>${escaparHtml(rotulo)}:</strong> ${valorHtml}</p>`;
}

/** Botón que se pinta igual con o sin CSS moderno: el color vive en la celda. */
export function botonDeCorreo(texto: string, url: string): string {
  const destino = escaparHtml(url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px;"><tr>
              <td bgcolor="${MARCA}" style="background-color:${MARCA};border-radius:10px;">
                <a href="${destino}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:10px;${FUENTE}">${escaparHtml(texto)}</a>
              </td>
            </tr></table>`;
}

/** La dirección escrita, por si el botón no abre (correos reenviados, lectores que quitan los enlaces). */
export function ligaDeRespaldo(url: string): string {
  const destino = escaparHtml(url);
  return `<p data-solo-html style="margin:0 0 18px;font-size:13px;line-height:1.5;color:${TENUE};">Si el botón no abre, copia esta dirección en tu navegador:<br /><a href="${destino}" style="color:${MARCA};word-break:break-all;">${destino}</a></p>`;
}

/** «Saludos, / Equipo NEXARA» y, si hacen falta, renglones de contacto ya en HTML. */
export function despedida(renglones: string[] = []): string {
  const extra = renglones.map((r) => `<br />${r}`).join('');
  return `<p style="margin:6px 0 14px;color:${TENUE};">Saludos,<br /><strong style="color:${TINTA_FUERTE};">Equipo NEXARA</strong>${extra}</p>`;
}

const ENTIDADES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

/**
 * La versión en texto de un cuerpo armado con las piezas de arriba. Un correo con las dos versiones
 * se lee en cualquier cliente y pasa mejor los filtros de correo no deseado que uno de solo HTML.
 */
export function aTextoPlano(html: string): string {
  return html
    // En texto la dirección ya va escrita junto al botón: el renglón «si el botón no abre» sobra.
    .replace(/<p\b[^>]*\bdata-solo-html\b[^>]*>[\s\S]*?<\/p>/gi, '')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_todo, href: string, dentro: string) => {
      const texto = dentro.replace(/<[^>]+>/g, '').trim();
      return !texto || texto === href ? href : `${texto}: ${href}`;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|div|table|li)>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entidad) => ENTIDADES[entidad] ?? entidad)
    .split('\n')
    .map((linea) => linea.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
