import {
  botonDeCorreo,
  conSaltos,
  correoNexara,
  despedida,
  escaparHtml,
  ligaDeRespaldo,
  parrafo,
  parrafoTenue,
  recuadro,
  saludo,
} from '../common/email/correo-nexara.js';

export interface DatosDelCorreoDeCotizacion {
  cliente?: string | null;
  folio: string;
  /** Lo que escribió quien la envía. Texto libre: se escapa aquí. */
  mensaje?: string | null;
  ligaParaFirmar: string;
}

/**
 * El correo con el que la cotización le llega al cliente. Es lo primero que ve de la propuesta:
 * llegaba como cuatro renglones sin formato, con el asunto «Cotizacion» y la dirección larga a la vista.
 */
export function correoDeCotizacion(datos: DatosDelCorreoDeCotizacion): { subject: string; html: string; text: string } {
  const folio = String(datos.folio ?? '').trim();
  const mensaje = datos.mensaje?.trim();
  const cuerpo = [
    saludo(datos.cliente),
    parrafo(`Te compartimos la cotización <strong>${escaparHtml(folio)}</strong>. Va adjunta en PDF.`),
    mensaje ? recuadro(conSaltos(mensaje)) : '',
    parrafo('Puedes revisarla y firmarla en línea:'),
    botonDeCorreo('Revisar y firmar la cotización', datos.ligaParaFirmar),
    ligaDeRespaldo(datos.ligaParaFirmar),
    parrafoTenue('Si tienes dudas, responde a este correo y te atendemos.'),
    despedida(),
  ]
    .filter(Boolean)
    .join('\n');

  const nombre = String(datos.cliente ?? '').trim();
  const text = [
    nombre ? `Hola ${nombre},` : 'Hola,',
    `Te compartimos la cotización ${folio}. Va adjunta en PDF.`,
    mensaje ?? '',
    `Puedes revisarla y firmarla en línea: ${datos.ligaParaFirmar}`,
    'Si tienes dudas, responde a este correo y te atendemos.',
    'Saludos,\nEquipo NEXARA',
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    subject: `Cotización ${folio}`,
    html: correoNexara({
      etiqueta: 'Cotización',
      avance: `Cotización ${folio}, adjunta en PDF. Puedes revisarla y firmarla en línea.`,
      cuerpo,
    }),
    text,
  };
}
