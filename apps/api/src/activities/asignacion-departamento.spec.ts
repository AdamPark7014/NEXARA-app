import {
  mensajeAsignacionDenegada,
  puedeDejarActividadA,
  type DestinoAsignacion,
} from './asignacion-departamento';

/**
 * Luis (Servicios) le pide a Antonio (Sistemas) que asigne a su ingeniero.
 * Carolina es ingeniera de Antonio: Luis no se la salta.
 * Joan es ingeniero de campo: no cruza de departamento.
 */
const christian = persona(1, 'gerencia@nexara.com.mx', 'ceo', 1, null);
const luis = persona(7, 'direccion.operaciones@nexara.com.mx', 'coord_operaciones', 31, 1);
const david = persona(8, 'operaciones@nexara.com.mx', 'coord_operaciones', 30, 1);
const antonio = persona(39, 'jose.ramirez@nexara.com.mx', 'ing_soporte', 20, 1);
const carolina = persona(13, 'soporte@nexara.com.mx', 'ing_soporte', 20, 39);
const alejandro = persona(40, 'alejandro.gonzalez@nexara.com.mx', 'ing_soporte', 20, 39);
const joan = persona(16, 'joan.sanchez@nexara.com.mx', 'ing_campo', 40, 8);
const israel = persona(12, 'israel.ramos@nexara.com.mx', 'ing_campo', 40, 8);
const dirAdmin = persona(2, 'admin@nexara.com.mx', 'dir_admin', 10, 1);
const administrativo = persona(11, 'oficina@nexara.com.mx', 'administrativo', 10, 1);
const encargadoNuevo = persona(50, 'nuevo.encargado@nexara.com.mx', 'ing_soporte', 55, 1);
const ingenieroNuevo = persona(51, 'nuevo.ing@nexara.com.mx', 'ing_campo', 55, 50);

const roster: DestinoAsignacion[] = [
  christian,
  luis,
  david,
  antonio,
  carolina,
  alejandro,
  joan,
  israel,
  dirAdmin,
  administrativo,
  encargadoNuevo,
  ingenieroNuevo,
];

function persona(
  id: number,
  email: string,
  roleKey: string,
  departmentId: number,
  managerId: number | null,
): DestinoAsignacion {
  return { id, email, roleKey, departmentId, managerId };
}

function actor(p: DestinoAsignacion, extra?: { isSuperAdmin?: boolean }) {
  return { ...p, isSuperAdmin: extra?.isSuperAdmin ?? false };
}

describe('puedeDejarActividadA', () => {
  it('Luis (coordinador de servicios) puede dejarle la actividad a Antonio, de otro departamento', () => {
    expect(puedeDejarActividadA(actor(luis), antonio, roster)).toBe(true);
  });

  it('Luis no asigna directo al ingeniero de Antonio', () => {
    expect(puedeDejarActividadA(actor(luis), carolina, roster)).toBe(false);
    expect(puedeDejarActividadA(actor(luis), alejandro, roster)).toBe(false);
    expect(mensajeAsignacionDenegada(luis)).toMatch(/coordinador/);
  });

  it('un coordinador puede pedir apoyo a otro coordinador de otro departamento', () => {
    expect(puedeDejarActividadA(actor(luis), david, roster)).toBe(true);
    expect(puedeDejarActividadA(actor(david), antonio, roster)).toBe(true);
  });

  it('gerencia puede pedir apoyo a un coordinador de otro departamento', () => {
    expect(puedeDejarActividadA(actor(dirAdmin), luis, roster)).toBe(true);
  });

  it('un coordinador puede pedir apoyo a un encargado nuevo que tiene gente a su cargo', () => {
    expect(puedeDejarActividadA(actor(david), encargadoNuevo, roster)).toBe(true);
    expect(puedeDejarActividadA(actor(david), ingenieroNuevo, roster)).toBe(false);
  });

  it('un ingeniero sigue limitado a su departamento', () => {
    expect(puedeDejarActividadA(actor(joan), israel, roster)).toBe(true);
    expect(puedeDejarActividadA(actor(joan), carolina, roster)).toBe(false);
    expect(puedeDejarActividadA(actor(joan), antonio, roster)).toBe(false);
    expect(puedeDejarActividadA(actor(joan), david, roster)).toBe(false);
    expect(mensajeAsignacionDenegada(joan)).toBe('Solo puedes asignar a tu propio departamento');
  });

  it('un administrativo no cruza de departamento', () => {
    expect(puedeDejarActividadA(actor(administrativo), luis, roster)).toBe(false);
  });

  it('dirección y super admin asignan a cualquiera', () => {
    expect(puedeDejarActividadA(actor(christian), carolina, roster)).toBe(true);
    expect(
      puedeDejarActividadA(actor(administrativo, { isSuperAdmin: true }), carolina, roster),
    ).toBe(true);
  });

  it('el organigrama cruza departamento: David asigna a su ingeniero aunque el área no coincida', () => {
    const joanEnOtraArea = { ...joan, departmentId: 99 };
    expect(puedeDejarActividadA(actor(david), joanEnOtraArea, roster)).toBe(true);
    expect(puedeDejarActividadA(actor(joan), { ...david, departmentId: 99 }, roster)).toBe(false);
  });
});
