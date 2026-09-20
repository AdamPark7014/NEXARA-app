import {
  LARGO_PICKUP_CODE,
  PICKUP_VIGENCIA_HORAS,
  generarPickupCode,
  horasRestantesPickup,
  normalizarPickupCode,
  validarPickup,
  vencimientoPickup,
} from './pickup-code.js';

const AHORA = new Date('2026-09-19T12:00:00.000Z');
const EN_HORAS = (h: number) => new Date(AHORA.getTime() + h * 3600_000);

describe('generarPickupCode', () => {
  it('tiene el largo pactado', () => {
    expect(generarPickupCode()).toHaveLength(LARGO_PICKUP_CODE);
  });

  it('no usa caracteres que se confunden al dictarlos', () => {
    // 500 códigos: suficiente para que salga cualquier letra del alfabeto.
    const todos = Array.from({ length: 500 }, () => generarPickupCode()).join('');
    expect(todos).not.toMatch(/[O0I1LS5B8]/);
    expect(todos).toMatch(/^[A-Z0-9]+$/);
  });

  it('acepta un generador inyectado (pruebas deterministas)', () => {
    expect(generarPickupCode(() => 0)).toBe('A'.repeat(LARGO_PICKUP_CODE));
  });
});

describe('vencimientoPickup', () => {
  it('por defecto vale dos días', () => {
    expect(vencimientoPickup(AHORA)).toEqual(EN_HORAS(PICKUP_VIGENCIA_HORAS));
  });
});

describe('normalizarPickupCode', () => {
  it('ignora minúsculas, espacios y guiones', () => {
    expect(normalizarPickupCode(' ab3-4 cd ')).toBe('AB34CD');
  });

  it('nada se queda en cadena vacía', () => {
    expect(normalizarPickupCode(null)).toBe('');
    expect(normalizarPickupCode(undefined)).toBe('');
  });
});

describe('validarPickup', () => {
  const vigente = { pickupCode: 'AC3F7K', pickupExpiresAt: EN_HORAS(10), pickedUpAt: null };

  it('el código correcto abre', () => {
    expect(validarPickup(vigente, 'ac3f7k', AHORA)).toEqual({ valido: true });
  });

  it('otro código no', () => {
    const res = validarPickup(vigente, 'AAAAAA', AHORA);
    expect(res).toMatchObject({ valido: false, motivo: 'NO_COINCIDE' });
  });

  it('vencido no abre, y lo dice', () => {
    const res = validarPickup({ ...vigente, pickupExpiresAt: EN_HORAS(-1) }, 'AC3F7K', AHORA);
    expect(res).toMatchObject({ valido: false, motivo: 'VENCIDO' });
    if (!res.valido) expect(res.mensaje).toMatch(/venció/);
  });

  it('una solicitud sin aprobar no tiene llave', () => {
    const res = validarPickup({ pickupCode: null, pickupExpiresAt: null, pickedUpAt: null }, 'X', AHORA);
    expect(res).toMatchObject({ valido: false, motivo: 'SIN_CODIGO' });
  });

  it('el mismo código no sirve dos veces', () => {
    const res = validarPickup({ ...vigente, pickedUpAt: EN_HORAS(-2) }, 'AC3F7K', AHORA);
    expect(res).toMatchObject({ valido: false, motivo: 'YA_RECOGIDA' });
  });

  it('sin fecha de vencimiento no caduca', () => {
    expect(validarPickup({ ...vigente, pickupExpiresAt: null }, 'AC3F7K', AHORA).valido).toBe(true);
  });
});

describe('horasRestantesPickup', () => {
  it('redondea hacia abajo', () => {
    expect(horasRestantesPickup(new Date(AHORA.getTime() + 5.9 * 3600_000), AHORA)).toBe(5);
  });

  it('vencido es cero, no negativo', () => {
    expect(horasRestantesPickup(EN_HORAS(-3), AHORA)).toBe(0);
  });

  it('sin fecha no aplica', () => {
    expect(horasRestantesPickup(null, AHORA)).toBeNull();
  });
});
