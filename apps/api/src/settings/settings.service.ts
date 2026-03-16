import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.systemSetting.findMany({
      orderBy: { category: 'asc' },
    });
  }

  async findByCategory(category: string) {
    return this.prisma.systemSetting.findMany({
      where: { category },
      orderBy: { key: 'asc' },
    });
  }

  async getValue(key: string): Promise<string | null> {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key } });
    return setting?.value ?? null;
  }

  async upsert(key: string, value: string, category: string, label?: string) {
    return this.prisma.systemSetting.upsert({
      where: { key },
      update: { value, updatedAt: new Date() },
      create: { key, value, category, label: label ?? key },
    });
  }

  async upsertMany(settings: { key: string; value: string; category: string; label?: string }[]) {
    const results = await Promise.all(
      settings.map((s) => this.upsert(s.key, s.value, s.category, s.label)),
    );
    return results;
  }

  async remove(key: string) {
    const existing = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!existing) throw new NotFoundException(`Setting "${key}" no encontrada`);
    return this.prisma.systemSetting.delete({ where: { key } });
  }
}
