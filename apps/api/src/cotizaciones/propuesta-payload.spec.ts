import { payloadDePropuesta, type CotizacionParaPropuesta } from './propuesta-payload.js';
import { generarPropuestaTecnicaPdf } from './propuesta-tecnica-pdf.js';
import { escribirObjetivo } from './objetivo-plantilla.js';
import { escribirTerminosPersonalizados } from './terminos-segmento.js';
import { textoPorHoja } from '../common/pdf/texto-de-pdf.js';

/**
 * Lo que guarda el editor de Core llega al PDF: cada campo de la propuesta modelo, en su lugar.
 * La cotización de prueba tiene la forma exacta con la que el editor la guarda (objetivo con marcas,
 * `scope`, bloques con viñetas, términos reescritos en `note`, partidas en el orden del editor).
 */

const textoDelPdf = (pdf: Buffer) => textoPorHoja(pdf).join('\n');

const GUARDADA: CotizacionParaPropuesta = {
  quoteNumber: 'NEX-LJ75100126-0007-JA',
  status: 'DRAFT',
  revision: 1,
  sentAt: '2026-09-12T18:00:00.000Z',
  segmento: 'OBRA',
  issueDate: '2026-09-18T00:00:00.000Z',
  validUntil: '2026-10-03T00:00:00.000Z',
  clientName: 'Plaza Norte',
  clientCompany: 'Inmobiliaria Plaza Norte',
  clientPhone: '222 123 4567',
  clientEmail: 'compras@plazanorte.mx',
  projectName: 'Renovación del sistema de CCTV',
  scope: 'El presente proyecto tiene como objetivo la renovación del CCTV existente.',
  objetivo: escribirObjetivo({
    intro: 'Este proyecto permitirá contar con un sistema más confiable.',
    beneficios: ['Mayor cobertura de vigilancia.', 'Monitoreo remoto.'],
    cierre: 'Como resultado, mayor seguridad.',
  }),
  alcanceBloques: [
    {
      clave: 'plantilla:mantenimiento',
      titulo: 'Mantenimiento de la infraestructura',
      texto: 'Se realizarán las siguientes actividades:',
      vinetas: ['Recableado de cámaras.', 'Sustitución de balunes.'],
    },
    { clave: 'libre-2', titulo: '', texto: 'Párrafo suelto sin número.', vinetas: [] },
    { clave: 'libre-3', titulo: '  ', texto: '', vinetas: [] },
  ],
  note: escribirTerminosPersonalizados({ noIncluye: 'Obra civil ni permisos municipales.' }),
  depositPercent: 60,
  subtotal: 9000,
  taxTotal: 1440,
  total: 10440,
  // En el orden del editor: servicio primero, equipo después (agrupadas saldrían al revés).
  items: [
    { name: 'Instalación de cámara', unit: 'Servicio', qty: 5, unitPrice: 1000, grupo: 'MANO_DE_OBRA', lineTotal: 5800 },
    { name: 'Cámara bala 2 MP', unit: 'Pieza', qty: 5, unitPrice: 800, grupo: 'EQUIPOS', lineTotal: 4640 },
  ],
};

describe('payload de la propuesta desde lo que guarda el editor', () => {
  const payload = payloadDePropuesta(GUARDADA, {
    planos: [{ url: '/uploads/cotizaciones-planos/x.png', nombre: 'CCTV-01', tipo: 'imagen' }],
    participantes: [{ nombre: 'Luis Joel Aguilar', rolEtiqueta: 'Elaboró', siglas: 'LJ' }],
  });

  it('01: introducción, beneficios y cierre tal como se escribieron', () => {
    expect(payload.objetivo).toEqual({
      intro: 'Este proyecto permitirá contar con un sistema más confiable.',
      beneficios: ['Mayor cobertura de vigilancia.', 'Monitoreo remoto.'],
      cierre: 'Como resultado, mayor seguridad.',
    });
  });

  it('02: título del proyecto, párrafo de entrada sin número y subsecciones con viñetas', () => {
    expect(payload.proyecto).toBe('Renovación del sistema de CCTV');
    expect(payload.alcance[0]).toEqual({
      titulo: '',
      texto: 'El presente proyecto tiene como objetivo la renovación del CCTV existente.',
      vinetas: [],
    });
    expect(payload.alcance[1]).toMatchObject({
      titulo: 'Mantenimiento de la infraestructura',
      vinetas: ['Recableado de cámaras.', 'Sustitución de balunes.'],
    });
    // Sin título: párrafo suelto (el generador no lo numera). El vacío no llega.
    expect(payload.alcance[2]).toMatchObject({ titulo: '', texto: 'Párrafo suelto sin número.' });
    expect(payload.alcance).toHaveLength(3);
  });

  it('04: partidas en el orden del editor, con el total del renglón antes de IVA', () => {
    const partidas = payload.grupos.flatMap((g) => g.partidas);
    expect(partidas.map((p) => p.name)).toEqual(['Instalación de cámara', 'Cámara bala 2 MP']);
    expect(partidas.map((p) => p.lineTotal)).toEqual([5000, 4000]);
    expect(partidas.reduce((a, p) => a + p.lineTotal, 0)).toBe(payload.subtotal);
  });

  it('04: términos etiquetados, con lo reescrito en su lugar y el anticipo capturado', () => {
    expect(payload.terminos.lineas).toEqual([
      'Forma de pago: 60 % de anticipo para confirmar el pedido y programar los trabajos; el 40 % restante contra entrega del sistema en operación.',
      expect.stringMatching(/^Alcance de la cotización: /),
      'No incluye: Obra civil ni permisos municipales.',
      expect.stringMatching(/^Disponibilidad: /),
      'Vigencia: 15 días naturales a partir de la fecha de emisión de esta propuesta.',
    ]);
  });

  it('portada: un borrador que ya salió es la versión siguiente en preparación', () => {
    expect(payload.revision).toBe(2);
    expect(payloadDePropuesta({ ...GUARDADA, sentAt: null }).revision).toBe(1);
    expect(payloadDePropuesta({ ...GUARDADA, status: 'SENT', revision: 2 }).revision).toBe(2);
  });

  it('el PDF imprime lo que se capturó', async () => {
    const texto = textoDelPdf(await generarPropuestaTecnicaPdf(payload));
    // La versión va en la rejilla de la portada: etiqueta y, debajo, el valor.
    expect(texto).toMatch(/VERSIÓN\n2\.0/);
    for (const esperado of [
      'Renovación del sistema de CCTV',
      'Mayor cobertura de vigilancia.',
      'Monitoreo remoto.',
      'Mantenimiento de la infraestructura',
      'Recableado de cámaras.',
      'Párrafo suelto sin número.',
      // El generador imprime la etiqueta en negritas y con punto.
      'No incluye.',
      'Obra civil ni permisos municipales.',
      'Instalación de cámara',
      'NEX-LJ75100126-0007-JA',
    ]) {
      expect(texto).toContain(esperado);
    }
    // El párrafo suelto no lleva número: solo hay un apartado «2.1» y ningún «2.2».
    expect(texto).toMatch(/^2\.1$/m);
    expect(texto).not.toMatch(/^2\.2$/m);
    expect(texto).not.toContain('2. Párrafo suelto');
  });
});
