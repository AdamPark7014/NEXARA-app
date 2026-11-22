import {
  botonDeCorreo,
  correoNexara,
  escaparHtml,
  parrafo,
  parrafoTenue,
  saludo,
  titulo,
} from '../common/email/correo-nexara.js';

/**
 * A dónde lleva «Ver noticia». El blog del sitio solo publica las noticias de la empresa del sitio:
 * para esas la liga va a la noticia; para las demás, a la portada (como antes), que nunca da 404.
 */
export function ligaDeLaNoticia(sitio: string, slug: string | null | undefined, esDelSitioPublico: boolean): string {
  const base = sitio.replace(/\/+$/, '');
  const limpio = String(slug ?? '').trim();
  return esDelSitioPublico && limpio ? `${base}/blog/${encodeURIComponent(limpio)}` : base;
}

/** El aviso a quienes se suscribieron a Nexara News cuando se publica una noticia. */
export function correoDeNoticia(datos: {
  suscriptor?: string | null;
  tituloDeLaNoticia: string;
  resumen: string;
  liga: string;
}): { subject: string; html: string; text: string } {
  const nombre = String(datos.suscriptor ?? '').trim();
  const cuerpo = [
    saludo(nombre),
    parrafoTenue('Publicamos una noticia nueva:'),
    titulo(escaparHtml(datos.tituloDeLaNoticia)),
    parrafo(escaparHtml(datos.resumen)),
    botonDeCorreo('Ver noticia', datos.liga),
    parrafoTenue('Gracias por suscribirte a Nexara News.'),
  ].join('\n');
  const text = [
    nombre ? `Hola ${nombre},` : 'Hola,',
    `Publicamos una noticia nueva: ${datos.tituloDeLaNoticia}`,
    datos.resumen,
    `Ver noticia: ${datos.liga}`,
    'Gracias por suscribirte a Nexara News.\nEquipo NEXARA',
  ].join('\n\n');
  return {
    subject: `Nueva noticia: ${datos.tituloDeLaNoticia}`,
    html: correoNexara({
      etiqueta: 'Nexara News',
      avance: datos.resumen,
      cuerpo,
      pie: 'Recibes este correo porque te suscribiste a Nexara News.',
    }),
    text,
  };
}
