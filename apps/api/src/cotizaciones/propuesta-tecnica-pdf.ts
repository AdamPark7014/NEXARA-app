import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { loadNexaraLogo, pdfMoney } from '../common/pdf/nexara-pdf-theme.js';

/**
 * PDF «Propuesta técnica» (contrato del viernes, D).
 *
 * Reproduce el documento que NEXARA ya manda a mano (`Primera cotizacion .pdf`): portada con
 * versión e índice, 01 Objetivo, 02 Alcance por bloques, 03 Planos y 04 Cotización con las partidas
 * agrupadas en Equipos / Materiales / Mano de obra y los términos que correspondan al segmento.
 *
 * Diferencia con el documento hecho a mano: aquí los números del objetivo salen de las partidas y
 * los términos salen de lo que se cobra, así que la propuesta no puede cobrar instalación y decir
 * «solo suministro» tres párrafos abajo.
 */

const COLOR = {
  navy: '#0C1A26',
  teal: '#17A08A',
  tealSoft: '#E6F5F2',
  text: '#1F2A37',
  muted: '#5B6B7A',
  line: '#D9E2EC',
  white: '#FFFFFF',
} as const;

/** Pie de la propuesta modelo. Se sobrescribe con los datos fiscales de la empresa si existen. */
const EMPRESA_POR_OMISION = {
  web: 'https://nexara.com.mx/',
  telefono: '(22) 01 79 18 71',
  correo: 'gerencia@nexara.com.mx',
  direccion: 'Malltertaiment, Explanada Puebla, Cholula, Puebla 72774, México',
  nombre: 'NEXARA',
  lema: 'Conectando Ecosistemas de Tecnología',
};

export type PropuestaPartida = {
  name: string;
  description?: string | null;
  unit?: string | null;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

export type PropuestaGrupo = {
  grupo: string;
  etiqueta: string;
  subtotal: number;
  partidas: PropuestaPartida[];
};

export type PropuestaBloque = {
  titulo: string;
  texto?: string | null;
  vinetas?: string[];
  parametros?: Record<string, unknown> | null;
};

export type PropuestaPlano = {
  url: string;
  nombre?: string | null;
  tipo?: string | null;
};

export type PropuestaPayload = {
  folio: string;
  revision: number;
  issueDate: string;
  validUntil?: string | null;
  segmentoEtiqueta: string;
  cliente: {
    nombre?: string | null;
    empresa?: string | null;
    telefono?: string | null;
    correo?: string | null;
    direccion?: string | null;
  };
  proyecto?: string | null;
  objetivo: { intro: string; beneficios: string[]; cierre: string };
  alcance: PropuestaBloque[];
  planos: PropuestaPlano[];
  grupos: PropuestaGrupo[];
  subtotal: number;
  iva: number;
  total: number;
  currency: string;
  terminos: { titulo: string; lineas: string[] };
  participantes: Array<{ nombre: string; rolEtiqueta: string; siglas: string }>;
  empresa?: {
    legalName?: string | null;
    tradeName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    websiteUrl?: string | null;
    fiscalAddress?: string | null;
  } | null;
};

const ANCHO = 612;
const ALTO = 792;
const MARGEN = 48;
const ANCHO_UTIL = ANCHO - MARGEN * 2;

type Doc = InstanceType<typeof PDFDocument>;

function datosEmpresa(payload: PropuestaPayload) {
  const e = payload.empresa;
  return {
    nombre: e?.tradeName || e?.legalName || EMPRESA_POR_OMISION.nombre,
    web: e?.websiteUrl || EMPRESA_POR_OMISION.web,
    telefono: e?.contactPhone || EMPRESA_POR_OMISION.telefono,
    correo: e?.contactEmail || EMPRESA_POR_OMISION.correo,
    direccion: e?.fiscalAddress || EMPRESA_POR_OMISION.direccion,
    lema: EMPRESA_POR_OMISION.lema,
  };
}

/** Archivo local de un anexo `/uploads/...`; `null` si es remoto o no existe. */
function archivoDePlano(url: string): string | null {
  try {
    if (!url || /^https?:\/\//i.test(url)) return null;
    const limpio = url.split('?')[0]!.replace(/^\/+/, '');
    const candidatos = [
      path.resolve(process.cwd(), limpio),
      path.resolve(process.cwd(), '..', limpio),
    ];
    for (const candidato of candidatos) {
      if (fs.existsSync(candidato) && fs.statSync(candidato).isFile()) return candidato;
    }
  } catch {
    /* un anexo ilegible no tumba la propuesta */
  }
  return null;
}

function pieDePagina(doc: Doc, payload: PropuestaPayload) {
  const empresa = datosEmpresa(payload);
  const y = ALTO - 58;
  doc.save();
  doc.rect(0, y, ANCHO, 58).fill(COLOR.navy);
  doc
    .fillColor(COLOR.white)
    .font('Helvetica')
    .fontSize(7.5)
    .text(empresa.web, MARGEN, y + 10, { width: ANCHO_UTIL })
    .text(`${empresa.telefono}  ·  ${empresa.correo}`, MARGEN, y + 22, { width: ANCHO_UTIL })
    .text(empresa.direccion, MARGEN, y + 34, { width: ANCHO_UTIL });
  doc.restore();
}

function encabezadoSeccion(doc: Doc, numero: string, titulo: string) {
  doc.save();
  doc.rect(0, 0, 86, 86).fill(COLOR.navy);
  doc.circle(96, 46, 9).fill(COLOR.teal);
  doc.restore();

  doc.fillColor(COLOR.teal).font('Helvetica-Bold').fontSize(26).text(numero, MARGEN, 96);
  doc.fillColor(COLOR.navy).font('Helvetica-Bold').fontSize(15).text(titulo, MARGEN, 128, { width: ANCHO_UTIL });
  doc.y = 156;
  doc.x = MARGEN;
}

function parrafo(doc: Doc, texto: string, opciones: { bold?: boolean; size?: number; color?: string } = {}) {
  doc
    .font(opciones.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(opciones.size ?? 9.5)
    .fillColor(opciones.color ?? COLOR.text)
    .text(texto, MARGEN, doc.y, { width: ANCHO_UTIL, align: 'left', lineGap: 2 });
  doc.moveDown(0.6);
}

/** Salta de página cuando lo que sigue no cabe encima del pie. */
function asegurarEspacio(doc: Doc, alto: number) {
  if (doc.y + alto > ALTO - 80) {
    doc.addPage();
    doc.y = 64;
    doc.x = MARGEN;
  }
}

function portada(doc: Doc, payload: PropuestaPayload) {
  const empresa = datosEmpresa(payload);
  doc.rect(0, 0, ANCHO, ALTO).fill(COLOR.navy);
  doc.rect(0, ALTO - 190, 150, 190).fill(COLOR.teal);

  const logo = loadNexaraLogo();
  if (logo) {
    try {
      doc.image(logo, ANCHO - 200, 60, { fit: [150, 150], align: 'right' });
    } catch {
      /* sin logo la portada sigue en pie */
    }
  }

  doc.fillColor(COLOR.white).font('Helvetica-Bold').fontSize(38).text(empresa.nombre.toUpperCase(), MARGEN, 120, {
    characterSpacing: 6,
  });
  doc.font('Helvetica').fontSize(10).fillColor('#C7D3DD').text(empresa.lema, MARGEN, 172);

  doc.fillColor(COLOR.white).font('Helvetica').fontSize(30).text('PROPUESTA', MARGEN, 250, { characterSpacing: 2 });
  doc.fillColor(COLOR.teal).font('Helvetica-Bold').fontSize(30).text('TÉCNICA', MARGEN, 286, { characterSpacing: 2 });

  doc.circle(MARGEN + 5, 346, 4).fill(COLOR.teal);
  doc
    .fillColor(COLOR.white)
    .font('Helvetica')
    .fontSize(10)
    .text(`VERSIÓN ${Math.max(1, payload.revision)}.0`, MARGEN + 18, 341, { characterSpacing: 1 });

  const indice = [
    ['01.', 'OBJETIVO DEL PROYECTO'],
    ['02.', 'ALCANCE DEL PROYECTO'],
    ['03.', 'PLANOS'],
    ['04.', 'COTIZACIÓN'],
  ];
  let y = 400;
  doc.save();
  doc.rect(MARGEN - 8, y - 16, 330, indice.length * 46 + 16).fill('#12293A');
  doc.restore();
  for (const [numero, titulo] of indice) {
    doc.fillColor(COLOR.teal).font('Helvetica-Bold').fontSize(15).text(numero!, MARGEN + 8, y);
    doc.fillColor(COLOR.white).font('Helvetica').fontSize(9.5).text(titulo!, MARGEN + 62, y + 4, {
      characterSpacing: 1,
    });
    doc
      .moveTo(MARGEN + 8, y + 30)
      .lineTo(MARGEN + 300, y + 30)
      .strokeColor('#24415A')
      .lineWidth(0.5)
      .stroke();
    y += 46;
  }

  // Datos de la propuesta: folio, cliente y fechas.
  const datosY = 620;
  doc.fillColor('#8FA6B8').font('Helvetica').fontSize(8).text('FOLIO', ANCHO - 230, datosY);
  doc.fillColor(COLOR.white).font('Helvetica-Bold').fontSize(12).text(payload.folio, ANCHO - 230, datosY + 12, {
    width: 190,
  });
  doc.fillColor('#8FA6B8').font('Helvetica').fontSize(8).text('CLIENTE', ANCHO - 230, datosY + 44);
  doc
    .fillColor(COLOR.white)
    .font('Helvetica')
    .fontSize(10)
    .text(payload.cliente.empresa || payload.cliente.nombre || '—', ANCHO - 230, datosY + 56, { width: 190 });
  doc.fillColor('#8FA6B8').font('Helvetica').fontSize(8).text('EMISIÓN', ANCHO - 230, datosY + 88);
  doc
    .fillColor(COLOR.white)
    .font('Helvetica')
    .fontSize(10)
    .text(
      `${payload.issueDate}${payload.validUntil ? `  ·  vigencia ${payload.validUntil}` : ''}`,
      ANCHO - 230,
      datosY + 100,
      { width: 190 },
    );

  doc
    .fillColor(COLOR.white)
    .font('Helvetica-Bold')
    .fontSize(9)
    .text(datosEmpresa(payload).web, MARGEN + 110, ALTO - 62);
  doc
    .fillColor('#C7D3DD')
    .font('Helvetica')
    .fontSize(8)
    .text('Propuesta técnica sujeta a contratación formal.', ANCHO - 250, ALTO - 66, { width: 210 });
}

function seccionObjetivo(doc: Doc, payload: PropuestaPayload) {
  doc.addPage();
  encabezadoSeccion(doc, '01.', 'OBJETIVO DEL PROYECTO');
  parrafo(doc, payload.objetivo.intro);

  if (payload.objetivo.beneficios.length) {
    parrafo(doc, 'Entre los principales beneficios se encuentran:');
    payload.objetivo.beneficios.forEach((beneficio, i) => {
      asegurarEspacio(doc, 34);
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(COLOR.text)
        .text(`${i + 1}. ${beneficio}`, MARGEN + 16, doc.y, { width: ANCHO_UTIL - 24, lineGap: 2 });
      doc.moveDown(0.5);
    });
    doc.moveDown(0.4);
  }

  asegurarEspacio(doc, 50);
  parrafo(doc, payload.objetivo.cierre);
}

function seccionAlcance(doc: Doc, payload: PropuestaPayload) {
  doc.addPage();
  encabezadoSeccion(doc, '02.', 'ALCANCE DEL PROYECTO');

  if (!payload.alcance.length) {
    parrafo(doc, 'El alcance de esta propuesta es el detallado en la sección 04, Cotización.', {
      color: COLOR.muted,
    });
    return;
  }

  payload.alcance.forEach((bloque, i) => {
    asegurarEspacio(doc, 60);
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(COLOR.navy)
      .text(`${i + 1}. ${bloque.titulo}`, MARGEN, doc.y, { width: ANCHO_UTIL });
    doc.moveDown(0.3);
    if (bloque.texto) parrafo(doc, bloque.texto);
    for (const vineta of bloque.vinetas ?? []) {
      asegurarEspacio(doc, 24);
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(COLOR.text)
        .text(`•  ${vineta}`, MARGEN + 16, doc.y, { width: ANCHO_UTIL - 24, lineGap: 2 });
      doc.moveDown(0.3);
    }
    doc.moveDown(0.4);
  });
}

function seccionPlanos(doc: Doc, payload: PropuestaPayload) {
  doc.addPage();
  encabezadoSeccion(doc, '03.', 'PLANOS');

  if (!payload.planos.length) {
    parrafo(doc, 'Esta propuesta no incluye planos anexos.', { color: COLOR.muted });
    return;
  }

  for (const plano of payload.planos) {
    const archivo = archivoDePlano(plano.url);
    const esImagen = archivo != null && /\.(png|jpe?g)$/i.test(archivo);
    if (esImagen) {
      asegurarEspacio(doc, 300);
      try {
        doc.image(archivo!, MARGEN, doc.y, { fit: [ANCHO_UTIL, 280], align: 'center' });
        doc.y += 288;
      } catch {
        doc.y += 4;
      }
    } else {
      asegurarEspacio(doc, 40);
    }
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(COLOR.muted)
      .text(plano.nombre || plano.url, MARGEN, doc.y, { width: ANCHO_UTIL });
    doc.moveDown(0.8);
  }
}

const COLUMNAS = [
  { clave: 'descripcion', titulo: 'DESCRIPCIÓN', x: MARGEN, ancho: 236, align: 'left' as const },
  { clave: 'unidad', titulo: 'UNIDAD', x: MARGEN + 240, ancho: 54, align: 'center' as const },
  { clave: 'cantidad', titulo: 'CANTIDAD', x: MARGEN + 298, ancho: 54, align: 'center' as const },
  { clave: 'precio', titulo: 'PRECIO', x: MARGEN + 356, ancho: 76, align: 'right' as const },
  { clave: 'total', titulo: 'TOTAL', x: MARGEN + 436, ancho: 80, align: 'right' as const },
];

function cabeceraTabla(doc: Doc) {
  const y = doc.y;
  doc.save();
  doc.rect(MARGEN, y, ANCHO_UTIL, 20).fill(COLOR.teal);
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR.white);
  for (const col of COLUMNAS) {
    doc.text(col.titulo, col.x, y + 6, { width: col.ancho, align: col.align });
  }
  doc.y = y + 24;
}

function seccionCotizacion(doc: Doc, payload: PropuestaPayload) {
  doc.addPage();
  encabezadoSeccion(doc, '04.', 'COTIZACIÓN');

  doc.font('Helvetica').fontSize(9).fillColor(COLOR.muted);
  doc.text(
    `Cliente: ${payload.cliente.nombre || payload.cliente.empresa || '—'}${
      payload.cliente.telefono ? `   ·   Tel. ${payload.cliente.telefono}` : ''
    }`,
    MARGEN,
    doc.y,
    { width: ANCHO_UTIL },
  );
  doc.text(
    `Folio: ${payload.folio}   ·   Emisión: ${payload.issueDate}${
      payload.validUntil ? `   ·   Validez: ${payload.validUntil}` : ''
    }   ·   Segmento: ${payload.segmentoEtiqueta}`,
    MARGEN,
    doc.y + 2,
    { width: ANCHO_UTIL },
  );
  doc.moveDown(1);

  cabeceraTabla(doc);

  for (const grupo of payload.grupos) {
    asegurarEspacio(doc, 40);
    doc.save();
    doc.rect(MARGEN, doc.y, ANCHO_UTIL, 16).fill(COLOR.tealSoft);
    doc.restore();
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(COLOR.navy)
      .text(grupo.etiqueta.toUpperCase(), MARGEN + 6, doc.y + 4, { width: ANCHO_UTIL - 12 });
    doc.y += 20;

    for (const partida of grupo.partidas) {
      const texto = partida.description
        ? `${partida.name}\n${partida.description}`
        : partida.name;
      const alto =
        Math.max(
          doc.font('Helvetica').fontSize(8.5).heightOfString(texto, { width: COLUMNAS[0]!.ancho - 8 }),
          12,
        ) + 10;

      if (doc.y + alto > ALTO - 90) {
        doc.addPage();
        doc.y = 64;
        cabeceraTabla(doc);
      }

      const y = doc.y;
      doc.font('Helvetica').fontSize(8.5).fillColor(COLOR.text);
      doc.text(texto, COLUMNAS[0]!.x + 4, y + 4, { width: COLUMNAS[0]!.ancho - 8 });
      doc.text(partida.unit || 'Pieza', COLUMNAS[1]!.x, y + 4, {
        width: COLUMNAS[1]!.ancho,
        align: 'center',
      });
      doc.text(String(partida.qty ?? 0), COLUMNAS[2]!.x, y + 4, {
        width: COLUMNAS[2]!.ancho,
        align: 'center',
      });
      doc.text(pdfMoney(Number(partida.unitPrice || 0), payload.currency), COLUMNAS[3]!.x, y + 4, {
        width: COLUMNAS[3]!.ancho,
        align: 'right',
      });
      doc.text(pdfMoney(Number(partida.lineTotal || 0), payload.currency), COLUMNAS[4]!.x, y + 4, {
        width: COLUMNAS[4]!.ancho,
        align: 'right',
      });

      doc
        .moveTo(MARGEN, y + alto)
        .lineTo(ANCHO - MARGEN, y + alto)
        .strokeColor(COLOR.line)
        .lineWidth(0.5)
        .stroke();
      doc.y = y + alto;
    }

    // Subtotal del grupo: el cliente ve cuánto es producto y cuánto es trabajo.
    asegurarEspacio(doc, 24);
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(COLOR.muted)
      .text(`Subtotal ${grupo.etiqueta.toLowerCase()}`, COLUMNAS[2]!.x - 60, doc.y + 4, {
        width: COLUMNAS[2]!.ancho + 120,
        align: 'right',
      });
    doc
      .fillColor(COLOR.navy)
      .text(pdfMoney(grupo.subtotal, payload.currency), COLUMNAS[4]!.x, doc.y - 10, {
        width: COLUMNAS[4]!.ancho,
        align: 'right',
      });
    doc.y += 14;
  }

  // Totales
  asegurarEspacio(doc, 90);
  const yTot = doc.y + 8;
  doc.save();
  doc.rect(ANCHO - MARGEN - 220, yTot, 220, 62).fill(COLOR.tealSoft);
  doc.restore();
  const filas: Array<[string, number, boolean]> = [
    ['SUBTOTAL', payload.subtotal, false],
    ['IVA', payload.iva, false],
    ['TOTAL', payload.total, true],
  ];
  filas.forEach(([etiqueta, valor, fuerte], i) => {
    const y = yTot + 10 + i * 17;
    doc
      .font(fuerte ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(fuerte ? 10 : 9)
      .fillColor(COLOR.navy)
      .text(etiqueta, ANCHO - MARGEN - 210, y, { width: 90 });
    doc.text(pdfMoney(valor, payload.currency), ANCHO - MARGEN - 110, y, { width: 100, align: 'right' });
  });
  doc.y = yTot + 74;

  // Términos y condiciones — por segmento y por lo que realmente se cobra.
  asegurarEspacio(doc, 120);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR.navy).text(payload.terminos.titulo.toUpperCase(), MARGEN, doc.y);
  doc.moveDown(0.4);
  for (const linea of payload.terminos.lineas) {
    asegurarEspacio(doc, 28);
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(COLOR.text)
      .text(`•  ${linea}`, MARGEN, doc.y, { width: ANCHO_UTIL, lineGap: 1.5 });
    doc.moveDown(0.3);
  }

  if (payload.participantes.length) {
    asegurarEspacio(doc, 40);
    doc.moveDown(0.6);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(COLOR.muted)
      .text(
        `Elaborada por: ${payload.participantes
          .map((p) => `${p.nombre} (${p.rolEtiqueta})`)
          .join('  ·  ')}`,
        MARGEN,
        doc.y,
        { width: ANCHO_UTIL },
      );
  }
}

/** Documento completo, listo para adjuntar al correo o descargar. */
export async function generarPropuestaTecnicaPdf(payload: PropuestaPayload): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'LETTER', margin: MARGEN, bufferPages: true });
  const trozos: Buffer[] = [];
  doc.on('data', (trozo: Buffer) => trozos.push(trozo));

  const listo = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);
  });

  portada(doc, payload);
  seccionObjetivo(doc, payload);
  seccionAlcance(doc, payload);
  seccionPlanos(doc, payload);
  seccionCotizacion(doc, payload);

  // Pie corporativo en todas menos la portada, que ya lo trae dibujado.
  const rango = doc.bufferedPageRange();
  for (let i = rango.start + 1; i < rango.start + rango.count; i += 1) {
    doc.switchToPage(i);
    pieDePagina(doc, payload);
  }

  doc.end();
  return listo;
}
