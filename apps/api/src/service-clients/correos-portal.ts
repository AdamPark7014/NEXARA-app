import {
  aTextoPlano,
  botonDeCorreo,
  correoNexara,
  dato,
  despedida,
  escaparHtml,
  ligaDeRespaldo,
  parrafo,
  parrafoTenue,
  recuadro,
  saludo,
} from '../common/email/correo-nexara.js';

type Correo = { subject: string; html: string; text: string };

/** Los datos de acceso al portal de tickets, para el cliente. */
export function correoDeAccesoAlPortal(datos: {
  cliente: string;
  usuario: string;
  contrasena: string;
  ligaDelPortal: string;
}): Correo {
  const cuerpo = [
    saludo(datos.cliente),
    parrafo('Ya tienes acceso al portal de tickets de NEXARA. Estos son tus datos para entrar:'),
    recuadro(
      dato('Usuario', escaparHtml(datos.usuario)) + dato('Contraseña', escaparHtml(datos.contrasena), true),
    ),
    botonDeCorreo('Entrar al portal', datos.ligaDelPortal),
    ligaDeRespaldo(datos.ligaDelPortal),
    parrafoTenue('Si necesitas ayuda, responde a este correo.'),
    despedida(),
  ].join('\n');
  return {
    subject: 'Tu acceso al portal de tickets de NEXARA',
    html: correoNexara({
      etiqueta: 'Portal de tickets',
      avance: 'Ya tienes acceso al portal de tickets de NEXARA. Aquí van tus datos para entrar.',
      cuerpo,
    }),
    text: aTextoPlano(cuerpo),
  };
}

/** La invitación a opinar cuando un servicio se marca como terminado, para el cliente. */
export function correoDeEncuestaDeServicio(datos: {
  cliente: string;
  servicio: string;
  ligaDelPortal: string;
}): Correo {
  const cuerpo = [
    saludo(datos.cliente),
    parrafo(
      `Terminamos el servicio <strong>${escaparHtml(datos.servicio)}</strong>. Queremos confirmar que quedó bien atendido y conocer tu opinión.`,
    ),
    botonDeCorreo('Responder la encuesta', datos.ligaDelPortal),
    ligaDeRespaldo(datos.ligaDelPortal),
    parrafoTenue('Tu respuesta nos ayuda a mejorar. Gracias por tu confianza.'),
    despedida(),
  ].join('\n');
  return {
    subject: 'Tu opinión sobre el servicio de NEXARA',
    html: correoNexara({
      etiqueta: 'Encuesta de servicio',
      avance: `Terminamos el servicio ${datos.servicio}. ¿Nos cuentas cómo te atendimos?`,
      cuerpo,
    }),
    text: aTextoPlano(cuerpo),
  };
}
