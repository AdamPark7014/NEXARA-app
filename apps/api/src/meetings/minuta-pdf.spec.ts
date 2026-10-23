import { generarMinutaPdf, type MinutaPdfPayload } from './minuta-pdf';
import type { Minuta } from './minuta-ia';

const minuta: Minuta = {
  tituloSugerido: null,
  resumenEjecutivo: 'Se revisó el avance de la obra del CEDIS Tox y se acordó la contrapropuesta. '.repeat(4),
  loMasImportante: ['Descuento máximo de 8 % a Grupo Tox', 'Precios de Hikvision suben 6 %'],
  temas: Array.from({ length: 6 }, (_, i) => ({
    titulo: `Tema ${i + 1}: Grupo Tox y la ampliación de cámaras`,
    resumen: 'Se discutió la ampliación de 40 cámaras.',
    puntos: Array.from({ length: 6 }, (_, j) => `Punto ${j + 1} del tema con detalle concreto de cantidades y fechas.`),
    conclusion: i % 2 ? 'Quedó en enviar la contrapropuesta el viernes.' : null,
  })),
  decisiones: ['Descuento máximo de 8 % con anticipo del 50 %'],
  acuerdos: [
    {
      descripcion: 'Enviar la contrapropuesta a Grupo Tox',
      textoResponsable: 'Mafer',
      responsable: { id: 4, nombre: 'María Fernanda Ruiz Cano' },
      responsableCandidatos: [],
      fechaCompromiso: '2026-10-23',
      prioridad: 'alta',
    },
    { descripcion: 'Mandar el plano de la nave 2', textoResponsable: 'Ing. Ochoa', responsable: null, responsableCandidatos: [], fechaCompromiso: null, prioridad: 'media' },
  ],
  pendientes: ['Revisar proveedores de discos duros'],
  preguntasAbiertas: ['¿El cableado del edificio B puede ir por la azotea?'],
  riesgos: [{ riesgo: 'El tipo de cambio puede subir', mitigacion: null }],
  cifras: [{ dato: '2.3 millones', contexto: 'Oportunidades abiertas en el embudo' }],
  proximosPasos: ['Contrapropuesta a Tox el viernes'],
  lecciones: ['Validar existencias con almacén antes de cotizar'],
  seguimiento: [
    { ref: 'A1', agreementId: 1, acuerdo: 'Entregar el reporte de SLA', responsable: 'Roberto', estado: 'cumplido', detalle: '94 % de cumplimiento' },
    { ref: 'A2', agreementId: 2, acuerdo: 'Capacitar en el NVR', responsable: 'Roberto', estado: 'sin_mencion', detalle: null },
  ],
  reunionAnterior: { id: 3, titulo: 'Junta comercial semanal', fecha: '2026-10-15' },
  fuente: 'notas',
};

const base: MinutaPdfPayload = {
  id: 12,
  tipo: 'EXTRAORDINARIA',
  titulo: 'Junta comercial semanal',
  fecha: new Date('2026-10-22T00:00:00Z'),
  horaInicio: '10:00',
  facilitador: { nombre: 'María Fernanda Ruiz Cano' },
  asistentes: [
    { asistio: true, user: { nombre: 'Adriana Morales Paz' } },
    { asistio: false, user: { nombre: 'Diana Sánchez Mora' } },
  ],
  minuta,
  duracionMs: 41 * 60_000,
  transcripcion: Array.from({ length: 40 }, (_, i) => `[${String(i).padStart(2, '0')}:00] ${'bueno entonces lo de Tox queda así '.repeat(18)}`).join('\n'),
};

const paginas = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

describe('minuta de reunión en PDF', () => {
  it('genera portada, resumen con índice, apartados y anexo', async () => {
    const pdf = await generarMinutaPdf(base);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(paginas(pdf)).toBeGreaterThanOrEqual(6);
  });

  it('sin secciones opcionales ni transcripción sigue saliendo', async () => {
    const vacia: Minuta = {
      ...minuta,
      loMasImportante: [],
      temas: [],
      decisiones: [],
      acuerdos: [],
      pendientes: [],
      preguntasAbiertas: [],
      riesgos: [],
      cifras: [],
      proximosPasos: [],
      lecciones: [],
      seguimiento: [],
      reunionAnterior: null,
    };
    const pdf = await generarMinutaPdf({ ...base, minuta: vacia, asistentes: [], transcripcion: null, facilitador: null });
    expect(paginas(pdf)).toBe(2);
  });

  it('un párrafo pegado más largo que una hoja no rompe el anexo', async () => {
    const pdf = await generarMinutaPdf({ ...base, transcripcion: 'palabra '.repeat(6000) });
    expect(paginas(pdf)).toBeGreaterThan(6);
  });
});
