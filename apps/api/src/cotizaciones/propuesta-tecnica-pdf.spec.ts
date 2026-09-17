import { generarPropuestaTecnicaPdf, type PropuestaPayload } from './propuesta-tecnica-pdf.js';
import { agruparPartidas } from './partidas-grupos.js';
import { objetivoDePropuesta } from './objetivo-plantilla.js';
import { bloqueAlcanceDePaquete, buscarPaquete, partidasDePaquete } from './paquetes.js';
import { terminosDeCotizacion } from './terminos-segmento.js';

function payloadDePrueba(): PropuestaPayload {
  const paquete = buscarPaquete('camara-bala-instalada')!;
  const partidas = partidasDePaquete(paquete, 8).map((p) => ({
    ...p,
    lineTotal: p.qty * p.unitPrice,
  }));
  const subtotal = partidas.reduce((acc, p) => acc + p.lineTotal, 0);

  return {
    folio: 'NEX-LJ75100126-0007-JA.CE',
    revision: 1,
    issueDate: '2026-09-17',
    validUntil: '2026-10-02',
    segmentoEtiqueta: 'Comercial',
    cliente: { nombre: 'Cliente de prueba', empresa: 'Empresa S.A. de C.V.', telefono: '2221234567' },
    proyecto: 'Renovación y ampliación del sistema de CCTV',
    objetivo: objetivoDePropuesta({ segmento: 'COMERCIAL', partidas, vigenciaDias: 15 }),
    alcance: [
      {
        titulo: bloqueAlcanceDePaquete(paquete, 8).titulo,
        texto: bloqueAlcanceDePaquete(paquete, 8).texto,
        vinetas: ['Recableado de las cámaras existentes.', 'Sustitución de balunes de video.'],
      },
    ],
    planos: [{ url: '/uploads/no-existe.png', nombre: 'Plano CCTV-01', tipo: 'imagen' }],
    grupos: agruparPartidas(partidas).map((g) => ({
      grupo: g.grupo,
      etiqueta: g.etiqueta,
      subtotal: g.subtotal,
      partidas: g.partidas.map((p) => ({
        name: p.name,
        description: p.description ?? null,
        unit: p.unit ?? null,
        qty: Number(p.qty),
        unitPrice: Number(p.unitPrice),
        lineTotal: Number(p.lineTotal ?? 0),
      })),
    })),
    subtotal,
    iva: subtotal * 0.16,
    total: subtotal * 1.16,
    currency: 'MXN',
    terminos: terminosDeCotizacion({ segmento: 'COMERCIAL', incluyeInstalacion: true, anticipoPct: 50 }),
    participantes: [{ nombre: 'Luis Joel Aguilar', rolEtiqueta: 'Elaboró', siglas: 'LJ' }],
    empresa: null,
  };
}

describe('PDF Propuesta técnica', () => {
  it('genera un PDF válido con las cuatro secciones', async () => {
    const pdf = await generarPropuestaTecnicaPdf(payloadDePrueba());
    expect(pdf.length).toBeGreaterThan(2000);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('un anexo que no existe en disco no tumba la propuesta', async () => {
    const payload = payloadDePrueba();
    payload.planos = [
      { url: '/uploads/no-existe.png', nombre: 'Plano perdido', tipo: 'imagen' },
      { url: 'https://ejemplo.mx/plano.pdf', nombre: 'Plano remoto', tipo: 'pdf' },
    ];
    const pdf = await generarPropuestaTecnicaPdf(payload);
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it('sin partidas ni alcance sigue produciendo el documento', async () => {
    const payload = payloadDePrueba();
    payload.grupos = [];
    payload.alcance = [];
    payload.planos = [];
    payload.subtotal = 0;
    payload.iva = 0;
    payload.total = 0;
    const pdf = await generarPropuestaTecnicaPdf(payload);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
