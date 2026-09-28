import { ActivityEvidenceService } from './activity-evidence.service';
import { ActivityGeofenceService } from '../geofence/activity-geofence.service';
import { TENANT_SCOPED_MODELS } from '../../common/tenant/tenant-models';
import { runWithTenantScope } from '../../prisma/prisma.service';

/**
 * El cuerpo que llegó a producción: foto de salida con GPS y mockLocation en false.
 * La imagen ya va como ruta: el controlador convierte el data URL antes del servicio.
 */
const FOTO = {
  latitude: 19.07409,
  longitude: -98.27776,
  mockLocation: false,
  photoUrl: '/activities/salida.jpg',
};

type Fila = Record<string, any>;

function coincide(row: Fila, where: any): boolean {
  if (!where || typeof where !== 'object') return true;
  if (Array.isArray(where.AND)) return where.AND.every((parte) => coincide(row, parte));
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND' || key === 'OR' || key === 'NOT') return true;
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      const op = value as { in?: unknown[]; notIn?: unknown[]; not?: unknown };
      if (Array.isArray(op.notIn)) return !op.notIn.includes(row[key]);
      if (Array.isArray(op.in)) return op.in.includes(row[key]);
      if ('not' in op && op.not === null) return row[key] != null;
      if ('not' in op) return row[key] !== op.not;
      return true;
    }
    return row[key] === value;
  });
}

function proyectar(row: Fila, args: any): Fila {
  if (!args?.select) return row;
  const out: Fila = {};
  for (const key of Object.keys(args.select)) {
    if (args.select[key]) out[key] = row[key];
  }
  return out;
}

/**
 * Prisma de mentira que pasa cada llamada de un modelo aislado por el mismo
 * plan que el middleware de tenant. Si el where sigue trayendo `activityId_userId`
 * (o un AND alrededor), la consulta revienta igual que en producción.
 */
function clienteAislado(companyId: number, tablas: Record<string, Fila[]>) {
  const llamadas: Array<{ model: string; action: string; args: any }> = [];

  async function ejecutar(model: string, action: string, args: any) {
    const tabla = tablas[model] ?? (tablas[model] = []);
    if (action === 'findFirst' || action === 'findUnique' || action === 'findFirstOrThrow') {
      const row = tabla.find((fila) => coincide(fila, args?.where)) ?? null;
      return row ? proyectar(row, args) : null;
    }
    if (action === 'findMany') {
      return tabla.filter((fila) => coincide(fila, args?.where)).map((fila) => proyectar(fila, args));
    }
    if (action === 'create') {
      const row = { id: 100 + tabla.length, ...args.data };
      tabla.push(row);
      return proyectar(row, args);
    }
    if (action === 'update') {
      const row = tabla.find((fila) => coincide(fila, args?.where));
      if (!row) return null;
      Object.assign(row, args.data);
      return proyectar(row, args);
    }
    if (action === 'updateMany') {
      const rows = tabla.filter((fila) => coincide(fila, args?.where));
      rows.forEach((fila) => Object.assign(fila, args.data));
      return { count: rows.length };
    }
    if (action === 'deleteMany') return { count: 0 };
    return null;
  }

  function modelo(nombre: string) {
    return new Proxy(
      {},
      {
        get(_target, accion: string) {
          return async (args?: any) => {
            // Prisma nombra el modelo en PascalCase (`ActivityEvidence`); el delegate es camelCase.
            const modeloNombre = nombre.charAt(0).toUpperCase() + nombre.slice(1);
            if (TENANT_SCOPED_MODELS.has(modeloNombre)) {
              return runWithTenantScope({ model: modeloNombre, action: accion, args }, companyId, async (planned) => {
                llamadas.push({ model: modeloNombre, action: planned.action, args: planned.args });
                const serial = JSON.stringify(planned.args?.where ?? {});
                if (serial.includes('_userId') || serial.includes('_fecha') || serial.includes('_scheduledDate')) {
                  throw new Error(`Llave compuesta inválida en ${nombre}.${planned.action}: ${serial}`);
                }
                if (
                  (planned.action === 'findUnique' || planned.action === 'update' || planned.action === 'upsert') &&
                  planned.args?.where?.AND
                ) {
                  throw new Error(`WhereUnique con AND en ${nombre}.${planned.action}`);
                }
                return ejecutar(modeloNombre, planned.action, planned.args);
              });
            }
            llamadas.push({ model: modeloNombre, action: accion, args });
            return ejecutar(modeloNombre, accion, args);
          };
        },
      },
    );
  }

  const prisma: any = new Proxy(
    {
      $transaction: async (fn: (tx: any) => Promise<any>) => fn(prisma),
    },
    {
      get(target, prop: string) {
        if (prop in target) return (target as any)[prop];
        return modelo(prop);
      },
    },
  );

  return { prisma, llamadas, tablas };
}

function armar(status: 'ENTRY_PHOTO' | 'EXIT_PHOTO') {
  const { prisma, llamadas, tablas } = clienteAislado(1, {
    Activity: [
      {
        id: 2,
        companyId: 1,
        estatus: 'En Proceso',
        coreKind: 'tarea',
        workType: null,
        evidencePhotoRequired: 4,
        responsableId: 7,
        indicaciones: null,
        titulo: 'Salida de sitio',
        anNumber: 'AN-0002',
        assignmentCharge: null,
        prioridad: 'MEDIA',
        fechaInicio: new Date('2026-09-28T12:00:00Z'),
        clientId: null,
        branchName: null,
        branchNumber: null,
        responsable: { id: 7, nombre: 'Antonio' },
      },
    ],
    ActivityEvidence: [
      // Otra empresa, misma actividad y persona: si el aislamiento no filtra, la
      // geocerca mide contra este punto (lejos) y rechaza la foto.
      {
        id: 9,
        activityId: 2,
        userId: 7,
        companyId: 2,
        status: 'EXIT_PHOTO',
        reviewStatus: 'PENDING',
        entryLatitude: 19.0,
        entryLongitude: -98.0,
        entryLongitudeFar: true,
        entryPhotoUploadedAt: new Date('2026-09-28T12:00:00Z'),
        exitPhotoUploadedAt: null,
      },
      {
        id: 55,
        activityId: 2,
        userId: 7,
        companyId: 1,
        status,
        reviewStatus: 'PENDING',
        entryLatitude: status === 'EXIT_PHOTO' ? FOTO.latitude : null,
        entryLongitude: status === 'EXIT_PHOTO' ? FOTO.longitude : null,
        entryPhotoUploadedAt: status === 'EXIT_PHOTO' ? new Date('2026-09-28T17:00:00Z') : null,
        exitPhotoUploadedAt: null,
        entryMockLocation: null,
        exitMockLocation: null,
      },
    ],
    ActivityAssignee: [
      {
        id: 3,
        activityId: 2,
        userId: 7,
        rol: 'TECNICO',
        retiradoAt: null,
        aceptadaAt: new Date('2026-09-28T17:00:00Z'),
        inicioRealAt: new Date('2026-09-28T17:00:00Z'),
        finRealAt: null,
        horasReales: null,
      },
    ],
  });

  const avisos: any = {
    notifyActivityProgress: jest.fn(),
    notifyEvidenceSubmitted: jest.fn(),
    notifyActivityAutoCompleted: jest.fn(),
    notifyActivityStartFlagged: jest.fn(),
    notifyActivityOutOfZone: jest.fn(),
  };
  const geofence = new ActivityGeofenceService(prisma, avisos);
  const service = new ActivityEvidenceService(prisma, {} as any, avisos, geofence);
  return { service, prisma, llamadas, tablas, avisos };
}

describe('foto de entrada y salida con aislamiento de empresa', () => {
  it('guarda la foto de entrada (lat, lng, mockLocation) sin tocar la evidencia de otra empresa', async () => {
    const { service, tablas, llamadas } = armar('ENTRY_PHOTO');
    const guardada = await service.saveEntryPhoto(
      2,
      7,
      '/activities/entrada.jpg',
      FOTO.latitude,
      FOTO.longitude,
      1,
      null,
      FOTO.mockLocation,
    );

    expect(guardada.status).toBe('EVIDENCE_PHOTOS');
    expect(guardada.entryPhotoUrl).toBe('/activities/entrada.jpg');
    expect(guardada.entryLatitude).toBe(FOTO.latitude);
    expect(guardada.entryLongitude).toBe(FOTO.longitude);
    expect(guardada.entryMockLocation).toBe(false);
    expect(guardada.companyId).toBe(1);

    const ajena = tablas.ActivityEvidence.find((fila) => fila.companyId === 2);
    expect(ajena?.entryPhotoUrl).toBeUndefined();
    expect(ajena?.status).toBe('EXIT_PHOTO');

    const escrituras = llamadas.filter(
      (llamada) => llamada.model === 'ActivityEvidence' && llamada.action === 'updateMany',
    );
    expect(escrituras.some((llamada) => llamada.args?.where?.id === 55 && llamada.args?.where?.companyId === 1)).toBe(
      true,
    );
  });

  it('guarda la foto de salida dentro de la geocerca de SU empresa', async () => {
    const { service, tablas, llamadas } = armar('EXIT_PHOTO');
    const guardada = await service.saveExitPhoto(
      2,
      7,
      FOTO.photoUrl,
      FOTO.latitude,
      FOTO.longitude,
      1,
      FOTO.mockLocation,
    );

    expect(guardada.status).toBe('COMPLETED');
    expect(guardada.exitPhotoUrl).toBe(FOTO.photoUrl);
    expect(guardada.exitLatitude).toBe(FOTO.latitude);
    expect(guardada.exitLongitude).toBe(FOTO.longitude);
    expect(guardada.exitMockLocation).toBe(false);
    expect(guardada.companyId).toBe(1);
    expect(guardada.completedAt).toBeInstanceOf(Date);

    const ajena = tablas.ActivityEvidence.find((fila) => fila.id === 9);
    expect(ajena?.exitPhotoUrl).toBeUndefined();
    expect(ajena?.status).toBe('EXIT_PHOTO');

    const lecturas = llamadas.filter(
      (llamada) => llamada.model === 'ActivityEvidence' && llamada.action === 'findFirst',
    );
    expect(lecturas.length).toBeGreaterThan(0);
    for (const lectura of lecturas) {
      expect(JSON.stringify(lectura.args?.where)).not.toContain('activityId_userId');
      expect(JSON.stringify(lectura.args?.where)).toContain('"companyId":1');
    }
  });
});
