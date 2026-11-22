import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DescargaMasivaService } from '../../pac/descarga-masiva/descarga-masiva.service.js';
import { resolveUploadsDir } from '../../common/uploads-path.js';
import { WORKDAY_TIMEZONE } from '../../common/time/workday.js';
import { crearReporte, type ColumnaReporte } from '../../common/excel/reporte-excel.js';
import { ETIQUETA_ESTATUS_SAT, ETIQUETA_LISTA_69B, ETIQUETA_PESTANA_BUZON_SAT } from '../../common/excel/etiquetas.js';
import { pdfPeriodo } from '../../common/pdf/nexara-pdf-theme.js';
import { runScheduledJob } from '../../common/cron/run-scheduled-job.js';
import { requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { CfdiInvalidoError, leerCfdi } from '../mesa-contable/cfdi-xml.js';
import { diaMexico, interruptorActivo, periodosBuzonDiario } from './periodo-buzon.js';
import { URL_LISTA_69B_SAT, normalizarRfc, parsearCsv69B } from './lista-69b.js';
import {
  coincideImporte,
  datosInvoiceDesdeCfdi,
  datosSatCfdiDesdeCfdi,
  dentroDeDias,
  sentidoCfdi,
} from './ingest-cfdi.js';
import { PolizaPropuestaService } from './poliza-propuesta.service.js';
import { JobQueueService } from '../../jobs/job-queue.service.js';

type Pestana = 'recibidos' | 'emitidos' | 'cancelados' | 'alertas';

/** Columnas del Excel del buzón: las de la pantalla más el UUID completo, el IVA y el estatus ante el SAT. */
export const COLUMNAS_BUZON_SAT: ColumnaReporte<any>[] = [
  { clave: 'issueDate', titulo: 'Fecha', tipo: 'fecha' },
  { clave: 'emisorName', titulo: 'Emisor', ancho: 44, ajustar: true },
  { clave: 'emisorRfc', titulo: 'RFC emisor', ancho: 16 },
  { clave: 'receptorName', titulo: 'Receptor', ancho: 36, ajustar: true },
  { clave: 'cfdiUuid', titulo: 'UUID', ancho: 42 },
  { clave: 'satEstatus', titulo: 'Estatus SAT', etiquetas: ETIQUETA_ESTATUS_SAT, ancho: 14 },
  { clave: 'lista69B', titulo: 'Lista 69-B', etiquetas: ETIQUETA_LISTA_69B, ancho: 14 },
  // Los importes al final, juntos y a la derecha, como en cualquier hoja contable.
  { clave: 'totalAmount', titulo: 'Total', tipo: 'dinero', total: 'suma' },
  { clave: 'taxAmount', titulo: 'IVA', tipo: 'dinero', total: 'suma' },
];

@Injectable()
export class BuzonSatService implements OnModuleInit {
  private readonly logger = new Logger('BuzonSat');

  constructor(
    private readonly prisma: PrismaService,
    private readonly descarga: DescargaMasivaService,
    private readonly polizas: PolizaPropuestaService,
    private readonly jobs: JobQueueService,
  ) {}

  onModuleInit() {
    this.jobs.register('buzon-sat.diario', async () => {
      await runScheduledJob('buzon-sat:diario', this.logger, () => this.correrDescargaAutomatica());
    });
  }

  async listar(
    companyIdRaw: number | null,
    q: { pestana?: string; desde?: string; hasta?: string; q?: string },
  ) {
    const companyId = requireCompanyId(companyIdRaw);
    const pestana = (q.pestana ?? 'recibidos') as Pestana;
    const desde = q.desde?.slice(0, 10);
    const hasta = q.hasta?.slice(0, 10);
    const texto = (q.q ?? '').trim();

    const where: Prisma.InvoiceWhereInput = {
      companyId,
      deletedAt: null,
      origenSat: true,
    };
    if (desde || hasta) {
      where.issueDate = {};
      if (desde) where.issueDate.gte = new Date(`${desde}T00:00:00.000Z`);
      if (hasta) where.issueDate.lte = new Date(`${hasta}T23:59:59.999Z`);
    }
    if (texto) {
      where.OR = [
        { emisorRfc: { contains: texto, mode: 'insensitive' } },
        { emisorName: { contains: texto, mode: 'insensitive' } },
        { receptorRfc: { contains: texto, mode: 'insensitive' } },
        { receptorName: { contains: texto, mode: 'insensitive' } },
        { cfdiUuid: { contains: texto, mode: 'insensitive' } },
        { invoiceNumber: { contains: texto, mode: 'insensitive' } },
      ];
    }

    if (pestana === 'recibidos') {
      where.type = 'ACCOUNTS_PAYABLE';
      where.isCancelled = false;
    } else if (pestana === 'emitidos') {
      where.type = 'ACCOUNTS_RECEIVABLE';
      where.isCancelled = false;
    } else if (pestana === 'cancelados') {
      where.isCancelled = true;
    }

    const rows = await this.prisma.invoice.findMany({
      where: pestana === 'alertas' ? { companyId, deletedAt: null, origenSat: true } : where,
      orderBy: { issueDate: 'desc' },
      take: 500,
      include: {
        supplier: { select: { id: true, name: true, rfc: true, lista69B: true } },
        polizaPropuesta: { select: { id: true, estado: true, confianza: true } },
        payments: { select: { id: true }, take: 1 },
      },
    });

    let items = rows;
    if (pestana === 'alertas') {
      items = rows.filter((r) => {
        const lista69 = r.supplier?.lista69B;
        const sinPoliza =
          r.type === 'ACCOUNTS_PAYABLE' &&
          (!r.polizaPropuesta || r.polizaPropuesta.estado === 'PENDIENTE');
        const canceladoTrasPago = r.isCancelled && r.payments.length > 0;
        const sinPago =
          r.type === 'ACCOUNTS_PAYABLE' &&
          Number(r.paidAmount) < Number(r.totalAmount) - 0.01 &&
          r.payments.length === 0;
        return Boolean(lista69) || sinPoliza || canceladoTrasPago || sinPago;
      });
    }

    return {
      pestana,
      desde: desde ?? null,
      hasta: hasta ?? null,
      total: items.length,
      items: items.map((r) => ({
        id: r.id,
        invoiceNumber: r.invoiceNumber,
        type: r.type,
        status: r.status,
        issueDate: r.issueDate,
        totalAmount: Number(r.totalAmount),
        taxAmount: Number(r.taxAmount),
        ivaRetenido: r.ivaRetenido != null ? Number(r.ivaRetenido) : null,
        isrRetenido: r.isrRetenido != null ? Number(r.isrRetenido) : null,
        emisorRfc: r.emisorRfc,
        emisorName: r.emisorName,
        receptorRfc: r.receptorRfc,
        receptorName: r.receptorName,
        cfdiUuid: r.cfdiUuid,
        satEstatus: r.satEstatus,
        isCancelled: r.isCancelled,
        lista69B: r.supplier?.lista69B ?? null,
        poliza: r.polizaPropuesta,
        supplierId: r.supplierId,
      })),
    };
  }

  async importarXml(companyIdRaw: number | null, xml: string, userId: number) {
    const companyId = requireCompanyId(companyIdRaw);
    return this.guardarCfdi(companyId, xml, userId);
  }

  async guardarCfdi(companyId: number, xml: string, userId?: number) {
    let cfdi;
    try {
      cfdi = leerCfdi(xml);
    } catch (e) {
      if (e instanceof CfdiInvalidoError) throw new BadRequestException(e.message);
      throw e;
    }

    const existente = await this.prisma.invoice.findFirst({
      where: { cfdiUuid: { equals: cfdi.uuid, mode: 'insensitive' } },
      select: { id: true, companyId: true },
    });
    if (existente) {
      if (existente.companyId !== companyId) {
        throw new BadRequestException('Ese CFDI ya está en otra empresa.');
      }
      return { id: existente.id, creado: false, uuid: cfdi.uuid };
    }

    const empresa = await this.prisma.companyProfile.findFirst({
      where: { id: companyId },
      select: { rfc: true },
    });
    const rfcEmpresa = String(
      empresa?.rfc || process.env.EMPRESA_RFC || process.env.COMPANY_RFC || '',
    )
      .trim()
      .toUpperCase();
    const sentido = sentidoCfdi(cfdi, rfcEmpresa);
    const datosSat = datosSatCfdiDesdeCfdi(cfdi, xml, sentido);
    const satModel = (this.prisma as any).satCfdi;
    if (satModel) {
      const satExistente = await satModel.findFirst({ where: { uuid: { equals: cfdi.uuid, mode: 'insensitive' } } });
      if (!satExistente) {
        await satModel.create({
          data: {
            companyId,
            uuid: datosSat.uuid,
            rfcEmisor: datosSat.rfcEmisor,
            nombreEmisor: datosSat.nombreEmisor,
            rfcReceptor: datosSat.rfcReceptor,
            nombreReceptor: datosSat.nombreReceptor,
            total: new Prisma.Decimal(datosSat.total),
            subtotal: new Prisma.Decimal(datosSat.subtotal),
            ivaTrasladado: new Prisma.Decimal(datosSat.ivaTrasladado),
            ivaRetenido: new Prisma.Decimal(datosSat.ivaRetenido),
            isrRetenido: new Prisma.Decimal(datosSat.isrRetenido),
            tipo: String(datosSat.tipo).slice(0, 1),
            metodoPago: datosSat.metodoPago,
            formaPago: datosSat.formaPago,
            usoCfdi: datosSat.usoCfdi,
            sentido: datosSat.sentido,
            estatusSat: datosSat.estatusSat,
            fecha: datosSat.fecha,
            xml: datosSat.xml,
            serie: datosSat.serie,
            folio: datosSat.folio,
            moneda: datosSat.moneda,
          },
        });
      }
    }
    const datos = datosInvoiceDesdeCfdi(cfdi, xml, sentido);

    let supplierId: number | null = null;
    if (sentido === 'recibido') {
      supplierId = await this.asegurarProveedor(companyId, cfdi.emisor.rfc, cfdi.emisor.nombre);
    }

    const creado = await this.prisma.invoice.create({
      data: {
        ...datos,
        subtotal: new Prisma.Decimal(datos.subtotal),
        taxAmount: new Prisma.Decimal(datos.taxAmount),
        totalAmount: new Prisma.Decimal(datos.totalAmount),
        paidAmount: new Prisma.Decimal(datos.paidAmount),
        ivaRetenido: new Prisma.Decimal(datos.ivaRetenido),
        isrRetenido: new Prisma.Decimal(datos.isrRetenido),
        supplierId,
        companyId,
        createdById: userId ?? null,
      },
      select: { id: true },
    });

    if (sentido === 'recibido') {
      await this.ligarTicketViatico(companyId, creado.id, cfdi).catch((err) =>
        this.logger.warn(`No se ligó ticket: ${String(err)}`),
      );
      await this.polizas.proponerParaInvoice(companyId, creado.id).catch((err) =>
        this.logger.warn(`No se propuso póliza: ${String(err)}`),
      );
    }

    return { id: creado.id, creado: true, uuid: cfdi.uuid, sentido };
  }

  private async asegurarProveedor(companyId: number, rfc: string, nombre: string | null) {
    const limpio = normalizarRfc(rfc);
    const lista = await this.prisma.satLista69B.findUnique({ where: { rfc: limpio } }).catch(() => null);
    const existente = await this.prisma.supplier.findFirst({
      where: { companyId, rfc: limpio },
      select: { id: true },
    });
    if (existente) {
      if (lista) {
        await this.prisma.supplier.update({
          where: { id: existente.id },
          data: { lista69B: lista.tipo, lista69BActualizadoAt: new Date() },
        });
      }
      return existente.id;
    }
    const nombreFinal = (nombre || limpio).slice(0, 255);
    const creado = await this.prisma.supplier.create({
      data: {
        companyId,
        name: nombreFinal,
        rfc: limpio,
        lista69B: lista?.tipo ?? null,
        lista69BActualizadoAt: lista ? new Date() : null,
      },
      select: { id: true },
    });
    return creado.id;
  }

  private async ligarTicketViatico(
    companyId: number,
    invoiceId: number,
    cfdi: { emisor: { rfc: string }; total: number; fecha: string },
  ) {
    const tickets = await this.prisma.viaticoTicket.findMany({
      where: {
        companyId,
        estado: { in: ['APROBADO', 'PENDIENTE'] },
        invoiceId: null,
        OR: [{ rfcEmisor: normalizarRfc(cfdi.emisor.rfc) }, { rfcEmisor: null }],
      },
      take: 50,
      orderBy: { fechaHora: 'desc' },
    });
    const match = tickets.find(
      (t) =>
        coincideImporte(Number(t.monto), cfdi.total) &&
        dentroDeDias(t.fechaHora.toISOString().slice(0, 10), cfdi.fecha, 7) &&
        (!t.rfcEmisor || normalizarRfc(t.rfcEmisor) === normalizarRfc(cfdi.emisor.rfc)),
    );
    if (!match) return null;
    await this.prisma.viaticoTicket.update({
      where: { id: match.id },
      data: {
        invoiceId,
        estado: 'FACTURADO',
        facturadoAt: new Date(),
      },
    });
    return match.id;
  }

  async actualizarLista69B(csv?: string) {
    let texto = csv;
    if (!texto) {
      const res = await fetch(URL_LISTA_69B_SAT, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new BadRequestException(`No se pudo bajar la lista 69-B (${res.status}).`);
      texto = await res.text();
    }
    const entradas = parsearCsv69B(texto);
    for (const e of entradas) {
      await this.prisma.satLista69B.upsert({
        where: { rfc: e.rfc },
        create: { rfc: e.rfc, nombre: e.nombre, tipo: e.tipo, actualizadoAt: new Date() },
        update: { nombre: e.nombre, tipo: e.tipo, actualizadoAt: new Date() },
      });
    }
    const proveedores = await this.prisma.supplier.findMany({
      where: { rfc: { in: entradas.map((e) => e.rfc) } },
      select: { id: true, rfc: true },
    });
    const porRfc = new Map(entradas.map((e) => [e.rfc, e.tipo]));
    for (const p of proveedores) {
      const tipo = p.rfc ? porRfc.get(normalizarRfc(p.rfc)) : null;
      if (!tipo) continue;
      await this.prisma.supplier.update({
        where: { id: p.id },
        data: { lista69B: tipo, lista69BActualizadoAt: new Date() },
      });
    }
    return { entradas: entradas.length, proveedoresMarcados: proveedores.length };
  }

  /**
   * El buzón en Excel, con el tema de los demás reportes. Antes era un volcado sin formato: la
   * fecha no cabía en su columna («###»), los importes iban sin separador de miles, «Generado»
   * traía la hora del servidor en ISO y los estatus salían como en la base.
   */
  async excel(
    companyIdRaw: number | null,
    q: { pestana?: string; desde?: string; hasta?: string },
    generadoPor?: string | null,
  ) {
    const data = await this.listar(companyIdRaw, q);
    const buffer = await crearReporte({
      hoja: 'Buzón SAT',
      titulo: `Buzón SAT · ${ETIQUETA_PESTANA_BUZON_SAT[data.pestana] ?? 'Recibidos'}`,
      subtitulo: pdfPeriodo(data.desde, data.hasta, 'Todas las fechas'),
      generadoPor,
      columnas: COLUMNAS_BUZON_SAT,
      filas: data.items,
    });
    return { buffer, nombre: `buzon-sat-${diaMexico()}.xlsx` };
  }

  async correrDescargaAutomatica(companyId?: number) {
    if (!interruptorActivo('BUZON_SAT_AUTO', true)) {
      this.logger.log('BUZON_SAT_AUTO apagado: se omite la corrida.');
      return { omitido: true };
    }
    const estado = this.descarga.estado();
    if (!estado.lista) {
      this.logger.warn(`Buzón SAT sin e.firma: ${estado.mensaje}`);
      return { omitido: true, motivo: estado.mensaje };
    }

    const periodos = periodosBuzonDiario();
    const resumen = { solicitadas: 0, xmls: 0, errores: [] as string[] };
    for (const periodo of periodos) {
      for (const tipo of ['recibidos', 'emitidos'] as const) {
        try {
          const { idSolicitud } = await this.descarga.solicitar({
            desde: periodo.desde,
            hasta: periodo.hasta,
            tipo,
            formato: 'xml',
          });
          resumen.solicitadas += 1;
          const paquetes = await this.esperarPaquetes(idSolicitud);
          for (const idPaquete of paquetes) {
            const { guardadoEn } = await this.descarga.descargar(idPaquete);
            const zipPath = path.join(resolveUploadsDir(), guardadoEn);
            resumen.xmls += await this.procesarZip(zipPath, companyId);
          }
        } catch (err) {
          resumen.errores.push(String((err as Error).message ?? err));
        }
      }
    }
    return resumen;
  }

  private async esperarPaquetes(idSolicitud: string, intentos = 12): Promise<string[]> {
    for (let i = 0; i < intentos; i++) {
      const v = await this.descarga.verificar(idSolicitud);
      if (v.lista) return v.paquetes;
      if (v.estado === 'falló' || v.estado === 'rechazada' || v.estado === 'vencida') {
        throw new BadRequestException(`Solicitud SAT ${v.estado}`);
      }
      await new Promise((r) => setTimeout(r, 5_000));
    }
    return [];
  }

  private async procesarZip(zipPath: string, companyId?: number): Promise<number> {
    // Sin dependencia zip: si el paquete ya se expandió a XML en la carpeta, los leemos.
    const dir = path.dirname(zipPath);
    const files = await fs.readdir(dir).catch(() => [] as string[]);
    let n = 0;
    const empresas = companyId
      ? [{ id: companyId }]
      : await this.prisma.companyProfile.findMany({ select: { id: true }, take: 20 });
    for (const f of files) {
      if (!f.toLowerCase().endsWith('.xml')) continue;
      const xml = await fs.readFile(path.join(dir, f), 'utf8');
      for (const emp of empresas) {
        try {
          const r = await this.guardarCfdi(emp.id, xml);
          if (r.creado) n += 1;
        } catch {
          /* XML de otra empresa u otro RFC */
        }
      }
    }
    return n;
  }

  @Cron('0 6 * * *', { name: 'buzon-sat-diario', timeZone: WORKDAY_TIMEZONE })
  async cronDiario() {
    try {
      await this.jobs.enqueue('buzon-sat.diario', {}, { jobId: 'buzon-sat-diario', unico: true, maxAttempts: 1 });
    } catch (err) {
      this.logger.warn(`Cola buzón SAT: ${String((err as Error).message ?? err)}`);
      await runScheduledJob('buzon-sat:diario', this.logger, () => this.correrDescargaAutomatica());
    }
  }

  @Cron('0 7 * * 1', { name: 'buzon-sat-69b', timeZone: WORKDAY_TIMEZONE })
  async cron69B() {
    await runScheduledJob('buzon-sat:69b', this.logger, () => this.actualizarLista69B());
  }
}
