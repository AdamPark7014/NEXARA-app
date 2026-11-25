import {
  normalizarParametros,
  parametrosVigentesEn,
  PARAMETROS_DEFAULT,
} from './parametros-productividad';

describe('parametros-productividad', () => {
  it('elige el vigente mas reciente <= fecha', () => {
    const hist = [
      normalizarParametros({ ...PARAMETROS_DEFAULT, vigenteDesde: '2026-01-01', graciaMin: 10 }),
      normalizarParametros({ ...PARAMETROS_DEFAULT, vigenteDesde: '2026-06-01', graciaMin: 20 }),
      normalizarParametros({ ...PARAMETROS_DEFAULT, vigenteDesde: '2026-12-01', graciaMin: 5 }),
    ];
    expect(parametrosVigentesEn(hist, '2026-07-15').graciaMin).toBe(20);
    expect(parametrosVigentesEn(hist, '2025-12-01').graciaMin).toBe(PARAMETROS_DEFAULT.graciaMin);
  });

  it('normaliza pesos a suma 1', () => {
    const p = normalizarParametros({
      vigenteDesde: '2026-11-20',
      pesoPuntualidad: 3,
      pesoAprovechamiento: 3,
      pesoEficiencia: 4,
    });
    expect(p.pesoPuntualidad + p.pesoAprovechamiento + p.pesoEficiencia).toBeCloseTo(1, 5);
  });
});
