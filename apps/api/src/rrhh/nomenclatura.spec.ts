import {
  auditarNomenclatura,
  fechaNacimientoDeCurp,
  generarNomenclatura,
  inicialesNomenclatura,
  validarDatosRrhh,
} from './nomenclatura';

// Datos ficticios: ninguna persona real.
const HOY = new Date(Date.UTC(2026, 8, 16));
const d = (y: number, m: number, day = 1) => new Date(Date.UTC(y, m - 1, day));

describe('nomenclatura de empleados', () => {
  it('toma las iniciales de las dos primeras palabras, sin acentos', () => {
    expect(inicialesNomenclatura('Óscar Iván Pérez Luna')).toBe('OI');
    expect(inicialesNomenclatura('Érika Núñez Soto')).toBe('EN');
  });

  it('lee la fecha de nacimiento de la CURP con su siglo', () => {
    expect(fechaNacimientoDeCurp('PELO850314HDFRNS09')?.toISOString().slice(0, 10)).toBe('1985-03-14');
    expect(fechaNacimientoDeCurp('PELO050314HDFRNSA1')?.toISOString().slice(0, 10)).toBe('2005-03-14');
    expect(fechaNacimientoDeCurp('PELO851314HDFRNS09')).toBeNull();
  });

  it('genera la clave con nacimiento e ingreso', () => {
    expect(
      generarNomenclatura({ nombre: 'Óscar Iván Pérez Luna', curp: 'PELO850314HDFRNS09', fechaIngreso: d(2024, 7, 15) }),
    ).toBe('OI85032407');
    expect(generarNomenclatura({ nombre: 'Óscar Pérez', fechaIngreso: d(2024, 7) })).toBeNull();
  });

  it('marca ok cuando todo cuadra', () => {
    const r = auditarNomenclatura({
      codigo: 'OI85032407',
      nombre: 'Óscar Iván Pérez Luna',
      curp: 'PELO850314HDFRNS09',
      fechaIngreso: d(2024, 7, 15),
      hoy: HOY,
    });
    expect(r.estado).toBe('ok');
    expect(r.observaciones).toEqual([]);
  });

  it('detecta mes imposible y ingreso en el futuro como inválida', () => {
    const mes = auditarNomenclatura({ codigo: 'OI85030126', nombre: 'Óscar Iván Pérez Luna', hoy: HOY });
    expect(mes.estado).toBe('invalida');
    expect(mes.observaciones.join(' ')).toContain('Mes de ingreso imposible');

    const futuro = auditarNomenclatura({ codigo: 'OI85032901', nombre: 'Óscar Iván Pérez Luna', hoy: HOY });
    expect(futuro.estado).toBe('invalida');
    expect(futuro.observaciones.join(' ')).toContain('futuro');
  });

  it('marca diferente cuando no coincide con CURP o ingreso y sugiere la esperada', () => {
    const r = auditarNomenclatura({
      codigo: 'OI85031406',
      nombre: 'Óscar Iván Pérez Luna',
      curp: 'PELO850314HDFRNS09',
      fechaIngreso: d(2026, 6, 22),
      hoy: HOY,
    });
    expect(r.estado).toBe('diferente');
    expect(r.esperado).toBe('OI85032606');
  });

  it('sin datos suficientes no afirma que esté bien', () => {
    expect(auditarNomenclatura({ codigo: 'OI85032606', nombre: 'Óscar Iván Pérez Luna', hoy: HOY }).estado).toBe('sin_datos');
    expect(auditarNomenclatura({ codigo: 'NX-301', nombre: 'Óscar Iván Pérez Luna', hoy: HOY }).estado).toBe('invalida');
  });

  it('revisa forma de RFC, CURP, NSS y correo', () => {
    expect(
      validarDatosRrhh({ rfc: 'PELO850314AB1', curp: 'PELO850314HDFRNS09', nss: '12345678901', correo: 'a@b.mx' }),
    ).toEqual([]);
    const obs = validarDatosRrhh({ rfc: 'PELO85', curp: 'PELO850314HDFRNS0', nss: '1234567890', correo: 'a@b,com' });
    expect(obs).toHaveLength(4);
  });
});
