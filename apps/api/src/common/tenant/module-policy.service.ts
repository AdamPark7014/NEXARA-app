import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  MODULE_POLICY_SETTING_KEY,
  RESTRICTABLE_MODULES,
  modulosOcultosPara,
  parsearPolitica,
  puedeUsarModulo,
  type ModulePolicy,
  type RestrictableModuleId,
  type UsuarioDePolitica,
} from './module-policy.js';

const TTL_MS = 30_000;

/**
 * Lee la política de módulos de una empresa (`SystemSetting` `rbac.module_roles`).
 *
 * La fila de la empresa gana sobre la de plataforma (`companyId` null). Se guarda en memoria 30 s
 * para no pegarle a la base en cada petición; `invalidar()` la limpia al instante tras un cambio.
 * `SystemSetting` no está en `TENANT_SCOPED_MODELS`, así que la consulta directa ve las dos filas.
 */
@Injectable()
export class ModulePolicyService {
  private readonly cache = new Map<number | 'plataforma', { at: number; politica: ModulePolicy }>();

  constructor(private readonly prisma: PrismaService) {}

  async politicaDe(companyId: number | null | undefined): Promise<ModulePolicy> {
    const cid = companyId != null && Number(companyId) > 0 ? Number(companyId) : null;
    const clave = cid ?? 'plataforma';
    const previo = this.cache.get(clave);
    if (previo && Date.now() - previo.at < TTL_MS) return previo.politica;

    const filas = await this.prisma.systemSetting.findMany({
      where: {
        key: MODULE_POLICY_SETTING_KEY,
        ...(cid != null ? { OR: [{ companyId: null }, { companyId: cid }] } : { companyId: null }),
      },
      select: { companyId: true, value: true },
    });
    const propia = cid != null ? filas.find((f) => f.companyId === cid) : undefined;
    const base = filas.find((f) => f.companyId == null);
    const politica = parsearPolitica((propia ?? base)?.value);
    this.cache.set(clave, { at: Date.now(), politica });
    return politica;
  }

  invalidar(companyId?: number | null): void {
    if (companyId == null) this.cache.clear();
    else this.cache.delete(Number(companyId));
  }

  async puedeUsar(
    modulo: RestrictableModuleId,
    user: UsuarioDePolitica | null | undefined,
    companyId: number | null | undefined,
  ): Promise<boolean> {
    return puedeUsarModulo(await this.politicaDe(companyId), modulo, user);
  }

  /** 403 en español si la empresa restringió el módulo y este usuario no es de los permitidos. */
  async exigir(
    modulo: RestrictableModuleId,
    user: UsuarioDePolitica | null | undefined,
    companyId: number | null | undefined,
  ): Promise<void> {
    if (await this.puedeUsar(modulo, user, companyId)) return;
    throw new ForbiddenException(
      `«${RESTRICTABLE_MODULES[modulo].label}» está restringido en esta empresa. Pídele acceso a la dirección.`,
    );
  }

  async ocultosPara(
    user: UsuarioDePolitica | null | undefined,
    companyId: number | null | undefined,
  ): Promise<RestrictableModuleId[]> {
    return modulosOcultosPara(await this.politicaDe(companyId), user);
  }
}
