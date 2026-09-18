import {
  escribirTerminosPersonalizados,
  leerTerminosPersonalizados,
  terminosDeCotizacion,
  terminosPorOmision,
} from './terminos-segmento.js';
import { ordenarPlanos } from './planos-cotizacion.js';

/**
 * Términos editables por partes (forma de pago, alcance de la cotización, no incluye,
 * disponibilidad) y planos que desde el PUT solo se reordenan o renombran.
 */

describe('términos por partes', () => {
  const base = { segmento: 'COMERCIAL', incluyeInstalacion: true, anticipoPct: 50, vigenciaDias: 15 };

  it('salen con título, en el orden de la propuesta modelo, y la vigencia al final', () => {
    const t = terminosDeCotizacion(base);
    expect(t.partes.map((p) => p.titulo)).toEqual([
      'Forma de pago',
      'Alcance de la cotización',
      'No incluye',
      'Disponibilidad',
      'Vigencia de esta propuesta',
    ]);
    expect(t.lineas[0]).toBe(`Forma de pago: ${t.partes[0]!.texto}`);
    expect(t.partes.every((p) => !p.personalizado)).toBe(true);
  });

  it('lo reescrito manda sobre el texto del segmento, parte por parte', () => {
    const note = escribirTerminosPersonalizados({ noIncluye: 'Obra civil y permisos.' });
    const t = terminosDeCotizacion({ ...base, personalizados: note });
    const noIncluye = t.partes.find((p) => p.clave === 'noIncluye')!;
    expect(noIncluye.texto).toBe('Obra civil y permisos.');
    expect(noIncluye.personalizado).toBe(true);
    // Lo que no se tocó sigue al anticipo aunque cambie.
    const conOtroAnticipo = terminosDeCotizacion({ ...base, anticipoPct: 70, personalizados: note });
    expect(conOtroAnticipo.partes[0]!.texto).toContain('70 %');
    expect(conOtroAnticipo.partes[0]!.personalizado).toBe(false);
  });

  it('guardar y leer lo reescrito es ida y vuelta', () => {
    const propios = { pago: 'Contado.', disponibilidad: 'Entrega en 5 días hábiles.\nSujeto a existencias.' };
    expect(leerTerminosPersonalizados(escribirTerminosPersonalizados(propios))).toEqual(propios);
    expect(escribirTerminosPersonalizados({})).toBe('');
  });

  it('una nota vieja sin títulos no se pierde: sale como «Otras condiciones»', () => {
    const t = terminosDeCotizacion({ ...base, personalizados: 'Precios en dólares al tipo de cambio del día.' });
    const otras = t.partes.find((p) => p.clave === 'otras')!;
    expect(otras.titulo).toBe('Otras condiciones');
    expect(otras.texto).toBe('Precios en dólares al tipo de cambio del día.');
    expect(t.partes.at(-1)!.clave).toBe('vigencia');
  });

  it('acepta el título en el mismo renglón y sin acentos', () => {
    expect(
      leerTerminosPersonalizados('Forma de pago: 100 % anticipado\nAlcance de la cotizacion:\nSolo equipo.'),
    ).toEqual({ pago: '100 % anticipado', alcance: 'Solo equipo.' });
  });

  it('reescribir con el mismo texto del segmento no lo marca como propio', () => {
    const omision = terminosPorOmision(base);
    const t = terminosDeCotizacion({
      ...base,
      personalizados: escribirTerminosPersonalizados({ pago: omision.pago }),
    });
    expect(t.partes[0]!.personalizado).toBe(false);
  });
});

describe('planos desde el PUT', () => {
  const guardados = [
    { url: '/uploads/cotizaciones-planos/1-a.png', nombre: 'Planta baja', tipo: 'imagen', origen: 'cotizacion' },
    { url: '/uploads/cotizaciones-planos/1-b.pdf', nombre: 'CCTV-01', tipo: 'pdf', origen: 'cotizacion' },
  ];

  it('reordena y renombra los que ya estaban', () => {
    const salida = ordenarPlanos(guardados, [
      { url: guardados[1]!.url, nombre: '  Sembrado de cámaras  ' },
      { url: guardados[0]!.url, nombre: '' },
    ]);
    expect(salida.map((p) => p.nombre)).toEqual(['Sembrado de cámaras', 'Planta baja']);
    expect(salida[0]!.tipo).toBe('pdf');
  });

  it('una URL que no estaba no entra (el PDF lee los planos del disco)', () => {
    const salida = ordenarPlanos(guardados, [{ url: '/uploads/otro/archivo-ajeno.png', nombre: 'x' }]);
    expect(salida.map((p) => p.url)).toEqual(guardados.map((p) => p.url));
  });

  it('un plano que no se mandó no se pierde', () => {
    const salida = ordenarPlanos(guardados, [{ url: guardados[1]!.url }]);
    expect(salida.map((p) => p.url)).toEqual([guardados[1]!.url, guardados[0]!.url]);
  });
});
