import { generarCotizacionNexaraPdf, formatoDesdeCotizacion } from './cotizacion-formato-nexara.js';
import { alcanceDeMemoria, calculoDelCentro, justificacionDeMemoria, normalizarMemoria, type MemoriaDiseno } from './memoria-diseno.js';
import { contenidoDesdeCotizacion, normalizarOpciones, opcionesAlGuardar } from './personalizacion.js';
import { puntosPorOmision } from './alcance-por-omision.js';
import { textoPorHoja } from '../common/pdf/texto-de-pdf.js';

const memoria = (over: Partial<MemoriaDiseno> = {}): MemoriaDiseno => ({
  calibrado: true,
  camaras: 14,
  cobertura: { cubierto: 86.2, identificacion: 3.7, reconocimiento: 49.5, observacion: 24.9, deteccion: 8.2 },
  mbps: 40.3,
  tb: 13.07,
  retencionDias: 30,
  codec: 'H.265',
  zonas: ['Recepción', 'Cuarto de TI', 'Bodega'],
  canales: 16,
  poeW: 140.5,
  poeDisponibleW: 500,
  cableM: 891,
  bobinas: 3,
  lineas: [
    { tipo: 'domo', titulo: 'Domo IP 2 MP', marca: 'AXIS', modelo: 'P3265-LV', cantidad: 3, ubicaciones: ['Recepción', 'Oficinas'], datos: ['Visión nocturna de hasta 40 m.'] },
    { tipo: 'turret', titulo: 'Turret IP 4 MP', marca: 'Dahua', modelo: 'DH-IPC-HDW2441T-S', cantidad: 11, ubicaciones: ['Bodega noroeste'], datos: [] },
  ],
  centro: [{ tipo: 'nvr', titulo: 'Grabador NVR', modelo: 'Dahua DHI-NVR4108HS', cantidad: 2, detalle: '' }],
  otros: [{ titulo: 'Sirena', modelo: 'Sirena con estrobo', cantidad: 2 }],
  levantamiento: {
    columnas: [
      { clave: 'a', titulo: 'Domo', modelo: 'P3265-LV' },
      { clave: 'b', titulo: 'Turret', modelo: 'DH-IPC-HDW2441T-S' },
    ],
    filas: [
      { nivel: 'Planta baja', zona: 'Recepción', piezas: { a: 3 } },
      { nivel: 'Planta baja', zona: 'Bodega', piezas: { b: 11 } },
    ],
  },
  ...over,
});

const partidas = [
  { name: 'Domo · AXIS P3265-LV', qty: 3, unitPrice: 1000, tax: 16, grupo: 'EQUIPOS', unit: 'pieza' },
  { name: 'Cable UTP Cat 6, bobina de 305 m', qty: 3, unitPrice: 3000, tax: 16, grupo: 'MATERIALES', unit: 'bobina' },
  { name: 'Instalación, configuración y puesta en marcha', qty: 1, unitPrice: 8000, tax: 16, grupo: 'MANO_DE_OBRA', unit: 'Servicio' },
];

const cotizacion = (over: Record<string, unknown> = {}) => ({
  quoteNumber: 'NX-1',
  issueDate: '2026-11-03',
  clientName: 'Cliente',
  projectName: 'Bodega Norte',
  segmento: 'OBRA',
  depositPercent: 50,
  items: partidas,
  ...over,
});

const texto = async (q: Record<string, unknown>) => (await textoPorHoja(await generarCotizacionNexaraPdf(q as never))).join(' ').replace(/\s+/g, ' ');

describe('normalizarMemoria', () => {
  it('sin cámaras no hay memoria', () => {
    expect(normalizarMemoria(null)).toBeNull();
    expect(normalizarMemoria({ lineas: [] })).toBeNull();
    expect(normalizarMemoria({ lineas: [{ titulo: 'Domo', cantidad: 0 }] })).toBeNull();
  });

  it('tolera datos incompletos sin tronar', () => {
    const m = normalizarMemoria({ lineas: [{ titulo: 'Domo', cantidad: 2 }], canales: 'x', levantamiento: { filas: [{ zona: 'A', piezas: { d: 'no', e: 3 } }] } });
    expect(m?.canales).toBeNull();
    expect(m?.levantamiento.filas[0]?.piezas).toEqual({ e: 3 });
  });

  it('solo acepta como foto un PNG de tamaño razonable', () => {
    const conFoto = (foto: string) => normalizarMemoria({ lineas: [{ titulo: 'Domo', cantidad: 1, foto }] })?.lineas[0]?.foto;
    expect(conFoto('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(conFoto('https://otro.sitio/x.png')).toBeNull();
    expect(conFoto(`data:image/png;base64,${'A'.repeat(170_000)}`)).toBeNull();
  });
});

describe('los textos solo dicen lo que el diseño respalda', () => {
  it('«calibrado» solo si hubo una cota medida', () => {
    expect(alcanceDeMemoria(memoria()).parrafos[0]).toContain('plano calibrado');
    expect(alcanceDeMemoria(memoria({ calibrado: false })).parrafos[0]).not.toContain('calibrado');
  });

  it('sin cobertura no promete un resultado', () => {
    expect(alcanceDeMemoria(memoria({ cobertura: null })).resultado).toBe('');
    expect(alcanceDeMemoria(memoria()).resultado).toContain('86 %');
  });

  it('los canales libres salen de la cuenta, y sin grabador no se mencionan', () => {
    expect(justificacionDeMemoria(memoria()).vinetas[0]).toContain('2 canales libres');
    expect(justificacionDeMemoria(memoria({ camaras: 16 })).vinetas[0]).not.toContain('libres');
    expect(justificacionDeMemoria(memoria({ canales: null })).vinetas.join(' ')).not.toContain('canal');
  });

  it('el dimensionamiento no inventa renglones', () => {
    expect(calculoDelCentro(memoria()).map(([e]) => e)).toEqual(['Almacenamiento requerido', 'Ancho de banda de video', 'Canales de grabación', 'Consumo PoE', 'Cableado UTP Cat 6']);
    expect(calculoDelCentro(memoria({ tb: 0, mbps: 0, canales: null, poeW: null, cableM: 0 }))).toEqual([]);
  });
});

describe('opciones de la cotización', () => {
  it('el editor no borra la memoria aunque no la mande', () => {
    const guardada = { memoria: memoria() };
    expect(opcionesAlGuardar({ tipoCambioNota: 'x' }, guardada).memoria?.camaras).toBe(14);
    expect(opcionesAlGuardar({ tipoCambioNota: 'x' }, guardada).tipoCambioNota).toBe('x');
  });

  it('el diseñador sí la reemplaza', () => {
    expect(opcionesAlGuardar({ memoria: memoria({ camaras: 3 }) }, { memoria: memoria() }).memoria?.camaras).toBe(3);
  });

  it('las referencias se recortan y lo vacío no se guarda', () => {
    expect(normalizarOpciones({ referencias: { oc: ' OC-1 ', sp: '  ', otra: 'x' } }).referencias).toEqual({ oc: 'OC-1' });
    expect(normalizarOpciones({}).referencias).toBeUndefined();
  });

  it('una plantilla no se lleva el diseño ni las referencias de ese cliente', () => {
    const contenido = contenidoDesdeCotizacion({ opciones: { memoria: memoria(), referencias: { oc: 'OC-1' } }, items: [] }, false);
    expect(contenido.opciones).not.toHaveProperty('memoria');
    expect(contenido.opciones).not.toHaveProperty('referencias');
  });
});

describe('el PDF con la memoria del diseño', () => {
  it('imprime la especificación, el centro y el levantamiento con los datos del diseño', async () => {
    const t = await texto(cotizacion({ opciones: { memoria: memoria() } }));
    expect(t).toContain('Domo IP 2 MP — 3 cámaras');
    expect(t).toContain('Ubicaciones asignadas: Recepción, Oficinas.');
    expect(t).toContain('DIMENSIONAMIENTO DEL SISTEMA');
    expect(t).toContain('13.1 TB para 30 días en H.265');
    expect(t).toContain('LEVANTAMIENTO POR ZONA');
    expect(t).toContain('Nivel de detalle alcanzado');
    expect(t).toContain('2 canales libres');
  });

  it('lo que escribió quien cotiza manda sobre lo que sale del diseño', async () => {
    const t = await texto(cotizacion({ objetivo: 'Nuestro alcance propio.', alcanceBloques: [{ clave: 'omision:especificacion', titulo: 'Equipos', texto: 'Texto propio de la especificación.', vinetas: [] }], opciones: { memoria: memoria() } }));
    expect(t).toContain('Nuestro alcance propio.');
    expect(t).toContain('Texto propio de la especificación.');
    expect(t).not.toContain('Ubicaciones asignadas');
    expect(t).not.toContain('Nivel de detalle alcanzado');
  });

  it('un punto por omisión que solo se renombró sigue saliendo del diseño', async () => {
    const sugerido = puntosPorOmision(partidas).find((b) => b.clave === 'omision:especificacion')!;
    const t = await texto(cotizacion({ alcanceBloques: [{ ...sugerido, titulo: 'Cámaras elegidas' }], opciones: { memoria: memoria() } }));
    expect(t).toContain('CÁMARAS ELEGIDAS');
    expect(t).toContain('Ubicaciones asignadas');
  });

  it('sin diseño la cotización no cambia de estructura', async () => {
    const t = await texto(cotizacion());
    expect(t).not.toContain('LEVANTAMIENTO POR ZONA');
    expect(t).not.toContain('Ubicaciones asignadas');
    expect(t).not.toContain('DIMENSIONAMIENTO');
  });
});

describe('lo que suma el esquema del 27-09 a toda cotización', () => {
  it('subtotal por grupo cuando hay más de uno', async () => {
    const t = await texto(cotizacion());
    expect(t).toContain('Subtotal A');
    expect(t).toContain('Subtotal C');
    const uno = await texto(cotizacion({ items: [partidas[0]] }));
    expect(uno).not.toContain('Subtotal A');
  });

  it('anticipo y saldo en pesos, que suman el total', async () => {
    const q = formatoDesdeCotizacion(cotizacion() as never);
    const t = await texto(cotizacion());
    expect(t).toContain('Anticipo (50 %)');
    expect(t).toContain('Saldo contra entrega');
    expect(q.total).toBeGreaterThan(0);
    const mitad = (q.total / 2).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    expect(t).toContain(`$${mitad}`);
  });

  it('con un solo pago no se imprime el esquema', async () => {
    for (const depositPercent of [0, 100]) {
      expect(await texto(cotizacion({ depositPercent }))).not.toContain('Saldo contra entrega');
    }
  });

  it('las referencias del cliente salen solo si se capturaron', async () => {
    const t = await texto(cotizacion({ opciones: { referencias: { ritm: 'RITM-77', oc: 'OC-9' } } }));
    expect(t).toContain('RITM-77');
    expect(t).toContain('ORDEN DE COMPRA');
    expect(t).not.toContain('REQUERIMIENTO');
    expect(await texto(cotizacion())).not.toContain('RITM');
  });
});
