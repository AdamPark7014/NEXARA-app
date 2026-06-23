import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: number) {
    return this.prisma.userPreference.findMany({
      where: { userId },
      orderBy: { key: 'asc' },
    });
  }

  async getValue(userId: number, key: string): Promise<string | null> {
    const pref = await this.prisma.userPreference.findUnique({
      where: { userId_key: { userId, key } },
    });
    return pref?.value ?? null;
  }

  async upsert(userId: number, key: string, value: string) {
    return this.prisma.userPreference.upsert({
      where: { userId_key: { userId, key } },
      update: { value, updatedAt: new Date() },
      create: { userId, key, value },
    });
  }

  async upsertMany(userId: number, prefs: { key: string; value: string }[]) {
    return Promise.all(
      prefs.map((p) => this.upsert(userId, p.key, p.value)),
    );
  }

  async remove(userId: number, key: string) {
    return this.prisma.userPreference.deleteMany({
      where: { userId, key },
    });
  }
}
