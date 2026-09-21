import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  datosEmpresaPropuesta,
  fechaLarga,
  generarPropuestaTecnicaPdf,
  OPCIONES_POR_OMISION,
  opcionesDePropuesta,
  type PropuestaPayload,
} from './propuesta-tecnica-pdf.js';
import { loadNexaraLogo } from '../common/pdf/nexara-pdf-theme.js';
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
      // La oficina de la barra de contacto del modelo: ahora va al pie de la portada.
      'Malltertaiment, Explanada Puebla, Cholula, Puebla 72774, México',
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

  it('encabeza la hoja de cotización con total, anticipo y vigencia', async () => {
    const texto = textoPorHoja(await generarPropuestaTecnicaPdf({ ...payloadDePrueba(), anticipoPct: 60 })).join('\n');
    expect(texto).toContain('TOTAL (MXN)');
    expect(texto).toContain('ANTICIPO PARA INICIAR (60%)');
    expect(texto).toContain('VIGENCIA DE LOS PRECIOS');
  });

  it('no pone la tarjeta de anticipo cuando la cotización no lo pide', async () => {
    const texto = textoPorHoja(await generarPropuestaTecnicaPdf({ ...payloadDePrueba(), anticipoPct: 0 })).join('\n');
    expect(texto).toContain('TOTAL (MXN)');
    expect(texto).not.toContain('ANTICIPO PARA INICIAR');
  });

  it('sin partidas no pinta la tira de resumen: serían tres ceros sobre un vacío', async () => {
    const vacia = { ...payloadDePrueba(), grupos: [], subtotal: 0, iva: 0, total: 0, anticipoPct: 60 };
    const texto = textoPorHoja(await generarPropuestaTecnicaPdf(vacia)).join('\n');
    expect(texto).not.toContain('TOTAL (MXN)');
    expect(texto).not.toContain('ANTICIPO PARA INICIAR');
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

describe('PDF Propuesta técnica · personalización', () => {
  const hojasDe = async (p: PropuestaPayload) => textoPorHoja(await generarPropuestaTecnicaPdf(p));
  const imagenes = (pdf: Buffer) => cuentaDe(pdf, /\/Subtype \/Image/g);

  it('sin opciones y con las opciones por omisión sale el mismo documento', async () => {
    const base = payloadDePrueba();
    const sin = await hojasDe(base);
    const con = await hojasDe({ ...base, opciones: OPCIONES_POR_OMISION });
    expect(con).toEqual(sin);
  });

  it('las secciones apagadas desaparecen y el índice se renumera', async () => {
    const hojas = await hojasDe({
      ...payloadDePrueba(),
      opciones: { secciones: { objetivo: false, alcance: false, planos: false } },
    });
    const todo = hojas.join('\n');
    expect(todo).not.toContain('Objetivo del proyecto');
    expect(todo).not.toContain('ALCANCE DEL PROYECTO');
    expect(todo).not.toContain('Plano CCTV-01');
    // La cotización queda como única sección: «01» en el índice de la portada y en su apertura.
    expect(hojas[0]).toMatch(/^01\nCotización$/m);
    expect(hojas[1]).toMatch(/^01\nCotización$/m);
  });

  it('con el objetivo apagado, el alcance es la 01 y sus apartados 1.1, 1.2…', async () => {
    const todo = (await hojasDe({ ...payloadDePrueba(), opciones: { secciones: { objetivo: false } } })).join('\n');
    expect(todo).toMatch(/^01\nAlcance del proyecto$/m);
    expect(todo).toMatch(/^1\.1$/m);
    expect(todo).toMatch(/^03\nCotización$/m);
  });

  it('términos y firma se pueden quitar', async () => {
    const todo = (
      await hojasDe({ ...payloadDePrueba(), opciones: { secciones: { terminos: false, firma: false } } })
    ).join('\n');
    expect(todo).not.toContain('TÉRMINOS Y CONDICIONES');
    expect(todo).not.toContain('Luis Joel Aguilar');
  });

  it('marca y modelo, descuento por renglón, sin precio unitario y el descuento en los totales', async () => {
    const payload = payloadDePrueba();
    const partidas = payload.grupos.flatMap((g) => g.partidas);
    const primera = partidas[0]!;
    partidas[0] = {
      ...primera,
      marca: 'Hikvision',
      modelo: 'DS-2CE16D0T-EXIPF',
      descuentoPct: 10,
      lineTotal: Math.round(primera.qty * primera.unitPrice * 0.9 * 100) / 100,
    };
    payload.grupos = [{ ...payload.grupos[0]!, partidas }];
    payload.opciones = { columnas: { marcaModelo: true, descuento: true, precioUnitario: false } };
    const todo = (await hojasDe(payload)).join('\n');
    for (const esperado of ['Hikvision', 'DS-2CE16D0T-EXIPF', 'CANT.', 'DESC.', '10 %', 'DESCUENTO']) {
      expect(todo).toContain(esperado);
    }
    // Sin precio unitario la tabla no lo trae; con descuento la unidad va bajo la cantidad.
    expect(todo).not.toMatch(/^PRECIO$/m);
    expect(todo).not.toMatch(/^UNIDAD$/m);
  });

  it('la foto de un producto se embebe una sola vez aunque se repita en varias partidas', async () => {
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'nexara-propuesta-'));
    fs.writeFileSync(path.join(carpeta, 'producto.png'), loadNexaraLogo()!);
    const antes = process.env['UPLOADS_ROOT'];
    process.env['UPLOADS_ROOT'] = carpeta;
    try {
      const payload = payloadDePrueba();
      payload.grupos = payload.grupos.map((g) => ({
        ...g,
        partidas: g.partidas.map((p) => ({ ...p, imagenUrl: '/uploads/producto.png' })),
      }));
      expect(payload.grupos.flatMap((g) => g.partidas).length).toBeGreaterThan(1);
      const sinFotos = await generarPropuestaTecnicaPdf(payload);
      const conFotos = await generarPropuestaTecnicaPdf({ ...payload, opciones: { columnas: { imagen: true } } });
      expect(imagenes(conFotos)).toBe(imagenes(sinFotos) + 1);
    } finally {
      if (antes === undefined) delete process.env['UPLOADS_ROOT'];
      else process.env['UPLOADS_ROOT'] = antes;
      fs.rmSync(carpeta, { recursive: true, force: true });
    }
  });

  it('en dólares dice la moneda en el total y lleva la nota del tipo de cambio', async () => {
    const todo = (
      await hojasDe({
        ...payloadDePrueba(),
        opciones: { moneda: 'USD', tipoCambioNota: 'Tipo de cambio de referencia: 17.45 MXN por dólar.' },
      })
    ).join('\n');
    expect(todo).toContain('Importes en USD.');
    expect(todo).toContain('TOTAL USD');
    expect(todo).toContain('Tipo de cambio de referencia: 17.45 MXN por dólar.');
  });

  it('la carta de presentación va en la hoja 2, firmada por quien elaboró', async () => {
    const base = payloadDePrueba();
    const sinCarta = await hojasDe(base);
    const hojas = await hojasDe({
      ...base,
      opciones: {
        carta: {
          dirigidaA: 'Ing. Carlos Mendoza',
          cargo: 'Gerente de Compras',
          mensaje: 'Estimado ingeniero:\nGracias por la oportunidad.',
        },
        firmas: [{ nombre: 'Luis Joel Aguilar', cargo: 'Ejecutivo de proyectos', rol: 'Elaboró' }],
      },
    });
    expect(hojas).toHaveLength(sinCarta.length + 1);
    for (const esperado of [
      'CARTA DE PRESENTACIÓN',
      'DIRIGIDA A',
      'Ing. Carlos Mendoza',
      'Gerente de Compras',
      'Presente',
      'NEX-LJ75100126-0007-JA.CE',
      'Estimado ingeniero:',
      'Gracias por la oportunidad.',
      'Atentamente,',
      'Luis Joel Aguilar',
      'Ejecutivo de proyectos',
    ]) {
      expect(hojas[1]).toContain(esperado);
    }
  });

  it('dos firmas: cada una con su nombre, cargo y rol', async () => {
    const todo = (
      await hojasDe({
        ...payloadDePrueba(),
        opciones: {
          firmas: [
            { nombre: 'Luis Joel Aguilar', cargo: 'Ejecutivo de proyectos', rol: 'Elaboró' },
            { nombre: 'María Fernanda López', cargo: 'Dirección comercial', rol: 'Autorizó' },
          ],
        },
      })
    ).join('\n');
    for (const esperado of [
      'Luis Joel Aguilar',
      'Ejecutivo de proyectos',
      'Elaboró',
      'María Fernanda López',
      'Dirección comercial',
      'Autorizó',
    ]) {
      expect(todo).toContain(esperado);
    }
  });

  it('las opciones parciales se completan con los valores por omisión', () => {
    expect(opcionesDePropuesta({ currency: 'MXN' })).toEqual(OPCIONES_POR_OMISION);
    const o = opcionesDePropuesta({
      currency: 'USD',
      opciones: { secciones: { planos: false }, carta: { dirigidaA: 'X', mensaje: '   ' } },
    });
    expect(o.moneda).toBe('USD');
    expect(o.secciones).toEqual({ ...OPCIONES_POR_OMISION.secciones, planos: false });
    // Una carta sin mensaje no se imprime.
    expect(o.carta).toBeNull();
  });
});
