import { Prisma } from '@prisma/client';
import { horarioDePersona } from '../me/kpis-equipo';
import {
  avisoBuenosDias,
  avisoQueToca,
  avisoSinEntrada,
  descansosDeEmpresa,
  esFestivoDeLey,
  seLeEsperaHoy,
  type DiaDeLaPersona,
} from './recordatorio-entrada';
import { RecordatorioEntradaService } from './recordatorio-entrada.service';

// Datos ficticios: ninguna persona real. México está en UTC−6 todo el año.
const mx = (fecha: string, hm: string) => new Date(`${fecha}T${hm}:00-06:00`);
const JUEVES = '2026-10-29';
const SABADO = '2026-10-31';

const OFICINA = horarioDePersona('office_hours', null);
const CUADRILLA = horarioDePersona('contractor', { horaEntrada: '08:00', horaSalida: '17:00', dias: [1, 2, 3, 4, 5] });
const DIRECCION = horarioDePersona('always_on', null);

const dia = (over: Partial<DiaDeLaPersona> = {}): DiaDeLaPersona => ({
  fecha: JUEVES,
  horario: OFICINA,
  conGuardia: false,
  justificada: false,
  conPermiso: false,
  ...over,
});
const NADA = { yaEntro: false, yaSaludado: false };
const SALUDADO = { yaEntro: false, yaSaludado: true };

describe('recordatorio de entrada: la regla', () => {
  it('oficina: buenos días a las 10:00 y «sin entrada» desde las 10:15 (10:00 + 15 de gracia)', () => {
    expect(avisoQueToca(mx(JUEVES, '09:59'), dia(), NADA)).toBeNull();
    expect(avisoQueToca(mx(JUEVES, '10:00'), dia(), NADA)).toEqual({
      aviso: 'buenos-dias',
      turno: '2026-10-29 10:00',
      minutosTarde: 0,
    });
    // Ya saludado, dentro de la gracia: nada.
    expect(avisoQueToca(mx(JUEVES, '10:14'), dia(), SALUDADO)).toBeNull();
    expect(avisoQueToca(mx(JUEVES, '10:15'), dia(), SALUDADO)).toEqual({
      aviso: 'sin-entrada',
      turno: '2026-10-29 10:15',
      minutosTarde: 15,
    });
  });

  it('el turno cambia cada 2 minutos: dos corridas del mismo turno no son dos avisos', () => {
    const turno = (hm: string) => avisoQueToca(mx(JUEVES, hm), dia(), SALUDADO)?.turno;
    expect(turno('10:15')).toBe('2026-10-29 10:15');
    expect(turno('10:16')).toBe('2026-10-29 10:15');
    expect(turno('10:17')).toBe('2026-10-29 10:17');
    expect(turno('10:18')).toBe('2026-10-29 10:17');
    expect(turno('17:59')).toBe('2026-10-29 17:59');
  });

  it('para al checar y al llegar su hora de salida', () => {
    expect(avisoQueToca(mx(JUEVES, '10:30'), dia(), { yaEntro: true, yaSaludado: true })).toBeNull();
    expect(avisoQueToca(mx(JUEVES, '18:00'), dia(), SALUDADO)).toBeNull();
    expect(avisoQueToca(mx(JUEVES, '18:00'), dia(), NADA)).toBeNull();
  });

  it('a quien ya checó no le manda nada: lo atiende el recordatorio de la jornada', () => {
    expect(avisoQueToca(mx(JUEVES, '10:00'), dia(), { yaEntro: true, yaSaludado: false })).toBeNull();
    expect(avisoQueToca(mx(JUEVES, '11:00'), dia(), { yaEntro: true, yaSaludado: false })).toBeNull();
    // El servidor arrancó a las 11: quien no ha entrado recibe el buenos días primero.
    expect(avisoQueToca(mx(JUEVES, '11:00'), dia(), NADA)).toEqual({
      aviso: 'buenos-dias',
      turno: '2026-10-29 11:00',
      minutosTarde: 60,
    });
  });

  it('la cuadrilla de campo usa su horario propio: 08:00, insistencia desde 08:15 y fin a las 17:00', () => {
    const c = dia({ horario: CUADRILLA });
    expect(avisoQueToca(mx(JUEVES, '07:59'), c, NADA)).toBeNull();
    expect(avisoQueToca(mx(JUEVES, '08:00'), c, NADA)?.aviso).toBe('buenos-dias');
    expect(avisoQueToca(mx(JUEVES, '08:15'), c, SALUDADO)?.aviso).toBe('sin-entrada');
    expect(avisoQueToca(mx(JUEVES, '16:59'), c, SALUDADO)?.aviso).toBe('sin-entrada');
    expect(avisoQueToca(mx(JUEVES, '17:00'), c, SALUDADO)).toBeNull();
  });

  it('la gracia de cada quien manda: con 0 min la insistencia empieza a las 10:02', () => {
    const sinGracia = dia({ horario: horarioDePersona('office_hours', { graciaMin: 0 }) });
    expect(avisoQueToca(mx(JUEVES, '10:01'), sinGracia, SALUDADO)?.turno).toBe('2026-10-29 10:00');
    expect(avisoQueToca(mx(JUEVES, '10:02'), sinGracia, SALUDADO)?.turno).toBe('2026-10-29 10:02');
  });

  it('nada con falta justificada, permiso o vacaciones, ni a dirección (24/7)', () => {
    expect(avisoQueToca(mx(JUEVES, '10:20'), dia({ justificada: true }), SALUDADO)).toBeNull();
    expect(avisoQueToca(mx(JUEVES, '10:20'), dia({ conPermiso: true }), NADA)).toBeNull();
    expect(avisoQueToca(mx(JUEVES, '10:20'), dia({ horario: DIRECCION }), NADA)).toBeNull();
  });

  it('descanso: fin de semana y festivos no, salvo guardia', () => {
    expect(seLeEsperaHoy(dia({ fecha: SABADO }))).toBe(false);
    expect(seLeEsperaHoy(dia({ fecha: SABADO, conGuardia: true }))).toBe(true);
    expect(avisoQueToca(mx(SABADO, '10:20'), dia({ fecha: SABADO, conGuardia: true }), SALUDADO)?.aviso).toBe(
      'sin-entrada',
    );
    // Tercer lunes de noviembre de 2026.
    expect(seLeEsperaHoy(dia({ fecha: '2026-11-16' }))).toBe(false);
    expect(seLeEsperaHoy(dia({ fecha: '2026-11-16', conGuardia: true }))).toBe(true);
    // Días que la empresa da además de la ley: el 2 de noviembre ya viene acordado.
    expect(seLeEsperaHoy(dia({ fecha: '2026-11-02' }))).toBe(true);
    expect(seLeEsperaHoy(dia({ fecha: '2026-11-02', descansos: descansosDeEmpresa('') }))).toBe(false);
    expect(seLeEsperaHoy(dia({ fecha: '2026-11-03', descansos: descansosDeEmpresa('') }))).toBe(true);
  });

  it('descansos de la empresa: los acordados más los del entorno', () => {
    expect([...descansosDeEmpresa(undefined)]).toEqual(['2026-11-02']);
    expect([...descansosDeEmpresa('2026-12-24, 2026-12-31;x 2026-13')].sort()).toEqual([
      '2026-11-02',
      '2026-12-24',
      '2026-12-31',
    ]);
  });

  it('respeta los días laborables de su horario', () => {
    const lunesAJueves = dia({ horario: horarioDePersona('office_hours', { dias: [1, 2, 3, 4] }) });
    expect(seLeEsperaHoy(lunesAJueves)).toBe(true);
    expect(seLeEsperaHoy({ ...lunesAJueves, fecha: '2026-10-30' })).toBe(false);
  });

  it('festivos de la LFT (art. 74)', () => {
    for (const f of ['2026-01-01', '2026-02-02', '2026-03-16', '2026-05-01', '2026-09-16', '2026-11-16', '2026-12-25']) {
      expect(esFestivoDeLey(f)).toBe(true);
    }
    expect(esFestivoDeLey('2027-02-01')).toBe(true);
    expect(esFestivoDeLey('2027-03-15')).toBe(true);
    expect(esFestivoDeLey('2027-11-15')).toBe(true);
    expect(esFestivoDeLey('2030-10-01')).toBe(true);
    expect(esFestivoDeLey('2026-10-01')).toBe(false);
    expect(esFestivoDeLey('2026-11-02')).toBe(false);
    expect(esFestivoDeLey('2026-02-09')).toBe(false);
    expect(esFestivoDeLey('no-es-fecha')).toBe(false);
  });

  it('textos', () => {
    expect(avisoBuenosDias({ nombre: 'óscar Pérez', horario: '10:00 a. m.', minutosTarde: 0 })).toEqual({
      title: 'Buenos días, Óscar ☀️',
      message: '¿Ya registraste tu entrada? Tu horario empieza a las 10:00 a. m.',
    });
    expect(avisoBuenosDias({ nombre: '', horario: '10:00 a. m.', minutosTarde: 40 })).toEqual({
      title: 'Buenos días ☀️',
      message: 'Aún no registras tu entrada (tu horario empezó a las 10:00 a. m.): regístrala en la app.',
    });
    expect(avisoSinEntrada({ horario: '10:00 a. m.', minutosTarde: 75 })).toEqual({
      title: 'No has registrado tu entrada',
      message:
        'Tu horario empezó a las 10:00 a. m. (van 1 h 15 min). Regístrala en la app: este aviso se repite cada 2 minutos hasta que la registres.',
    });
  });
});

// ─── El servicio, con una base en memoria compartida por dos instancias ─────────────────────────

type Fila = Record<string, any>;

function baseFalsa() {
  const db = {
    users: [] as Fila[],
    attendance: [] as Fila[],
    jornadas: [] as Fila[],
    justificaciones: [] as Fila[],
    permisos: [] as Fila[],
    guardias: [] as Fila[],
    notificaciones: [] as Fila[],
    prefs: [] as Fila[],
    consultas: 0,
  };
  const enIds = (where: any, fila: Fila) => !where?.userId?.in || where.userId.in.includes(fila.userId);
  const mismaFecha = (a: Date, b: Date) => a.getTime() === b.getTime();
  const prisma = {
    user: {
      findMany: async ({ where }: any) => {
        db.consultas += 1;
        return db.users.filter((u) => where?.isActive == null || u.isActive === where.isActive);
      },
    },
    attendance: {
      findMany: async ({ where }: any) => {
        db.consultas += 1;
        return db.attendance
          .filter((a) => enIds(where, a) && a.type === where.type)
          .filter((a) => a.timestamp >= where.timestamp.gte && a.timestamp <= where.timestamp.lte);
      },
    },
    attendanceDay: {
      findMany: async ({ where }: any) => {
        db.consultas += 1;
        return db.jornadas.filter((j) => enIds(where, j) && mismaFecha(j.date, where.date));
      },
    },
    attendanceJustification: {
      findMany: async ({ where }: any) => {
        db.consultas += 1;
        return db.justificaciones.filter((j) => enIds(where, j) && mismaFecha(j.date, where.date));
      },
    },
    leaveRequest: {
      findMany: async ({ where }: any) => {
        db.consultas += 1;
        return db.permisos.filter(
          (p) => enIds(where, p) && p.status === where.status && p.startDate <= where.startDate.lte && p.endDate >= where.endDate.gte,
        );
      },
    },
    guardia: {
      findMany: async ({ where }: any) => {
        db.consultas += 1;
        return db.guardias.filter((g) => enIds(where, g) && mismaFecha(g.fecha, where.fecha));
      },
    },
    notification: {
      findMany: async ({ where }: any) => {
        db.consultas += 1;
        return db.notificaciones.filter(
          (n) =>
            enIds(where, n) && n.type === where.type && n.entityType === where.entityType && n.createdAt >= where.createdAt.gte,
        );
      },
    },
    userPreference: {
      findMany: async ({ where }: any) => {
        db.consultas += 1;
        return db.prefs.filter((p) => enIds(where, p) && p.key === where.key).map((p) => ({ ...p }));
      },
      // Como en Postgres: la condición se evalúa al escribir, fila por fila.
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const p of db.prefs) {
          if (p.userId === where.userId && p.key === where.key && p.value < where.value.lt) {
            p.value = data.value;
            count += 1;
          }
        }
        return { count };
      },
      create: async ({ data }: any) => {
        if (db.prefs.some((p) => p.userId === data.userId && p.key === data.key)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
        }
        db.prefs.push({ ...data });
        return data;
      },
    },
  };
  const avisos: Fila[] = [];
  const notifications = {
    createNotification: async (p: Fila) => {
      const fila = { id: db.notificaciones.length + 1, createdAt: reloj.ahora, ...p };
      db.notificaciones.push(fila);
      avisos.push(p);
      return fila;
    },
  };
  const pushes: Array<{ userId: number; payload: Fila }> = [];
  const push = { sendToUser: async (userId: number, payload: Fila) => void pushes.push({ userId, payload }) };
  const reloj = { ahora: new Date() };
  const instancia = () => new RecordatorioEntradaService(prisma as any, notifications as any, push as any);
  return { db, avisos, pushes, reloj, instancia };
}

function equipo() {
  const b = baseFalsa();
  b.db.users.push(
    // Oficina (rol sin horario propio → 10:00).
    { id: 1, nombre: 'Ana Prueba', email: 'ana@ejemplo.test', isActive: true, roleKey: 'ing_soporte', tipoContrato: null, role: null, horario: null, companyMemberships: [{ companyId: 7, isDefault: true }] },
    // Cuadrilla con horario propio de 08:00 a 17:00.
    { id: 2, nombre: 'Beto Campo', email: 'beto@ejemplo.test', isActive: true, roleKey: 'ing_campo', tipoContrato: 'Planta', role: null, horario: { horaEntrada: '08:00', horaSalida: '17:00', dias: [1, 2, 3, 4, 5], graciaMin: null }, companyMemberships: [{ companyId: 7, isDefault: true }] },
    // Dirección 24/7: nunca.
    { id: 3, nombre: 'Ceci Dirección', email: 'ceci@ejemplo.test', isActive: true, roleKey: 'ceo', tipoContrato: null, role: null, horario: null, companyMemberships: [{ companyId: 7, isDefault: true }] },
    // Cuenta de plataforma: no es integrante.
    { id: 4, nombre: 'Desarrollo', email: 'developer@nexara.com.mx', isActive: true, roleKey: 'ing_soporte', tipoContrato: null, role: null, horario: null, companyMemberships: [] },
    // Dado de baja.
    { id: 5, nombre: 'Eva Baja', email: 'eva@ejemplo.test', isActive: false, roleKey: 'ing_soporte', tipoContrato: null, role: null, horario: null, companyMemberships: [{ companyId: 7, isDefault: true }] },
    // Equipo ficticio del tenant de demo de las tiendas.
    { id: 6, nombre: 'Fede Demo', email: 'fede.demo@demo.invalid', isActive: true, roleKey: 'ing_soporte', tipoContrato: null, role: null, horario: null, companyMemberships: [{ companyId: 9, isDefault: true }] },
  );
  return b;
}

/** Corre el minuto en dos instancias a la vez, como dos réplicas de la API. */
async function minuto(b: ReturnType<typeof equipo>, fecha: string, hm: string) {
  b.reloj.ahora = mx(fecha, hm);
  const [x, y] = [b.instancia(), b.instancia()];
  await Promise.all([x.revisar(b.reloj.ahora), y.revisar(b.reloj.ahora)]);
}

describe('recordatorio de entrada: el servicio', () => {
  it('de noche solo lee la lista de personas', async () => {
    const b = equipo();
    await minuto(b, JUEVES, '03:00');
    expect(b.db.consultas).toBe(2);
    expect(b.avisos).toHaveLength(0);
    expect(b.pushes).toHaveLength(0);
  });

  it('cada quien a su hora, sin repetir aunque corran dos instancias, y solo el buenos días deja fila', async () => {
    const b = equipo();
    await minuto(b, JUEVES, '08:00');
    expect(b.avisos.map((a) => a.userId)).toEqual([2]);
    expect(b.avisos[0]).toMatchObject({ type: 'ATTENDANCE_ABSENCE', entityType: 'RecordatorioEntrada', relatedUrl: '/erp/asistencias', companyId: 7 });

    await minuto(b, JUEVES, '08:15');
    await minuto(b, JUEVES, '08:16');
    await minuto(b, JUEVES, '08:17');
    expect(b.pushes.map((p) => p.userId)).toEqual([2, 2]);
    expect(b.pushes[0].payload).toMatchObject({ title: 'No has registrado tu entrada', reemplazar: true, collapseKey: 'nx_entrada_u2' });

    await minuto(b, JUEVES, '10:00');
    expect(b.avisos.map((a) => a.userId)).toEqual([2, 1]);
    // Una fila por persona en el día, aunque los push sigan.
    expect(b.db.notificaciones).toHaveLength(2);
    expect(b.db.prefs).toHaveLength(2);
  });

  it('deja de insistir en cuanto checa', async () => {
    const b = equipo();
    await minuto(b, JUEVES, '10:00');
    await minuto(b, JUEVES, '10:15');
    expect(b.pushes.filter((p) => p.userId === 1)).toHaveLength(1);
    b.db.attendance.push({ userId: 1, type: 'entrada', timestamp: mx(JUEVES, '10:16') });
    await minuto(b, JUEVES, '10:17');
    await minuto(b, JUEVES, '10:19');
    expect(b.pushes.filter((p) => p.userId === 1)).toHaveLength(1);
  });

  it('con la jornada de hoy abierta se calla aunque la checada no se vea: no se enciman los dos recordatorios', async () => {
    const b = equipo();
    // La señal de `recordatorios-jornada` (AttendanceDay de hoy), sin fila de entrada a la vista.
    b.db.jornadas.push({ userId: 1, date: new Date(Date.UTC(2026, 9, 29)), isOpen: true });
    for (const hm of ['10:00', '10:15', '10:17']) await minuto(b, JUEVES, hm);
    expect(b.avisos.filter((a) => a.userId === 1)).toHaveLength(0);
    expect(b.pushes.filter((p) => p.userId === 1)).toHaveLength(0);
  });

  it('con falta justificada o permiso aprobado no recibe nada', async () => {
    const b = equipo();
    const hoy = new Date(Date.UTC(2026, 9, 29));
    b.db.justificaciones.push({ userId: 1, date: hoy });
    b.db.permisos.push({ userId: 2, status: 'APPROVED', startDate: new Date(Date.UTC(2026, 9, 26)), endDate: new Date(Date.UTC(2026, 9, 30)) });
    for (const hm of ['08:00', '08:15', '10:00', '10:15', '10:17']) await minuto(b, JUEVES, hm);
    expect(b.avisos).toHaveLength(0);
    expect(b.pushes).toHaveLength(0);
  });

  it('el lunes 2 de noviembre no insiste: es descanso acordado', async () => {
    const b = equipo();
    for (const hm of ['08:00', '08:15', '10:00', '10:15', '10:17']) await minuto(b, '2026-11-02', hm);
    expect(b.avisos).toHaveLength(0);
    expect(b.pushes).toHaveLength(0);
    // El martes 3 todo vuelve a la normalidad.
    await minuto(b, '2026-11-03', '10:00');
    expect(b.avisos.map((a) => a.userId)).toEqual([1, 2]);
  });

  it('el sábado solo a quien tiene guardia', async () => {
    const b = equipo();
    b.db.guardias.push({ userId: 1, fecha: new Date(Date.UTC(2026, 9, 31)) });
    await minuto(b, SABADO, '10:00');
    await minuto(b, SABADO, '10:15');
    expect(b.avisos.map((a) => a.userId)).toEqual([1]);
    expect(b.pushes.map((p) => p.userId)).toEqual([1]);
  });
});
