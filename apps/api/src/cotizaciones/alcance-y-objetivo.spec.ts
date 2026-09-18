import { escribirObjetivo, leerObjetivo, objetivoDePropuesta } from './objetivo-plantilla.js';
import { normalizarBloques, plantillasDeAlcance, plantillasDeCotizacion } from './alcance-bloques.js';

/**
 * El editor de la web guarda el objetivo como texto con marcas («Beneficios:», «Cierre:») y el
 * alcance como bloques con viñetas. Estas pruebas fijan el formato: si la web y el PDF no leen lo
 * mismo, lo que se escribe no es lo que sale.
 */

describe('objetivo guardado como texto', () => {
  const partes = {
    intro:
      'Este proyecto permitirá contar con un sistema de videovigilancia más confiable.\n\nSegundo párrafo de la introducción.',
    beneficios: [
      'Mayor cobertura de vigilancia mediante la incorporación de 15 nuevas cámaras.',
      'Monitoreo remoto desde dispositivos autorizados.',
    ],
    cierre: 'Como resultado, el cliente dispondrá de una solución con mayor cobertura.',
  };

  it('ida y vuelta: lo que se escribe es lo que se lee', () => {
    expect(leerObjetivo(escribirObjetivo(partes))).toEqual(partes);
  });

  it('el texto guardado es legible sin la web', () => {
    expect(escribirObjetivo(partes)).toBe(
      [
        partes.intro,
        '',
        'Beneficios:',
        `1. ${partes.beneficios[0]}`,
        `2. ${partes.beneficios[1]}`,
        '',
        'Cierre:',
        partes.cierre,
      ].join('\n'),
    );
  });

  it('un cierre sin beneficios no se confunde con la introducción', () => {
    const texto = escribirObjetivo({ intro: 'Intro.', beneficios: [], cierre: 'Cierre.' });
    expect(leerObjetivo(texto)).toEqual({ intro: 'Intro.', beneficios: [], cierre: 'Cierre.' });
  });

  it('solo introducción se guarda tal cual (compatible con lo que ya había)', () => {
    expect(escribirObjetivo({ intro: 'Dejar el patio cubierto.', beneficios: [], cierre: '' })).toBe(
      'Dejar el patio cubierto.',
    );
    expect(leerObjetivo('Dejar el patio cubierto.')).toEqual({
      intro: 'Dejar el patio cubierto.',
      beneficios: [],
      cierre: '',
    });
  });

  it('lee un texto pegado del documento modelo, sin marcas', () => {
    const pegado = [
      'Este proyecto permitirá contar con un sistema más confiable.',
      '',
      'Entre los principales beneficios se encuentran:',
      '',
      '1. Mayor cobertura de vigilancia mediante la incorporación de 15 nuevas cámaras',
      '   y la reubicación estratégica de equipos existentes.',
      '2) Monitoreo remoto.',
      '',
      'Como resultado, el cliente dispondrá de una solución con mayor cobertura.',
    ].join('\r\n');
    expect(leerObjetivo(pegado)).toEqual({
      intro: 'Este proyecto permitirá contar con un sistema más confiable.',
      beneficios: [
        'Mayor cobertura de vigilancia mediante la incorporación de 15 nuevas cámaras y la reubicación estratégica de equipos existentes.',
        'Monitoreo remoto.',
      ],
      cierre: 'Como resultado, el cliente dispondrá de una solución con mayor cobertura.',
    });
  });

  it('los beneficios con salto de línea se guardan en un renglón', () => {
    const texto = escribirObjetivo({ intro: '', beneficios: ['Uno\ncon dos renglones', '  ', 'Dos'], cierre: '' });
    expect(texto).toBe('Beneficios:\n1. Uno con dos renglones\n2. Dos');
  });

  it('vacío es vacío', () => {
    expect(leerObjetivo(null)).toEqual({ intro: '', beneficios: [], cierre: '' });
    expect(escribirObjetivo({ intro: ' ', beneficios: [], cierre: '' })).toBe('');
  });
});

describe('objetivo en el PDF', () => {
  const partidas = [
    { grupo: 'EQUIPOS', name: 'Cámara bala', qty: 8, unitPrice: 592.42 },
    { grupo: 'MANO_DE_OBRA', name: 'Instalación', qty: 8, unitPrice: 1000 },
  ];

  it('los beneficios escritos mandan sobre los calculados', () => {
    const objetivo = objetivoDePropuesta({
      segmento: 'COMERCIAL',
      partidas,
      objetivoLibre: escribirObjetivo({ intro: 'Intro.', beneficios: ['Uno.', 'Dos.'], cierre: '' }),
    });
    expect(objetivo.intro).toBe('Intro.');
    expect(objetivo.beneficios).toEqual(['Uno.', 'Dos.']);
    // Sin cierre escrito va el del segmento.
    expect(objetivo.cierre).toContain('Como resultado');
  });

  it('sin beneficios escritos salen de las partidas, con la cifra real', () => {
    const objetivo = objetivoDePropuesta({
      segmento: 'COMERCIAL',
      partidas,
      objetivoLibre: escribirObjetivo({ intro: 'Intro.', beneficios: [], cierre: 'Mi cierre.' }),
    });
    expect(objetivo.beneficios.join(' ')).toContain('8 equipos nuevos');
    expect(objetivo.cierre).toBe('Mi cierre.');
  });
});

describe('bloques de alcance', () => {
  it('deja título, párrafo y viñetas limpios', () => {
    const [bloque] = normalizarBloques([
      {
        clave: 'libre-1',
        titulo: '  Mantenimiento de la infraestructura existente ',
        texto: 'Como parte del mantenimiento se realizarán las siguientes actividades:\r\n',
        vinetas: ['• Recableado de las 14 cámaras.', '', '- Sustitución de balunes de video.', '   '],
      },
    ]);
    expect(bloque).toEqual({
      clave: 'libre-1',
      titulo: 'Mantenimiento de la infraestructura existente',
      texto: 'Como parte del mantenimiento se realizarán las siguientes actividades:',
      vinetas: ['Recableado de las 14 cámaras.', 'Sustitución de balunes de video.'],
    });
  });

  it('lee los bloques que ya había (paquetes sin viñetas, viñetas en texto)', () => {
    const bloques = normalizarBloques([
      { clave: 'paquete:camara-bala-instalada', titulo: 'Cámara bala instalada', texto: '8 cámaras', parametros: { cantidad: 8 } },
      { titulo: 'Exclusiones', vinetas: 'Obra civil\nPermisos' },
    ]);
    expect(bloques[0]).toEqual({
      clave: 'paquete:camara-bala-instalada',
      titulo: 'Cámara bala instalada',
      texto: '8 cámaras',
      vinetas: [],
      parametros: { cantidad: 8 },
    });
    expect(bloques[1]!.clave).toBe('libre-2');
    expect(bloques[1]!.vinetas).toEqual(['Obra civil', 'Permisos']);
  });

  it('quita los bloques vacíos: en el PDF saldrían como un número sin nada', () => {
    expect(normalizarBloques([{ titulo: ' ', texto: '', vinetas: [' '] }, null, 'x'])).toEqual([]);
    expect(normalizarBloques('no es lista')).toEqual([]);
  });

  it('dos bloques con la misma clave no se pisan', () => {
    const bloques = normalizarBloques([
      { clave: 'plantilla:exclusiones', titulo: 'A' },
      { clave: 'plantilla:exclusiones', titulo: 'B' },
    ]);
    expect(new Set(bloques.map((b) => b.clave)).size).toBe(2);
  });

  it('ofrece las doce subsecciones de la propuesta modelo, en su orden', () => {
    expect(plantillasDeAlcance('COMERCIAL').map((b) => b.titulo)).toEqual([
      'Modernización del sistema de grabación',
      'Mantenimiento de la infraestructura existente',
      'Diagnóstico y recuperación de cámaras existentes',
      'Reubicación de cámaras existentes',
      'Ampliación del sistema de videovigilancia',
      'Instalación de poste para vigilancia',
      'Configuración de analíticos de video',
      'Integración y puesta en marcha',
      'Parámetros de almacenamiento',
      'Consideraciones de operación',
      'Exclusiones del proyecto',
      'Entrega del sistema',
    ]);
  });

  it('las plantillas no traen cantidades del proyecto (esas las pone quien cotiza)', () => {
    for (const b of plantillasDeAlcance('COMERCIAL')) {
      expect(`${b.texto} ${b.vinetas.join(' ')}`).not.toMatch(/\b\d+\s+(cámaras|canales|metros)/);
    }
  });

  it('cada segmento tiene exclusiones y entrega propias', () => {
    const obra = plantillasDeAlcance('OBRA');
    const licitacion = plantillasDeAlcance('LICITACION');
    const claves = obra.map((b) => b.clave);
    expect(new Set(claves).size).toBe(claves.length);
    expect(obra.find((b) => b.clave === 'plantilla:exclusiones')!.vinetas.join(' ')).toContain('Permisos');
    expect(licitacion.find((b) => b.clave === 'plantilla:entrega')!.texto).toContain('bases');
  });

  it('las plantillas no se comparten por referencia (editarlas no cambia las de otra cotización)', () => {
    const a = plantillasDeAlcance('COMERCIAL');
    a[0]!.vinetas.push('extra');
    expect(plantillasDeAlcance('COMERCIAL')[0]!.vinetas).not.toContain('extra');
  });

  it('hay plantillas para los cuatro segmentos', () => {
    const todas = plantillasDeCotizacion();
    expect(todas.map((p) => p.segmento)).toEqual(['COMERCIAL', 'OBRA', 'LICITACION', 'SERVICIO']);
    for (const p of todas) {
      expect(p.objetivo.intro.length).toBeGreaterThan(20);
      expect(p.bloques).toHaveLength(12);
    }
  });
});
