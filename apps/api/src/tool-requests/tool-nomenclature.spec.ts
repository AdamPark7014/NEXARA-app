import { buildCodigoInterno, categoryPrefixFromName } from './tool-nomenclature';

describe('tool-nomenclature', () => {
  it('prefijo por categoría / nombre', () => {
    expect(categoryPrefixFromName('Multímetro Fluke')).toBe('MUL');
    expect(categoryPrefixFromName('Taladro Bosch')).toBe('TAL');
    expect(categoryPrefixFromName('Cámara bullet')).toBe('CAM');
  });

  it('arma codigoInterno prefijo + serie', () => {
    expect(buildCodigoInterno({ toolName: 'Multímetro', serialNumber: 'sn 12345' })).toBe(
      'MUL-SN-12345',
    );
  });
});
