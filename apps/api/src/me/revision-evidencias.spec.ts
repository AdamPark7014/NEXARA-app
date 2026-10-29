import {
  actividadCerradaParaRevision,
  cadenaConResponsable,
  cadenasDeMando,
  esperaRevision,
  ordenarPorEspera,
  reglaDeRevision,
  revisaTodo,
  type EslabonRevision,
} from './revision-evidencias';

// Organigrama de prueba: Christian (1) ← José Antonio (39) ← Roberto (40); David (8) ← Israel (16).
const usuarios = [
  { id: 1, managerId: null },
  { id: 39, managerId: 1 },
  { id: 40, managerId: 39 },
  { id: 8, managerId: 1 },
  { id: 16, managerId: 8 },
];
const jefesDe = cadenasDeMando(
  usuarios,
  usuarios.map((u) => u.id),
);

const t0 = new Date('2026-10-28T15:00:00Z');
const despues = (s: number) => new Date(t0.getTime() + s * 1000);
const fila = (userId: number, rol: string, asignadoAt = t0, retiradoAt: Date | null = null): EslabonRevision => ({
  userId,
  rol,
  asignadoAt,
  retiradoAt,
});

describe('cadenasDeMando', () => {
  it('sube por managerId hasta arriba', () => {
    expect([...(jefesDe.get(40) ?? [])]).toEqual([39, 1]);
    expect([...(jefesDe.get(1) ?? [])]).toEqual([]);
  });

  it('no se cicla si el organigrama tiene un lazo', () => {
    const lazo = cadenasDeMando(
      [
        { id: 2, managerId: 3 },
        { id: 3, managerId: 2 },
      ],
      [2],
    );
    expect([...(lazo.get(2) ?? [])]).toEqual([3]);
  });
});

describe('revisaTodo', () => {
  it('dirección, consola y evidences.review revisan a cualquiera', () => {
    expect(revisaTodo({ id: 1, roleKey: 'ceo' })).toBe(true);
    expect(revisaTodo({ id: 1, email: 'gerencia@nexara.com.mx' })).toBe(true);
    expect(revisaTodo({ id: 5, permissions: ['evidences.review'] })).toBe(true);
    expect(revisaTodo({ id: 5, isSuperAdmin: true })).toBe(true);
  });

  it('un encargado cualquiera no', () => {
    expect(revisaTodo({ id: 39, email: 'jose.ramirez@nexara.com.mx', roleKey: 'coord_soporte', permissions: [] })).toBe(
      false,
    );
  });
});

describe('cadenaConResponsable', () => {
  it('agrega al responsable al frente si no tiene fila', () => {
    const cadena = cadenaConResponsable([fila(40, 'TECNICO')], 39, () => fila(39, 'LEAD'));
    expect(cadena.map((m) => m.userId)).toEqual([39, 40]);
  });

  it('no lo duplica si ya está en el equipo', () => {
    const cadena = cadenaConResponsable([fila(39, 'LEAD'), fila(40, 'TECNICO')], 39, () => fila(39, 'LEAD'));
    expect(cadena.map((m) => m.userId)).toEqual([39, 40]);
  });
});

describe('reglaDeRevision', () => {
  const base = { todo: false, esResponsable: false, despacho: false, jefesDe };

  it('el jefe por organigrama revisa a su gente, aunque no esté en la actividad', () => {
    const cadena = [fila(40, 'TECNICO')];
    const { puedeRevisar } = reglaDeRevision({ ...base, viewerId: 39, cadena });
    expect(puedeRevisar(cadena[0]!)).toBe(true);
    // Christian también: está arriba en el organigrama.
    expect(reglaDeRevision({ ...base, viewerId: 1, cadena }).puedeRevisar(cadena[0]!)).toBe(true);
  });

  it('nadie se revisa a sí mismo, ni quien revisa todo', () => {
    const cadena = [fila(40, 'TECNICO')];
    expect(reglaDeRevision({ ...base, todo: true, viewerId: 40, cadena }).puedeRevisar(cadena[0]!)).toBe(false);
  });

  it('alguien de otra rama no revisa', () => {
    const cadena = [fila(40, 'TECNICO')];
    expect(reglaDeRevision({ ...base, viewerId: 8, cadena }).puedeRevisar(cadena[0]!)).toBe(false);
  });

  it('el responsable revisa a su equipo', () => {
    const cadena = [fila(16, 'TECNICO')];
    expect(reglaDeRevision({ ...base, esResponsable: true, viewerId: 39, cadena }).puedeRevisar(cadena[0]!)).toBe(true);
  });

  it('el encargado revisa a quien la recibió después de él', () => {
    const cadena = [fila(8, 'LEAD'), fila(16, 'TECNICO', despues(60))];
    const { puedeRevisar, soyEncargado } = reglaDeRevision({ ...base, viewerId: 8, cadena });
    expect(soyEncargado).toBe(true);
    expect(puedeRevisar(cadena[1]!)).toBe(true);
  });

  it('a la vez (menos de 5 s) solo revisa al que no es encargado', () => {
    const otroLead = fila(40, 'LEAD', despues(2));
    const tecnico = fila(16, 'TECNICO', despues(2));
    const cadena = [fila(77, 'LEAD'), otroLead, tecnico];
    const { puedeRevisar } = reglaDeRevision({ ...base, jefesDe: new Map(), viewerId: 77, cadena });
    expect(puedeRevisar(otroLead)).toBe(false);
    expect(puedeRevisar(tecnico)).toBe(true);
  });

  it('un encargado que ya salió del equipo deja de revisar por la cadena', () => {
    const cadena = [fila(77, 'LEAD', t0, despues(30)), fila(16, 'TECNICO', despues(60))];
    expect(reglaDeRevision({ ...base, jefesDe: new Map(), viewerId: 77, cadena }).puedeRevisar(cadena[1]!)).toBe(false);
  });

  it('en despacho, quien solo la reparte no tiene evidencia que revisar', () => {
    const cadena = [fila(39, 'LEAD'), fila(40, 'TECNICO', despues(60))];
    const { puedeRevisar } = reglaDeRevision({ ...base, todo: true, despacho: true, viewerId: 1, cadena });
    expect(puedeRevisar(cadena[0]!)).toBe(false);
    expect(puedeRevisar(cadena[1]!)).toBe(true);
  });
});

describe('esperaRevision', () => {
  it('enviada y sin decisión, o corrección reenviada', () => {
    expect(esperaRevision({ status: 'COMPLETED', reviewStatus: 'PENDING' })).toBe(true);
    expect(esperaRevision({ status: 'COMPLETED', reviewStatus: null })).toBe(true);
  });

  it('ni aprobada, ni devuelta, ni a medias', () => {
    expect(esperaRevision({ status: 'COMPLETED', reviewStatus: 'APPROVED' })).toBe(false);
    expect(esperaRevision({ status: 'COMPLETED', reviewStatus: 'REJECTED' })).toBe(false);
    expect(esperaRevision({ status: 'EXIT_PHOTO', reviewStatus: 'PENDING' })).toBe(false);
  });
});

describe('actividadCerradaParaRevision', () => {
  it('Por Validar y En Proceso siguen abiertas para revisar', () => {
    expect(actividadCerradaParaRevision('Por Validar')).toBe(false);
    expect(actividadCerradaParaRevision('En Proceso')).toBe(false);
  });

  it('finalizada, cancelada o no cumplida ya no', () => {
    expect(actividadCerradaParaRevision('Finalizada')).toBe(true);
    expect(actividadCerradaParaRevision('Cancelada')).toBe(true);
    expect(actividadCerradaParaRevision('No cumplida')).toBe(true);
  });
});

describe('ordenarPorEspera', () => {
  it('la que más lleva esperando va primero; sin fecha, al final', () => {
    const items = [
      { id: 'b', enviadaAt: despues(120) },
      { id: 'sin', enviadaAt: null },
      { id: 'a', enviadaAt: despues(10) },
    ];
    expect(ordenarPorEspera(items).map((i) => i.id)).toEqual(['a', 'b', 'sin']);
  });
});
