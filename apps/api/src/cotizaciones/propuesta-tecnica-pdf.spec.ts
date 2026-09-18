import {
  datosEmpresaPropuesta,
  fechaLarga,
  generarPropuestaTecnicaPdf,
  type PropuestaPayload,
} from './propuesta-tecnica-pdf.js';
import { agruparPartidas } from './partidas-grupos.js';
import { objetivoDePropuesta } from './objetivo-plantilla.js';
import { bloqueAlcanceDePaquete, buscarPaquete, partidasDePaquete } from './paquetes.js';
import { terminosDeCotizacion } from './terminos-segmento.js';
import { textoPorHoja } from '../common/pdf/texto-de-pdf.js';

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

const cuentaDe = (pdf: Buffer, patron: RegExp) => (pdf.toString('latin1').match(patron) ?? []).length;
const paginas = (pdf: Buffer) => cuentaDe(pdf, /\/Type \/Page\b/g);

describe('PDF Propuesta técnica', () => {
  it('genera un PDF válido con portada y las cuatro secciones', async () => {
    const pdf = await generarPropuestaTecnicaPdf(payloadDePrueba());
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const texto = textoPorHoja(pdf).join('\n');
    for (const esperado of ['PROPUESTA TÉCNICA', 'OBJETIVO DEL PROYECTO', 'ALCANCE DEL PROYECTO', 'PLANOS', 'COTIZACIÓN']) {
      expect(texto).toContain(esperado);
    }
    // La versión va en la rejilla de la portada: etiqueta y, debajo, el valor.
    expect(texto).toMatch(/VERSIÓN\n1\.0/);
  });

  it('imprime todos los campos de la hoja de cotización del modelo', async () => {
    const texto = textoPorHoja(await generarPropuestaTecnicaPdf(payloadDePrueba())).join('\n');
    for (const esperado of [
      'Santiago Momoxpan, 72775 Cholula de Rivadavia, Pue.',
      'Correo electrónico: gerencia@nexara.com.mx',
      'Teléfonos:',
      'Fecha de emisión',
      '17 de septiembre de 2026',
      'Cotización N°',
      'NEX-LJ75100126-0007-JA.CE',
      'Validez',
      '2 de octubre de 2026',
      'CLIENTE',
      'Empresa S.A. de C.V.',
      'Teléfono',
      '2221234567',
      'DESCRIPCIÓN',
      'UNIDAD',
      'CANTIDAD',
      'PRECIO',
      'TOTAL',
      'SUBTOTAL',
      'IVA',
      'TÉRMINOS Y CONDICIONES',
      'Forma de pago.',
      'Alcance de la cotización.',
      'Disponibilidad.',
      'Luis Joel Aguilar',
    ]) {
      expect(texto).toContain(esperado);
    }
  });

  it('el cliente no ve subtotales por grupo: las partidas van seguidas, como en el modelo', async () => {
    const texto = textoPorHoja(await generarPropuestaTecnicaPdf(payloadDePrueba())).join('\n');
    expect(texto).not.toMatch(/^(EQUIPOS|MATERIALES|MANO DE OBRA)$/m);
  });

  it('numera todas las hojas menos la portada con «Página n de N»', async () => {
    const payload = payloadDePrueba();
    // Muchas partidas para que la tabla ocupe varias hojas.
    const base = payload.grupos[0]!.partidas[0]!;
    payload.grupos = [{ ...payload.grupos[0]!, partidas: Array.from({ length: 60 }, () => ({ ...base })) }];
    const pdf = await generarPropuestaTecnicaPdf(payload);
    const hojas = textoPorHoja(pdf);
    const total = paginas(pdf);
    expect(hojas).toHaveLength(total);
    expect(hojas[0]).not.toContain('Página');
    hojas.slice(1).forEach((hoja, i) => expect(hoja).toContain(`Página ${i + 2} de ${total}`));
  });

  it('la marca se embebe una sola vez aunque el documento tenga muchas hojas', async () => {
    const corto = await generarPropuestaTecnicaPdf(payloadDePrueba());
    const payload = payloadDePrueba();
    const base = payload.grupos[0]!.partidas[0]!;
    payload.grupos = [{ ...payload.grupos[0]!, partidas: Array.from({ length: 80 }, () => ({ ...base })) }];
    const largo = await generarPropuestaTecnicaPdf(payload);
    expect(paginas(largo)).toBeGreaterThan(paginas(corto));
    expect(cuentaDe(largo, /\/Subtype \/Image/g)).toBe(cuentaDe(corto, /\/Subtype \/Image/g));
  });

  it('usa los datos del perfil de la empresa cuando existen', async () => {
    const payload = payloadDePrueba();
    payload.empresa = { contactEmail: 'contacto@nexara.com.mx', contactPhone: '222 000 1111' };
    const texto = textoPorHoja(await generarPropuestaTecnicaPdf(payload)).join('\n');
    expect(texto).toContain('contacto@nexara.com.mx');
    expect(texto).toContain('222 000 1111');
    expect(texto).not.toContain('gerencia@nexara.com.mx');
  });

  it('un anexo que no existe en disco no tumba la propuesta: se enlista en 03', async () => {
    const payload = payloadDePrueba();
    payload.planos = [
      { url: '/uploads/no-existe.png', nombre: 'Plano perdido', tipo: 'imagen' },
      { url: 'https://ejemplo.mx/plano.pdf', nombre: 'Plano remoto', tipo: 'pdf' },
    ];
    const texto = textoPorHoja(await generarPropuestaTecnicaPdf(payload)).join('\n');
    expect(texto).toContain('Plano perdido');
    expect(texto).toContain('Plano remoto');
  });

  it('sin partidas, alcance ni planos sigue produciendo el documento y la portada lo dice', async () => {
    const payload = payloadDePrueba();
    payload.grupos = [];
    payload.alcance = [];
    payload.planos = [];
    payload.subtotal = 0;
    payload.iva = 0;
    payload.total = 0;
    const pdf = await generarPropuestaTecnicaPdf(payload);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const [portada, ...resto] = textoPorHoja(pdf);
    expect(portada).toMatch(/sin anexos/i);
    expect(resto.join('\n')).not.toContain('ALCANCE DEL PROYECTO');
    // Portada, objetivo y cotización.
    expect(paginas(pdf)).toBe(3);
  });
});

describe('datos de la propuesta', () => {
  it('fecha larga en español sin corrimiento por zona horaria', () => {
    expect(fechaLarga('2026-09-17')).toBe('17 de septiembre de 2026');
    expect(fechaLarga('2026-01-01T00:00:00.000Z')).toBe('1 de enero de 2026');
    expect(fechaLarga(null)).toBeNull();
  });

  it('sin perfil de empresa usa los datos de la propuesta modelo', () => {
    const empresa = datosEmpresaPropuesta(null);
    expect(empresa.correo).toBe('gerencia@nexara.com.mx');
    expect(empresa.telefonoAlterno).toBe('(222) 696 0350');
    expect(empresa.nombre).toBe('NEXARA');
  });

  it('un campo vacío del perfil no borra el dato del modelo', () => {
    const empresa = datosEmpresaPropuesta({ contactEmail: '  ', tradeName: 'Nexara' });
    expect(empresa.correo).toBe('gerencia@nexara.com.mx');
    expect(empresa.nombre).toBe('NEXARA');
  });
});
