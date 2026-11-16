import {
  actividadCubreFecha,
  clasificarEstatusActividad,
  esCuentaRealParaAviso,
  mananaIso,
  parseFechaIso,
} from './supervision-helpers.js';

describe('supervision-helpers', () => {
  it('parseFechaIso acepta AAAA-MM-DD y rechaza basura', () => {
    expect(parseFechaIso('2026-11-17')).toEqual(new Date(Date.UTC(2026, 10, 17)));
    expect(() => parseFechaIso('17/11/2026')).toThrow(/Fecha inválida/);
  });

  it('mananaIso suma un día civil', () => {
    expect(mananaIso('2026-11-16')).toBe('2026-11-17');
    expect(mananaIso('2026-12-31')).toBe('2027-01-01');
  });

  it('esCuentaRealParaAviso filtra demos y acepta dirección real', () => {
    expect(esCuentaRealParaAviso({ email: 'gerencia@nexara.com.mx', puesto: 'CEO' })).toBe(true);
    expect(esCuentaRealParaAviso({ email: 'ceo@demo.invalid' })).toBe(false);
    expect(esCuentaRealParaAviso({ email: 'play.review@nexara.com.mx' })).toBe(false);
    expect(esCuentaRealParaAviso({ email: 'developer@nexara.com.mx' })).toBe(false);
    expect(esCuentaRealParaAviso({ email: 'otro@nexara.com.mx', puesto: 'Tester QA' })).toBe(false);
    expect(esCuentaRealParaAviso({ email: 'otro@nexara.com.mx', puesto: 'Cuenta de demostración' })).toBe(false);
  });

  it('clasificarEstatusActividad usa las mismas reglas de pizarra', () => {
    expect(clasificarEstatusActividad('Finalizada')).toBe('terminada');
    expect(clasificarEstatusActividad('Por Validar')).toBe('en_revision');
    expect(clasificarEstatusActividad('No cumplida')).toBe('no_cumplida');
    expect(clasificarEstatusActividad('Pendiente')).toBe('sin_empezar');
    expect(clasificarEstatusActividad('En Proceso')).toBe('en_curso');
  });

  it('actividadCubreFecha respeta periodo y fechaAsignacion', () => {
    expect(
      actividadCubreFecha(
        { periodoInicio: '2026-11-16', periodoFin: '2026-11-18' },
        '2026-11-17',
      ),
    ).toBe(true);
    expect(
      actividadCubreFecha(
        { periodoInicio: '2026-11-16', periodoFin: '2026-11-18' },
        '2026-11-19',
      ),
    ).toBe(false);
    expect(
      actividadCubreFecha({ fechaAsignacion: '2026-11-17T18:00:00.000Z' }, '2026-11-17'),
    ).toBe(true);
  });
});

describe('fechas límite',()=>{ it('rechaza fechas inexistentes y salta fines de semana',()=>{expect(()=>parseFechaIso('2026-02-30')).toThrow();expect(mananaIso('2026-11-20')).toBe('2026-11-23');});it('distingue una fecha civil de un instante de madrugada',()=>{expect(actividadCubreFecha({fechaInicio:new Date('2026-11-18T02:00:00Z')},'2026-11-17')).toBe(true);});});
