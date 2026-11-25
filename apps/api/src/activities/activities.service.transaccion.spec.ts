import { ActivitiesService } from './activities.service.js';

describe('alta de actividad dentro de una transacción de supervisión', () => {
  it('escribe actividad, responsable y evidencia con el mismo cliente y difiere avisos al commit', async () => {
    const row={id:11,companyId:7,titulo:'Revisar acceso',estatus:'Pendiente',anNumber:'AN-0011',responsableId:3,creadoPorId:2,assignmentCharge:null,responsable:{id:3,nombre:'Técnico'},creador:{nombre:'Supervisor'}};
    const db:any={user:{findUnique:jest.fn(async()=>({isActive:true}))},activity:{create:jest.fn()},activityAssignee:{upsert:jest.fn()},activityEvidence:{upsert:jest.fn()}};
    const tx:any={activity:{create:jest.fn(async()=>row)},activityAssignee:{upsert:jest.fn()},activityEvidence:{upsert:jest.fn()}};
    const notifications:any={notifyActivityAssigned:jest.fn()};
    const events:any={publishEntityLifecycle:jest.fn()};
    const service=new ActivitiesService(db,notifications,events);
    const created=await service.create({titulo:row.titulo,responsableId:3,creadoPorId:2,anNumber:row.anNumber},7,{tx});
    expect(created.id).toBe(11);
    expect(tx.activity.create).toHaveBeenCalled();
    expect(tx.activityAssignee.upsert).toHaveBeenCalled();
    expect(tx.activityEvidence.upsert).toHaveBeenCalled();
    expect(db.activity.create).not.toHaveBeenCalled();
    expect(db.activityAssignee.upsert).not.toHaveBeenCalled();
    expect(notifications.notifyActivityAssigned).not.toHaveBeenCalled();
    expect(events.publishEntityLifecycle).not.toHaveBeenCalled();
    await service.publicarActividadCreada(row,7);
    expect(notifications.notifyActivityAssigned).toHaveBeenCalledTimes(1);
    expect(events.publishEntityLifecycle).toHaveBeenCalledWith('created',expect.objectContaining({entityId:11,companyId:7}));
  });
});
