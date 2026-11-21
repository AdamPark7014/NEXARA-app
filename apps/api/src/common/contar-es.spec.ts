import { contarEs } from './contar-es.js';

describe('contarEs', () => {
  it('uno en singular y lo demás en plural', () => {
    expect(contarEs(1, 'pieza')).toBe('1 pieza');
    expect(contarEs(0, 'pieza')).toBe('0 piezas');
    expect(contarEs(4, 'número de serie', 'números de serie')).toBe('4 números de serie');
    expect(contarEs(1, 'número de serie', 'números de serie')).toBe('1 número de serie');
  });
});
