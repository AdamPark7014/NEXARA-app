import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * CompanyService — multi-tenant base.
 *
 * Soporta múltiples instancias de CompanyProfile (cada una representa una empresa
 * distinta dentro de la misma instalación del ERP). Una se marca como `isPrimary`
 * y es el default. El frontend puede mandar header `X-Company-Id` para indicar
 * sobre cuál empresa quiere operar; si no se manda, se usa la primaria.
 */
@Injectable()
export class CompanyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista todas las empresas activas. */
  list() {
    return (this.prisma as any).companyProfile.findMany({
      where: { isActive: true },
      orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
    });
  }

  /**
   * Devuelve la empresa "primaria" o crea una por defecto si no existe.
   * Mantiene compatibilidad con código que asume single-company.
   */
  async get() {
    const primary = await (this.prisma as any).companyProfile.findFirst({
      where: { isPrimary: true, isActive: true },
      orderBy: { id: 'asc' },
    });
    if (primary) return primary;
    const any = await (this.prisma as any).companyProfile.findFirst({ orderBy: { id: 'asc' } });
    if (any) return any;
    // Si no existe ninguna, crea la primaria desde envs
    return (this.prisma as any).companyProfile.create({
      data: {
        legalName: process.env.COMPANY_LEGAL_NAME || 'NEXARA Tech S.A. de C.V.',
        tradeName: process.env.COMPANY_TRADE_NAME || 'NEXARA',
        rfc: process.env.COMPANY_RFC || 'XAXX010101000',
        fiscalRegime: process.env.COMPANY_REGIME || 'R601',
        contactEmail: process.env.COMPANY_EMAIL || 'contacto@nexara.com.mx',
        websiteUrl: 'https://nexara.com.mx',
        brandPrimary: '#0ea5e9',
        brandSecondary: '#16a34a',
        slug: 'nexara',
        isPrimary: true,
        isActive: true,
      },
    });
  }

  /** Resuelve por id si viene, sino devuelve la primaria. */
  async resolve(id?: number) {
    if (!id) return this.get();
    const found = await (this.prisma as any).companyProfile.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`Empresa ${id} no encontrada`);
    return found;
  }

  /** Endpoint público (sin auth): datos no sensibles para web y portales. */
  async getPublic(id?: number) {
    const profile = await this.resolve(id);
    return {
      id: profile.id,
      slug: profile.slug,
      legalName: profile.legalName,
      tradeName: profile.tradeName,
      websiteUrl: profile.websiteUrl,
      contactEmail: profile.contactEmail,
      contactPhone: profile.contactPhone,
      supportEmail: profile.supportEmail,
      logoUrl: profile.logoUrl,
      logoDarkUrl: profile.logoDarkUrl,
      faviconUrl: profile.faviconUrl,
      brandPrimary: profile.brandPrimary,
      brandSecondary: profile.brandSecondary,
    };
  }

  async create(dto: any) {
    return (this.prisma as any).companyProfile.create({
      data: {
        legalName: dto.legalName?.trim() || 'Empresa sin nombre',
        tradeName: dto.tradeName?.trim() || null,
        rfc: (dto.rfc?.trim()?.toUpperCase()) || 'XAXX010101000',
        slug: dto.slug?.trim()?.toLowerCase() || null,
        fiscalRegime: dto.fiscalRegime?.trim() || null,
        fiscalAddress: dto.fiscalAddress?.trim() || null,
        fiscalPostalCode: dto.fiscalPostalCode?.trim() || null,
        contactEmail: dto.contactEmail?.trim() || null,
        contactPhone: dto.contactPhone?.trim() || null,
        supportEmail: dto.supportEmail?.trim() || null,
        websiteUrl: dto.websiteUrl?.trim() || null,
        logoUrl: dto.logoUrl?.trim() || null,
        brandPrimary: dto.brandPrimary?.trim() || '#0ea5e9',
        brandSecondary: dto.brandSecondary?.trim() || '#16a34a',
        isPrimary: false,
        isActive: true,
      },
    });
  }

  async update(dto: any, id?: number) {
    const current = await this.resolve(id);
    return (this.prisma as any).companyProfile.update({
      where: { id: current.id },
      data: {
        legalName: dto.legalName?.trim() ?? current.legalName,
        tradeName: dto.tradeName?.trim() ?? current.tradeName,
        rfc: dto.rfc?.trim()?.toUpperCase() ?? current.rfc,
        slug: dto.slug?.trim()?.toLowerCase() ?? current.slug,
        fiscalRegime: dto.fiscalRegime?.trim() ?? current.fiscalRegime,
        fiscalAddress: dto.fiscalAddress?.trim() ?? current.fiscalAddress,
        fiscalPostalCode: dto.fiscalPostalCode?.trim() ?? current.fiscalPostalCode,
        contactEmail: dto.contactEmail?.trim() ?? current.contactEmail,
        contactPhone: dto.contactPhone?.trim() ?? current.contactPhone,
        supportEmail: dto.supportEmail?.trim() ?? current.supportEmail,
        websiteUrl: dto.websiteUrl?.trim() ?? current.websiteUrl,
        logoUrl: dto.logoUrl?.trim() ?? current.logoUrl,
        logoDarkUrl: dto.logoDarkUrl?.trim() ?? current.logoDarkUrl,
        faviconUrl: dto.faviconUrl?.trim() ?? current.faviconUrl,
        brandPrimary: dto.brandPrimary?.trim() ?? current.brandPrimary,
        brandSecondary: dto.brandSecondary?.trim() ?? current.brandSecondary,
        defaultBankName: dto.defaultBankName?.trim() ?? current.defaultBankName,
        defaultClabe: dto.defaultClabe?.trim() ?? current.defaultClabe,
        notificationEmail: dto.notificationEmail?.trim() ?? current.notificationEmail,
      },
    });
  }

  /** Marca esta empresa como primaria y desmarca las demás. */
  async setPrimary(id: number) {
    await (this.prisma as any).companyProfile.updateMany({
      where: { isPrimary: true },
      data: { isPrimary: false },
    });
    return (this.prisma as any).companyProfile.update({
      where: { id },
      data: { isPrimary: true },
    });
  }

  async setActive(id: number, isActive: boolean) {
    return (this.prisma as any).companyProfile.update({ where: { id }, data: { isActive } });
  }
}
