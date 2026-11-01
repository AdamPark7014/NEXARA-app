import { motivoDe, ordenarPorProbabilidad, puestoEncaja, tieneRespaldo, type ActividadPasada } from './elegir-persona';

const soporte = { id: 39, nombre: 'José Antonio Ramírez', puesto: 'Encargado de soporte', recibe: ['tarea', 'proyecto', 'servicio', 'comercial'] as const };
const tecnico = { id: 61, nombre: 'Antonio Vázquez', puesto: 'Técnico Instalador', recibe: ['tarea'] as const };

const pasada = (responsableId: number, cambios: Partial<ActividadPasada> = {}): ActividadPasada => ({
  responsableId,
  coreKind: 'tarea',
  ticketType: 'OTRO',
  ticketTypeCustom: 'Reporte / documentación',
  clientId: null,
  ...cambios,
});

describe('quién es la persona más probable', () => {
  it('lo primero es que pueda recibir ese tipo de actividad', () => {
    const trabajo = { tipo: 'servicio' as const, subtipo: 'CORRECTIVO', clienteId: null };
    const orden = ordenarPorProbabilidad([tecnico, soporte], trabajo);
    expect(orden[0].persona.id).toBe(39);
    expect(motivoDe(orden[0], orden.slice(1), trabajo)).toBe('porque puede recibir servicios');
  });

  it('entre las que pueden, su puesto gana a lo que ha hecho', () => {
    const trabajo = { tipo: 'tarea' as const, subtipo: 'Instalación', clienteId: null };
    const historial = Array.from({ length: 10 }, () => pasada(39, { ticketTypeCustom: 'Reporte / documentación' }));
    const orden = ordenarPorProbabilidad([soporte, tecnico], trabajo, historial);
    expect(orden[0].persona.id).toBe(61);
    expect(motivoDe(orden[0], orden.slice(1), trabajo)).toBe('por su puesto (Técnico Instalador)');
  });

  it('con el mismo puesto, quien más ha hecho ese trabajo; los textos viejos del tipo también cuentan', () => {
    const trabajo = { tipo: 'tarea' as const, subtipo: 'Instalación', clienteId: null };
    const a = { id: 1, nombre: 'Ana Ruiz', puesto: 'Técnico Instalador' };
    const b = { id: 2, nombre: 'Bea Soto', puesto: 'Técnico Instalador' };
    const historial = [pasada(2, { ticketTypeCustom: 'instalación de cámaras' }), pasada(2, { ticketTypeCustom: 'Instalación' })];
    const orden = ordenarPorProbabilidad([a, b], trabajo, historial);
    expect(orden[0].persona.id).toBe(2);
    expect(orden[0].parecidas).toBe(2);
    expect(motivoDe(orden[0], orden.slice(1), trabajo)).toBe('porque ha hecho 2 actividades parecidas');
  });

  it('el mismo cliente también cuenta', () => {
    const trabajo = { tipo: 'tarea' as const, subtipo: 'Junta', clienteId: 41 };
    const a = { id: 1, nombre: 'Ana Ruiz' };
    const b = { id: 2, nombre: 'Bea Soto' };
    const orden = ordenarPorProbabilidad([a, b], trabajo, [pasada(2, { clientId: 41 })]);
    expect(orden[0].persona.id).toBe(2);
    expect(motivoDe(orden[0], orden.slice(1), trabajo)).toBe('porque ya ha atendido a este cliente');
  });

  it('en un empate total, el nombre de pila dicho; sin nada, el orden de la lista', () => {
    const trabajo = { tipo: 'tarea' as const, subtipo: 'Junta', clienteId: null };
    const a = { id: 1, nombre: 'José Antonio Ruiz' };
    const b = { id: 2, nombre: 'Antonio Soto' };
    expect(ordenarPorProbabilidad([a, b], trabajo, [], ['antonio'])[0].persona.id).toBe(2);
    expect(ordenarPorProbabilidad([a, b], trabajo)[0].persona.id).toBe(1);
    expect(motivoDe(ordenarPorProbabilidad([a, b], trabajo)[0], [], trabajo)).toBe('por el nombre que dijeron');
  });

  it('sin dato de lo que recibe, recibe todo (las pruebas y empresas sin ese mapa)', () => {
    const orden = ordenarPorProbabilidad([{ id: 1, nombre: 'Ana Ruiz' }], { tipo: 'servicio', subtipo: null, clienteId: null });
    expect(orden[0].recibe).toBe(true);
  });

  it('el puesto encaja con el trabajo', () => {
    const t = (tipo: 'tarea' | 'servicio' | 'comercial' | 'obra' | 'proyecto', subtipo: string | null = null) => ({ tipo, subtipo, clienteId: null });
    expect(puestoEncaja('Técnico Instalador', t('tarea', 'Cableado y canalización'))).toBe(true);
    expect(puestoEncaja('Encargado de soporte', t('tarea', 'Correctivo y diagnóstico'))).toBe(true);
    expect(puestoEncaja('Encargado de servicios', t('servicio', 'PREVENTIVO'))).toBe(true);
    expect(puestoEncaja('Encargada comercial', t('comercial'))).toBe(true);
    expect(puestoEncaja('Contador(a) General', t('tarea', 'Facturación y contabilidad'))).toBe(true);
    expect(puestoEncaja('Encargado de Obra', t('tarea', 'Diseño, CAD y memoria técnica'))).toBe(true);
    expect(puestoEncaja('Encargado de Obra', t('obra'))).toBe(true);
    expect(puestoEncaja('Técnico Instalador', t('comercial'))).toBe(false);
    expect(puestoEncaja(null, t('tarea', 'Instalación'))).toBe(false);
  });

  it('para sugerir a alguien que nadie mencionó hace falta algo que la respalde', () => {
    const trabajo = { tipo: 'servicio' as const, subtipo: 'CORRECTIVO', clienteId: null };
    const [mejor, peor] = ordenarPorProbabilidad([soporte, tecnico], trabajo);
    expect(tieneRespaldo(mejor)).toBe(true);
    expect(tieneRespaldo(peor)).toBe(false);
    const [sinNada] = ordenarPorProbabilidad([{ id: 1, nombre: 'Ana Ruiz' }], { tipo: 'tarea', subtipo: 'Junta', clienteId: null });
    expect(tieneRespaldo(sinNada)).toBe(false);
  });
});
