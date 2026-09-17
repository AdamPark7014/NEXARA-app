import {
  agruparPartidas,
  grupoDePartida,
  incluyeInstalacion,
  totalesPorGrupo,
} from './partidas-grupos.js';
import {
  diasDeVigencia,
  modalidadDeCotizacion,
  normalizarSegmento,
  terminosDeCotizacion,
} from './terminos-segmento.js';

/** Partidas tomadas de la propuesta modelo (`Primera cotizacion .pdf`). */
const PARTIDAS = [
  { name: 'Bala TURBOHD 2 Megapixel (1080p) / Lente 3.6 mm', unit: 'Pieza', qty: 8, unitPrice: 592.42, lineTotal: 4739.36 },
  { name: 'DVR 32 Canales TurboHD + 8 Canales IP', unit: 'Pieza', qty: 1, unitPrice: 7532.55, lineTotal: 7532.55 },
  { name: 'Instalacion de camara de seguridad puesta a punto', unit: 'Servicio', qty: 15, unitPrice: 1000, lineTotal: 15000 },
  { name: 'reinstalacion de cable y habilitacion de camara de seguridad', unit: 'Servicio', qty: 14, unitPrice: 500, lineTotal: 7000 },
  { name: 'insumos materiales para puesta a punto de CCTV', unit: 'Insumo', qty: 1, unitPrice: 5000, lineTotal: 5000 },
  { name: 'Kit de Transceptores (Baluns) con Terminal PUSH SUPERIOR', unit: 'Pieza', qty: 29, unitPrice: 47, lineTotal: 1363 },
  { name: 'Bobina de Cable de 305 Metros Cat5e', unit: 'Pieza', qty: 3, unitPrice: 753.92, lineTotal: 2261.76 },
];

describe('agrupación Equipos / Materiales / Mano de obra', () => {
  it('manda el grupo que eligió quien cotiza', () => {
    expect(grupoDePartida({ grupo: 'MATERIALES', name: 'Camara bala' })).toBe('MATERIALES');
  });

  it('la instalación y la reinstalación son mano de obra', () => {
    expect(grupoDePartida(PARTIDAS[2]!)).toBe('MANO_DE_OBRA');
    expect(grupoDePartida(PARTIDAS[3]!)).toBe('MANO_DE_OBRA');
  });

  it('baluns, cable e insumos son materiales', () => {
    expect(grupoDePartida(PARTIDAS[4]!)).toBe('MATERIALES');
    expect(grupoDePartida(PARTIDAS[5]!)).toBe('MATERIALES');
    expect(grupoDePartida(PARTIDAS[6]!)).toBe('MATERIALES');
  });

  it('cámaras y grabador son equipos', () => {
    expect(grupoDePartida(PARTIDAS[0]!)).toBe('EQUIPOS');
    expect(grupoDePartida(PARTIDAS[1]!)).toBe('EQUIPOS');
  });

  it('una línea con horas de mano de obra es mano de obra aunque el nombre no lo diga', () => {
    expect(grupoDePartida({ name: 'Trabajo en sitio', laborHours: 8, laborRate: 350 })).toBe('MANO_DE_OBRA');
  });

  it('suma los subtotales de cada grupo', () => {
    const totales = totalesPorGrupo(PARTIDAS);
    expect(totales.EQUIPOS).toBeCloseTo(12271.91, 2);
    expect(totales.MATERIALES).toBeCloseTo(8624.76, 2);
    expect(totales.MANO_DE_OBRA).toBeCloseTo(22000, 2);
  });

  it('el total agrupado es el mismo que la suma de todas las partidas', () => {
    const totales = totalesPorGrupo(PARTIDAS);
    const suma = totales.EQUIPOS + totales.MATERIALES + totales.MANO_DE_OBRA;
    expect(suma).toBeCloseTo(
      PARTIDAS.reduce((acc, p) => acc + p.lineTotal, 0),
      2,
    );
  });

  it('no imprime grupos vacíos', () => {
    const grupos = agruparPartidas([PARTIDAS[0]!]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]!.grupo).toBe('EQUIPOS');
  });

  it('calcula el importe cuando la línea no trae total guardado', () => {
    const totales = totalesPorGrupo([{ name: 'Camara', qty: 2, unitPrice: 100 }]);
    expect(totales.EQUIPOS).toBe(200);
  });
});

describe('términos según el segmento y lo que se cobra', () => {
  it('la propuesta modelo cobra instalación: sus términos no pueden decir «solo suministro»', () => {
    expect(incluyeInstalacion(PARTIDAS)).toBe(true);
    const terminos = terminosDeCotizacion({ segmento: 'COMERCIAL', incluyeInstalacion: true });
    expect(terminos.modalidad).toBe('SUMINISTRO_INSTALACION');
    expect(terminos.lineas.join(' ')).toContain('mano de obra de instalación');
    expect(terminos.lineas.join(' ')).not.toContain('No se incluyen servicios de instalación');
  });

  it('comercial sin mano de obra sí es solo suministro', () => {
    const terminos = terminosDeCotizacion({ segmento: 'COMERCIAL', incluyeInstalacion: false });
    expect(terminos.modalidad).toBe('SUMINISTRO');
    expect(terminos.lineas.join(' ')).toContain('únicamente el suministro');
  });

  it('obra y servicio siempre son suministro e instalación', () => {
    expect(modalidadDeCotizacion({ segmento: 'OBRA', incluyeInstalacion: false })).toBe('SUMINISTRO_INSTALACION');
    expect(modalidadDeCotizacion({ segmento: 'SERVICIO', incluyeInstalacion: false })).toBe('SUMINISTRO_INSTALACION');
  });

  it('en licitación mandan las bases, no nuestro anticipo', () => {
    const terminos = terminosDeCotizacion({ segmento: 'LICITACION', incluyeInstalacion: true, anticipoPct: 50 });
    expect(terminos.modalidad).toBe('LICITACION');
    expect(terminos.lineas.join(' ')).toContain('bases de la licitación');
    expect(terminos.lineas.join(' ')).not.toContain('50 % de anticipo');
  });

  it('respeta el anticipo capturado y calcula el resto', () => {
    const terminos = terminosDeCotizacion({ segmento: 'OBRA', incluyeInstalacion: true, anticipoPct: 60 });
    expect(terminos.lineas[0]).toContain('60 %');
    expect(terminos.lineas[0]).toContain('40 %');
  });

  it('sin anticipo capturado usa el 50 % de la propuesta modelo', () => {
    const terminos = terminosDeCotizacion({ segmento: 'COMERCIAL', incluyeInstalacion: false, anticipoPct: 0 });
    expect(terminos.lineas[0]).toContain('50 %');
  });

  it('agrega la vigencia cuando hay fecha de vencimiento', () => {
    const dias = diasDeVigencia('2026-09-17', '2026-10-02');
    expect(dias).toBe(15);
    const terminos = terminosDeCotizacion({ segmento: 'COMERCIAL', incluyeInstalacion: false, vigenciaDias: dias });
    expect(terminos.lineas.at(-1)).toContain('15 días naturales');
  });

  it('normaliza el segmento que llegue del cliente', () => {
    expect(normalizarSegmento('licitación')).toBe('LICITACION');
    expect(normalizarSegmento('obra')).toBe('OBRA');
    expect(normalizarSegmento(undefined)).toBe('COMERCIAL');
  });
});
