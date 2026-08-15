import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { OPEN_ACTIVITY_WHERE } from '../activities/activity-status.js';

/**
 * Feature flags: `companyId = null` = platform/global.
 * Tenant overrides use the same key with a concrete companyId.
 * Lab UI manages platform flags; product AI resolves tenant → platform.
 */
@Injectable()
export class LabService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Feature flags ────────────────────────────────────────────────
  listFlags(scope?: string, companyId?: number | null) {
    const where: any = {};
    if (scope) where.scope = scope;
    // Lab default: platform flags only (null). Pass companyId to include tenant overrides.
    if (companyId == null) {
      where.companyId = null;
    } else {
      where.OR = [{ companyId: null }, { companyId }];
    }
    return this.prisma.featureFlag.findMany({
      where,
      orderBy: [{ scope: 'asc' }, { key: 'asc' }],
    });
  }

  async setFlag(key: string, enabled: boolean, companyId: number | null = null) {
    const flag = await this.prisma.featureFlag.findFirst({
      where: { key, companyId },
    });
    if (!flag) throw new NotFoundException(`Flag ${key} no existe`);
    return this.prisma.featureFlag.update({
      where: { id: flag.id },
      data: { enabled },
    });
  }

  async upsertFlag(input: {
    key: string;
    scope: string;
    description?: string;
    enabled?: boolean;
    metadata?: any;
    companyId?: number | null;
  }) {
    const companyId = input.companyId ?? null;
    const existing = await this.prisma.featureFlag.findFirst({
      where: { key: input.key, companyId },
    });
    const data = {
      scope: input.scope,
      description: input.description ?? null,
      enabled: input.enabled ?? false,
      metadata: input.metadata ?? undefined,
    };
    if (existing) {
      return this.prisma.featureFlag.update({ where: { id: existing.id }, data });
    }
    return this.prisma.featureFlag.create({
      data: {
        key: input.key,
        companyId,
        ...data,
      },
    });
  }

  async deleteFlag(key: string, companyId: number | null = null) {
    const flag = await this.prisma.featureFlag.findFirst({ where: { key, companyId } });
    if (!flag) throw new NotFoundException(`Flag ${key} no existe`);
    await this.prisma.featureFlag.delete({ where: { id: flag.id } });
    return { ok: true };
  }

  /**
   * Resolve enabled: tenant override wins over platform flag.
   */
  async isEnabled(key: string, companyId?: number | null): Promise<boolean> {
    if (companyId != null) {
      const tenant = await this.prisma.featureFlag.findFirst({
        where: { key, companyId },
      });
      if (tenant) return Boolean(tenant.enabled);
    }
    const platform = await this.prisma.featureFlag.findFirst({
      where: { key, companyId: null },
    });
    return Boolean(platform?.enabled);
  }

  // ── AI Sandbox ────────────────────────────────────────────────────
  async runAiPrompt(input: { model: string; prompt: string; systemPrompt?: string }): Promise<{
    output: string;
    model: string;
    provider: string;
    elapsedMs: number;
    isMock?: boolean;
  }> {
    const t0 = Date.now();
    const isAnthropic = input.model.startsWith('claude');
    const provider = isAnthropic ? 'anthropic' : 'openai';
    const anthropicBaseUrl = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    const anthropicToken = (process.env.ANTHROPIC_AUTH_TOKEN || '').trim();
    const apiKey = isAnthropic
      ? (process.env.ANTHROPIC_API_KEY || anthropicToken)
      : process.env.OPENAI_API_KEY;
    const liveEnabled = await this.isEnabled('lab.ai.live');

    if (!apiKey || !liveEnabled) {
      return {
        provider,
        model: input.model,
        isMock: true,
        elapsedMs: Date.now() - t0,
        output: `⚠️ Lab AI desconectado.\n\nPara habilitarlo:\n  1. Activa el feature flag 'lab.ai.live' en /lab/flags\n  2. Configura ${isAnthropic ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} en el .env del API\n  3. Reinicia el servicio\n\n--- Eco del prompt ---\n${input.prompt}`,
      };
    }

    try {
      if (isAnthropic) {
        const res = await fetch(`${anthropicBaseUrl}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            Authorization: `Bearer ${apiKey}`,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: input.model,
            max_tokens: 1024,
            system: input.systemPrompt,
            messages: [{ role: 'user', content: input.prompt }],
          }),
        });
        if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
        const data: any = await res.json();
        const text = Array.isArray(data.content) ? data.content.map((c: any) => c.text || '').join('\n') : '';
        return { output: text, model: input.model, provider, elapsedMs: Date.now() - t0 };
      } else {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: input.model,
            messages: [
              ...(input.systemPrompt ? [{ role: 'system', content: input.systemPrompt }] : []),
              { role: 'user', content: input.prompt },
            ],
            max_tokens: 1024,
          }),
        });
        if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
        const data: any = await res.json();
        return {
          output: data.choices?.[0]?.message?.content ?? '(sin respuesta)',
          model: input.model,
          provider,
          elapsedMs: Date.now() - t0,
        };
      }
    } catch (err) {
      return {
        provider,
        model: input.model,
        isMock: true,
        elapsedMs: Date.now() - t0,
        output: `❌ Error invocando ${provider}: ${(err as Error).message}`,
      };
    }
  }

  // ── System Health (extra para /lab/health en backend) ────────────
  async getHealthSummary() {
    const [users, projects, openTickets] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.operationalProject.count().catch(() => 0),
      this.prisma.activity.count({ where: { ...OPEN_ACTIVITY_WHERE } }).catch(() => 0),
    ]);
    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      counts: { users, projects, openTickets },
    };
  }
}
