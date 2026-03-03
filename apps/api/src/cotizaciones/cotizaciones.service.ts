import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CotizacionStatus, Prisma } from '@prisma/client';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto.js';
import { UpdateCotizacionDto } from './dto/update-cotizacion.dto.js';
import { SendCotizacionDto } from './dto/send-cotizacion.dto.js';
import { SignCotizacionDto } from './dto/sign-cotizacion.dto.js';
import { generateCotizacionPdf } from './cotizacion-pdf.js';
import { randomBytes } from 'crypto';
import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';

const round2 = (value: number) => Math.round(value * 100) / 100;

const normalizeStatus = (status?: string) => {
  if (!status) return undefined;
  const normalized = status.trim().toLowerCase();
  if (normalized === 'draft') return CotizacionStatus.DRAFT;
  if (normalized === 'sent') return CotizacionStatus.SENT;
  if (normalized === 'approved') return CotizacionStatus.APPROVED;
  return undefined;
};

@Injectable()
export class CotizacionesService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma;
  }

  private parseDate(value?: string) {
    if (!value) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed;
  }

  private normalizeItems(items: CreateCotizacionDto['items']) {
    if (!items || !items.length) {
      throw new BadRequestException('Se requiere al menos un concepto');
    }

    return items.map((item) => ({
      category: item.category?.trim() || 'Otros',
      name: item.name?.trim() || 'Concepto',
      description: item.description?.trim() || null,
      scope: item.scope?.trim() || null,
      brand: item.brand?.trim() || null,
      model: item.model?.trim() || null,
      sku: item.sku?.trim() || null,
      partNumber: item.partNumber?.trim() || null,
      batchReference: item.batchReference?.trim() || null,
      unit: item.unit?.trim() || 'pieza',
      qty: Math.max(1, Number(item.qty) || 1),
      unitPrice: Number(item.unitPrice) || 0,
      discount: Math.max(0, Math.min(100, Number(item.discount) || 0)),
      tax: Math.max(0, Math.min(100, Number(item.tax) || 0)),
      ieps: Math.max(0, Math.min(100, Number(item.ieps) || 0)),
      retention: Math.max(0, Math.min(100, Number(item.retention) || 0)),
      laborHours: Math.max(0, Number(item.laborHours) || 0),
      laborRate: Math.max(0, Number(item.laborRate) || 0),
      warrantyMonths: Math.max(0, Number(item.warrantyMonths) || 0),
      deliveryTime: item.deliveryTime?.trim() || null,
      countryOrigin: item.countryOrigin?.trim() || null,
      notes: item.notes?.trim() || null,
    }));
  }

  private calculateTotals(items: ReturnType<CotizacionesService['normalizeItems']>) {
    return items.reduce(
      (acc, item) => {
        const subtotal = item.qty * item.unitPrice;
        const discount = subtotal * (item.discount / 100);
        const taxable = subtotal - discount;
        const taxAmount = taxable * (item.tax / 100);
        const iepsAmount = taxable * (item.ieps / 100);
        const retentionAmount = taxable * (item.retention / 100);
        const total = taxable + taxAmount + iepsAmount - retentionAmount;
        return {
          subtotal: acc.subtotal + subtotal,
          discountTotal: acc.discountTotal + discount,
          taxTotal: acc.taxTotal + taxAmount,
          iepsTotal: acc.iepsTotal + iepsAmount,
          retentionTotal: acc.retentionTotal + retentionAmount,
          total: acc.total + total,
        };
      },
      { subtotal: 0, discountTotal: 0, taxTotal: 0, iepsTotal: 0, retentionTotal: 0, total: 0 },
    );
  }

  private buildItemData(items: ReturnType<CotizacionesService['normalizeItems']>) {
    return items.map((item) => {
      const subtotal = item.qty * item.unitPrice;
      const discount = subtotal * (item.discount / 100);
      const taxable = subtotal - discount;
      const taxAmount = taxable * (item.tax / 100);
      const iepsAmount = taxable * (item.ieps / 100);
      const retentionAmount = taxable * (item.retention / 100);
      const total = taxable + taxAmount + iepsAmount - retentionAmount;
      return {
        ...item,
        lineTotal: round2(total),
      };
    });
  }

  private async ensureUniqueQuoteNumber(base: string) {
    let candidate = base;
    let counter = 1;
    while (await this.db.cotizacion.findUnique({ where: { quoteNumber: candidate } })) {
      candidate = `${base}-${String(counter).padStart(3, '0')}`;
      counter += 1;
      if (counter > 999) {
        throw new BadRequestException('No se pudo generar un folio unico');
      }
    }
    return candidate;
  }

  async create(dto: CreateCotizacionDto, createdById?: number) {
    const items = this.normalizeItems(dto.items);
    const totals = this.calculateTotals(items);
    const status = normalizeStatus(dto.status) || CotizacionStatus.DRAFT;
    const baseQuoteNumber = dto.quoteNumber.trim();
    const quoteNumber = await this.ensureUniqueQuoteNumber(baseQuoteNumber);

    const data = {
      quoteNumber,
      issueDate: this.parseDate(dto.issueDate) || new Date(),
      validUntil: this.parseDate(dto.validUntil),
      status,
      clientName: dto.clientName?.trim() || null,
      clientCompany: dto.clientCompany?.trim() || null,
      clientEmail: dto.clientEmail?.trim() || null,
      clientPhone: dto.clientPhone?.trim() || null,
      clientAddress: dto.clientAddress?.trim() || null,
      projectName: dto.projectName?.trim() || null,
      scope: dto.scope?.trim() || null,
      paymentTerms: dto.paymentTerms?.trim() || null,
      deliveryTime: dto.deliveryTime?.trim() || null,
      preparedBy: dto.preparedBy?.trim() || null,
      preparedRole: dto.preparedRole?.trim() || null,
      currency: dto.currency?.trim() || 'MXN',
      depositPercent: dto.depositPercent ?? 0,
      note: dto.note?.trim() || null,
      subtotal: round2(totals.subtotal),
      discountTotal: round2(totals.discountTotal),
      taxTotal: round2(totals.taxTotal),
      iepsTotal: round2(totals.iepsTotal),
      retentionTotal: round2(totals.retentionTotal),
      total: round2(totals.total),
      items: { create: this.buildItemData(items) },
      createdBy: createdById ? { connect: { id: createdById } } : undefined,
    };

    try {
      return await this.db.cotizacion.create({
        data,
        include: { items: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const fallback = await this.ensureUniqueQuoteNumber(`${baseQuoteNumber}-${String(Date.now()).slice(-4)}`);
        return this.db.cotizacion.create({
          data: { ...data, quoteNumber: fallback },
          include: { items: true },
        });
      }
      throw error;
    }
  }

  async findAll() {
    return this.db.cotizacion.findMany({
      orderBy: { createdAt: 'desc' },
      include: { items: true, createdBy: true },
    });
  }

  async findOne(id: number) {
    const quote = await this.db.cotizacion.findUnique({
      where: { id },
      include: { items: true, createdBy: true },
    });
    if (!quote) throw new NotFoundException('Cotizacion no encontrada');
    return quote;
  }

  async update(id: number, dto: UpdateCotizacionDto) {
    const existing = await this.db.cotizacion.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Cotizacion no encontrada');

    const updateData: Record<string, any> = {
      quoteNumber: dto.quoteNumber?.trim(),
      issueDate: this.parseDate(dto.issueDate),
      validUntil: this.parseDate(dto.validUntil),
      clientName: dto.clientName?.trim(),
      clientCompany: dto.clientCompany?.trim(),
      clientEmail: dto.clientEmail?.trim(),
      clientPhone: dto.clientPhone?.trim(),
      clientAddress: dto.clientAddress?.trim(),
      projectName: dto.projectName?.trim(),
      scope: dto.scope?.trim(),
      paymentTerms: dto.paymentTerms?.trim(),
      deliveryTime: dto.deliveryTime?.trim(),
      preparedBy: dto.preparedBy?.trim(),
      preparedRole: dto.preparedRole?.trim(),
      currency: dto.currency?.trim(),
      depositPercent: dto.depositPercent,
      note: dto.note?.trim(),
    };

    const status = normalizeStatus(dto.status);
    if (status) updateData['status'] = status;

    if (dto.items) {
      const items = this.normalizeItems(dto.items);
      const totals = this.calculateTotals(items);
      const itemData = this.buildItemData(items);

      updateData['subtotal'] = round2(totals.subtotal);
      updateData['discountTotal'] = round2(totals.discountTotal);
      updateData['taxTotal'] = round2(totals.taxTotal);
      updateData['iepsTotal'] = round2(totals.iepsTotal);
      updateData['retentionTotal'] = round2(totals.retentionTotal);
      updateData['total'] = round2(totals.total);

      return this.db.$transaction(async (tx) => {
        await tx.cotizacionItem.deleteMany({ where: { cotizacionId: id } });
        return tx.cotizacion.update({
          where: { id },
          data: {
            ...Object.fromEntries(Object.entries(updateData).filter(([, value]) => value !== undefined)),
            items: { create: itemData },
          },
          include: { items: true, createdBy: true },
        });
      });
    }

    return this.db.cotizacion.update({
      where: { id },
      data: Object.fromEntries(Object.entries(updateData).filter(([, value]) => value !== undefined)),
      include: { items: true, createdBy: true },
    });
  }

  async getPdfBuffer(id: number) {
    const quote = await this.findOne(id);
    return this.buildPdf(quote);
  }

  async generatePdfFile(id: number) {
    const quote = await this.findOne(id);
    const pdf = await this.buildPdf(quote);
    const dir = path.resolve(process.cwd(), 'uploads', 'cotizaciones');
    await fs.mkdir(dir, { recursive: true });
    const filename = `cotizacion-${quote.quoteNumber}-${Date.now()}.pdf`;
    const outPath = path.join(dir, filename);
    await fs.writeFile(outPath, pdf);
    return { pdfUrl: `/uploads/cotizaciones/${filename}` };
  }

  async getPublicByToken(token: string) {
    const quote = await this.db.cotizacion.findUnique({
      where: { publicToken: token },
      include: { items: true },
    });
    if (!quote) throw new NotFoundException('Cotizacion no encontrada');

    return {
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      issueDate: quote.issueDate,
      validUntil: quote.validUntil,
      status: quote.status,
      clientName: quote.clientName,
      clientCompany: quote.clientCompany,
      clientEmail: quote.clientEmail,
      projectName: quote.projectName,
      currency: quote.currency,
      subtotal: quote.subtotal,
      discountTotal: quote.discountTotal,
      taxTotal: quote.taxTotal,
      iepsTotal: quote.iepsTotal,
      retentionTotal: quote.retentionTotal,
      total: quote.total,
      items: quote.items,
    };
  }

  async signByToken(token: string, dto: SignCotizacionDto) {
    const quote = await this.db.cotizacion.findUnique({ where: { publicToken: token } });
    if (!quote) throw new NotFoundException('Cotizacion no encontrada');

    return this.db.cotizacion.update({
      where: { id: quote.id },
      data: {
        status: CotizacionStatus.APPROVED,
        signedByName: dto.name.trim(),
        signedByEmail: dto.email.trim(),
        signedAt: new Date(),
      },
      include: { items: true },
    });
  }

  async send(id: number, dto: SendCotizacionDto, senderId?: number) {
    const quote = await this.db.cotizacion.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!quote) throw new NotFoundException('Cotizacion no encontrada');

    const email = dto.email?.trim() || quote.clientEmail?.trim();
    if (!email) throw new BadRequestException('Email de cliente requerido');

    const token = quote.publicToken || randomBytes(24).toString('hex');
    const status = CotizacionStatus.SENT;

    const updated = await this.db.cotizacion.update({
      where: { id },
      data: {
        status,
        publicToken: token,
        sentToEmail: email,
        sentAt: new Date(),
        updatedAt: new Date(),
        createdBy: quote.createdById || senderId ? { connect: { id: quote.createdById || senderId! } } : undefined,
      },
      include: { items: true },
    });

    const pdf = await this.buildPdf(updated);
    await this.sendEmail(updated, email, dto.message, pdf, token);

    return updated;
  }

  private async buildPdf(quote: any) {
    const items = quote.items.map((item: any) => ({
      category: item.category,
      name: item.name,
      description: item.description,
      brand: item.brand,
      model: item.model,
      sku: item.sku,
      partNumber: item.partNumber,
      batchReference: item.batchReference,
      unit: item.unit,
      qty: item.qty,
      unitPrice: Number(item.unitPrice),
      discount: item.discount,
      tax: item.tax,
      ieps: item.ieps,
      retention: item.retention,
      laborHours: Number(item.laborHours || 0),
      laborRate: Number(item.laborRate || 0),
      warrantyMonths: item.warrantyMonths,
      lineTotal: Number(item.lineTotal),
    }));

    return generateCotizacionPdf({
      quoteNumber: quote.quoteNumber,
      issueDate: quote.issueDate.toISOString().slice(0, 10),
      validUntil: quote.validUntil ? quote.validUntil.toISOString().slice(0, 10) : null,
      status: quote.status,
      clientName: quote.clientName,
      clientCompany: quote.clientCompany,
      clientEmail: quote.clientEmail,
      clientPhone: quote.clientPhone,
      clientAddress: quote.clientAddress,
      projectName: quote.projectName,
      scope: quote.scope,
      paymentTerms: quote.paymentTerms,
      deliveryTime: quote.deliveryTime,
      preparedBy: quote.preparedBy,
      preparedRole: quote.preparedRole,
      currency: quote.currency,
      depositPercent: quote.depositPercent,
      note: quote.note,
      subtotal: Number(quote.subtotal),
      discountTotal: Number(quote.discountTotal),
      taxTotal: Number(quote.taxTotal),
      iepsTotal: Number(quote.iepsTotal || 0),
      retentionTotal: Number(quote.retentionTotal || 0),
      total: Number(quote.total),
      items,
    });
  }

  private buildTransporter() {
    const host = process.env['SMTP_HOST'];
    const port = Number(process.env['SMTP_PORT'] || 587);
    const user = process.env['SMTP_VENTAS_USER'] || process.env['SMTP_USER'];
    const pass = process.env['SMTP_VENTAS_PASS'] || process.env['SMTP_PASS'];

    if (!host || !user || !pass) {
      throw new InternalServerErrorException('SMTP no configurado');
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  private async sendEmail(quote: any, email: string, message: string | undefined, pdf: Buffer, token: string) {
    const transporter = this.buildTransporter();
    const from = process.env['SMTP_VENTAS_USER'] || process.env['SMTP_FROM'] || 'ventas@nexara.com.mx';
    const baseUrl = process.env['PUBLIC_WEB_URL'] || 'http://localhost:3000';
    const signUrl = `${baseUrl.replace(/\/+$/, '')}/cotizaciones/firmar/${token}`;

    const htmlMessage = `
      <p>Hola ${quote.clientName || 'cliente'},</p>
      <p>Adjuntamos la cotizacion ${quote.quoteNumber}.</p>
      ${message ? `<p>${message}</p>` : ''}
      <p>Para firmar la cotizacion visita: <a href="${signUrl}">${signUrl}</a></p>
    `;

    try {
      await transporter.sendMail({
        from,
        to: email,
        subject: `Cotizacion ${quote.quoteNumber}`,
        html: htmlMessage,
        attachments: [
          {
            filename: `cotizacion-${quote.quoteNumber}.pdf`,
            content: pdf,
          },
        ],
      });
    } catch {
      throw new InternalServerErrorException('No se pudo enviar el correo');
    }
  }
}
