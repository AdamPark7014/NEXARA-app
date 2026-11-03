import { PROMPT_REDACTAR, peticionRedactar, revisarRedaccion, type PartidaParaRedactar } from './redactar-ia';

const LECTOR: PartidaParaRedactar = {
  name: 'Lector de códigos de barras manual cableado',
  description: 'Campo de visión de 39° horizontal. Interfaz USB 2.0.',
  brand: 'Hikrobot',
  model: 'MV-IDH2000/13NR',
  unit: 'Pieza',
  qty: 110,
  unitPrice: 2036,
};
const IMPRESORA: PartidaParaRedactar = { name: 'Impresora de etiquetas', brand: 'Zebra', model: 'ZD421D', unit: 'Pieza', qty: 30, unitPrice: 8952 };
const SERVICIO: PartidaParaRedactar = { name: 'Instalación y puesta en marcha', unit: 'Servicio', qty: 1, unitPrice: 5000 };

const conIntro = (intro: string) => ({ proyecto: '', intro, beneficios: [], resultado: '', puntos: [] });

describe('petición de «Redactar con IA»', () => {
  it('no manda cliente, proyecto ni precios', () => {
    const p = peticionRedactar({ partidas: [{ ...LECTOR, unitCost: 1500 } as PartidaParaRedactar], segmento: 'COMERCIAL', titulos: ['Uno'] });
    const datos = JSON.parse(p.usuario);
    expect(Object.keys(datos).sort()).toEqual(['conManoDeObra', 'indicacion', 'partidas', 'segmento', 'titulos']);
    expect(Object.keys(datos.partidas[0]).sort()).toEqual(['cantidad', 'ficha', 'grupo', 'marca', 'modelo', 'nombre', 'unidad']);
    expect(p.usuario).not.toContain('2036');
    expect(p.usuario).not.toContain('1500');
  });

  it('dice el grupo de cada partida: de ahí sale si se puede hablar de instalación', () => {
    const { partidas, conManoDeObra } = JSON.parse(peticionRedactar({ partidas: [LECTOR, SERVICIO], titulos: [] }).usuario);
    expect(partidas.map((x: { grupo: string }) => x.grupo)).toEqual(['EQUIPOS', 'MANO_DE_OBRA']);
    expect(conManoDeObra).toBe(true);
    expect(JSON.parse(peticionRedactar({ partidas: [LECTOR], titulos: [] }).usuario).conManoDeObra).toBe(false);
  });

  it('con muchas partidas manda las de más peso', () => {
    const partidas = Array.from({ length: 40 }, (_, i) => ({ name: `Equipo ${i}`, unit: 'Pieza', qty: 1, unitPrice: i }));
    const enviadas = JSON.parse(peticionRedactar({ partidas, titulos: [] }).usuario).partidas;
    expect(enviadas).toHaveLength(30);
    expect(enviadas[0].nombre).toBe('Equipo 39');
  });

  it('corta nombres y fichas largas, sin partir una palabra', () => {
    const { partidas } = JSON.parse(peticionRedactar({ partidas: [{ name: 'palabra '.repeat(60), description: 'detalle '.repeat(100), qty: 1 }], titulos: [] }).usuario);
    expect(partidas[0].nombre.length).toBeLessThanOrEqual(121);
    expect(partidas[0].nombre.endsWith('palabra…')).toBe(true);
    expect(partidas[0].ficha.length).toBeLessThanOrEqual(321);
  });

  it('el prompt es estable: lo variable no entra en él, para que la caché sirva', () => {
    expect(peticionRedactar({ partidas: [LECTOR], titulos: ['X'] }).sistema).toEqual([PROMPT_REDACTAR]);
  });
});

describe('revisión de lo que escribió la IA', () => {
  const entrada = { partidas: [LECTOR, IMPRESORA] };

  it('lo que sale de las partidas se queda', () => {
    const { salida, quitadas } = revisarRedaccion(
      {
        proyecto: 'Suministro de lectores e impresoras',
        intro: 'NEXARA propone 110 lectores y 30 impresoras.',
        beneficios: ['Lectura: campo de visión de 39° e interfaz USB 2.0.'],
        resultado: 'Equipos listos para integrarse a su operación.',
        puntos: [{ texto: 'Lectura manual de códigos.', vinetas: ['MV-IDH2000/13NR: lector manual.', 'ZD421D: impresora de etiquetas.'] }],
      },
      entrada,
    );
    expect(quitadas).toEqual([]);
    expect(salida.proyecto).toBe('Suministro de lectores e impresoras');
    expect(salida.beneficios).toHaveLength(1);
    expect(salida.puntos[0]!.vinetas).toHaveLength(2);
  });

  it('una cifra que no viene en las partidas se va con su frase, y la otra se queda', () => {
    const { salida, quitadas } = revisarRedaccion(conIntro('Lectura confiable. Visión panorámica de 360 grados.'), entrada);
    expect(salida.intro).toBe('Lectura confiable.');
    expect(quitadas).toEqual(['cifra 360']);
  });

  it('un número no pasa por ser parte de otro: 12 no es 112', () => {
    const { salida } = revisarRedaccion(conIntro('Protección por 12 años.'), { partidas: [{ name: 'Cámara', qty: 112 }] });
    expect(salida.intro).toBe('');
  });

  it('sumar las piezas sí vale: 140 equipos cuando son 110 y 30', () => {
    expect(revisarRedaccion(conIntro('Son 140 equipos.'), entrada).quitadas).toEqual([]);
  });

  it('una cifra con otro formato sigue siendo la misma', () => {
    expect(revisarRedaccion(conIntro('Mide 16,2 mm.'), { partidas: [{ name: 'Lector', description: 'Dimensiones 123x70x16.2 mm', qty: 1 }] }).quitadas).toEqual([]);
  });

  it('un modelo inventado se quita', () => {
    const { salida, quitadas } = revisarRedaccion({ ...conIntro(''), beneficios: ['DS-2CD1143: cámara domo.'] }, entrada);
    expect(salida.beneficios).toEqual([]);
    expect(quitadas).toEqual(['cifra ds-2cd1143']);
  });

  it('una marca que nadie cotizó se quita', () => {
    expect(revisarRedaccion(conIntro('Con cámaras Hikvision de línea.'), entrada).quitadas).toEqual(['marca hikvision']);
    expect(revisarRedaccion(conIntro('Con lectores Hikrobot.'), entrada).quitadas).toEqual([]);
  });

  describe('sin mano de obra no se promete instalación', () => {
    it.each(['Quedan instalados en sitio.', 'Incluye la instalación.', 'Con puesta en marcha.', 'Incluye capacitación.', 'Configurado para su red.'])('«%s»', (frase) => {
      expect(revisarRedaccion(conIntro(frase), entrada).salida.intro).toBe('');
    });

    it('«en sus instalaciones» no es una promesa', () => {
      expect(revisarRedaccion(conIntro('Se usan en sus instalaciones.'), entrada).quitadas).toEqual([]);
    });

    it('«la misma configuración de hardware» tampoco', () => {
      expect(revisarRedaccion(conIntro('Todas comparten la misma configuración de hardware.'), entrada).quitadas).toEqual([]);
    });

    it('si se cobra, se puede decir', () => {
      expect(revisarRedaccion(conIntro('Incluye la instalación.'), { partidas: [LECTOR, SERVICIO] }).quitadas).toEqual([]);
    });
  });

  it('«cobertura» solo si hay cámaras o antenas', () => {
    expect(revisarRedaccion(conIntro('Mayor cobertura.'), entrada).quitadas).toEqual(['cobertura']);
    expect(revisarRedaccion(conIntro('Mayor cobertura.'), { partidas: [{ name: 'Cámara domo', qty: 2 }] }).quitadas).toEqual([]);
  });

  it('precio y garantía van en otra parte del documento', () => {
    expect(revisarRedaccion(conIntro('El mejor precio.'), entrada).salida.intro).toBe('');
    expect(revisarRedaccion(conIntro('Con garantía del fabricante.'), entrada).salida.intro).toBe('');
    expect(revisarRedaccion(conIntro('Con vigencia de un año.'), entrada).salida.intro).toBe('');
  });

  it('salvo que sea lo que se vende: una extensión de garantía, una licencia con vigencia', () => {
    const extension = { partidas: [{ name: 'Extensión de garantía', description: 'Vigencia de un año', qty: 1 }] };
    expect(revisarRedaccion(conIntro('Amplía la garantía con vigencia de un año.'), extension).quitadas).toEqual([]);
    expect(revisarRedaccion(conIntro('El mejor precio.'), extension).quitadas).toEqual(['precio']);
    expect(revisarRedaccion(conIntro('Con vigencia de un año.'), { partidas: [{ name: 'Licencia de software 1 año', qty: 5 }] }).quitadas).toEqual([]);
  });

  it('lo que aclaró quien cotiza cuenta como dato', () => {
    const { quitadas } = revisarRedaccion(conIntro('Para el almacén 3.'), { partidas: [LECTOR], indicacion: 'es para el almacén 3' });
    expect(quitadas).toEqual([]);
  });

  it('limpia viñetas pegadas y respeta los topes', () => {
    const { salida } = revisarRedaccion({ ...conIntro(''), beneficios: ['• Uno', '- Dos', 'Tres', 'Cuatro'], puntos: [{ texto: '', vinetas: ['a', 'b', 'c', 'd', 'e', 'f'] }] }, entrada);
    expect(salida.beneficios).toEqual(['Uno', 'Dos', 'Tres']);
    expect(salida.puntos[0]!.vinetas).toHaveLength(5);
  });

  it('un título demasiado largo o dudoso se descarta: el PDF pone el suyo', () => {
    expect(revisarRedaccion({ ...conIntro(''), proyecto: 'Suministro '.repeat(12) }, entrada).salida.proyecto).toBe('');
    expect(revisarRedaccion({ ...conIntro(''), proyecto: 'Instalación de lectores' }, entrada).salida.proyecto).toBe('');
  });

  it('una respuesta incompleta no truena', () => {
    expect(revisarRedaccion(null, entrada).salida).toEqual({ proyecto: '', intro: '', beneficios: [], resultado: '', puntos: [] });
    expect(revisarRedaccion({ puntos: [null as never] }, entrada).salida.puntos).toEqual([{ texto: '', vinetas: [] }]);
  });
});
