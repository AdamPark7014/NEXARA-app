import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';
import { isNonEmployeeEmail } from '../common/platform-accounts.js';
import { workDateKey } from '../common/time/workday.js';
import { CATEGORIAS_BASE, categoriaPorPuesto } from './categorias-base.js';
import { numero, redondear } from './calculos/numeros.js';
import {
  aniosCumplidos,
  costoHora,
  factorSalarioReal,
  vacacionesPorAntiguedad,
} from './calculos/salario-real.js';
import { UNIDADES_EQUIPO, tarifaEquipo, type FichaEquipoCalculo } from './calculos/tarifa-equipo.js';

/** Lo que rige cuando nadie ha capturado el año. `ps` es un supuesto hasta que lo confirme la contadora. */
export const PARAMETROS_OMISION = {
  ps: 0.25,
  psValidado: false,
  otrosDias: 3,
  aguinaldoDias: 15,
  primaVacacional: 0.25,
  kh: 0.03,
  ks: 0.01,
  indirectoPct: null as number | null,
  tasaInteres: null as number | null,
  notas: null as string | null,
};

export type ParametrosCosto = typeof PARAMETROS_OMISION & {
  anio: number;
  guardado: boolean;
  actualizadoEn: string | null;
};

type PersonaLeida = {
  id: number;
  nombre: string;
  email: string;
  puesto: string | null;
  fechaIngreso: Date | null;
  isActive: boolean;
  perfil: { sueldoSemanal: unknown } | null;
  horario: { dias: number[]; jornadaOrdinariaMin: number | null } | null;
};

const SELECCION_PERSONA = {
  id: true,
  nombre: true,
  email: true,
  puesto: true,
  fechaIngreso: true,
  isActive: true,
  perfil: { select: { sueldoSemanal: true } },
  horario: { select: { dias: true, jornadaOrdinariaMin: true } },
} as const;

export type CambiosParametros = Partial<
  Pick<
    typeof PARAMETROS_OMISION,
    'ps' | 'psValidado' | 'otrosDias' | 'aguinaldoDias' | 'primaVacacional' | 'kh' | 'ks' | 'indirectoPct' | 'tasaInteres' | 'notas'
  >
>;

export type DatosCategoria = { nombre?: string; tipo?: string; sueldoSemanalRef?: number | null; activo?: boolean };

export type DatosFicha = Partial<FichaEquipoCalculo> & {
  tipo?: string;
  nombre?: string;
  unidad?: string;
  vehicleId?: number | null;
  toolId?: number | null;
  notas?: string | null;
  activo?: boolean;
};

const TIPOS_FICHA = ['VEHICULO', 'HERRAMIENTA'];

@Injectable()
export class CostosTarifasService {
  constructor(private readonly prisma: PrismaService) {}

  /* ── Parámetros ─────────────────────────────────────────────────────────── */

  async parametros(companyId: number, anio: number): Promise<ParametrosCosto> {
    const fila = await this.prisma.costoParametros.findFirst({ where: { companyId, anio } });
    if (!fila) return { ...PARAMETROS_OMISION, anio, guardado: false, actualizadoEn: null };
    return {
      anio,
      ps: numero(fila.ps),
      psValidado: fila.psValidado,
      otrosDias: fila.otrosDias,
      aguinaldoDias: fila.aguinaldoDias,
      primaVacacional: numero(fila.primaVacacional),
      kh: numero(fila.kh),
      ks: numero(fila.ks),
      indirectoPct: fila.indirectoPct == null ? null : numero(fila.indirectoPct),
      tasaInteres: fila.tasaInteres == null ? null : numero(fila.tasaInteres),
      notas: fila.notas,
      guardado: true,
      actualizadoEn: fila.updatedAt.toISOString(),
    };
  }

  async guardarParametros(companyId: number | null, anio: number, cambios: CambiosParametros, actorId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    if (!Number.isInteger(anio) || anio < 2020 || anio > 2100) throw new BadRequestException('Año inválido');
    const datos = {
      ...cambios,
      notas: cambios.notas === undefined ? undefined : cambios.notas?.trim() || null,
      actualizadoPorId: actorId ?? null,
    };
    await this.prisma.costoParametros.upsert({
      where: { companyId_anio: { companyId: tenantId, anio } },
      create: { ...PARAMETROS_OMISION, ...datos, companyId: tenantId, anio },
      update: datos,
    });
    return this.parametros(tenantId, anio);
  }

  /* ── Motor: costo por hora de una persona ───────────────────────────────── */

  private calcularPersona(p: PersonaLeida, parametros: ParametrosCosto, psPropio: number | null) {
    const anio = parametros.anio;
    const antiguedad = aniosCumplidos(p.fechaIngreso, new Date(Date.UTC(anio, 6, 1)));
    const vacacionesDias = vacacionesPorAntiguedad(antiguedad ?? 1);
    const factor = factorSalarioReal({
      anio,
      diasLaborables: p.horario?.dias?.length ? p.horario.dias : undefined,
      vacacionesDias,
      otrosDias: parametros.otrosDias,
      aguinaldoDias: parametros.aguinaldoDias,
      primaVacacional: parametros.primaVacacional,
      ps: psPropio ?? parametros.ps,
    });
    const sueldoSemanal = numero(p.perfil?.sueldoSemanal);
    const horasJornada = p.horario?.jornadaOrdinariaMin ? p.horario.jornadaOrdinariaMin / 60 : 8;
    return {
      sueldoSemanal,
      vacacionesDias,
      fsr: factor.fsr,
      horasJornada,
      costoHora: costoHora(sueldoSemanal, factor.fsr, horasJornada),
    };
  }

  /**
   * Función que da el costo por hora de una persona en una fecha. Para el proceso nocturno: lee una
   * vez y guarda por año, también a quien ya no está activo, porque sus horas siguen contando.
   */
  async motor(companyId: number): Promise<(userId: number, fecha: Date) => number> {
    const personas = (await this.prisma.user.findMany({
      where: { companyMemberships: { some: { companyId } } },
      select: SELECCION_PERSONA,
    })) as unknown as PersonaLeida[];
    const propias = await this.prisma.costoPersona.findMany({ where: { companyId } });
    const psDe = new Map(propias.map((c) => [c.userId, c.psPropio == null ? null : numero(c.psPropio)]));
    const porId = new Map(personas.map((p) => [p.id, p]));

    // Los parámetros de cada año se leen una vez y se guardan para ese ciclo del proceso.
    const anios = new Map<number, ParametrosCosto>();
    const filas = await this.prisma.costoParametros.findMany({ where: { companyId } });
    for (const fila of filas) anios.set(fila.anio, await this.parametros(companyId, fila.anio));

    const memo = new Map<string, number>();
    return (userId, fecha) => {
      const anio = Number(workDateKey(fecha).slice(0, 4));
      const clave = `${userId}:${anio}`;
      const guardado = memo.get(clave);
      if (guardado !== undefined) return guardado;
      const persona = porId.get(userId);
      const parametros = anios.get(anio) ?? { ...PARAMETROS_OMISION, anio, guardado: false, actualizadoEn: null };
      const hora = persona ? this.calcularPersona(persona, parametros, psDe.get(userId) ?? null).costoHora : 0;
      memo.set(clave, hora);
      return hora;
    };
  }

  /* ── Pantalla de tarifas ────────────────────────────────────────────────── */

  /** Primera vez de una empresa: las categorías base. No pisa las que ya existan. */
  private async asegurarCategorias(companyId: number) {
    const cuantas = await this.prisma.costoCategoria.count({ where: { companyId } });
    if (cuantas) return;
    await this.prisma.costoCategoria.createMany({
      data: CATEGORIAS_BASE.map((c) => ({ ...c, companyId })),
      skipDuplicates: true,
    });
  }

  async tarifas(companyId: number | null, anio: number) {
    const tenantId = requireCompanyId(companyId);
    await this.asegurarCategorias(tenantId);
    const parametros = await this.parametros(tenantId, anio);

    const [leidas, categorias, propias, fichas, vehiculos, herramientas] = await Promise.all([
      this.prisma.user.findMany({
        where: { isActive: true, companyMemberships: { some: { companyId: tenantId } } },
        select: SELECCION_PERSONA,
        orderBy: { nombre: 'asc' },
      }) as unknown as Promise<PersonaLeida[]>,
      this.prisma.costoCategoria.findMany({ where: { companyId: tenantId }, orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] }),
      this.prisma.costoPersona.findMany({ where: { companyId: tenantId } }),
      this.prisma.costoFichaEquipo.findMany({ where: { companyId: tenantId, activo: true }, orderBy: { nombre: 'asc' } }),
      this.prisma.vehicleAsset.findMany({
        where: { companyId: tenantId, activo: true },
        select: { id: true, nombre: true, placas: true },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.toolInventoryItem.findMany({
        where: { companyId: tenantId },
        select: { id: true, toolName: true, model: true, codigoInterno: true },
        orderBy: { toolName: 'asc' },
        take: 300,
      }),
    ]);

    const propiaDe = new Map(propias.map((c) => [c.userId, c]));
    const categoriaPorClave = new Map(categorias.map((c) => [c.clave, c]));

    const personas = leidas
      .filter((p) => !isNonEmployeeEmail(p.email))
      .map((p) => {
        const propia = propiaDe.get(p.id);
        const psPropio = propia?.psPropio == null ? null : numero(propia.psPropio);
        const calculo = this.calcularPersona(p, parametros, psPropio);
        const categoriaId =
          propia?.categoriaId ?? categoriaPorClave.get(categoriaPorPuesto(p.puesto) ?? '')?.id ?? null;
        return {
          userId: p.id,
          nombre: p.nombre,
          puesto: p.puesto,
          categoriaId,
          categoriaAsignada: propia?.categoriaId != null,
          psPropio,
          sueldoSemanal: calculo.sueldoSemanal,
          vacacionesDias: calculo.vacacionesDias,
          fsr: calculo.fsr,
          costoHora: calculo.costoHora,
          sinSueldo: calculo.sueldoSemanal <= 0,
        };
      });

    // El factor de referencia: lunes a viernes, primer año. Es el que se le enseña a la contadora.
    const referencia = factorSalarioReal({
      anio,
      vacacionesDias: vacacionesPorAntiguedad(1),
      otrosDias: parametros.otrosDias,
      aguinaldoDias: parametros.aguinaldoDias,
      primaVacacional: parametros.primaVacacional,
      ps: parametros.ps,
    });

    const filasCategoria = categorias.map((c) => {
      const miembros = personas.filter((p) => p.categoriaId === c.id && !p.sinSueldo);
      const ref = c.sueldoSemanalRef == null ? null : numero(c.sueldoSemanalRef);
      const hora = ref
        ? costoHora(ref, referencia.fsr)
        : miembros.length
          ? redondear(miembros.reduce((a, p) => a + p.costoHora, 0) / miembros.length)
          : null;
      return {
        id: c.id,
        clave: c.clave,
        nombre: c.nombre,
        tipo: c.tipo,
        activo: c.activo,
        sueldoSemanalRef: ref,
        personas: personas.filter((p) => p.categoriaId === c.id).length,
        costoHora: hora,
        origenTarifa: ref ? 'REFERENCIA' : 'PROMEDIO',
      };
    });

    return {
      anio,
      parametros,
      factor: { ...referencia, vacacionesDias: vacacionesPorAntiguedad(1) },
      categorias: filasCategoria,
      personas,
      equipos: fichas.map((f) => this.presentarFicha(f)),
      vehiculos,
      herramientas: herramientas.map((h) => ({
        id: h.id,
        nombre: [h.toolName, h.model].filter(Boolean).join(' '),
        codigo: h.codigoInterno,
      })),
      avisos: {
        psSinValidar: !parametros.psValidado,
        personasSinSueldo: personas.filter((p) => p.sinSueldo).length,
        personasSinCategoria: personas.filter((p) => p.categoriaId == null).length,
        vehiculosSinFicha: vehiculos.filter((v) => !fichas.some((f) => f.vehicleId === v.id)).length,
      },
    };
  }

  /* ── Categorías y personas ──────────────────────────────────────────────── */

  async crearCategoria(companyId: number | null, datos: DatosCategoria) {
    const tenantId = requireCompanyId(companyId);
    const nombre = String(datos.nombre ?? '').trim();
    if (!nombre) throw new BadRequestException('Escribe el nombre de la categoría');
    const clave = nombre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .slice(0, 30);
    const existente = await this.prisma.costoCategoria.findFirst({ where: { companyId: tenantId, clave } });
    if (existente) throw new BadRequestException('Ya existe una categoría con ese nombre');
    return this.prisma.costoCategoria.create({
      data: {
        companyId: tenantId,
        clave,
        nombre,
        tipo: datos.tipo === 'INDIRECTO' ? 'INDIRECTO' : 'DIRECTO',
        sueldoSemanalRef: datos.sueldoSemanalRef ?? null,
        orden: 50,
      },
    });
  }

  async editarCategoria(companyId: number | null, id: number, datos: DatosCategoria) {
    const tenantId = requireCompanyId(companyId);
    const fila = await this.prisma.costoCategoria.findFirst({ where: { id, companyId: tenantId } });
    if (!fila) throw new NotFoundException('Categoría no encontrada');
    return this.prisma.costoCategoria.update({
      where: { id },
      data: {
        nombre: datos.nombre?.trim() || undefined,
        tipo: datos.tipo === 'INDIRECTO' || datos.tipo === 'DIRECTO' ? datos.tipo : undefined,
        sueldoSemanalRef: datos.sueldoSemanalRef === undefined ? undefined : datos.sueldoSemanalRef,
        activo: datos.activo,
      },
    });
  }

  async asignarPersona(
    companyId: number | null,
    userId: number,
    datos: { categoriaId?: number | null; psPropio?: number | null },
  ) {
    const tenantId = requireCompanyId(companyId);
    const persona = await this.prisma.user.findFirst({
      where: { id: userId, companyMemberships: { some: { companyId: tenantId } } },
      select: { id: true },
    });
    if (!persona) throw new NotFoundException('Persona no encontrada en esta empresa');
    if (datos.categoriaId != null) {
      const categoria = await this.prisma.costoCategoria.findFirst({ where: { id: datos.categoriaId, companyId: tenantId } });
      if (!categoria) throw new BadRequestException('Categoría no encontrada');
    }
    const cambios = {
      categoriaId: datos.categoriaId === undefined ? undefined : datos.categoriaId,
      psPropio: datos.psPropio === undefined ? undefined : datos.psPropio,
    };
    return this.prisma.costoPersona.upsert({
      where: { companyId_userId: { companyId: tenantId, userId } },
      create: { companyId: tenantId, userId, categoriaId: datos.categoriaId ?? null, psPropio: datos.psPropio ?? null },
      update: cambios,
    });
  }

  /* ── Fichas de equipo ───────────────────────────────────────────────────── */

  private presentarFicha(f: Record<string, any>) {
    const calculo = fichaACalculo(f);
    return {
      id: f.id,
      tipo: f.tipo,
      nombre: f.nombre,
      unidad: f.unidad,
      vehicleId: f.vehicleId,
      toolId: f.toolId,
      notas: f.notas,
      ...calculo,
      tarifa: tarifaEquipo(calculo),
    };
  }

  private datosDeFicha(datos: DatosFicha) {
    if (datos.tipo !== undefined && !TIPOS_FICHA.includes(datos.tipo)) throw new BadRequestException('Tipo de equipo inválido');
    if (datos.unidad !== undefined && !(UNIDADES_EQUIPO as readonly string[]).includes(datos.unidad)) {
      throw new BadRequestException('Unidad inválida: KM, HORA o DIA');
    }
    const { nombre, ...resto } = datos;
    return { ...resto, nombre: nombre === undefined ? undefined : nombre.trim() };
  }

  async crearFicha(companyId: number | null, datos: DatosFicha, actorId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const limpio = this.datosDeFicha(datos);
    if (!limpio.nombre) throw new BadRequestException('Escribe el nombre del equipo');
    if (!limpio.tipo) throw new BadRequestException('Falta el tipo de equipo');
    if (!limpio.unidad) throw new BadRequestException('Falta la unidad');
    if (!(numero(limpio.valor) > 0)) throw new BadRequestException('Falta el valor del equipo');
    if (!(numero(limpio.vidaUnidades) > 0) || !(numero(limpio.unidadesAnio) > 0)) {
      throw new BadRequestException('Falta la vida útil o el uso al año');
    }
    const fila = await this.prisma.costoFichaEquipo.create({
      data: {
        ...limpio,
        companyId: tenantId,
        actualizadoPorId: actorId ?? null,
      } as Prisma.CostoFichaEquipoUncheckedCreateInput,
    });
    return this.presentarFicha(fila);
  }

  async editarFicha(companyId: number | null, id: number, datos: DatosFicha, actorId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const fila = await this.prisma.costoFichaEquipo.findFirst({ where: { id, companyId: tenantId } });
    if (!fila) throw new NotFoundException('Equipo no encontrado');
    const actualizada = await this.prisma.costoFichaEquipo.update({
      where: { id },
      data: { ...this.datosDeFicha(datos), actualizadoPorId: actorId ?? null } as Prisma.CostoFichaEquipoUncheckedUpdateInput,
    });
    return this.presentarFicha(actualizada);
  }

  async quitarFicha(companyId: number | null, id: number, actorId?: number | null) {
    return this.editarFicha(companyId, id, { activo: false }, actorId);
  }
}

/** De la fila de la base a lo que pide la fórmula. */
export function fichaACalculo(f: Record<string, any>): FichaEquipoCalculo {
  const opcional = (v: unknown) => (v == null ? undefined : numero(v));
  return {
    valor: numero(f.valor),
    valorLlantas: numero(f.valorLlantas),
    rescatePct: numero(f.rescatePct),
    vidaUnidades: numero(f.vidaUnidades),
    unidadesAnio: numero(f.unidadesAnio),
    tasaInteres: numero(f.tasaInteres),
    primaSeguro: numero(f.primaSeguro),
    ko: numero(f.ko),
    rendimiento: opcional(f.rendimiento),
    precioCombustible: opcional(f.precioCombustible),
    costoAceite: opcional(f.costoAceite),
    aceiteCadaUnidades: opcional(f.aceiteCadaUnidades),
    vidaLlantasUnidades: opcional(f.vidaLlantasUnidades),
    otrosAnuales: numero(f.otrosAnuales),
  };
}
