import {
  aTextoPlano,
  botonDeCorreo,
  conSaltos,
  correoNexara,
  dato,
  despedida,
  escaparHtml,
  parrafo,
  parrafoTenue,
  recuadro,
  saludo,
  titulo,
} from '../common/email/correo-nexara.js';

type Correo = { subject: string; html: string; text: string };

/** El aviso al equipo cuando alguien escribe desde el sitio. */
export function correoDeNuevoContacto(datos: {
  categoria: string;
  nombre: string;
  correo: string;
  telefono?: string | null;
  empresa?: string | null;
  asunto?: string | null;
  mensaje: string;
  origen?: string | null;
}): Correo {
  const renglones = [
    dato('Correo', escaparHtml(datos.correo)),
    datos.telefono ? dato('Teléfono', escaparHtml(datos.telefono)) : '',
    datos.empresa ? dato('Empresa', escaparHtml(datos.empresa)) : '',
    datos.asunto ? dato('Asunto', escaparHtml(datos.asunto)) : '',
    dato('Categoría', escaparHtml(datos.categoria)),
  ].filter(Boolean);
  const cuerpo = [
    titulo(escaparHtml(datos.nombre)),
    `<div style="margin:0 0 16px;">${renglones.join('')}</div>`,
    recuadro(conSaltos(datos.mensaje)),
    parrafoTenue(`Origen: ${escaparHtml(datos.origen || 'formulario')}`),
  ].join('\n');
  return {
    subject: `Nuevo contacto [${datos.categoria}]: ${datos.nombre}`,
    html: correoNexara({ etiqueta: 'Nuevo contacto', avance: datos.mensaje.trim().slice(0, 140), cuerpo }),
    text: aTextoPlano(cuerpo),
  };
}

/** La respuesta del equipo a quien escribió desde el sitio. */
export function correoDeRespuestaAContacto(datos: {
  nombre: string;
  asuntoOriginal?: string | null;
  respuesta: string;
  ligaDeWhatsApp: string;
  telefono: string;
  sitio: string;
}): Correo {
  const sitioALaVista = datos.sitio.replace(/^https?:\/\//, '');
  const cuerpo = [
    saludo(datos.nombre),
    parrafo('Gracias por escribirnos. Esta es nuestra respuesta:'),
    recuadro(conSaltos(datos.respuesta)),
    parrafoTenue('Si tienes más dudas, responde a este correo y te ayudamos con gusto. Si prefieres que te llamemos:'),
    botonDeCorreo('Agendar llamada por WhatsApp', datos.ligaDeWhatsApp),
    despedida([
      `Teléfono: ${escaparHtml(datos.telefono)}`,
      `<a href="${escaparHtml(datos.sitio)}" style="color:#1f4aa8;text-decoration:none;">${escaparHtml(sitioALaVista)}</a>`,
    ]),
  ].join('\n');
  const text = [
    `Hola ${datos.nombre.trim()},`,
    'Gracias por escribirnos. Esta es nuestra respuesta:',
    datos.respuesta.trim(),
    'Si tienes más dudas, responde a este correo y te ayudamos con gusto.',
    `¿Prefieres que te llamemos? Escríbenos por WhatsApp: ${datos.ligaDeWhatsApp}`,
    `Saludos,\nEquipo NEXARA\nTeléfono: ${datos.telefono}\n${datos.sitio}`,
  ].join('\n\n');
  return {
    subject: datos.asuntoOriginal ? `Respuesta: ${datos.asuntoOriginal}` : 'Respuesta de NEXARA',
    html: correoNexara({
      etiqueta: 'Respuesta a tu solicitud',
      avance: datos.respuesta.trim().slice(0, 140),
      cuerpo,
    }),
    text,
  };
}
