import { describe, expect, it } from 'vitest';
import {
  EMPTY_ACTIVITY_FORM,
  buildActivityPayload,
  formFromActivityRecord,
  toDateInputValue,
  type OperationalProjectOption,
} from './ops-activity-form';

const project: OperationalProjectOption = {
  id: 11,
  title: 'Mantenimiento CFE',
  status: 'ACTIVE',
  client: { id: 77, name: 'CFE' },
};

describe('toDateInputValue', () => {
  it('convierte un ISO a valor de <input type="date">', () => {
    expect(toDateInputValue('2026-03-09T15:30:00.000Z')).toMatch(/^2026-03-0[89]$/);
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

  it('la fecha se ancla a las 08:00 locales, no a medianoche UTC', () => {
    const payload = buildActivityPayload(
      { ...EMPTY_ACTIVITY_FORM, projectId: '11', responsableId: '8', fecha: '2026-04-15' },
      project,
      {},
    );
    expect(new Date(payload.fechaInicio as string).getHours()).toBe(8);
  });

  it('sin fecha no manda fechaInicio', () => {
    const payload = buildActivityPayload({ ...EMPTY_ACTIVITY_FORM, projectId: '11', responsableId: '8' }, project, {});
    expect(payload.fechaInicio).toBeUndefined();
  });
});
