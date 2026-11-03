import { RedactarTextosService } from './redactar-textos.service';

const USO = { modelo: 'claude-haiku-5-5', tokensEntrada: 800, tokensSalida: 900, tokensCacheLeidos: 0, tokensCacheEscritos: 0, tokensPensamiento: 0, usdAprox: 0.0006 };
const PARTIDAS = [
  { name: 'Lector de códigos de barras', model: 'MV-IDH2000', unit: 'Pieza', qty: 110, unitPrice: 2036 },
  { name: 'Impresora de etiquetas', model: 'ZD421D', unit: 'Pieza', qty: 30, unitPrice: 8952 },
];
const REDACTADO = {
  proyecto: 'Suministro de lectores e impresoras',
  intro: 'NEXARA propone 110 lectores y 30 impresoras.',
  beneficios: ['Lectura: códigos de barras al momento.'],
  resultado: 'Equipos listos para integrarse a su operación.',
  puntos: [
    { texto: 'Por qué estos equipos.', vinetas: ['Lectura: manual.'] },
    { texto: 'Qué gana la operación.', vinetas: [] },
    { texto: 'Los equipos.', vinetas: ['MV-IDH2000: lector.', 'ZD421D: impresora.'] },
    { texto: 'Uso diario.', vinetas: [] },
  ],
};

function armar(cambios: { disponible?: boolean; json?: jest.Mock } = {}) {
  const json = cambios.json ?? jest.fn(async () => ({ datos: REDACTADO, uso: USO }));
  const claude = { disponible: () => cambios.disponible ?? true, json };
  return { service: new RedactarTextosService(claude as never), json };
}

describe('RedactarTextosService', () => {
  it('sin empresa no entra', async () => {
    await expect(armar().service.redactar({ partidas: PARTIDAS }, null)).rejects.toThrow('Empresa requerida');
  });

  it('sin partidas no gasta nada', async () => {
    const { service, json } = armar();
    await expect(service.redactar({ partidas: [{ name: '  ', qty: 1 }] }, 1)).rejects.toThrow('Agrega al menos una partida');
    expect(json).not.toHaveBeenCalled();
  });

  it('entrega los textos de la IA con los títulos del diseño', async () => {
    const { service, json } = armar();
    const r = await service.redactar({ partidas: PARTIDAS, segmento: 'COMERCIAL' }, 7);
    expect(r.via).toBe('ia');
    expect(r.proyecto).toBe('Suministro de lectores e impresoras');
    expect(r.objetivo).toEqual({ intro: REDACTADO.intro, beneficios: REDACTADO.beneficios, cierre: REDACTADO.resultado });
    expect(r.bloques.map((b) => b.titulo)).toEqual([
      'Justificación tecnológica',
      'Beneficios de la solución',
      'Especificación funcional de los equipos seleccionados',
      'Operación y continuidad del servicio',
    ]);
    expect(r.bloques[2]).toMatchObject({ clave: 'ia:especificacion', texto: 'Los equipos.', vinetas: ['MV-IDH2000: lector.', 'ZD421D: impresora.'] });
    expect(r.uso).toEqual(USO);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ proceso: 'cotizacion-redactar', companyId: 7 }));
  });

  it('la IA recibe los títulos que van a salir', async () => {
    const { service, json } = armar();
    await service.redactar({ partidas: [{ name: 'Mantenimiento preventivo', unit: 'Servicio', qty: 1 }] }, 1);
    const { titulos } = JSON.parse(json.mock.calls[0][0].usuario);
    expect(titulos[2]).toBe('Especificación de los servicios');
  });

  it('una venta de licencias conserva su título', async () => {
    const { service } = armar();
    const r = await service.redactar({ partidas: [{ name: 'Licencia anual', unit: 'Licencia', qty: 5 }] }, 1);
    expect(r.bloques[2]!.titulo).toBe('Especificación funcional de las licencias seleccionadas');
  });

  it('la indicación llega a la IA y cuenta como dato al revisar', async () => {
    const json = jest.fn(async () => ({ datos: { ...REDACTADO, intro: 'Para el almacén 3.' }, uso: USO }));
    const { service } = armar({ json });
    const r = await service.redactar({ partidas: PARTIDAS, indicacion: 'es para el almacén 3' }, 1);
    expect(JSON.parse((json.mock.calls[0] as unknown as [{ usuario: string }])[0].usuario).indicacion).toBe('es para el almacén 3');
    expect(r.objetivo.intro).toBe('Para el almacén 3.');
  });

  it('lo que la revisión quita lo cubre el texto general, parte por parte', async () => {
    const json = jest.fn(async () => ({
      datos: {
        ...REDACTADO,
        intro: 'Queda instalado en sitio.',
        beneficios: ['Visión de 360 grados.'],
        puntos: [{ texto: 'Se configura en sitio con instalación.', vinetas: ['Con instalación.'] }, ...REDACTADO.puntos.slice(1)],
      },
      uso: USO,
    }));
    const r = await armar({ json }).service.redactar({ partidas: PARTIDAS, segmento: 'COMERCIAL' }, 1);
    expect(r.via).toBe('ia');
    expect(r.quitadas).toBe(4);
    expect(r.objetivo.intro).toMatch(/^Este proyecto permitirá/);
    expect(r.objetivo.beneficios[0]).toMatch(/^Equipamiento: 140 equipos/);
    expect(r.objetivo.cierre).toBe(REDACTADO.resultado);
    expect(r.bloques[0]!.texto).toMatch(/^La solución se definió/);
    expect(r.bloques[1]!.texto).toBe('Qué gana la operación.');
  });

  it('si la IA falla, los textos generales y sin título: nunca se queda sin nada', async () => {
    const json = jest.fn(async () => {
      throw new Error('La IA no respondió');
    });
    const r = await armar({ json }).service.redactar({ partidas: PARTIDAS, segmento: 'COMERCIAL' }, 1);
    expect(r).toMatchObject({ via: 'general', proyecto: null, quitadas: 0, uso: null });
    expect(r.objetivo.intro).toMatch(/^Este proyecto permitirá/);
    expect(r.bloques).toHaveLength(4);
    expect(r.bloques[0]!.clave).toBe('omision:justificacion');
  });

  it('sin IA configurada no intenta llamarla', async () => {
    const { service, json } = armar({ disponible: false });
    expect((await service.redactar({ partidas: PARTIDAS }, 1)).via).toBe('general');
    expect(json).not.toHaveBeenCalled();
  });
});
