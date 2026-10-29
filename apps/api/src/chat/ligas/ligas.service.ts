import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { PERMISSIONS } from '../../common/permissions.js';
import { checkUrlAccess } from '../../common/rbac/url-matrix.js';
import { LEGACY_TO_V2, ROLES, type RoleKey } from '../../common/rbac/roles.v2.js';
import { puedeVerCliente } from '../../ventas/client-access.js';
import { ChatService } from '../chat.service.js';
import {
  ESTADO_COTIZACION,
  ESTADO_FACTURA,
  ESTADO_PROYECTO,
  NO_ENCONTRADA,
  SIN_ACCESO,
  TIPO_DE_KIND,
  diaCorto,
  duracion,
  fechaCorta,
  numero,
  parsearLiga,
  rutaDeLiga,
  tarjetaGenerica,
  tipoDeFolio,
  type LigaParseada,
  type TarjetaLiga,
  type TipoLiga,
} from './ligas.js';

/** Lo que trae `req.user` (jwt.strategy): permisos ya resueltos y el rol v2. */
export type ActorLiga = {
  id: number;
  permissions?: string[];
  roleKey?: string | null;
  orgRoleKey?: string | null;
  isSuperAdmin?: boolean;
  departmentId?: number | null;
  email?: string | null;
};

/** Resultado del selector «Ligar» (mismo formato que `chat/mentions`). */
export type LigaEncontrada = {
  kind: string;
  id: number;
  label: string;
  subtitle: string;
  href: string;
};

/** Tope por petición: un mensaje trae pocas ligas y una página de mensajes, unas decenas. */
export const MAX_REFS = 40;

type Pendiente = { ref: string; liga: LigaParseada; folio?: string };

/**
 * Resuelve las ligas del chat con los permisos de **quien las ve**, no de quien las escribió.
 *
 * Cada tipo pide lo mismo que pide su pantalla de detalle (la regla de URL del rol y el permiso del
 * controlador), y además el alcance de esa pantalla (actividades de su árbol, clientes de su sector,
 * viáticos propios o de su departamento, asistencia propia o de su equipo). Así una tarjeta nunca
 * enseña algo que la persona no podría abrir.
 */
@Injectable()
export class LigasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
  ) {}

  // ─────────────────────────── permisos ───────────────────────────

  private rolV2(user: ActorLiga): RoleKey | null {
    const validas = Object.values(ROLES) as string[];
    if (user.roleKey && validas.includes(user.roleKey)) return user.roleKey as RoleKey;
    if (user.orgRoleKey && LEGACY_TO_V2[user.orgRoleKey]) return LEGACY_TO_V2[user.orgRoleKey];
    return null;
  }

  /** Lo mismo que `RbacGuard`: regla de URL del rol (si tiene rol v2) Y alguno de los permisos. */
  private puede(user: ActorLiga, url: string, permisos: string[]): boolean {
    if (user.isSuperAdmin) return true;
    const rol = this.rolV2(user);
    if (rol && !checkUrlAccess(rol, url, 'GET').allowed) return false;
    const propios = user.permissions ?? [];
    return permisos.some((p) => propios.includes(p));
  }

  // ─────────────────────────── resolver ───────────────────────────

  async resolver(user: ActorLiga, companyId: number | null | undefined, refs: unknown): Promise<Record<string, TarjetaLiga>> {
    const tenantId = requireCompanyId(companyId);
    const lista = Array.isArray(refs) ? refs : [];
    const unicos = [...new Set(lista.map((r) => String(r ?? '').trim()).filter(Boolean))].slice(0, MAX_REFS);

    const pendientes: Pendiente[] = [];
    const salida: Record<string, TarjetaLiga> = {};
    const folios: Array<{ ref: string; folio: string; tipo: 'actividad' | 'cotizacion' }> = [];
    for (const ref of unicos) {
      if (ref.startsWith('folio:')) {
        const folio = ref.slice(6).trim().toUpperCase();
        const tipo = tipoDeFolio(folio);
        if (tipo) folios.push({ ref, folio, tipo });
        continue;
      }
      const liga = parsearLiga(ref);
      if (liga) pendientes.push({ ref, liga });
    }
    pendientes.push(...(await this.foliosALigas(folios, tenantId, salida)));

    const porTipo = new Map<TipoLiga, Pendiente[]>();
    for (const p of pendientes) porTipo.set(p.liga.tipo, [...(porTipo.get(p.liga.tipo) ?? []), p]);

    let alcance: Promise<{ isOmniscient: boolean; reportIds: number[] }> | null = null;
    const alcanceDe = () => (alcance ??= this.chat.resolveChatScope(user.id, tenantId));

    const tandas = await Promise.all(
      [...porTipo.entries()].map(([tipo, items]) => {
        switch (tipo) {
          case 'actividad':
          case 'evidencia':
            return this.actividades(items, tenantId, alcanceDe, user);
          case 'cotizacion':
            return this.cotizaciones(items, tenantId, user);
          case 'cliente':
            return this.clientes(items, tenantId, user);
          case 'proyecto':
            return this.proyectos(items, tenantId, user);
          case 'asistencia':
            return this.asistencias(items, tenantId, alcanceDe, user);
          case 'viatico':
            return this.viaticos(items, tenantId, user);
          case 'factura':
            return this.facturas(items, tenantId, user);
          default:
            return Promise.resolve([] as TarjetaLiga[]);
        }
      }),
    );
    for (const t of tandas.flat()) salida[t.ref] = t;
    return salida;
  }

  /** Folios sueltos → liga con id. Lo que no aparece queda como tarjeta «No se encontró». */
  private async foliosALigas(
    folios: Array<{ ref: string; folio: string; tipo: 'actividad' | 'cotizacion' }>,
    tenantId: number,
    salida: Record<string, TarjetaLiga>,
  ): Promise<Pendiente[]> {
    if (!folios.length) return [];
    const an = folios.filter((f) => f.tipo === 'actividad').map((f) => f.folio);
    const cot = folios.filter((f) => f.tipo === 'cotizacion').map((f) => f.folio);
    const [acts, cots] = await Promise.all([
      an.length
        ? this.prisma.activity.findMany({
            where: { companyId: tenantId, deletedAt: null, anNumber: { in: an, mode: 'insensitive' } },
            select: { id: true, anNumber: true },
          })
        : Promise.resolve([]),
      cot.length
        ? this.prisma.cotizacion.findMany({
            where: {
              companyId: tenantId,
              OR: cot.flatMap((f) => [
                { quoteNumber: { equals: f, mode: 'insensitive' as const } },
                // Una revisión (`-R2`) o la cadena (`-JA.CE`) de la misma cotización.
                { quoteNumber: { startsWith: `${f}-`, mode: 'insensitive' as const } },
              ]),
            },
            select: { id: true, quoteNumber: true },
            orderBy: { id: 'desc' },
          })
        : Promise.resolve([]),
    ]);
    const out: Pendiente[] = [];
    for (const f of folios) {
      if (f.tipo === 'actividad') {
        const a = acts.find((x) => x.anNumber.toUpperCase() === f.folio);
        if (a) out.push({ ref: f.ref, liga: { tipo: 'actividad', id: a.id }, folio: f.folio });
        else salida[f.ref] = tarjetaGenerica(f.ref, 'actividad', '/erp/actividades', NO_ENCONTRADA, f.folio);
      } else {
        const c =
          cots.find((x) => x.quoteNumber.toUpperCase() === f.folio) ??
          cots.find((x) => x.quoteNumber.toUpperCase().startsWith(`${f.folio}-`));
        if (c) out.push({ ref: f.ref, liga: { tipo: 'cotizacion', id: c.id }, folio: f.folio });
        else salida[f.ref] = tarjetaGenerica(f.ref, 'cotizacion', '/erp/cotizaciones', NO_ENCONTRADA, f.folio);
      }
    }
    return out;
  }

  private async actividades(
    items: Pendiente[],
    tenantId: number,
    alcanceDe: () => Promise<{ isOmniscient: boolean; reportIds: number[] }>,
    user: ActorLiga,
  ): Promise<TarjetaLiga[]> {
    const ids = [...new Set(items.map((i) => i.liga.id))];
    const evidenciaIds = items.map((i) => i.liga.evidenciaId).filter((x): x is number => Boolean(x));
    const [acts, evidencias, alcance] = await Promise.all([
      this.prisma.activity.findMany({
        where: { id: { in: ids }, companyId: tenantId, deletedAt: null },
        select: {
          id: true,
          anNumber: true,
          titulo: true,
          estatus: true,
          prioridad: true,
          responsableId: true,
          creadoPorId: true,
          fechaMaxima: true,
          fechaEntregaEsperada: true,
          responsable: { select: { nombre: true } },
        },
      }),
      evidenciaIds.length
        ? this.prisma.evidence.findMany({
            where: { id: { in: evidenciaIds }, companyId: tenantId },
            select: { id: true, actividadId: true, tipoEvidencia: true, estatus: true },
          })
        : Promise.resolve([]),
      alcanceDe(),
    ]);
    const enAlcance = new Set([user.id, ...alcance.reportIds]);
    return items.map(({ ref, liga, folio }) => {
      const a = acts.find((x) => x.id === liga.id);
      const href =
        liga.tipo === 'evidencia' ? rutaDeLiga.evidencia(liga.id, liga.evidenciaId) : rutaDeLiga.actividad(liga.id);
      if (!a) return tarjetaGenerica(ref, liga.tipo, href, NO_ENCONTRADA, folio ?? null);
      const ve =
        user.isSuperAdmin || alcance.isOmniscient || enAlcance.has(a.responsableId) || enAlcance.has(a.creadoPorId);
      if (!ve) return tarjetaGenerica(ref, liga.tipo, href, SIN_ACCESO, a.anNumber);
      const fecha = fechaCorta(a.fechaMaxima ?? a.fechaEntregaEsperada, true);
      const detalle = [a.responsable?.nombre ?? null, fecha ? `Límite ${fecha}` : null].filter(
        (x): x is string => Boolean(x),
      );
      if (liga.tipo === 'evidencia') {
        const e = liga.evidenciaId ? evidencias.find((x) => x.id === liga.evidenciaId && x.actividadId === a.id) : null;
        return {
          ref,
          tipo: 'evidencia',
          acceso: true,
          folio: e ? `#${e.id}` : a.anNumber,
          titulo: e ? `${e.tipoEvidencia} · ${a.anNumber} ${a.titulo}` : `Evidencias de ${a.anNumber} · ${a.titulo}`,
          estado: e?.estatus ?? a.estatus,
          detalle,
          monto: null,
          href,
        };
      }
      return {
        ref,
        tipo: 'actividad',
        acceso: true,
        folio: a.anNumber,
        titulo: a.titulo,
        estado: a.estatus,
        detalle: a.prioridad ? [...detalle, `Prioridad ${a.prioridad.toLowerCase()}`] : detalle,
        monto: null,
        href,
      };
    });
  }

  private async cotizaciones(items: Pendiente[], tenantId: number, user: ActorLiga): Promise<TarjetaLiga[]> {
    const ve = this.puede(user, '/api/cotizaciones/core/1', [PERMISSIONS.COTIZACIONES_ACCESS]);
    const filas = await this.prisma.cotizacion.findMany({
      where: { id: { in: items.map((i) => i.liga.id) }, companyId: tenantId },
      select: {
        id: true,
        quoteNumber: true,
        status: true,
        total: true,
        currency: true,
        clientName: true,
        clientCompany: true,
        projectName: true,
        issueDate: true,
      },
    });
    return items.map(({ ref, liga, folio }) => {
      const c = filas.find((x) => x.id === liga.id);
      const href = rutaDeLiga.cotizacion(liga.id);
      if (!c) return tarjetaGenerica(ref, 'cotizacion', href, NO_ENCONTRADA, folio ?? null);
      if (!ve) return tarjetaGenerica(ref, 'cotizacion', href, SIN_ACCESO, c.quoteNumber);
      const cliente = c.clientCompany || c.clientName || null;
      const total = numero(c.total);
      return {
        ref,
        tipo: 'cotizacion',
        acceso: true,
        folio: c.quoteNumber,
        titulo: c.projectName || cliente || c.quoteNumber,
        estado: ESTADO_COTIZACION[c.status] ?? c.status,
        detalle: [cliente && cliente !== c.projectName ? cliente : null, fechaCorta(c.issueDate)].filter(
          (x): x is string => Boolean(x),
        ),
        monto: total != null ? { total, moneda: c.currency || 'MXN' } : null,
        href,
      };
    });
  }

  private async clientes(items: Pendiente[], tenantId: number, user: ActorLiga): Promise<TarjetaLiga[]> {
    const ve = this.puede(user, '/api/ventas/clientes/1', [
      PERMISSIONS.SALES_VIEW,
      PERMISSIONS.PANEL_VENTAS,
      PERMISSIONS.ACTIVITIES_VIEW,
      PERMISSIONS.ACTIVITIES_MANAGE,
    ]);
    const filas = await this.prisma.salesClient.findMany({
      where: { id: { in: items.map((i) => i.liga.id) }, companyId: tenantId },
      select: {
        id: true,
        name: true,
        legalName: true,
        status: true,
        tipo: true,
        ownerId: true,
        industry: true,
        sectors: { select: { sector: true } },
        owner: { select: { nombre: true } },
      },
    });
    return items.map(({ ref, liga }) => {
      const c = filas.find((x) => x.id === liga.id);
      const href = rutaDeLiga.cliente(liga.id);
      if (!c) return tarjetaGenerica(ref, 'cliente', href, NO_ENCONTRADA);
      if (!ve || !puedeVerCliente(c, user)) return tarjetaGenerica(ref, 'cliente', href, SIN_ACCESO);
      return {
        ref,
        tipo: 'cliente',
        acceso: true,
        folio: null,
        titulo: c.name,
        estado: c.status || null,
        detalle: [
          c.legalName && c.legalName !== c.name ? c.legalName : null,
          c.industry || null,
          c.owner?.nombre ? `Lo atiende ${c.owner.nombre}` : null,
        ].filter((x): x is string => Boolean(x)),
        monto: null,
        href,
      };
    });
  }

  private async proyectos(items: Pendiente[], tenantId: number, user: ActorLiga): Promise<TarjetaLiga[]> {
    const ve = this.puede(user, '/api/proyectos/1', [PERMISSIONS.CONSOLE_ACCESS]);
    const filas = await this.prisma.operationalProject.findMany({
      where: { id: { in: items.map((i) => i.liga.id) }, companyId: tenantId },
      select: {
        id: true,
        title: true,
        status: true,
        budgetAmount: true,
        currency: true,
        startDate: true,
        endDate: true,
        client: { select: { name: true } },
        responsable: { select: { nombre: true } },
      },
    });
    return items.map(({ ref, liga }) => {
      const p = filas.find((x) => x.id === liga.id);
      const href = rutaDeLiga.proyecto(liga.id);
      if (!p) return tarjetaGenerica(ref, 'proyecto', href, NO_ENCONTRADA);
      if (!ve) return tarjetaGenerica(ref, 'proyecto', href, SIN_ACCESO);
      const fin = fechaCorta(p.endDate);
      const total = numero(p.budgetAmount);
      return {
        ref,
        tipo: 'proyecto',
        acceso: true,
        folio: null,
        titulo: p.title,
        estado: ESTADO_PROYECTO[p.status] ?? p.status,
        detalle: [p.client?.name ?? null, p.responsable?.nombre ?? null, fin ? `Termina ${fin}` : null].filter(
          (x): x is string => Boolean(x),
        ),
        monto: total != null ? { total, moneda: p.currency || 'MXN' } : null,
        href,
      };
    });
  }

  private async asistencias(
    items: Pendiente[],
    tenantId: number,
    alcanceDe: () => Promise<{ isOmniscient: boolean; reportIds: number[] }>,
    user: ActorLiga,
  ): Promise<TarjetaLiga[]> {
    const gestiona = user.isSuperAdmin || (user.permissions ?? []).includes(PERMISSIONS.ATTENDANCE_MANAGE);
    const alcance = await alcanceDe();
    const visibles = items.filter(
      (i) =>
        i.liga.id === user.id ||
        (gestiona && (alcance.isOmniscient || user.isSuperAdmin || alcance.reportIds.includes(i.liga.id))),
    );
    const userIds = [...new Set(items.map((i) => i.liga.id))];
    const fechas = [...new Set(visibles.map((i) => i.liga.fecha!))].map((f) => new Date(`${f}T00:00:00.000Z`));
    const [personas, dias, checadas] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds }, companyMemberships: { some: { companyId: tenantId } } },
        select: { id: true, nombre: true },
      }),
      visibles.length
        ? this.prisma.attendanceDay.findMany({
            where: { companyId: tenantId, userId: { in: visibles.map((v) => v.liga.id) }, date: { in: fechas } },
            select: { userId: true, date: true, totalMinutes: true, isOpen: true },
          })
        : Promise.resolve([]),
      visibles.length
        ? this.prisma.attendance.findMany({
            where: { companyId: tenantId, userId: { in: visibles.map((v) => v.liga.id) }, workDate: { in: fechas } },
            select: { userId: true, type: true, timestamp: true, workDate: true, validacion: true, fueraDeSitio: true },
          })
        : Promise.resolve([]),
    ]);
    const diaIso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');
    return items.map(({ ref, liga }) => {
      const fecha = liga.fecha!;
      const href = rutaDeLiga.asistencia(liga.id, fecha);
      const persona = personas.find((p) => p.id === liga.id);
      if (!persona) return tarjetaGenerica(ref, 'asistencia', href, NO_ENCONTRADA);
      if (!visibles.some((v) => v.ref === ref)) {
        return { ...tarjetaGenerica(ref, 'asistencia', href, SIN_ACCESO), titulo: `Asistencia · ${diaCorto(fecha)}` };
      }
      const dia = dias.find((d) => d.userId === liga.id && diaIso(d.date) === fecha);
      const propias = checadas.filter((c) => c.userId === liga.id && diaIso(c.workDate) === fecha);
      const entrada = propias.find((c) => c.type === 'entrada');
      const salidaCh = propias.find((c) => c.type === 'salida');
      const hora = (d: Date) =>
        d.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false });
      const estado = !entrada ? 'Sin entrada' : dia?.isOpen && !salidaCh ? 'En jornada' : salidaCh ? 'Jornada cerrada' : 'Con entrada';
      return {
        ref,
        tipo: 'asistencia',
        acceso: true,
        folio: diaCorto(fecha),
        titulo: persona.nombre,
        estado,
        detalle: [
          entrada ? `Entrada ${hora(entrada.timestamp)}${entrada.fueraDeSitio ? ' (fuera de sitio)' : ''}` : null,
          salidaCh ? `Salida ${hora(salidaCh.timestamp)}` : null,
          dia && dia.totalMinutes > 0 ? `${duracion(dia.totalMinutes)} trabajadas` : null,
        ].filter((x): x is string => Boolean(x)),
        monto: null,
        href,
      };
    });
  }

  private async viaticos(items: Pendiente[], tenantId: number, user: ActorLiga): Promise<TarjetaLiga[]> {
    const puedeVer = this.puede(user, '/api/viatics/1', [PERMISSIONS.VIATICS_VIEW, PERMISSIONS.VIATICS_MANAGE]);
    const filas = await this.prisma.viatico.findMany({
      where: { id: { in: items.map((i) => i.liga.id) }, companyId: tenantId },
      select: {
        id: true,
        usuarioId: true,
        categoria: true,
        motivo: true,
        estatus: true,
        montoSolicitado: true,
        montoAprobado: true,
        fechaSolicitud: true,
        User: { select: { nombre: true, departmentId: true } },
      },
    });
    // El mismo alcance que la lista de viáticos (`ViaticosService.buildListWhere`): quien gestiona ve
    // la empresa (CEO, dirección administrativa, contabilidad o sin departamento) o su departamento;
    // los demás, solo los suyos.
    const rol = this.rolV2(user);
    const gestiona =
      user.isSuperAdmin ||
      (user.permissions ?? []).includes(PERMISSIONS.VIATICS_MANAGE) ||
      (user.permissions ?? []).includes('console.admin');
    const empresaCompleta =
      user.isSuperAdmin ||
      (gestiona && (!user.departmentId || rol === ROLES.CEO || rol === ROLES.DIR_ADMIN || rol === ROLES.CONTABILIDAD));
    return items.map(({ ref, liga }) => {
      const v = filas.find((x) => x.id === liga.id);
      const href = rutaDeLiga.viatico(liga.id);
      const folio = `#${liga.id}`;
      if (!v) return tarjetaGenerica(ref, 'viatico', href, NO_ENCONTRADA, folio);
      const enAlcance =
        v.usuarioId === user.id ||
        empresaCompleta ||
        (gestiona && Boolean(user.departmentId) && v.User?.departmentId === user.departmentId);
      if (!puedeVer || !enAlcance) return tarjetaGenerica(ref, 'viatico', href, SIN_ACCESO, folio);
      const total = numero(v.montoAprobado) ?? numero(v.montoSolicitado);
      return {
        ref,
        tipo: 'viatico',
        acceso: true,
        folio,
        titulo: v.motivo || (v.categoria ? `Viático de ${v.categoria.toLowerCase().replace(/_/g, ' ')}` : 'Viático'),
        estado: v.estatus,
        detalle: [v.User?.nombre ?? null, fechaCorta(v.fechaSolicitud)].filter((x): x is string => Boolean(x)),
        monto: total != null ? { total, moneda: 'MXN' } : null,
        href,
      };
    });
  }

  private async facturas(items: Pendiente[], tenantId: number, user: ActorLiga): Promise<TarjetaLiga[]> {
    const ve = this.puede(user, '/api/accounting/invoices/1', [PERMISSIONS.INVOICING_VIEW]);
    const filas = await this.prisma.invoice.findMany({
      where: { id: { in: items.map((i) => i.liga.id) }, companyId: tenantId },
      select: {
        id: true,
        invoiceNumber: true,
        cfdiSerie: true,
        cfdiFolio: true,
        status: true,
        totalAmount: true,
        paidAmount: true,
        currency: true,
        dueDate: true,
        receptorName: true,
        isCancelled: true,
        client: { select: { name: true } },
      },
    });
    return items.map(({ ref, liga }) => {
      const f = filas.find((x) => x.id === liga.id);
      const href = rutaDeLiga.factura(liga.id);
      if (!f) return tarjetaGenerica(ref, 'factura', href, NO_ENCONTRADA);
      const folio = f.cfdiSerie && f.cfdiFolio ? `${f.cfdiSerie}-${f.cfdiFolio}` : f.invoiceNumber;
      if (!ve) return tarjetaGenerica(ref, 'factura', href, SIN_ACCESO, folio);
      const total = numero(f.totalAmount);
      const pagado = numero(f.paidAmount) ?? 0;
      const vence = fechaCorta(f.dueDate);
      return {
        ref,
        tipo: 'factura',
        acceso: true,
        folio,
        titulo: f.client?.name || f.receptorName || folio,
        estado: f.isCancelled ? 'Cancelada' : (ESTADO_FACTURA[f.status] ?? f.status),
        detalle: [
          vence ? `Vence ${vence}` : null,
          total != null && pagado > 0 && pagado < total ? `Pagado ${pagado.toLocaleString('es-MX')}` : null,
        ].filter((x): x is string => Boolean(x)),
        monto: total != null ? { total, moneda: f.currency || 'MXN' } : null,
        href,
      };
    });
  }

  // ─────────────────────────── selector ───────────────────────────

  /**
   * Búsqueda del selector «Ligar» para los tipos nuevos. Quien no puede ver un tipo recibe la lista
   * vacía: no se le ofrece ligar lo que no podría abrir.
   */
  async buscar(user: ActorLiga, companyId: number | null | undefined, kind: string, q: string): Promise<LigaEncontrada[]> {
    const tenantId = requireCompanyId(companyId);
    const tipo = TIPO_DE_KIND[kind];
    const query = (q ?? '').trim().slice(0, 80);
    const ci = (v: string) => ({ contains: v, mode: 'insensitive' as const });
    switch (tipo) {
      case 'cotizacion': {
        if (!this.puede(user, '/api/cotizaciones/core/1', [PERMISSIONS.COTIZACIONES_ACCESS])) return [];
        const filas = await this.prisma.cotizacion.findMany({
          where: {
            companyId: tenantId,
            ...(query
              ? { OR: [{ quoteNumber: ci(query) }, { clientName: ci(query) }, { clientCompany: ci(query) }, { projectName: ci(query) }] }
              : {}),
          },
          select: { id: true, quoteNumber: true, status: true, clientCompany: true, clientName: true, projectName: true },
          orderBy: { id: 'desc' },
          take: 20,
        });
        return filas.map((c) => ({
          kind,
          id: c.id,
          label: c.quoteNumber,
          subtitle: [c.projectName, c.clientCompany || c.clientName, ESTADO_COTIZACION[c.status] ?? c.status]
            .filter(Boolean)
            .join(' · '),
          href: rutaDeLiga.cotizacion(c.id),
        }));
      }
      case 'cliente': {
        const ve = this.puede(user, '/api/ventas/clientes/1', [
          PERMISSIONS.SALES_VIEW,
          PERMISSIONS.PANEL_VENTAS,
          PERMISSIONS.ACTIVITIES_VIEW,
          PERMISSIONS.ACTIVITIES_MANAGE,
        ]);
        if (!ve) return [];
        const filas = await this.prisma.salesClient.findMany({
          where: { companyId: tenantId, ...(query ? { OR: [{ name: ci(query) }, { legalName: ci(query) }] } : {}) },
          select: { id: true, name: true, legalName: true, status: true, tipo: true, ownerId: true, sectors: { select: { sector: true } } },
          orderBy: { name: 'asc' },
          take: 40,
        });
        return filas
          .filter((c) => puedeVerCliente(c, user))
          .slice(0, 20)
          .map((c) => ({
            kind,
            id: c.id,
            label: `Cliente · ${c.name}`,
            subtitle: [c.legalName, c.status].filter(Boolean).join(' · ') || 'Cliente',
            href: rutaDeLiga.cliente(c.id),
          }));
      }
      case 'proyecto': {
        if (!this.puede(user, '/api/proyectos/1', [PERMISSIONS.CONSOLE_ACCESS])) return [];
        const filas = await this.prisma.operationalProject.findMany({
          where: { companyId: tenantId, ...(query ? { OR: [{ title: ci(query) }, { client: { name: ci(query) } }] } : {}) },
          select: { id: true, title: true, status: true, client: { select: { name: true } } },
          orderBy: { updatedAt: 'desc' },
          take: 20,
        });
        return filas.map((p) => ({
          kind,
          id: p.id,
          label: `Proyecto · ${p.title}`,
          subtitle: [p.client?.name, ESTADO_PROYECTO[p.status] ?? p.status].filter(Boolean).join(' · '),
          href: rutaDeLiga.proyecto(p.id),
        }));
      }
      case 'asistencia': {
        // Personas cuya asistencia puede ver: la propia, y la de su equipo si gestiona asistencia.
        const alcance = await this.chat.resolveChatScope(user.id, tenantId);
        const gestiona = user.isSuperAdmin || (user.permissions ?? []).includes(PERMISSIONS.ATTENDANCE_MANAGE);
        const where: Prisma.UserWhereInput = {
          isActive: true,
          companyMemberships: { some: { companyId: tenantId } },
          ...(query ? { nombre: ci(query) } : {}),
          ...(gestiona && (alcance.isOmniscient || user.isSuperAdmin)
            ? {}
            : { id: { in: gestiona ? [user.id, ...alcance.reportIds] : [user.id] } }),
        };
        const personas = await this.prisma.user.findMany({
          where,
          select: { id: true, nombre: true },
          orderBy: { nombre: 'asc' },
          take: 20,
        });
        const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
        return personas.map((p) => ({
          kind,
          id: p.id,
          label: `Asistencia · ${p.nombre} · ${diaCorto(hoy)}`,
          subtitle: 'Entrada, salida y horas de hoy',
          href: rutaDeLiga.asistencia(p.id, hoy),
        }));
      }
      case 'viatico': {
        if (!this.puede(user, '/api/viatics/1', [PERMISSIONS.VIATICS_VIEW, PERMISSIONS.VIATICS_MANAGE])) return [];
        const gestiona =
          user.isSuperAdmin ||
          (user.permissions ?? []).includes(PERMISSIONS.VIATICS_MANAGE) ||
          (user.permissions ?? []).includes('console.admin');
        const rol = this.rolV2(user);
        const empresa =
          user.isSuperAdmin ||
          (gestiona && (!user.departmentId || rol === ROLES.CEO || rol === ROLES.DIR_ADMIN || rol === ROLES.CONTABILIDAD));
        const alcance: Prisma.ViaticoWhereInput = empresa
          ? {}
          : gestiona && user.departmentId
            ? { OR: [{ usuarioId: user.id }, { User: { departmentId: user.departmentId } }] }
            : { usuarioId: user.id };
        const texto: Prisma.ViaticoWhereInput = query
          ? { OR: [{ motivo: ci(query) }, { categoria: ci(query) }, { User: { nombre: ci(query) } }] }
          : {};
        const filas = await this.prisma.viatico.findMany({
          where: { companyId: tenantId, AND: [alcance, texto] },
          select: { id: true, motivo: true, categoria: true, estatus: true, montoSolicitado: true, User: { select: { nombre: true } } },
          orderBy: { fechaSolicitud: 'desc' },
          take: 20,
        });
        return filas.map((v) => ({
          kind,
          id: v.id,
          label: `Viático #${v.id}${v.categoria ? ` · ${v.categoria.toLowerCase().replace(/_/g, ' ')}` : ''}`,
          subtitle: [v.User?.nombre, v.motivo, v.estatus].filter(Boolean).join(' · '),
          href: rutaDeLiga.viatico(v.id),
        }));
      }
      case 'factura': {
        if (!this.puede(user, '/api/accounting/invoices/1', [PERMISSIONS.INVOICING_VIEW])) return [];
        const filas = await this.prisma.invoice.findMany({
          where: {
            companyId: tenantId,
            ...(query
              ? { OR: [{ invoiceNumber: ci(query) }, { cfdiFolio: ci(query) }, { receptorName: ci(query) }, { client: { name: ci(query) } }] }
              : {}),
          },
          select: { id: true, invoiceNumber: true, cfdiSerie: true, cfdiFolio: true, status: true, receptorName: true, client: { select: { name: true } } },
          orderBy: { issueDate: 'desc' },
          take: 20,
        });
        return filas.map((f) => {
          const folio = f.cfdiSerie && f.cfdiFolio ? `${f.cfdiSerie}-${f.cfdiFolio}` : f.invoiceNumber;
          return {
            kind,
            id: f.id,
            label: `Factura ${folio}`,
            subtitle: [f.client?.name || f.receptorName, ESTADO_FACTURA[f.status] ?? f.status].filter(Boolean).join(' · '),
            href: rutaDeLiga.factura(f.id),
          };
        });
      }
      default:
        return [];
    }
  }
}
