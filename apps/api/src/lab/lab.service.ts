import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class LabService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Feature flags ────────────────────────────────────────────────
  listFlags(scope?: string) {
    return this.prisma.featureFlag.findMany({
      where: scope ? { scope } : undefined,
      orderBy: [{ scope: 'asc' }, { key: 'asc' }],
    });
  }

  async setFlag(key: string, enabled: boolean) {
    const flag = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!flag) throw new NotFoundException(`Flag ${key} no existe`);
    return this.prisma.featureFlag.update({ where: { key }, data: { enabled } });
  }

  upsertFlag(input: { key: string; scope: string; description?: string; enabled?: boolean; metadata?: any }) {
    return this.prisma.featureFlag.upsert({
      where: { key: input.key },
      create: {
        key: input.key,
        scope: input.scope,
        description: input.description ?? null,
        enabled: input.enabled ?? false,
        metadata: input.metadata ?? undefined,
      },
      update: {
        scope: input.scope,
        description: input.description ?? null,
        enabled: input.enabled ?? false,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  async deleteFlag(key: string) {
    await this.prisma.featureFlag.delete({ where: { key } });
    return { ok: true };
  }

  async isEnabled(key: string): Promise<boolean> {
    const flag = await this.prisma.featureFlag.findUnique({ where: { key } });
    return Boolean(flag?.enabled);
  }

  // ── AI Sandbox ────────────────────────────────────────────────────
  /**
   * Ejecuta un prompt contra un proveedor de IA configurado por env.
   * Si no hay clave configurada, devuelve un mensaje claro indicando cómo
   * habilitarlo. Soporta Anthropic (Claude) y OpenAI (GPT).
   */
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
      this.prisma.activity.count({ where: { estatus: { not: 'Finalizado' } } }).catch(() => 0),
    ]);
    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      counts: { users, projects, openTickets },
    };
  }
}
