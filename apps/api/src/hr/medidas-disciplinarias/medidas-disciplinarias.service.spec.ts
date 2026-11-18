import { MedidasDisciplinariasService } from './medidas-disciplinarias.service.js';

function fixture() {
  const row:any={id:1,companyId:7,tipo:'AMONESTACION_ESCRITA',estado:'BORRADOR',pdfUrl:null};
  const db:any={
    user:{findFirst:jest.fn(async ({where})=>where.companyMemberships.some.companyId===7 ? {id:2,roleKey:'rh',isActive:true}:null)},
    userCompany:{findMany:jest.fn(async()=>[{userId:3}])},userDocument:{findFirst:jest.fn(async()=>null)},
    medidaDisciplinaria:{findFirst:jest.fn(async()=>row),findMany:jest.fn(async()=>[]),update:jest.fn(async ({data})=>Object.assign(row,data))},
  };
  return {service:new MedidasDisciplinariasService(db),db,row};
}
describe('Medidas disciplinarias: ámbito y estados',()=>{
  it('deniega otra empresa y un rol sin permiso aunque el JWT diga RH',async()=>{
    const {service,db}=fixture();
    await expect(service.listar({id:2,roleKey:'rh'},8)).rejects.toThrow('Solo RH');
    db.user.findFirst.mockResolvedValue({id:2,roleKey:'ing_campo'});
    await expect(service.listar({id:2,roleKey:'rh'},7)).rejects.toThrow('Solo RH');
    expect(db.medidaDisciplinaria.findMany).not.toHaveBeenCalled();
  });
  it('permite notificar un borrador y acota la escritura a empresa y estado previo',async()=>{
    const {service,db}=fixture();
    await service.actualizarEstado({id:2},7,1,'NOTIFICADA');
    expect(db.medidaDisciplinaria.update).toHaveBeenCalledWith({where:{id:1,companyId:7,estado:'BORRADOR'},data:{estado:'NOTIFICADA'}});
  });
  it('rechaza saltos de estado y exige documento para firmar',async()=>{
    const {service,row}=fixture();
    await expect(service.actualizarEstado({id:2},7,1,'CERRADA')).rejects.toThrow('estado');
    row.estado='NOTIFICADA';
    await expect(service.actualizarEstado({id:2},7,1,'FIRMADA')).rejects.toThrow('documento firmado');
  });
  it('una medida final no se reabre y un reintento del mismo estado no escribe',async()=>{
    const {service,db,row}=fixture(); row.estado='ANULADA';
    await expect(service.actualizarEstado({id:2},7,1,'BORRADOR')).rejects.toThrow();
    expect(await service.actualizarEstado({id:2},7,1,'ANULADA')).toBe(row);
    expect(db.medidaDisciplinaria.update).not.toHaveBeenCalled();
  });
  it('no ejecuta suspensión sin acreditar reglamento',async()=>{
    const {service,db,row}=fixture();row.tipo='SUSPENSION';
    await expect(service.actualizarEstado({id:2},7,1,'NOTIFICADA')).rejects.toThrow('reglamento');
    expect(db.medidaDisciplinaria.update).not.toHaveBeenCalled();
  });
  it('los indicadores cuentan todo el historial aunque el detalle esté limitado',async()=>{
    const {service,db}=fixture();
    db.performanceReview={findMany:jest.fn(async()=>Array(12).fill({})),count:jest.fn(async()=>25)};
    db.medidaDisciplinaria.count=jest.fn(async()=>60);
    db.activityEvidence={aggregate:jest.fn(async()=>({_avg:{eficienciaScore:4.26},_count:{eficienciaScore:350}}))};
    const r=await service.tableroDesempeno({id:2},7,3);
    expect(r.kpis).toEqual({evaluaciones:25,calificacionPromedio:4.3,medidasActivas:60,evidenciasCalificadas:350});
    expect(db.activityEvidence.aggregate).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({companyId:7,userId:3})}));
  });
});
