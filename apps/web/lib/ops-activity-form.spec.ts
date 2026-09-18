import { describe, expect, it } from 'vitest';
import {
  EMPTY_ACTIVITY_FORM,
  buildActivityPayload,
  formFromActivityRecord,
  periodoDelFormulario,
  toDateInputValue,
  type OperationalProjectOption,
} from './ops-activity-form';

const project: OperationalProjectOption = {
  id: 11,
  title: 'Mantenimiento CFE',
  status: 'ACTIVE',
  client: { id: 77, name: 'CFE' },
};

// `vitest.config.mts` fija TZ=America/Mexico_City: UTC-6 todo el año. Las horas
// esperadas van en UTC con ese desfase escrito a mano, no calculadas con Date.
describe('zona horaria de las pruebas', () => {
  it('corre en hora de Ciudad de Mexico, UTC-6', () => {
    expect(new Date('2026-04-15T12:00:00.000Z').getTimezoneOffset()).toBe(360);
    expect(new Date('2026-12-15T12:00:00.000Z').getTimezoneOffset()).toBe(360);
  });
});

describe('toDateInputValue', () => {
  it('convierte un ISO a valor de <input type="date">', () => {
    // 15:30Z son las 09:30 del mismo dia en CDMX.
    expect(toDateInputValue('2026-03-09T15:30:00.000Z')).toBe('2026-03-09');
  });

  it('usa el dia local: las 03:00Z todavia son la noche anterior en CDMX', () => {
    expect(toDateInputValue('2026-03-10T03:00:00.000Z')).toBe('2026-03-09');
  });

  it('devuelve cadena vacía ante nulo o fecha inválida', () => {
    expect(toDateInputValue(null)).toBe('');
    expect(toDateInputValue(undefined)).toBe('');
    expect(toDateInputValue('no-es-fecha')).toBe('');
  });
});

describe('formFromActivityRecord · cargar una OT existente en el formulario', () => {
  it('rellena el formulario desde el registro del API', () => {
    const form = formFromActivityRecord({
      titulo: 'Revisión de UPS',
      indicaciones: 'Sitio 4',
      prioridad: 'Alta',
      responsableId: 8,
      tiempoEstimadoMin: 90,
      projectId: 11,
      clientId: 77,
      ticketType: 'CORRECTIVO',
      branchName: 'Sucursal Centro',
    });
    expect(form.titulo).toBe('Revisión de UPS');
    expect(form.prioridad).toBe('Alta');
    // Todo campo de <input> tiene que salir como string o React avisa de que
    // el componente pasa de no-controlado a controlado.
    expect(form.responsableId).toBe('8');
    expect(form.tiempoEstimadoMin).toBe('90');
    expect(form.projectId).toBe('11');
    expect(form.ticketType).toBe('CORRECTIVO');
  });

  it('nunca deja campos undefined en un registro vacío', () => {
    const form = formFromActivityRecord({});
    for (const [key, value] of Object.entries(form)) {
      expect(typeof value, `campo ${key}`).toBe('string');
    }
    expect(form.prioridad).toBe('Media');
    expect(form.workType).toBe('ISSUE');
  });

  it('toma el cliente de la relación cuando no viene clientId suelto', () => {
    expect(formFromActivityRecord({ client: { id: 77, name: 'CFE' } }).clientId).toBe('77');
  });
});

describe('buildActivityPayload · lo que se manda al API', () => {
  it('el tipo INVENTARIO se traduce a PREVENTIVO + workType de inventario', () => {
    const payload = buildActivityPayload(
      { ...EMPTY_ACTIVITY_FORM, titulo: 'Conteo', projectId: '11', responsableId: '8', ticketType: 'INVENTARIO' },
      project,
      { userId: 3 },
    );
    expect(payload.ticketType).toBe('PREVENTIVO');
    expect(payload.workType).toBe('PREVENTIVE_INVENTORY');
  });

  it('el texto libre del tipo solo viaja cuando el tipo es OTRO', () => {
    const base = { ...EMPTY_ACTIVITY_FORM, projectId: '11', responsableId: '8', ticketTypeCustom: 'Peritaje' };
    expect(buildActivityPayload({ ...base, ticketType: 'OTRO' }, project, {}).ticketTypeCustom).toBe('Peritaje');
    expect(buildActivityPayload({ ...base, ticketType: 'PREVENTIVO' }, project, {}).ticketTypeCustom).toBeUndefined();
  });

  it('convierte los campos numéricos y omite los vacíos', () => {
    const payload = buildActivityPayload(
      { ...EMPTY_ACTIVITY_FORM, projectId: '11', responsableId: '8', tiempoEstimadoMin: '45', tiempoMaximoMin: '' },
      project,
      {},
    );
    expect(payload.projectId).toBe(11);
    expect(payload.responsableId).toBe(8);
    expect(payload.tiempoEstimadoMin).toBe(45);
    expect(payload.tiempoMaximoMin).toBeUndefined();
  });

  it('el cliente lo pone el proyecto, no el formulario', () => {
    const payload = buildActivityPayload(
      { ...EMPTY_ACTIVITY_FORM, projectId: '11', responsableId: '8', clientId: '999' },
      project,
      {},
    );
    expect(payload.clientId).toBe(77);
  });

  it('al crear fija el estatus y el autor; al editar no los toca', () => {
    const form = { ...EMPTY_ACTIVITY_FORM, projectId: '11', responsableId: '8' };
    const creado = buildActivityPayload(form, project, { userId: 3 });
    expect(creado.estatus).toBe('Pendiente');
    expect(creado.creadoPorId).toBe(3);

    const editado = buildActivityPayload(form, project, { userId: 3, isEdit: true });
    expect(editado).not.toHaveProperty('estatus');
    expect(editado).not.toHaveProperty('creadoPorId');
  });

  it('sin hora elegida, la fecha se ancla a las 09:00 locales, no a medianoche UTC', () => {
    // El formulario tiene campo de hora desde 6994dbbf y arranca en 09:00.
    const payload = buildActivityPayload(
      { ...EMPTY_ACTIVITY_FORM, projectId: '11', responsableId: '8', fecha: '2026-04-15' },
      project,
      {},
    );
    // 09:00 en CDMX (UTC-6) = 15:00Z.
    expect(payload.fechaInicio).toBe('2026-04-15T15:00:00.000Z');
    expect(payload.fechaEntregaEsperada).toBe('2026-04-15T15:00:00.000Z');
    expect(payload.fechaMaxima).toBe('2026-04-15T15:00:00.000Z');
  });

  it('la hora elegida viaja tal cual, en hora local', () => {
    const payload = buildActivityPayload(
      { ...EMPTY_ACTIVITY_FORM, projectId: '11', responsableId: '8', fecha: '2026-04-15', hora: '19:30' },
      project,
      {},
    );
    // 19:30 en CDMX = 01:30Z del dia siguiente: el API recibe el instante correcto.
    expect(payload.fechaInicio).toBe('2026-04-16T01:30:00.000Z');
  });

  it('al reabrir la actividad el formulario recupera la misma fecha y hora local', () => {
    const form = formFromActivityRecord({ fechaInicio: '2026-04-16T01:30:00.000Z' });
    expect(form.fecha).toBe('2026-04-15');
    expect(form.hora).toBe('19:30');
  });

  it('sin fecha no manda fechaInicio', () => {
    const payload = buildActivityPayload({ ...EMPTY_ACTIVITY_FORM, projectId: '11', responsableId: '8' }, project, {});
    expect(payload.fechaInicio).toBeUndefined();
  });
});

describe('periodo de la actividad', () => {
  const base = { ...EMPTY_ACTIVITY_FORM, projectId: '11', responsableId: '8', fecha: '2026-09-16' };

  it('del día elegido al día de fin, con la etapa del proyecto', () => {
    const payload = buildActivityPayload({ ...base, periodoFin: '2026-09-25', projectMilestoneId: '101' }, project, {});
    expect(payload.periodoInicio).toBe('2026-09-16');
    expect(payload.periodoFin).toBe('2026-09-25');
    expect(payload.projectMilestoneId).toBe(101);
  });

  it('sin día de fin es de un solo momento: al crear no manda periodo', () => {
    const payload = buildActivityPayload(base, project, {});
    expect(payload).not.toHaveProperty('periodoInicio');
    expect(payload).not.toHaveProperty('projectMilestoneId');
  });

  it('al editar sin día de fin lo quita (null)', () => {
    const payload = buildActivityPayload(base, project, { isEdit: true });
    expect(payload.periodoInicio).toBeNull();
    expect(payload.periodoFin).toBeNull();
  });

  it('un fin anterior al inicio no es periodo', () => {
    expect(periodoDelFormulario({ fecha: '2026-09-16', periodoFin: '2026-09-10' })).toBeNull();
    expect(periodoDelFormulario({ fecha: '', periodoFin: '2026-09-10' })).toBeNull();
    expect(periodoDelFormulario({ fecha: '2026-09-16', periodoFin: '2026-09-16' })).toEqual({
      inicio: '2026-09-16',
      fin: '2026-09-16',
    });
  });

  it('la etapa sin proyecto no viaja', () => {
    const payload = buildActivityPayload(
      { ...base, projectMode: 'without_project', projectId: '', projectMilestoneId: '101' },
      undefined,
      {},
    );
    expect(payload).not.toHaveProperty('projectMilestoneId');
  });

  it('al abrir una actividad con periodo, los días salen sin correrse por la zona', () => {
    const form = formFromActivityRecord({
      fechaInicio: '2026-09-17T16:00:00.000Z',
      periodoInicio: '2026-09-16T00:00:00.000Z',
      periodoFin: '2026-09-25T00:00:00.000Z',
      projectMilestoneId: 101,
    });
    expect(form.fecha).toBe('2026-09-16');
    expect(form.periodoFin).toBe('2026-09-25');
    expect(form.projectMilestoneId).toBe('101');
  });
});
