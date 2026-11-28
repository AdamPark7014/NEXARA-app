import {
  VENTANA_SERVIDOR_MS,
  actividadSinAvance,
  decidirDeshacer,
  esSuperiorDe,
  esTipoDeshacer,
  viaticoSinAvance,
} from './deshacer-reglas';

// Organigrama ficticio: 1 dirección → 2 supervisor → 3 técnico; 4 técnico de otra rama bajo 1.
const personas = [
  { id: 1, managerId: null },
  { id: 2, managerId: 1 },
  { id: 3, managerId: 2 },
  { id: 4, managerId: 1 },
];
const hechoEn = new Date('2026-11-27T18:00:00.000Z');
const en = (ms: number) => new Date(hechoEn.getTime() + ms);
const actor = (id: number, autoridadMaxima = false) => ({ id, autoridadMaxima });

describe('deshacer-reglas', () => {
  it('reconoce solo los tipos que se deshacen', () => {
    expect(esTipoDeshacer('actividad')).toBe(true);
    expect(esTipoDeshacer('viatico')).toBe(true);
    expect(esTipoDeshacer('cotizacion')).toBe(false);
    expect(esTipoDeshacer(undefined)).toBe(false);
  });

  it('superior = cualquier jefe hacia arriba, nunca uno mismo ni otra rama', () => {
    expect(esSuperiorDe(2, 3, personas)).toBe(true);
    expect(esSuperiorDe(1, 3, personas)).toBe(true);
    expect(esSuperiorDe(3, 3, personas)).toBe(false);
    expect(esSuperiorDe(3, 2, personas)).toBe(false);
    expect(esSuperiorDe(4, 3, personas)).toBe(false);
  });

  it('no se cuelga con un ciclo en el organigrama', () => {
    expect(esSuperiorDe(9, 5, [{ id: 5, managerId: 6 }, { id: 6, managerId: 5 }])).toBe(false);
  });

  it('quien lo hizo lo deshace dentro de la ventana', () => {
    expect(decidirDeshacer({ actor: actor(3), autorId: 3, hechoEn, ahora: en(4_000), personas })).toEqual({ ok: true, como: 'a_tiempo' });
    expect(decidirDeshacer({ actor: actor(3), autorId: 3, hechoEn, ahora: en(VENTANA_SERVIDOR_MS), personas }).ok).toBe(true);
    // Reloj un poco atrás: sigue a tiempo.
    expect(decidirDeshacer({ actor: actor(3), autorId: 3, hechoEn, ahora: en(-500), personas }).ok).toBe(true);
  });

  it('quien lo hizo, pasado el plazo, ya no', () => {
    expect(decidirDeshacer({ actor: actor(3), autorId: 3, hechoEn, ahora: en(VENTANA_SERVIDOR_MS + 1), personas })).toEqual({
      ok: false,
      motivo: 'plazo_vencido',
    });
  });

  it('un superior lo deshace cuando sea; un compañero nunca', () => {
    expect(decidirDeshacer({ actor: actor(2), autorId: 3, hechoEn, ahora: en(86_400_000), personas })).toEqual({ ok: true, como: 'superior' });
    expect(decidirDeshacer({ actor: actor(4), autorId: 3, hechoEn, ahora: en(1_000), personas })).toEqual({ ok: false, motivo: 'sin_permiso' });
  });

  it('la autoridad máxima lo deshace siempre, incluso lo suyo fuera de plazo', () => {
    expect(decidirDeshacer({ actor: actor(9, true), autorId: 3, hechoEn, ahora: en(999_999), personas }).ok).toBe(true);
    expect(decidirDeshacer({ actor: actor(9, true), autorId: 9, hechoEn, ahora: en(999_999), personas }).ok).toBe(true);
  });

  it('una actividad empezada no se retira', () => {
    const base = { estatus: 'Pendiente', cancelledAt: null, sesiones: 0, conFotoDeEntrada: 0 };
    expect(actividadSinAvance(base).ok).toBe(true);
    expect(actividadSinAvance({ ...base, estatus: 'Asignada' }).ok).toBe(true);
    expect(actividadSinAvance({ ...base, estatus: 'En Proceso' }).ok).toBe(false);
    expect(actividadSinAvance({ ...base, sesiones: 1 }).ok).toBe(false);
    expect(actividadSinAvance({ ...base, conFotoDeEntrada: 1 }).ok).toBe(false);
    expect(actividadSinAvance({ ...base, cancelledAt: new Date() }).ok).toBe(false);
  });

  it('un viático aprobado, pagado o asentado no se retira', () => {
    const base = { estatus: 'Pendiente', approvalStep: 0, journalEntryId: null };
    expect(viaticoSinAvance(base).ok).toBe(true);
    expect(viaticoSinAvance({ ...base, estatus: 'Aprobado' }).ok).toBe(false);
    expect(viaticoSinAvance({ ...base, approvalStep: 1 }).ok).toBe(false);
    expect(viaticoSinAvance({ ...base, journalEntryId: 5 }).ok).toBe(false);
  });
});
