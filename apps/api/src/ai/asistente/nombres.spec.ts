import {
  buscar,
  corregidoDe,
  corregirEnTexto,
  distancia,
  mencion,
  nombresPropiosDe,
  palabrasDe,
  parecido,
  puntajeAproximado,
  sonido,
} from './nombres.js';

const personas = [
  { id: 1, nombre: 'Yahir Benítez Rosas' },
  { id: 2, nombre: 'Salvador Ortiz Bravo' },
  { id: 3, nombre: 'Erik Solís Prado' },
  { id: 4, nombre: 'José Antonio Ramírez' },
  { id: 5, nombre: 'Josué Cervantes' },
];
const clientes = [
  { id: 101, name: 'Grupo Tox' },
  { id: 106, name: 'Brooks Coffee' },
  { id: 107, name: 'Super Kwik' },
  { id: 108, name: 'Transportes Coatzacoalcos' },
  { id: 109, name: 'TPM Industrial' },
  { id: 110, name: 'Benemérita Universidad Autónoma de Puebla' },
];

describe('nombres mal oídos o mal escritos', () => {
  it('suenan igual: inglés del dictado, k/c/qu, s/z, b/v, h muda, ll/y', () => {
    expect(sonido('talks')).toBe(sonido('toks'));
    expect(sonido('toks')).toBe(sonido('tox'));
    expect(sonido('cofi')).toBe(sonido('coffee'));
    expect(sonido('bruks')).toBe(sonido('brooks'));
    expect(sonido('eric')).toBe(sonido('erik'));
    expect(sonido('asael')).toBe(sonido('azael'));
    expect(sonido('sefora')).toBe(sonido('sephora'));
    expect(sonido('chop')).toBe(sonido('shop'));
    expect(sonido('jerardo')).toBe(sonido('gerardo'));
    expect(sonido('jose')).not.toBe(sonido('josue'));
  });

  it('distancia de edición con transposición', () => {
    expect(distancia('kuatsakualkos', 'koatsakoalkos')).toBe(2);
    expect(distancia('rimaires', 'ramires')).toBe(2);
    expect(distancia('ab', 'ba')).toBe(1);
    expect(distancia('', 'tox')).toBe(3);
  });

  it('lo que se parece depende de lo largo: con 3 letras, nada', () => {
    expect(parecido('jair', 'yahir')).toBe(1);
    expect(parecido('cuatzacualcos', 'coatzacoalcos')).toBe(1);
    expect(parecido('tok', 'tox')).toBe(0);
    expect(parecido('tok', 'tox', 'holgada')).toBe(1);
    expect(parecido('talks', 'tox')).toBe(2);
    expect(parecido('tox', 'tox')).toBe(3);
    // Para escoger qué mandar a la IA: 5+ letras y la misma inicial.
    expect(parecido('jair', 'yahir', 'estricta')).toBe(0);
  });

  it('palabras del texto: apodos, dos palabras juntas y siglas deletreadas', () => {
    const dichas = palabrasDe('que chava vaya a han lob y a te pe eme');
    expect(dichas.find((d) => d.apodo)?.norm).toBe('salvador');
    expect(dichas.some((d) => d.norm === 'hanlob' && d.original === 'han lob')).toBe(true);
    expect(dichas.find((d) => d.sigla)).toMatchObject({ norm: 'tpm', original: 'te pe eme' });
    // «de a» no son siglas: son palabras comunes.
    expect(palabrasDe('que vaya de a pie').some((d) => d.sigla)).toBe(false);
  });

  it('lo exacto gana a lo que suena igual, y eso a lo que solo se parece', () => {
    expect(puntajeAproximado('Grupo Tox', 'Grupo Tox')).toBe(3);
    expect(puntajeAproximado('talks', 'Grupo Tox')).toBe(1.8);
    expect(puntajeAproximado('Chava', 'Salvador Ortiz Bravo')).toBe(1.8);
    expect(puntajeAproximado('Jair', 'Yahir Benítez Rosas')).toBe(1.5);
    expect(puntajeAproximado('te pe eme industrial', 'TPM Industrial')).toBe(1.8);
    expect(puntajeAproximado('be u a pe', 'Benemérita Universidad Autónoma de Puebla')).toBe(1.8);
    expect(puntajeAproximado('Syscom', 'Grupo Tox')).toBe(0);
  });

  it('elige solo con una opción clara; si hay varias parecidas, las propone', () => {
    expect(buscar('talks', clientes, (c) => c.name, 5, { aproximado: true }).elegido?.id).toBe(101);
    expect(buscar('bruks cofi', clientes, (c) => c.name, 5, { aproximado: true }).elegido?.id).toBe(106);
    expect(buscar('súper quick', clientes, (c) => c.name, 5, { aproximado: true }).elegido?.id).toBe(107);
    expect(buscar('cuatzacualcos', clientes, (c) => c.name, 5, { aproximado: true }).elegido?.id).toBe(108);
    expect(buscar('Jair', personas, (p) => p.nombre, 5, { aproximado: true }).elegido?.id).toBe(1);
    // «José» es José Antonio (igual), no Josué (parecido).
    expect(buscar('José', personas, (p) => p.nombre, 5, { aproximado: true }).elegido?.id).toBe(4);
    // Dos parecidas («Jair»: Yahir o Yair): no elige.
    const dos = buscar('Jair', [...personas, { id: 6, nombre: 'Yair Mendoza' }], (p) => p.nombre, 5, { aproximado: true });
    expect(dos.elegido).toBeNull();
    expect(dos.candidatos.map((p) => p.id)).toEqual(expect.arrayContaining([1, 6]));
    // Las dos con parecido claro quedan como empatadas: quien llama decide cuál proponer.
    expect(dos.empatados.map((p) => p.id)).toEqual(expect.arrayContaining([1, 6]));
    // Sin `aproximado`, como siempre (lo usan las actas).
    expect(buscar('talks', clientes, (c) => c.name).elegido).toBeNull();
    // Nunca inventa: nada parecido, nada elegido.
    expect(buscar('tienda Maja', clientes, (c) => c.name, 5, { aproximado: true })).toEqual({ elegido: null, candidatos: [], empatados: [] });
  });

  it('una palabra de tres letras no se corrige por parecido («Hik» no es «Kwik»)', () => {
    const pares = [{ mal: ['quick'], bien: 'Kwik' }];
    expect(corregirEnTexto('Configurar Hik-Connect en Super Quick', pares)).toBe('Configurar Hik-Connect en Super Kwik');
  });

  it('dice qué se corrigió y con qué palabra cambiarlo', () => {
    expect(corregidoDe('Grupo Tox', 'que vaya mañana a talks nave 2')).toEqual({
      de: 'talks',
      como: 'parecido',
      pares: [{ mal: ['talks'], bien: 'Tox' }],
    });
    expect(corregidoDe('Brooks Coffee', 'el switch de bruks cofi sonata')?.de).toBe('bruks cofi');
    expect(corregidoDe('Salvador Ortiz Bravo', 'que chava configure')).toMatchObject({ de: 'chava', como: 'apodo' });
    expect(corregidoDe('TPM Industrial', 'el levantamiento de te pe eme industrial')).toMatchObject({
      de: 'te pe eme',
      pares: [{ mal: ['te', 'pe', 'eme'], bien: 'TPM' }],
    });
    // Dicho igual (o el inicio, «Banor»): no es corrección.
    expect(corregidoDe('Grupo Tox', 'que vaya a Tox')).toBeNull();
    expect(corregidoDe('Banorte', 'la cotización de Banor')).toBeNull();
    // Siglas dichas como palabra: es el nombre de siempre.
    expect(corregidoDe('Benemérita Universidad Autónoma de Puebla', 'que vaya a la BUAP')).toBeNull();
    // Una palabra dicha igual: lo que solo se parece en otra palabra no cuenta.
    expect(corregidoDe('José Antonio Ramírez', 'que José Antonio vaya a Ramos Arizpe')).toBeNull();
    // …pero junto a la palabra dicha igual sí es el mismo nombre mal oído.
    expect(corregidoDe('Creppes and Waffles', 'la cotización de crepas en waffles')).toMatchObject({
      de: 'crepas',
      pares: [{ mal: ['crepas'], bien: 'Creppes' }],
    });
  });

  it('corrige el título y las indicaciones sin tocar el verbo ni otras palabras', () => {
    const pares = corregidoDe('Grupo Tox', 'que vaya a talks')!.pares;
    expect(corregirEnTexto('Revisar NVR en Talks nave 2', pares)).toBe('Revisar NVR en Tox nave 2');
    // La IA lo dejó en singular: con mayúscula y casi igual, también.
    expect(corregirEnTexto('Revisar NVR en Talk', pares)).toBe('Revisar NVR en Tox');
    expect(corregirEnTexto('Revisar todo en Toluca', pares)).toBe('Revisar todo en Toluca');
    const siglas = corregidoDe('TPM Industrial', 'de te pe eme industrial')!.pares;
    expect(corregirEnTexto('Levantamiento en te pe eme industrial', siglas)).toBe('Levantamiento en TPM industrial');
    expect(corregirEnTexto('Sin cambios', [])).toBe('Sin cambios');
  });

  it('nombres ya usados en actividades: los propios del título y del lugar, en su forma más usada', () => {
    const nombres = nombresPropiosDe([
      { titulo: 'Inventario Toks - Almacen', lugar: null },
      { titulo: 'Inventario de entrega Toks', lugar: null },
      { titulo: 'Revisar telefonía Arta', lugar: 'Tienda Maja' },
      { titulo: 'REVISION DE CCTV RESTAURANTE', lugar: null },
      { titulo: 'Mantenimientos Preventivos Sephora 2026', lugar: null },
    ]);
    expect(nombres[0]).toBe('Toks');
    expect(nombres).toEqual(expect.arrayContaining(['Arta', 'Maja', 'Sephora', 'Almacen']));
    // La primera palabra (el verbo), las de giro, las cortas y los títulos en mayúsculas no.
    expect(nombres).not.toEqual(expect.arrayContaining(['Inventario']));
    expect(nombres).not.toContain('Tienda');
    expect(nombres).not.toContain('CCTV');
  });
});

describe('iniciales de un nombre completo', () => {
  const clientes = [{ name: 'BUAP' }, { name: 'Benemer' }, { name: 'TPM' }, { name: 'Grupo Dice Puebla' }];

  it('el nombre completo encuentra a sus siglas, antes que a un nombre a medias', () => {
    const r = buscar('Benemérita Universidad Autónoma de Puebla', clientes, (c) => c.name, 5, { aproximado: true });
    expect(r.elegido?.name).toBe('BUAP');
  });

  it('también sin acentos y en minúsculas', () => {
    expect(buscar('benemerita universidad autonoma de puebla', clientes, (c) => c.name, 5, { aproximado: true }).elegido?.name).toBe('BUAP');
  });

  it('se menciona en la instrucción, para que la IA lo reciba en el catálogo', () => {
    expect(mencion(palabrasDe('que José revise las cámaras en la Benemérita Universidad Autónoma de Puebla mañana'), 'BUAP').nivel).toBeGreaterThanOrEqual(2);
  });

  it('tres palabras comunes no son siglas', () => {
    expect(mencion(palabrasDe('traer portátil mañana'), 'TPM').nivel).toBe(0);
  });

  it('tres palabras con mayúscula sí', () => {
    expect(mencion(palabrasDe('Técnicos Proveedores Mexicanos'), 'TPM').nivel).toBeGreaterThanOrEqual(2);
  });

  it('un nombre completo bien dicho no es la corrección de sí mismo', () => {
    expect(corregidoDe('José Antonio Ramírez Salazar', 'que José Antonio Ramírez Salazar revise las cámaras')).toBeNull();
    expect(puntajeAproximado('José Antonio Ramírez Salazar', 'José Antonio Ramírez Salazar')).toBe(3);
  });

  it('dice de dónde salió la corrección y la cambia en el texto', () => {
    const c = corregidoDe('BUAP', 'Revisar cámaras en la Benemérita Universidad Autónoma de Puebla');
    expect(c?.de).toBe('Benemérita Universidad Autónoma de Puebla');
    expect(corregirEnTexto('Revisar cámaras en la Benemérita Universidad Autónoma de Puebla', c!.pares)).toBe('Revisar cámaras en la BUAP');
  });
});
