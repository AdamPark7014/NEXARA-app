import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ClaudeService } from '../../ai/claude/claude.service.js';
import { requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { limpiarBorrador, type BorradorFacturaIa } from './factura-ia.js';

@Injectable()
export class FacturaIaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
  ) {}

  async armarBorrador(
    companyIdRaw: number | null,
    _userId: number,
    body: { texto?: string; cotizacionId?: number },
  ): Promise<{ borrador: BorradorFacturaIa; mensaje: string }> {
    const companyId = requireCompanyId(companyIdRaw);
    if (!this.claude.disponible()) {
      throw new ServiceUnavailableException('La IA no está disponible: arma la factura a mano.');
    }

    let contexto = (body.texto ?? '').trim();
    if (body.cotizacionId) {
      const cot = await this.prisma.cotizacion.findFirst({
        where: { id: body.cotizacionId, companyId },
        include: { items: true, salesClient: { select: { id: true, name: true, taxId: true } } },
      });
      if (!cot) throw new BadRequestException('No encontramos esa cotización.');
      contexto += `\nCotización #${cot.id} cliente=${cot.salesClient?.name ?? cot.clientName ?? cot.clientCompany ?? ''}\n`;
      for (const it of cot.items ?? []) {
        contexto += `- ${it.name} qty=${it.qty} precio=${it.unitPrice}\n`;
      }
    }
    if (!contexto) throw new BadRequestException('Pega un texto, PDF leído o indica una cotización.');

    const { datos } = await this.claude.json<Partial<BorradorFacturaIa>>({
      proceso: 'contadora-factura',
      companyId,
      sistema: [
        'Armas el borrador de una factura CFDI 4.0 mexicana. No timbres. Devuelve JSON con cliente (nombre, rfc, regimen, cp), usoCfdi/formaPago/metodoPago como {valor,fuente,confianza}, conceptos (descripcion, cantidad, unidad, precioUnitario, claveProdServ, claveUnidad, ivaTasa, fuente). Cantidad y descripción van SEPARADAS; si hay muchas piezas (ej. 1000 tarjetas), descripcion debe decir «Tarjeta… — 1,000 piezas».',
      ],
      usuario: contexto.slice(0, 12_000),
      esquema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          cliente: { type: 'object' },
          usoCfdi: { type: 'object' },
          formaPago: { type: 'object' },
          metodoPago: { type: 'object' },
          conceptos: { type: 'array' },
          notas: { type: 'string' },
        },
      },
      modelo: 'claude-haiku-5-5',
      esfuerzo: 'low',
      pensar: false,
    });

    const borrador = limpiarBorrador(datos);
    const clientes = await this.prisma.salesClient.findMany({
      where: { companyId },
      select: { id: true, name: true, taxId: true },
      take: 500,
    });
    const padron = clientes.map((c) => ({ id: c.id, name: c.name, rfc: c.taxId }));

    const match = this.resolverCliente(borrador.cliente.nombre, borrador.cliente.rfc, padron);
    if (match) {
      borrador.cliente.id = match.id;
      borrador.cliente.nombre = match.name;
      borrador.cliente.rfc = match.rfc;
      borrador.cliente.altaPropuesta = false;
      borrador.cliente.fuente = 'catalogo';
      borrador.cliente.confianza = 'alta';
    } else {
      borrador.cliente.altaPropuesta = true;
      borrador.cliente.confianza = 'media';
    }

    return {
      borrador,
      mensaje: 'Borrador listo: revisa y edita antes de timbrar. Nada se timbró.',
    };
  }

  private resolverCliente(
    nombre: string,
    rfc: string | null,
    clientes: { id: number; name: string; rfc: string | null }[],
  ) {
    const rfcN = (rfc ?? '').trim().toUpperCase();
    if (rfcN) {
      const porRfc = clientes.find((c) => (c.rfc ?? '').toUpperCase() === rfcN);
      if (porRfc) return porRfc;
    }
    const needle = nombre.trim().toLowerCase();
    if (!needle) return null;
    const exacto = clientes.find((c) => c.name.trim().toLowerCase() === needle);
    if (exacto) return exacto;
    // Siglas / contiene (UAP, etc.)
    // Siglas cortas (uap → Benemérita Universidad Autónoma de Puebla)
    const siglas = needle.replace(/\./g, '');
    if (siglas.length >= 2 && siglas.length <= 6) {
      const porSiglas = clientes.find((c) => {
        const iniciales = c.name
          .split(/\s+/)
          .filter((w) => /^[A-Za-zÁÉÍÓÚÑáéíóú]/.test(w))
          .map((w) => w[0])
          .join('')
          .toLowerCase();
        return iniciales.includes(siglas) || c.name.toLowerCase().includes(siglas);
      });
      if (porSiglas) return porSiglas;
    }
    return (
      clientes.find(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          needle.split(/\s+/).every((p) => p.length > 1 && c.name.toLowerCase().includes(p)),
      ) ?? null
    );
  }
}
