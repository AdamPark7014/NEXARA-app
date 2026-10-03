import { exigeMismaUbicacionPorTipo, tareaTerminaEnOtroLado } from './misma-ubicacion';

describe('¿la salida tiene que ser donde se inició?', () => {
  it('servicio, proyecto y obra terminan donde empezaron', () => {
    expect(exigeMismaUbicacionPorTipo('servicio')).toBe(true);
    expect(exigeMismaUbicacionPorTipo('proyecto')).toBe(true);
    expect(exigeMismaUbicacionPorTipo('obra')).toBe(true);
    expect(exigeMismaUbicacionPorTipo(' OBRA ')).toBe(true);
  });

  it('una tarea también, sea cual sea su subtipo de escritorio o de sitio', () => {
    expect(exigeMismaUbicacionPorTipo('tarea', 'Levantamiento')).toBe(true);
    expect(exigeMismaUbicacionPorTipo('tarea', 'Junta')).toBe(true);
    expect(exigeMismaUbicacionPorTipo('tarea', 'Preparación de equipo')).toBe(true);
    expect(exigeMismaUbicacionPorTipo('tarea', 'Trámite')).toBe(true);
    expect(exigeMismaUbicacionPorTipo('tarea', 'Capacitación')).toBe(true);
    expect(exigeMismaUbicacionPorTipo('tarea', 'Reporte / documentación')).toBe(true);
    expect(exigeMismaUbicacionPorTipo('tarea', 'Visita a proveedor')).toBe(true); // texto libre de «Otro»
    expect(exigeMismaUbicacionPorTipo('tarea', null)).toBe(true);
    expect(exigeMismaUbicacionPorTipo('tarea')).toBe(true);
  });

  it('recolección, entrega y compra de material terminan en otro lado: no se exige', () => {
    expect(exigeMismaUbicacionPorTipo('tarea', 'Recolección')).toBe(false);
    expect(exigeMismaUbicacionPorTipo('tarea', 'Entrega')).toBe(false);
    expect(exigeMismaUbicacionPorTipo('tarea', 'Compra de material')).toBe(false);
  });

  it('reconoce el subtipo con o sin acento, en mayúsculas, con espacios o por su id', () => {
    expect(tareaTerminaEnOtroLado('recoleccion')).toBe(true);
    expect(tareaTerminaEnOtroLado('  RECOLECCIÓN ')).toBe(true);
    expect(tareaTerminaEnOtroLado('compra')).toBe(true);
    expect(tareaTerminaEnOtroLado('Compra   de  Material')).toBe(true);
    expect(tareaTerminaEnOtroLado('entrega')).toBe(true);
    expect(tareaTerminaEnOtroLado('Entrega de reporte al cliente')).toBe(false);
    expect(tareaTerminaEnOtroLado('')).toBe(false);
    expect(tareaTerminaEnOtroLado(null)).toBe(false);
  });

  it('el subtipo solo cuenta en tareas: un servicio que diga «Entrega» sigue exigiendo', () => {
    expect(exigeMismaUbicacionPorTipo('servicio', 'Entrega')).toBe(true);
    expect(exigeMismaUbicacionPorTipo('obra', 'Recolección')).toBe(true);
  });

  it('comercial nunca, ni lo que no tiene tipo o trae uno desconocido', () => {
    expect(exigeMismaUbicacionPorTipo('comercial')).toBe(false);
    expect(exigeMismaUbicacionPorTipo('comercial', 'COMERCIAL')).toBe(false);
    expect(exigeMismaUbicacionPorTipo(null)).toBe(false);
    expect(exigeMismaUbicacionPorTipo(undefined)).toBe(false);
    expect(exigeMismaUbicacionPorTipo('')).toBe(false);
    expect(exigeMismaUbicacionPorTipo('inventario')).toBe(false);
  });
});
