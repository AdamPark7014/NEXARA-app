import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCompanyAccess, companyWhere, requireCompanyId } from '../../common/tenant/tenant-scope.js';
import {
  MOMENTOS,
  normalizarCampos,
  normalizarMomento,
  progresoDeCampos,
  type CampoEntrada,
  type Momento,
} from './evidence-fields.helpers.js';

/** Una foto de campo tal como la ve la web y las apps. */
export type FotoDeCampoDto = {
  id: number;
  momento: Momento;
  photoUrl: string;
  latitude: number | null;
  longitude: number | null;
  capturedAt: Date | null;
  por: { id: number; nombre: string } | null;
};

export type CampoDto = {
  id: number;
  nombre: string;
  momentos: Momento[];
  notas: string | null;
  orden: number;
  /** Lo que ya está documentado, por momento. `null` = hueco pendiente. */
  fotos: Record<Momento, FotoDeCampoDto | null>;
  /** Momentos que le faltan a este campo. */
  pendientes: Momento[];
  completo: boolean;
};

/**
 * Los campos de evidencia de una actividad: qué hay que documentar y en qué momentos.
 *
 * Los campos son de la **actividad**, no de cada persona: si va un equipo, «Cámara 1 ×
 * antes» se documenta una vez y la foto guarda quién la tomó. Así el ZIP sale con una
 * carpeta por campo y no con una copia por técnico.
 */
@Injectable()
export class ActivityEvidenceFieldsService {
  private readonly logger = new Logger(ActivityEvidenceFieldsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async cargarActividad(activityId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, ...companyWhere(tenantId) },
      select: { id: true, companyId: true, estatus: true, titulo: true, anNumber: true },
    });
    assertCompanyAccess(activity, tenantId, 'Actividad');
    return activity!;
  }

  /**
   * Define (o reemplaza) los campos de la actividad. Se llama al asignar o al despachar.
   * Un campo que desaparece de la lista se borra con sus fotos; los que siguen conservan
   * lo que ya se documentó.
   */
  async definirCampos(activityId: number, entrada: unknown, companyId?: number | null) {
    const activity = await this.cargarActividad(activityId, companyId);
    const campos = normalizarCampos(entrada);

    const existentes = await this.prisma.activityEvidenceField.findMany({
      where: { activityId, ...companyWhere(activity.companyId) },
      select: { id: true, nombre: true },
    });

    // Se conserva por id cuando viene, y si no por nombre: renombrar un campo no debe
    // tirar las fotos que ya se tomaron.
    const porId = new Map(existentes.map((c) => [c.id, c]));
    const porNombre = new Map(existentes.map((c) => [c.nombre.trim().toLowerCase(), c]));
    const conservados = new Set<number>();

    await this.prisma.$transaction(async (tx) => {
      for (const campo of campos) {
        const previo =
          (campo.id != null ? porId.get(campo.id) : undefined) ??
          porNombre.get(campo.nombre.trim().toLowerCase());

        if (previo) {
          conservados.add(previo.id);
          await tx.activityEvidenceField.update({
            where: { id: previo.id },
            data: {
              nombre: campo.nombre,
              momentos: campo.momentos,
              notas: campo.notas,
              orden: campo.orden,
            },
          });
        } else {
          const creado = await tx.activityEvidenceField.create({
            data: {
              activityId,
              companyId: activity.companyId,
              nombre: campo.nombre,
              momentos: campo.momentos,
              notas: campo.notas,
              orden: campo.orden,
            },
            select: { id: true },
          });
          conservados.add(creado.id);
        }
      }

      const sobran = existentes.filter((c) => !conservados.has(c.id)).map((c) => c.id);
      if (sobran.length > 0) {
        await tx.activityEvidenceField.deleteMany({ where: { id: { in: sobran } } });
      }
    });

    return this.listarCampos(activityId, companyId);
  }

  /** Los campos con lo que ya se documentó de cada uno. */
  async listarCampos(activityId: number, companyId?: number | null): Promise<CampoDto[]> {
    const activity = await this.cargarActividad(activityId, companyId);
    return this.listarCamposDeActividad(activityId, activity.companyId);
  }

  /**
   * Igual que `listarCampos` pero sin volver a cargar la actividad: lo usan el flujo de
   * evidencias y el ZIP, que ya la validaron.
   */
  async listarCamposDeActividad(activityId: number, companyId: number): Promise<CampoDto[]> {
    const filas = await this.prisma.activityEvidenceField.findMany({
      where: { activityId, ...companyWhere(companyId) },
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
      include: {
        fotos: {
          include: { user: { select: { id: true, nombre: true } } },
        },
      },
    });

    return filas.map((fila) => {
      const momentos = this.momentosDe(fila.momentos);
      const fotos = Object.fromEntries(MOMENTOS.map((m) => [m, null])) as Record<
        Momento,
        FotoDeCampoDto | null
      >;
      for (const foto of fila.fotos) {
        const momento = normalizarMomento(foto.momento);
        if (!momento) continue;
        fotos[momento] = {
          id: foto.id,
          momento,
          photoUrl: foto.photoUrl,
          latitude: foto.latitude == null ? null : Number(foto.latitude),
          longitude: foto.longitude == null ? null : Number(foto.longitude),
          capturedAt: foto.capturedAt,
          por: foto.user ? { id: foto.user.id, nombre: foto.user.nombre } : null,
        };
      }
      const pendientes = momentos.filter((m) => !fotos[m]);
      return {
        id: fila.id,
        nombre: fila.nombre,
        momentos,
        notas: fila.notas,
        orden: fila.orden,
        fotos,
        pendientes,
        completo: pendientes.length === 0,
      };
    });
  }

  private momentosDe(valor: unknown): Momento[] {
    const lista = Array.isArray(valor) ? valor : [];
    const vistos = new Set<Momento>();
    for (const item of lista) {
      const momento = normalizarMomento(item);
      if (momento) vistos.add(momento);
    }
    return MOMENTOS.filter((m) => vistos.has(m));
  }

  /** Avance de la actividad sobre los huecos pedidos. Sin campos: nada que exigir. */
  async progreso(activityId: number, companyId: number) {
    const campos = await this.listarCamposDeActividad(activityId, companyId);
    return { campos, ...progresoDeCampos(campos) };
  }

  /**
   * Guarda (o reemplaza) la foto de un campo en un momento. La ruta ya viene resuelta
   * por el controlador: aquí nunca entra un base64.
   */
  async guardarFoto(params: {
    activityId: number;
    fieldId: number;
    momento: unknown;
    photoUrl: string;
    latitude?: unknown;
    longitude?: unknown;
    capturedAt?: string | null;
    userId: number;
    companyId?: number | null;
  }): Promise<CampoDto[]> {
    const activity = await this.cargarActividad(params.activityId, params.companyId);

    const momento = normalizarMomento(params.momento);
    if (!momento) {
      throw new BadRequestException('Indica el momento de la foto: antes, en progreso o después.');
    }

    const campo = await this.prisma.activityEvidenceField.findFirst({
      where: { id: params.fieldId, activityId: params.activityId, ...companyWhere(activity.companyId) },
      select: { id: true, nombre: true, momentos: true },
    });
    if (!campo) throw new NotFoundException('Ese punto de evidencia no existe en esta actividad');

    if (!this.momentosDe(campo.momentos).includes(momento)) {
      throw new BadRequestException(`«${campo.nombre}» no pide foto de ese momento.`);
    }

    const url = (params.photoUrl || '').trim();
    if (!url || url.startsWith('data:') || url.includes(';base64,') || url.length > 500) {
      throw new BadRequestException(
        `No se pudo guardar la foto de «${campo.nombre}»: la imagen no se subió correctamente. Vuelve a tomarla.`,
      );
    }

    const lat = this.coordenada(params.latitude, 90);
    const lng = this.coordenada(params.longitude, 180);
    const capturedAt = this.fecha(params.capturedAt);

    await this.prisma.activityEvidenceFieldPhoto.upsert({
      where: { fieldId_momento: { fieldId: campo.id, momento } },
      create: {
        fieldId: campo.id,
        activityId: params.activityId,
        userId: params.userId,
        companyId: activity.companyId,
        momento,
        photoUrl: url,
        latitude: lat,
        longitude: lng,
        capturedAt,
      },
      update: {
        userId: params.userId,
        photoUrl: url,
        latitude: lat,
        longitude: lng,
        capturedAt,
      },
    });

    return this.listarCamposDeActividad(params.activityId, activity.companyId);
  }

  /** Quitar una foto deja el hueco pendiente otra vez. */
  async borrarFoto(params: {
    activityId: number;
    fieldId: number;
    momento: unknown;
    companyId?: number | null;
  }): Promise<CampoDto[]> {
    const activity = await this.cargarActividad(params.activityId, params.companyId);
    const momento = normalizarMomento(params.momento);
    if (!momento) throw new BadRequestException('Momento inválido');

    await this.prisma.activityEvidenceFieldPhoto.deleteMany({
      where: {
        fieldId: params.fieldId,
        activityId: params.activityId,
        momento,
        ...companyWhere(activity.companyId),
      },
    });
    return this.listarCamposDeActividad(params.activityId, activity.companyId);
  }

  private coordenada(valor: unknown, tope: number): number | null {
    if (valor == null || valor === '') return null;
    const n = Number(valor);
    if (!Number.isFinite(n) || Math.abs(n) > tope) return null;
    return n;
  }

  private fecha(valor: unknown): Date | null {
    if (typeof valor !== 'string' || !valor.trim()) return null;
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d;
  }
}
