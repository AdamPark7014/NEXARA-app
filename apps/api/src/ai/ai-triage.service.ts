import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import { OPEN_ACTIVITY_WHERE } from '../activities/activity-status.js';

export type TriageResult = {
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  ticketType: 'EMERGENCIA' | 'CORRECTIVO' | 'PREVENTIVO' | 'INSTALACION' | 'OTRO';
  confidence: number;
  summary: string;
  tags: string[];
  suggestedAssigneeRole: string;
  risk: 'low' | 'medium' | 'high';
  rationale: string[];
  provider: 'rules' | 'openai' | 'anthropic';
};

/**
 * Product AI — triage de tickets/actividades (no Lab).
 * Usa reglas deterministas siempre; opcionalmente LLM si hay API key + flag.
 */
@Injectable()
export class AiTriageService {
  constructor(private readonly prisma: PrismaService) {}

  async triageActivityText(
    input: { title: string; description?: string; clientName?: string },
    companyId?: number | null,
  ): Promise<TriageResult> {
    requireCompanyId(companyId);
    const text = `${input.title} ${input.description || ''}`.toLowerCase();
    const rationale: string[] = [];
    let priority: TriageResult['priority'] = 'P2';
    let ticketType: TriageResult['ticketType'] = 'CORRECTIVO';
    let risk: TriageResult['risk'] = 'low';
    const tags: string[] = [];

    if (/emergencia|caído|caido|sin servicio|incendio|robo|urgente|critical|down/.test(text)) {
      priority = 'P0';
      ticketType = 'EMERGENCIA';
      risk = 'high';
      tags.push('emergency', 'sla-critical');
      rationale.push('Lenguaje de emergencia / servicio caído detectado');
    } else if (/preventivo|mantenimiento programado|rutina|checklist/.test(text)) {
      priority = 'P3';
      ticketType = 'PREVENTIVO';
      tags.push('preventive');
      rationale.push('Solicitud clasificada como preventiva');
    } else if (/instalaci[oó]n|nuevo sitio|montaje|wiring/.test(text)) {
      priority = 'P2';
      ticketType = 'INSTALACION';
      tags.push('install');
      rationale.push('Trabajo de instalación detectado');
    } else if (/falla|error|no funciona|alarma|cctv|nvr|dvr/.test(text)) {
      priority = 'P1';
      ticketType = 'CORRECTIVO';
      risk = 'medium';
      tags.push('corrective', 'field');
      rationale.push('Falla operativa detectada');
    }

    if (/cliente vip|contrato oro|sla 4h|penalizaci/.test(text)) {
      if (priority === 'P2') priority = 'P1';
      if (priority === 'P1') priority = 'P0';
      risk = 'high';
      tags.push('vip-sla');
      rationale.push('Señal de contrato/SLA estricto');
    }

    // Tenant override wins over platform (companyId null) flag.
    let live =
      (await this.prisma.featureFlag
        .findFirst({ where: { key: 'product.ai.triage', companyId } })
        .catch(() => null)) ?? null;
    if (!live) {
      live =
        (await this.prisma.featureFlag
          .findFirst({ where: { key: 'product.ai.triage', companyId: null } })
          .catch(() => null)) ?? null;
    }
    let provider: TriageResult['provider'] = 'rules';
    let summary = `${ticketType} · ${priority}: ${input.title}`.slice(0, 180);

    if (live?.enabled && process.env.OPENAI_API_KEY) {
      try {
        const llm = await this.callOpenAi(input);
        if (llm) {
          provider = 'openai';
          summary = llm.summary || summary;
          if (llm.priority) priority = llm.priority;
          if (llm.ticketType) ticketType = llm.ticketType;
          rationale.push('Refinado por modelo LLM');
        }
      } catch {
        rationale.push('LLM no disponible; se usaron reglas');
      }
    }

    if (!rationale.length) rationale.push('Clasificación por heurísticas de dominio field-services');

    return {
      priority,
      ticketType,
      confidence: provider === 'rules' ? 0.72 : 0.88,
      summary,
      tags,
      suggestedAssigneeRole: ticketType === 'EMERGENCIA' ? 'ops_lead' : ticketType === 'PREVENTIVO' ? 'technician' : 'field_engineer',
      risk,
      rationale,
      provider,
    };
  }

  async suggestNextActions(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const overdue = await this.prisma.activity.count({
      where: {
        ...companyWhere(tenantId),
        ...OPEN_ACTIVITY_WHERE,
        fechaMaxima: { lt: new Date() },
      },
    });
    const openHigh = await this.prisma.activity.count({
      where: {
        ...companyWhere(tenantId),
        estatus: { in: ['Pendiente', 'En Proceso'] },
        prioridad: { in: ['Alta', 'Urgente', 'P0', 'P1'] },
      },
    });

    return {
      companyId: tenantId,
      suggestions: [
        ...(overdue > 0
          ? [{ action: `Triaging automático de ${overdue} actividades vencidas`, type: 'auto_assign', impact: 'SLA' }]
          : []),
        ...(openHigh > 0
          ? [{ action: `Escalar ${openHigh} tickets de alta prioridad`, type: 'escalate', impact: 'risk' }]
          : []),
        { action: 'Generar resumen diario de NOC para el turno', type: 'summary', impact: 'ops' },
      ],
    };
  }

  private async callOpenAi(input: { title: string; description?: string }) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TRIAGE_MODEL || 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Clasifica tickets de field service CCTV/IT. Responde JSON: {priority:P0|P1|P2|P3, ticketType:EMERGENCIA|CORRECTIVO|PREVENTIVO|INSTALACION|OTRO, summary:string}',
          },
          { role: 'user', content: `Título: ${input.title}\nDescripción: ${input.description || ''}` },
        ],
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content) as {
      priority?: TriageResult['priority'];
      ticketType?: TriageResult['ticketType'];
      summary?: string;
    };
  }
}
