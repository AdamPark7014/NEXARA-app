import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolveRequiredCompanyId } from '../common/tenant/tenant-scope.js';
import { ClaudeService } from '../ai/claude/claude.service.js';
import { CONFIG_DUPLICADOS, limpiarDuplicados, peticionDuplicados, type CoincidenciaIa } from '../ai/duplicados/duplicados-ia.js';
import { isInactiveClientStatus } from './client-permissions.js';
import { puedeVerCliente } from './client-access.js';
import { sectoresDelCliente, type ClientSectorCode } from './client-sectors.js';
import { clientesParecidos, explicarParecido, type FichaComparable } from './clientes-parecidos.js';
import type { BuscarParecidosDto } from './dto/buscar-parecidos.dto.js';

export type ClienteParecido = {
  id: number;
  nombre: string;
  /** Solo si quien pregunta puede abrir ese cliente. */
  razonSocial: string | null;
  tipos: ClientSectorCode[];
  porque: string;
  confianza: 'alta' | 'media';
  origen: 'codigo' | 'ia';
  /** Quien no puede abrirlo sabe que existe, pero no se lo lleva. */
  puedeUsar: boolean;
  /** Para elegirlo en una actividad sin volver a pedirlo. */
  serviceClientId: number | null;
};

type FichaPadron = FichaComparable & {
  status?: string | null;
  ownerId?: number | null;
  tipo?: string | null;
  serviceClientId?: number | null;
  sectors?: Array<{ sector: string }>;
};

const SELECT_PADRON = {
  id: true,
  name: true,
  legalName: true,
  taxId: true,
  status: true,
  ownerId: true,
  tipo: true,
  serviceClientId: true,
  sectors: { select: { sector: true } },
} as const;

/** Un padrón de esta empresa no llega aquí; el tope evita leer de más si algún día crece. */
const MAX_PADRON = 2000;

/** Los clientes vigentes de una empresa, listos para comparar. Los inactivos no cuentan. */
export async function padronParaComparar(prisma: Pick<PrismaService, 'salesClient'>, companyId: number): Promise<FichaPadron[]> {
  const filas = (await prisma.salesClient.findMany({
    where: { companyId },
    select: SELECT_PADRON,
    orderBy: { id: 'asc' },
    take: MAX_PADRON,
  })) as FichaPadron[];
  return (filas ?? []).filter((c) => !isInactiveClientStatus(c.status));
}

/**
 * «¿Ya existe este cliente?» antes de darlo de alta. Primero el código (`clientes-parecidos.ts`);
 * a Claude solo llega lo que el código no pudo afirmar, y solo se cree lo que dice saber con
 * certeza (el eval muestra que con «media» avisa de más). Si la IA falla, queda lo del código:
 * dar de alta nunca depende de que responda.
 */
@Injectable()
export class ClientesParecidosService {
  private readonly logger = new Logger('ClientesParecidos');

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
  ) {}

  async buscar(dto: BuscarParecidosDto, user: any, companyId: number | null): Promise<{ parecidos: ClienteParecido[] }> {
    const tenantId = await resolveRequiredCompanyId(this.prisma, companyId);
    const nombre = String(dto.nombre ?? '').trim();
    if (nombre.length < 2) return { parecidos: [] };
    const padron = await padronParaComparar(this.prisma, tenantId);
    const aFicha = (c: FichaPadron, porque: string, confianza: 'alta' | 'media', origen: 'codigo' | 'ia'): ClienteParecido => {
      const puedeUsar = puedeVerCliente(c as never, user);
      return {
        id: c.id,
        nombre: c.name,
        razonSocial: puedeUsar ? c.legalName ?? null : null,
        tipos: sectoresDelCliente(c as never),
        porque,
        confianza,
        origen,
        puedeUsar,
        serviceClientId: puedeUsar ? c.serviceClientId ?? null : null,
      };
    };
    const porCodigo = clientesParecidos({ nombre, razonSocial: dto.razonSocial, rfc: dto.rfc, excluirId: dto.excluirId }, padron);
    const parecidos = porCodigo.map((p) => aFicha(p.cliente, explicarParecido(p.motivo), p.confianza, 'codigo'));
    if (porCodigo.some((p) => p.confianza === 'alta') || dto.soloCodigo) return { parecidos };

    const vistos = new Set(parecidos.map((p) => p.id));
    const sinExcluido = padron.filter((c) => c.id !== dto.excluirId);
    for (const c of await this.preguntarIa(nombre, sinExcluido, tenantId)) {
      const ficha = sinExcluido.find((x) => x.id === c.id);
      if (ficha && !vistos.has(c.id)) parecidos.unshift(aFicha(ficha, c.porque || 'Parece la misma organización', 'alta', 'ia'));
    }
    return { parecidos: parecidos.slice(0, 5) };
  }

  private async preguntarIa(nombre: string, padron: FichaPadron[], companyId: number): Promise<CoincidenciaIa[]> {
    if (!padron.length || !this.claude.disponible()) return [];
    try {
      const { datos } = await this.claude.json<{ coincidencias: CoincidenciaIa[] }>({
        ...peticionDuplicados(nombre, padron),
        proceso: 'clientes-duplicados',
        companyId,
        modelo: CONFIG_DUPLICADOS.modelo,
      });
      return limpiarDuplicados(datos, padron).filter((c) => c.seguridad === 'alta');
    } catch (error) {
      // Sin el nombre en el log: puede ser un dato de la empresa.
      this.logger.warn(`sin revisión de IA: ${(error as Error).message}`);
      return [];
    }
  }
}
