import { puedeVerDetalleActividad } from './detalle-actividad-propia';

describe('puedeVerDetalleActividad', () => {
  const act = { responsableId: 5, creadoPorId: 6, assignees: [{ userId: 7 }] };

  it('RH abre la suya (responsable, creador o equipo) y no la ajena', () => {
    expect(puedeVerDetalleActividad({ id: 5, roleKey: 'rh', permissions: [] }, act)).toBe(true);
    expect(puedeVerDetalleActividad({ id: 6, roleKey: 'rh', permissions: [] }, act)).toBe(true);
    expect(puedeVerDetalleActividad({ id: 7, roleKey: 'contabilidad', permissions: [] }, act)).toBe(true);
    expect(puedeVerDetalleActividad({ id: 9, roleKey: 'vendedor', permissions: [] }, act)).toBe(false);
  });

  it('no cambia nada para los demás roles ni para superadmin', () => {
    expect(puedeVerDetalleActividad({ id: 9, roleKey: 'ing_campo', permissions: [] }, act)).toBe(true);
    expect(puedeVerDetalleActividad({ id: 9, roleKey: 'rh', isSuperAdmin: true }, act)).toBe(true);
  });

  it('quien gestiona actividades ve todas', () => {
    expect(puedeVerDetalleActividad({ id: 9, roleKey: 'coord_admin', permissions: ['activities.manage'] }, act)).toBe(true);
  });
});
