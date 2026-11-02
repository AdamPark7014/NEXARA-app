import { puedeAsignarConIa, type ConteoDePersonas } from './quien-asigna.js';

type Persona = { id: number; email: string; managerId: number | null; isActive: boolean };

/** Hace el mismo conteo que la base, para probar la regla con un organigrama de verdad. */
function baseCon(personas: Persona[]): ConteoDePersonas {
  return {
    user: {
      count: async ({ where }) => {
        const w = where as {
          isActive: boolean;
          id: { not: number };
          OR: Array<{ managerId?: number; email?: { in: string[] } }>;
        };
        return personas.filter(
          (p) =>
            p.isActive === w.isActive &&
            p.id !== w.id.not &&
            w.OR.some((o) => (o.managerId != null ? p.managerId === o.managerId : Boolean(o.email?.in.includes(p.email)))),
        ).length;
      },
    },
  };
}

const persona = (id: number, email: string, managerId: number | null = null, isActive = true): Persona => ({
  id,
  email,
  managerId,
  isActive,
});

const EMPRESA = [
  persona(1, 'gerencia@nexara.com.mx'),
  persona(8, 'operaciones@nexara.com.mx', 1),
  persona(39, 'jose.ramirez@nexara.com.mx', 1),
  persona(40, 'direccion.operaciones@nexara.com.mx', 1),
  persona(41, 'daniela.hernandez@nexara.com.mx', 1),
  persona(42, 'infraestructura@nexara.com.mx', 1),
  persona(61, 'antonio.hernandez@nexara.com.mx', 8),
  persona(62, 'soporte@nexara.com.mx', 39),
];

const puede = (id: number, personas = EMPRESA) => {
  const actor = personas.find((p) => p.id === id)!;
  return puedeAsignarConIa(baseCon(personas), actor);
};

describe('quién usa «Asignar con IA»', () => {
  it('quien tiene gente a cargo en el organigrama', async () => {
    expect(await puede(1)).toBe(true);
    expect(await puede(8)).toBe(true);
    expect(await puede(39)).toBe(true);
  });

  it('el despacho que no cuelga del organigrama también cuenta: Luis reparte a José Antonio', async () => {
    expect(await puede(40)).toBe(true);
  });

  it('un encargado sin nadie a cargo queda fuera, y entra solo en cuanto le pongan a alguien', async () => {
    expect(await puede(41)).toBe(false);
    expect(await puede(42)).toBe(false);
    const conGente = [...EMPRESA, persona(70, 'nuevo@nexara.com.mx', 41)];
    expect(await puede(41, conGente)).toBe(true);
  });

  it('quien solo tiene a alguien inactivo ya no manda a nadie', async () => {
    const sinGente = [persona(8, 'operaciones@nexara.com.mx', 1), persona(61, 'x@nexara.com.mx', 8, false)];
    expect(await puede(8, sinGente)).toBe(false);
  });

  it('un técnico sin gente a cargo no entra', async () => {
    expect(await puede(61)).toBe(false);
    expect(await puede(62)).toBe(false);
  });

  it('las cuentas de dirección entran sin preguntar a la base', async () => {
    const sinBase: ConteoDePersonas = {
      user: {
        count: () => {
          throw new Error('no debería preguntar');
        },
      },
    };
    for (const email of ['gerencia@nexara.com.mx', 'developer@nexara.com.mx', 'claudia.bernal@nexara.com.mx']) {
      expect(await puedeAsignarConIa(sinBase, { id: 99, email })).toBe(true);
    }
  });

  it('la cuenta de revisión de las tiendas no entra aunque su rol sea de CEO', async () => {
    expect(await puedeAsignarConIa(baseCon(EMPRESA), { id: 90, email: 'play.review@nexara.com.mx' })).toBe(false);
  });

  it('sin persona o sin id válido, no', async () => {
    expect(await puedeAsignarConIa(baseCon(EMPRESA), null)).toBe(false);
    expect(await puedeAsignarConIa(baseCon(EMPRESA), { id: null, email: 'operaciones@nexara.com.mx' })).toBe(false);
  });
});
