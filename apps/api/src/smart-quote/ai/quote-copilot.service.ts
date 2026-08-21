import { Injectable } from '@nestjs/common';
import { SolutionConfiguratorService, type SolutionTemplate } from '../configurator/solution-configurator.service.js';
import type { OptimizeMode } from '../scoring/quote-scoring.js';

export type CopilotIntent = {
  template: SolutionTemplate;
  cameras?: number;
  storageDays?: number;
  accessPoints?: number;
  doors?: number;
  optimize: OptimizeMode;
  targetMarginPercent: number;
  logisticsZone?: string;
  includeLabor: boolean;
  questions: string[];
  summary: string;
};

/**
 * Copiloto comercial — fase 4.
 * Interpreta lenguaje natural a un intent estructurado y delega al configurador.
 * No inventa precios: siempre pasa por search/scoring del catálogo CT.
 */
@Injectable()
export class QuoteCopilotService {
  constructor(private readonly configurator: SolutionConfiguratorService) {}

  parseIntent(prompt: string): CopilotIntent {
    const text = (prompt || '').toLowerCase();
    const questions: string[] = [];

    let template: SolutionTemplate = 'CUSTOM';
    if (/cámara|camara|cctv|videovigil|nvr/.test(text)) template = 'CCTV';
    else if (/wifi|access point|\bap\b|inalámbr/.test(text)) template = 'WIFI';
    else if (/acceso|torniquete|lector|puerta/.test(text)) template = 'ACCESS';

    const cameras = this.extractNumber(text, /(\d+)\s*c[aá]maras?/);
    const accessPoints = this.extractNumber(text, /(\d+)\s*(?:aps?|access points?|puntos?\s+de\s+acceso)/);
    const doors = this.extractNumber(text, /(\d+)\s*puertas?/);
    const storageDays = this.extractNumber(text, /(\d+)\s*d[ií]as?/);

    let optimize: OptimizeMode = 'BALANCE';
    if (/mejor precio|m[aá]s barato|precio m[aá]s bajo|bajo costo/.test(text)) optimize = 'PRICE';
    else if (/r[aá]pido|inmediata|disponib|stock|10 d[ií]as|entrega/.test(text)) optimize = 'SPEED';
    else if (/margen|rentab|utilidad/.test(text)) optimize = 'MARGIN';
    else if (/premium|mejor marca|hikvision|dahua/.test(text)) optimize = 'PREMIUM';

    let logisticsZone: string | undefined;
    if (/puebla|local/.test(text)) logisticsZone = 'LOCAL_PUE';
    else if (/cdmx|ciudad de m[eé]xico|df\b/.test(text)) logisticsZone = 'CDMX';
    else if (/for[aá]neo|otro estado|nacional/.test(text)) logisticsZone = 'FORANEO';

    if (template === 'CCTV' && !cameras) questions.push('¿Cuántas cámaras necesita el proyecto?');
    if (template === 'CCTV' && !storageDays) questions.push('¿Cuántos días de grabación requiere?');
    if (template === 'WIFI' && !accessPoints) questions.push('¿Cuántos access points se requieren?');
    if (template === 'CUSTOM') {
      questions.push('¿Es un proyecto de CCTV, WiFi o control de acceso?');
    }
    if (!logisticsZone) questions.push('¿La entrega/instalación es local (Puebla), CDMX o foránea?');

    const summary = [
      template !== 'CUSTOM' ? `Solución ${template}` : 'Solución por definir',
      cameras ? `${cameras} cámaras` : null,
      accessPoints ? `${accessPoints} APs` : null,
      doors ? `${doors} puertas` : null,
      storageDays ? `${storageDays} días de almacenamiento` : null,
      `optimizar por ${optimize}`,
    ]
      .filter(Boolean)
      .join(' · ');

    return {
      template,
      cameras: cameras || undefined,
      storageDays: storageDays || undefined,
      accessPoints: accessPoints || undefined,
      doors: doors || undefined,
      optimize,
      targetMarginPercent: 30,
      logisticsZone,
      includeLabor: !/sin (mano de obra|instalaci[oó]n)/.test(text),
      questions,
      summary,
    };
  }

  async draft(companyId: number | null | undefined, prompt: string) {
    const intent = this.parseIntent(prompt);
    const proposal = await this.configurator.configure(companyId, {
      template: intent.template,
      cameras: intent.cameras,
      storageDays: intent.storageDays,
      accessPoints: intent.accessPoints,
      doors: intent.doors,
      optimize: intent.optimize,
      targetMarginPercent: intent.targetMarginPercent,
      logisticsZone: intent.logisticsZone,
      includeLabor: intent.includeLabor,
    });

    return {
      intent,
      proposal,
      disclaimer:
        'Borrador generado por el copiloto. Precios y stock provienen del catálogo CT sincronizado. Revisar antes de enviar al cliente.',
    };
  }

  private extractNumber(text: string, re: RegExp): number | null {
    const m = text.match(re);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
}
