import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';
import { assertRefsBelongToCompany } from '../common/tenant/assert-refs.js';
import { getUploadSubdir } from '../common/upload-paths.js';
import { MENSAJE_SIN_ACCESO_CCTV, puedeDisenarCctvSegunGente } from './acceso-cctv.js';
import { CROQUIS_SUBDIR, leerImagenCroquis } from './croquis-imagen.js';
import { ConflictoVersionDiseno } from './conflicto-version.js';
import { ESTADOS_DISENO, nombreDiseno, planoVacio, validarExtra, validarPlano } from './plano-cctv.js';
import type { CrearDisenoDto } from './dto/crear-diseno.dto.js';
import type { GuardarDisenoDto } from './dto/guardar-diseno.dto.js';

/** Quien llama, tal como lo dejan `UrlAccessGuard` y el JWT. */
export type ActorCctv = {
  id: number;
  roleKey: string | null;
  isSuperAdmin: boolean;
  email: string | null;
};

type Persona = { id: number; nombre: string };

/** Lo que trae la lista: sin `plano` ni `grabacion`, que son lo pesado. */
const SELECT_FILA = {
  id: true,
  nombre: true,
  clienteId: true,
  cotizacionId: true,
  estado: true,
  resumen: true,
  version: true,
  creadoPorId: true,
  actualizadoPorId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const SELECT_COMPLETO = { ...SELECT_FILA, plano: true, grabacion: true } as const;

type FilaDb = Prisma.CctvDisenoGetPayload<{ select: typeof SELECT_FILA }>;
type CompletoDb = Prisma.CctvDisenoGetPayload<{ select: typeof SELECT_COMPLETO }>;

type Nombres = { personas: Map<number, string>; clientes: Map<number, string> };

/** La lista no crece sin fin: con 200 diseños vivos alcanza para cualquier empresa. */
export const LISTA_DISENOS_MAX = 200;

const NO_ENCONTRADO = 'Diseño no encontrado';

@Injectable()
export class CctvDisenosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ¿Entra al diseñador? Solo cuenta su gente (una consulta) cuando el rol lo pide: dirección,
   * coordinación y los encargados entran sin ir a la base.
   */
  async puede(actor: ActorCctv): Promise<boolean> {
    if (!actor) return false;
    return puedeDisenarCctvSegunGente(this.prisma, actor);
  }

  /** `GET /cctv-disenos/acceso`: nunca 403, solo la bandera. */
  async acceso(actor: ActorCctv): Promise<{ puede: boolean }> {
    return { puede: await this.puede(actor) };
  }

  async listar(actor: ActorCctv, companyId: number | null) {
    await this.exigirAcceso(actor);
    const empresa = requireCompanyId(companyId);
    const filas = await this.prisma.cctvDiseno.findMany({
      where: { companyId: empresa, archivadoAt: null },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: LISTA_DISENOS_MAX,
      select: SELECT_FILA,
    });
    const nombres = await this.nombres(filas, empresa);
    return { disenos: filas.map((f) => this.aFila(f, nombres)) };
  }

  async detalle(actor: ActorCctv, id: number, companyId: number | null) {
    await this.exigirAcceso(actor);
    return this.cargar(id, requireCompanyId(companyId));
  }

  async crear(actor: ActorCctv, dto: CrearDisenoDto, companyId: number | null) {
    await this.exigirAcceso(actor);
    const empresa = requireCompanyId(companyId);
    const nombre = nombreDiseno(dto.nombre);
    const plano = dto.plano == null ? planoVacio() : validarPlano(dto.plano);
    await this.revisarReferencias(empresa, dto.clienteId, dto.cotizacionId);

    const creado = await this.prisma.cctvDiseno.create({
      data: {
        companyId: empresa,
        nombre,
        clienteId: dto.clienteId ?? null,
        cotizacionId: dto.cotizacionId ?? null,
        plano: plano as Prisma.InputJsonValue,
        creadoPorId: actor.id,
      },
      select: { id: true },
    });
    return this.cargar(creado.id, empresa);
  }

  /**
   * Guarda con concurrencia optimista: un solo `updateMany` que exige la versión que se abrió.
   * Si no tocó nada, o el diseño ya no está (404) o alguien guardó antes (409 con su versión).
   */
  async guardar(actor: ActorCctv, id: number, dto: GuardarDisenoDto, companyId: number | null) {
    await this.exigirAcceso(actor);
    const empresa = requireCompanyId(companyId);

    const data: Prisma.CctvDisenoUpdateManyMutationInput = {
      version: { increment: 1 },
      actualizadoPorId: actor.id,
    };
    if (dto.nombre !== undefined) data.nombre = nombreDiseno(dto.nombre);
    if (dto.estado !== undefined) {
      if (!(ESTADOS_DISENO as readonly string[]).includes(String(dto.estado))) {
        throw new BadRequestException('El estado debe ser borrador, enviada o aprobada.');
      }
      data.estado = dto.estado;
    }
    if (dto.clienteId !== undefined) data.clienteId = dto.clienteId;
    if (dto.cotizacionId !== undefined) data.cotizacionId = dto.cotizacionId;
    if (dto.plano !== undefined) data.plano = validarPlano(dto.plano) as Prisma.InputJsonValue;
    if (dto.grabacion !== undefined) data.grabacion = jsonOpcional(validarExtra(dto.grabacion, 'grabacion'));
    if (dto.resumen !== undefined) data.resumen = jsonOpcional(validarExtra(dto.resumen, 'resumen'));
    await this.revisarReferencias(empresa, dto.clienteId, dto.cotizacionId);

    const { count } = await this.prisma.cctvDiseno.updateMany({
      where: { id, companyId: empresa, version: dto.version, archivadoAt: null },
      data,
    });
    if (count === 0) {
      const actual = await this.prisma.cctvDiseno.findFirst({
        where: { id, companyId: empresa, archivadoAt: null },
        select: { version: true },
      });
      if (!actual) throw new NotFoundException(NO_ENCONTRADO);
      throw new ConflictoVersionDiseno(actual.version);
    }
    return this.cargar(id, empresa);
  }

  /** Archiva (no borra): sale de la lista y deja de abrirse. */
  async archivar(actor: ActorCctv, id: number, companyId: number | null) {
    await this.exigirAcceso(actor);
    const empresa = requireCompanyId(companyId);
    const { count } = await this.prisma.cctvDiseno.updateMany({
      where: { id, companyId: empresa, archivadoAt: null },
      data: { archivadoAt: new Date(), actualizadoPorId: actor.id },
    });
    if (count === 0) throw new NotFoundException(NO_ENCONTRADO);
    return { ok: true, id };
  }

  /**
   * Sube el croquis y devuelve dónde quedó y sus medidas. No toca el diseño: la web lo pone en
   * `plano.croquis` y lo guarda con su versión, así la subida no le gana a un guardado.
   *
   * `/uploads/cctv-croquis/` exige sesión: no está en `PUBLIC_UPLOAD_PREFIXES`
   * (`common/security/uploads-access.ts`), que es una lista blanca.
   */
  async subirCroquis(
    actor: ActorCctv,
    id: number,
    archivo: { buffer?: Buffer; originalname?: string; mimetype?: string; size?: number } | undefined,
    companyId: number | null,
  ) {
    await this.exigirAcceso(actor);
    const empresa = requireCompanyId(companyId);
    const existe = await this.prisma.cctvDiseno.findFirst({
      where: { id, companyId: empresa, archivadoAt: null },
      select: { id: true },
    });
    if (!existe) throw new NotFoundException(NO_ENCONTRADO);

    const imagen = await leerImagenCroquis(archivo);
    const carpeta = getUploadSubdir(__dirname, CROQUIS_SUBDIR);
    // Nombre propio y difícil de adivinar; la extensión sale del formato real, no del nombre.
    const nombreArchivo = `${id}-${Date.now()}-${randomBytes(8).toString('hex')}${imagen.extension}`;
    await fs.writeFile(path.join(carpeta, nombreArchivo), archivo!.buffer!);

    return {
      url: `/uploads/${CROQUIS_SUBDIR}/${nombreArchivo}`,
      anchoPx: imagen.anchoPx,
      altoPx: imagen.altoPx,
    };
  }

  private async exigirAcceso(actor: ActorCctv) {
    if (!(await this.puede(actor))) throw new ForbiddenException(MENSAJE_SIN_ACCESO_CCTV);
  }

  private async cargar(id: number, empresa: number) {
    const fila = await this.prisma.cctvDiseno.findFirst({
      where: { id, companyId: empresa, archivadoAt: null },
      select: SELECT_COMPLETO,
    });
    if (!fila) throw new NotFoundException(NO_ENCONTRADO);
    const nombres = await this.nombres([fila], empresa);
    return {
      ...this.aFila(fila, nombres),
      plano: fila.plano,
      grabacion: fila.grabacion ?? null,
    };
  }

  /** El cliente y la cotización tienen que ser de la empresa (un `create` no lo revisa solo). */
  private async revisarReferencias(
    empresa: number,
    clienteId: number | null | undefined,
    cotizacionId: number | null | undefined,
  ) {
    await assertRefsBelongToCompany(empresa, [
      { modelo: this.prisma.salesClient, ids: [clienteId], etiqueta: 'Cliente' },
      { modelo: this.prisma.cotizacion, ids: [cotizacionId], etiqueta: 'Cotización' },
    ]);
  }

  /** Nombres de quienes crearon y editaron, y de los clientes: dos consultas para toda la lista. */
  private async nombres(filas: Array<FilaDb | CompletoDb>, empresa: number): Promise<Nombres> {
    const personaIds = [
      ...new Set(
        filas.flatMap((f) => [f.creadoPorId, f.actualizadoPorId]).filter((v): v is number => Number.isInteger(v)),
      ),
    ];
    const clienteIds = [
      ...new Set(filas.map((f) => f.clienteId).filter((v): v is number => Number.isInteger(v))),
    ];
    const [personas, clientes] = await Promise.all([
      personaIds.length
        ? this.prisma.user.findMany({ where: { id: { in: personaIds } }, select: { id: true, nombre: true } })
        : Promise.resolve([] as Array<{ id: number; nombre: string }>),
      clienteIds.length
        ? this.prisma.salesClient.findMany({
            where: { id: { in: clienteIds }, companyId: empresa },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as Array<{ id: number; name: string }>),
    ]);
    return {
      personas: new Map(personas.map((p) => [p.id, p.nombre])),
      clientes: new Map(clientes.map((c) => [c.id, c.name])),
    };
  }

  private aFila(f: FilaDb, nombres: Nombres) {
    const persona = (id: number): Persona => ({ id, nombre: nombres.personas.get(id) ?? 'Sin nombre' });
    return {
      id: f.id,
      nombre: f.nombre,
      clienteId: f.clienteId ?? null,
      clienteNombre: f.clienteId != null ? nombres.clientes.get(f.clienteId) ?? null : null,
      cotizacionId: f.cotizacionId ?? null,
      estado: f.estado,
      resumen: f.resumen ?? null,
      version: f.version,
      creadoPor: persona(f.creadoPorId),
      actualizadoPor: f.actualizadoPorId != null ? persona(f.actualizadoPorId) : null,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
    };
  }
}

/** `null` borra la columna JSON (en Prisma es `DbNull`, no `null`). */
function jsonOpcional(valor: Record<string, unknown> | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return valor === null ? Prisma.DbNull : (valor as Prisma.InputJsonValue);
}
