import {
  cadenaParticipantes,
  folioBase,
  folioEnviado,
  folioSinCadena,
  inicialesParaFolio,
  nomenclaturaCompleta,
  nomenclaturaParaFolio,
  siglasDeNomenclatura,
} from './folio-core.js';

describe('nomenclatura para el folio', () => {
  it('usa el número de empleado de RH cuando tiene el formato oficial', () => {
    expect(
      nomenclaturaParaFolio({ nombre: 'Luis Joel Aguilar Castillo', employeeNumber: 'LJ75100126' }),
    ).toBe('LJ75100126');
  });

  it('acepta la clave de RH en minúsculas o con espacios', () => {
    expect(
      nomenclaturaParaFolio({ nombre: 'Luis Joel Aguilar Castillo', employeeNumber: ' lj75100126 ' }),
    ).toBe('LJ75100126');
  });

  it('rellena con ceros lo que no se sabe, sin inventar datos (Christian → CE00000000)', () => {
    expect(
      nomenclaturaParaFolio({ nombre: 'Christian Eduardo Del Pozo Sánchez', employeeNumber: 'NX-001' }),
    ).toBe('CE00000000');
  });

  it('usa el año y mes que sí se pueden calcular y deja en cero el resto', () => {
    const clave = nomenclaturaParaFolio({
      nombre: 'Ana Karen Ruiz',
      employeeNumber: null,
      fechaNacimiento: new Date(Date.UTC(1992, 2, 14)),
    });
    expect(clave).toBe('AK92030000');
  });

  it('toma la fecha de nacimiento de la CURP cuando no hay fecha en el perfil', () => {
    const clave = nomenclaturaParaFolio({
      nombre: 'Jorge Alberto Méndez',
      curp: 'MEJJ880412HDFNRR09',
      fechaIngreso: new Date(Date.UTC(2024, 6, 1)),
    });
    expect(clave).toBe('JA88042407');
  });

  it('con un solo nombre toma sus dos primeras letras', () => {
    expect(inicialesParaFolio('Zaira')).toBe('ZA');
  });

  it('ignora los acentos al sacar iniciales', () => {
    expect(inicialesParaFolio('Ángel Óscar Ruiz')).toBe('AO');
  });

  it('distingue una clave oficial de un relleno con ceros', () => {
    expect(nomenclaturaCompleta('LJ75100126')).toBe(true);
    expect(nomenclaturaCompleta('CE00000000')).toBe(false);
  });
});

describe('folio del servidor', () => {
  it('arma NEX-{nomenclatura}-{contador de 4 dígitos}', () => {
    expect(folioBase('LJ75100126', 7)).toBe('NEX-LJ75100126-0007');
  });

  it('no trunca a quien pase de 9 999 cotizaciones', () => {
    expect(folioBase('LJ75100126', 12345)).toBe('NEX-LJ75100126-12345');
  });

  it('el segmento no aparece en el folio', () => {
    expect(folioBase('LJ75100126', 7)).not.toMatch(/COMERCIAL|OBRA|LICITACION|SERVICIO/);
  });
});

describe('cadena de quién intervino', () => {
  it('agrega las siglas del resto de participantes, en orden y sin repetir', () => {
    expect(cadenaParticipantes('LJ', ['JA88042407', 'CE00000000', 'JA88042407'])).toBe('JA.CE');
  });

  it('no repite a quien la elaboró', () => {
    expect(cadenaParticipantes('LJ75100126', ['LJ75100126', 'CE00000000'])).toBe('CE');
  });

  it('las siglas son las dos primeras letras de la nomenclatura', () => {
    expect(siglasDeNomenclatura('JA88042407')).toBe('JA');
  });

  it('el folio enviado queda NEX-LJ75100126-0007-JA.CE', () => {
    expect(
      folioEnviado({
        base: 'NEX-LJ75100126-0007',
        siglasAutor: 'LJ75100126',
        participantes: ['JA88042407', 'CE00000000'],
      }),
    ).toBe('NEX-LJ75100126-0007-JA.CE');
  });

  it('cada versión enviada después agrega -R2, -R3', () => {
    const input = {
      base: 'NEX-LJ75100126-0007',
      siglasAutor: 'LJ75100126',
      participantes: ['JA88042407'],
    };
    expect(folioEnviado({ ...input, revision: 2 })).toBe('NEX-LJ75100126-0007-JA-R2');
    expect(folioEnviado({ ...input, revision: 3 })).toBe('NEX-LJ75100126-0007-JA-R3');
  });

  it('sin más participantes el folio enviado es el folio base', () => {
    expect(
      folioEnviado({ base: 'NEX-CE00000000-0001', siglasAutor: 'CE00000000', participantes: [] }),
    ).toBe('NEX-CE00000000-0001');
  });

  it('recupera el folio base de uno ya enviado', () => {
    expect(folioSinCadena('NEX-LJ75100126-0007-JA.CE-R2')).toBe('NEX-LJ75100126-0007');
  });
});
