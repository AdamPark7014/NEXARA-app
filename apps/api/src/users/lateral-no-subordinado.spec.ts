/**
 * La frontera de la colocación lateral: **estar al lado de alguien no es colgar de él**.
 *
 * Esta prueba existe por un riesgo concreto. En NEXARA, «tener gente a cargo» abre
 * puertas: `ventas.tienePersonalACargo` (cuenta `managerId` = tú) da permiso de crear y
 * editar clientes; `equipo-alcance` decide a quién ves en la pizarra y a quién le puedes
 * asignar trabajo; `activity-superiors` decide quién cancela una actividad ajena;
 * `notification-hierarchy` y `lunch-breaks` deciden quién aprueba una comida a destiempo;
 * `attendance` recorta el árbol de asistencia. Todos cuentan con `managerId`.
 *
 * Luis se dibuja al lado de José Antonio porque le pasa trabajo. Si la colocación lateral
 * se colara en esos conteos, José Antonio heredaría de golpe permisos sobre Luis (y al
 * revés) sin que nadie lo decidiera. Por eso `lateralDeId` es un campo aparte y estas
 * aserciones lo dejan por escrito.
 */
import {
  lateralesDe,
  motivoLateralInvalida,
  subarbolDeMando,
  subordinadosDirectos,
} from './organigrama-lateral';
import { esJefe, reportesDirectos, subarbolIds } from '../me/equipo-alcance';

const ANTONIO = 10;
const LUIS = 11;
const SOPORTE = 12;
const CHRISTIAN = 1;

/** Luis al lado de Antonio: los dos cuelgan de Christian, ninguno del otro. */
const PLANTILLA = [
  { id: CHRISTIAN, managerId: null, lateralDeId: null, email: 'gerencia@nexara.com.mx' },
  { id: ANTONIO, managerId: CHRISTIAN, lateralDeId: null, email: 'jose.ramirez@nexara.com.mx' },
  { id: LUIS, managerId: CHRISTIAN, lateralDeId: ANTONIO, email: 'direccion.operaciones@nexara.com.mx' },
  { id: SOPORTE, managerId: ANTONIO, lateralDeId: null, email: 'soporte@nexara.com.mx' },
];

describe('colocación lateral · no cuenta como subordinado', () => {
  it('quien está al lado de Antonio no aparece entre su gente', () => {
    expect(subordinadosDirectos(ANTONIO, PLANTILLA)).toEqual([SOPORTE]);
    expect(subordinadosDirectos(ANTONIO, PLANTILLA)).not.toContain(LUIS);
  });

  it('tampoco entra en el árbol de mando de Antonio', () => {
    expect([...subarbolDeMando(ANTONIO, PLANTILLA)].sort()).toEqual([ANTONIO, SOPORTE]);
    expect(subarbolDeMando(ANTONIO, PLANTILLA).has(LUIS)).toBe(false);
  });

  it('el alcance de equipo que ya existía no lo ve: ni subárbol, ni reportes, ni «es jefe»', () => {
    // Las mismas funciones que usan la pizarra, la asignación de trabajo y los KPIs.
    expect(subarbolIds(ANTONIO, PLANTILLA).has(LUIS)).toBe(false);
    expect(reportesDirectos(ANTONIO, PLANTILLA)).toEqual([SOPORTE]);

    // Y al revés: Antonio no se vuelve gente de Luis por estar a su lado.
    expect(subarbolIds(LUIS, PLANTILLA).has(ANTONIO)).toBe(false);
    expect(reportesDirectos(LUIS, PLANTILLA)).toEqual([]);
    expect(esJefe(LUIS, PLANTILLA)).toBe(false);
  });

  it('«tiene personal a su cargo» (permiso de clientes) sigue contando solo managerId', () => {
    // Réplica de `prisma.user.count({ where: { managerId: id, isActive: true } })`.
    const cuenta = (id: number) => PLANTILLA.filter((p) => p.managerId === id).length;
    expect(cuenta(ANTONIO)).toBe(1);
    expect(cuenta(LUIS)).toBe(0); // no hereda gente por dibujarse al lado de Antonio
  });

  it('el lateral conserva su propio jefe: no se le quita la línea de mando', () => {
    const luis = PLANTILLA.find((p) => p.id === LUIS)!;
    expect(luis.managerId).toBe(CHRISTIAN);
    expect(subarbolIds(CHRISTIAN, PLANTILLA).has(LUIS)).toBe(true);
  });

  it('sabe listar a quién tiene al costado, sin mezclarlo con sus reportes', () => {
    expect(lateralesDe(ANTONIO, PLANTILLA)).toEqual([LUIS]);
    expect(lateralesDe(LUIS, PLANTILLA)).toEqual([]);
  });
});

describe('colocación lateral · qué no se deja hacer', () => {
  it('nadie se coloca al lado de sí mismo', () => {
    expect(motivoLateralInvalida(LUIS, LUIS, PLANTILLA)).toMatch(/sí mismo/);
  });

  it('nadie se coloca al lado de su propia gente', () => {
    expect(motivoLateralInvalida(ANTONIO, SOPORTE, PLANTILLA)).toMatch(/su propia gente/);
  });

  it('dos personas no pueden quedar cada una al lado de la otra', () => {
    expect(motivoLateralInvalida(ANTONIO, LUIS, PLANTILLA)).toMatch(/al lado del otro/);
  });

  it('quitar la colocación (null) siempre vale', () => {
    expect(motivoLateralInvalida(LUIS, null, PLANTILLA)).toBeNull();
  });

  it('colocarse al lado de un par de otra rama vale', () => {
    expect(motivoLateralInvalida(SOPORTE, LUIS, PLANTILLA)).toBeNull();
  });
});
