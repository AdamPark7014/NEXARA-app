import { CargosPerdidaService } from './cargos-perdida.service.js';

function fixture() {
  const cargo = { id: 9, userId: 3, companyId: 7, estado: 'APROBADO', montoTotal: 1000,
    conformidadPdfUrl: '/uploads/firma.pdf', aprobadoPorId: 1,
    planCuotasJson: { cuotas: [{ semanaIso: '2026-11-16', monto: 300 }] } };
  const descuentos: any[] = [];
  const db: any = {
    user: { findFirst: jest.fn(async ({where}) => where.companyMemberships.some.companyId === 7 ? { id: where.id, roleKey: 'rh', isActive: true } : null) },
    userProfile: { findUnique: jest.fn(async () => ({ sueldoSemanal: 3500 })) },
    activity: { findFirst: jest.fn(async () => null) },
    incidenciaPersonal: { findFirst: jest.fn(async () => null) },
    cargoPorPerdida: {
      findMany: jest.fn(async () => [cargo]), findFirst: jest.fn(async () => cargo),
      update: jest.fn(async ({data}) => Object.assign(cargo, data)), create: jest.fn(),
    },
    nominaSemana: { upsert: jest.fn(async () => ({id: 4, fin: new Date('2026-11-22')})), updateMany: jest.fn(async () => ({ count: 1 })) },
    nominaDescuento: {
      findFirst: jest.fn(async ({where}) => descuentos.find(d => d.concepto === where.concepto) ?? null),
      findMany: jest.fn(async ({where}) => descuentos.filter(d => typeof where.concepto === 'string' ? d.concepto === where.concepto : d.concepto.startsWith(where.concepto.startsWith))),
      create: jest.fn(async ({data}) => { const d={id: descuentos.length+1,...data}; descuentos.push(d); return d; }),
    },
  };
  // Misma exclusión que el bloqueo de NominaSemana; rollback de todas las escrituras del callback.
  let tail=Promise.resolve();
  db.$transaction=jest.fn((fn: any) => {
    const run=tail.then(async () => {
      const backup=[...descuentos], estado=cargo.estado;
      try { return await fn(db); } catch(e) { descuentos.splice(0,descuentos.length,...backup); cargo.estado=estado; throw e; }
    });
    tail=run.catch(() => undefined);
    return run;
  });
  return { service: new CargosPerdidaService(db), db, cargo, descuentos };
}

describe('Cargos por pérdida: permisos y aplicación atómica', () => {
  const actor={id: 2, roleKey: 'rh'};
  it('rechaza al actor de otra empresa antes de consultar cargos', async () => {
    const {service,db}=fixture();
    await expect(service.listar(actor,8)).rejects.toThrow('Solo RH');
    expect(db.cargoPorPerdida.findMany).not.toHaveBeenCalled();
  });
  it('no confía en el rol de la sesión y RH no puede aprobar', async () => {
    const {service,db}=fixture();
    db.user.findFirst.mockResolvedValueOnce({id:2,roleKey:'ing_campo'});
    await expect(service.listar({id:2,roleKey:'ceo'},7)).rejects.toThrow('Solo RH');
    await expect(service.decidir(actor,7,9,{accion:'aprobar'})).rejects.toThrow('Solo dirección');
  });
  it('valida persona y referencias antes de crear', async () => {
    const {service,db}=fixture();
    await expect(service.crear(actor,7,{userId:3,montoTotal:500,hechos:'Pérdida documentada',actividadId:99,evidenciaUrl:'https://example.org/evidencia',descargo:'Mi declaración'})).rejects.toThrow('esta empresa');
    expect(db.cargoPorPerdida.create).not.toHaveBeenCalled();
  });
  it('inmoviliza la conformidad después del borrador', async () => {
    const {service,db}=fixture();
    await expect(service.adjuntarConformidad(actor,7,9,'https://example.org/firma.pdf')).rejects.toThrow('borrador');
    expect(db.cargoPorPerdida.update).not.toHaveBeenCalled();
  });
  it('aplica una sola vez aun con dos peticiones simultáneas', async () => {
    const {service,db,descuentos}=fixture();
    const r=await Promise.all([service.aplicarSemana(actor,7,'2026-11-16'),service.aplicarSemana(actor,7,'2026-11-16')]);
    expect(r.map(x=>x.aplicadas).sort()).toEqual([0,1]);
    expect(descuentos).toHaveLength(1);
    expect(db.nominaSemana.updateMany).toHaveBeenCalledWith(expect.objectContaining({where: expect.objectContaining({companyId:7,estado:{not:'CERRADA'}})}));
  });
  it('no escribe en una semana cerrada', async () => {
    const {service,db}=fixture(); db.nominaSemana.updateMany.mockResolvedValue({count:0});
    await expect(service.aplicarSemana(actor,7,'2026-11-16')).rejects.toThrow('cerrada');
    expect(db.nominaDescuento.create).not.toHaveBeenCalled();
  });
  it('suma el límite semanal de los cargos de la persona', async () => {
    const {service,descuentos}=fixture();
    descuentos.push({concepto:'Cargo por pérdida (multa interna) #8',monto:100});
    await expect(service.aplicarSemana(actor,7,'2026-11-16')).rejects.toThrow('límite legal');
    expect(descuentos).toHaveLength(1);
  });
  it('revalida el sueldo y exige firma y aprobación antes de cobrar', async () => {
    const {service,db,cargo}=fixture(); db.userProfile.findUnique.mockResolvedValue({sueldoSemanal:2200});
    await expect(service.aplicarSemana(actor,7,'2026-11-16')).rejects.toThrow('límite legal');
    cargo.conformidadPdfUrl='';
    await expect(service.aplicarSemana(actor,7,'2026-11-16')).rejects.toThrow('conformidad');
    expect(db.nominaDescuento.create).not.toHaveBeenCalled();
  });
  it('revierte el descuento si falla guardar el estado del cargo', async () => {
    const {service,db,descuentos}=fixture(); db.cargoPorPerdida.update.mockRejectedValue(new Error('fallo de BD'));
    await expect(service.aplicarSemana(actor,7,'2026-11-16')).rejects.toThrow('fallo de BD');
    expect(descuentos).toHaveLength(0);
  });
  it('rechaza fechas imposibles y años sin salario mínimo verificado', async () => {
    const {service}=fixture();
    await expect(service.aplicarSemana(actor,7,'2026-02-30')).rejects.toThrow();
    await expect(service.aplicarSemana(actor,7,'2027-02-01')).rejects.toThrow('salario mínimo');
  });
});
