import { Injectable, Logger } from '@nestjs/common';
import type {
  IPacAdapter,
  PacCancelInput,
  PacCancelResult,
  PacPaymentComplementInput,
  PacProvider,
  PacStampInput,
  PacStampResult,
} from './pac.types.js';
import { MockPacAdapter } from './adapters/mock.adapter.js';
import { FacturamaAdapter } from './adapters/facturama.adapter.js';
import { SwSapienAdapter } from './adapters/sw.adapter.js';
import { FinkokAdapter } from './adapters/finkok.adapter.js';
import { CsdService } from './csd.service.js';

/**
 * PAC orquestador — selecciona el adapter por `PAC_PROVIDER` (env).
 * Provee fallback a `mock` cuando no hay credenciales o el provider falla,
 * EXCEPTO en producción (para no timbrar con UUID falso).
 *
 * Variables soportadas:
 *   PAC_PROVIDER          mock | facturama | sw | finkok    (default: mock)
 *   PAC_FALLBACK_TO_MOCK  1 / 0                              (default: 1; forzado a 0 en prod)
 *   FACTURAMA_USER, FACTURAMA_PASSWORD, FACTURAMA_BASE_URL
 *   SW_TOKEN | (SW_USER + SW_PASSWORD), SW_BASE_URL, SW_USE_ISSUE_JSON
 *   FINKOK_USER, FINKOK_PASSWORD, FINKOK_BASE_URL
 *   CSD_CER_BASE64 | CSD_CER_PATH, CSD_KEY_BASE64 | CSD_KEY_PATH, CSD_KEY_PASSWORD
 */
@Injectable()
export class PacService {
  private readonly logger = new Logger(PacService.name);
  private readonly mock = new MockPacAdapter();
  private adapter: IPacAdapter;
  readonly provider: PacProvider;
  readonly fallbackToMock: boolean;
  readonly isProduction: boolean;

  constructor(private readonly csd: CsdService) {
    this.isProduction = (process.env['NODE_ENV'] || 'development') === 'production';
    this.provider = (process.env.PAC_PROVIDER as PacProvider) || 'mock';
    // En producción nunca caemos silenciosamente a mock.
    this.fallbackToMock = this.isProduction ? false : process.env.PAC_FALLBACK_TO_MOCK !== '0';
    this.adapter = this.buildAdapter(this.provider);
    this.logger.log(
      `PAC inicializado: provider=${this.adapter.provider}, fallback=${this.fallbackToMock}, csd=${this.csd.isConfigured()}`,
    );
  }

  /** Bloquea timbrado con mock en producción. */
  assertProductionReady(): void {
    if (this.isProduction && this.adapter.provider === 'mock') {
      throw new Error(
        'Timbrado bloqueado: PAC en modo mock en producción. Configura PAC_PROVIDER real y credenciales.',
      );
    }
  }

  async stamp(input: PacStampInput): Promise<PacStampResult> {
    this.assertProductionReady();
    try {
      return await this.adapter.stamp(input);
    } catch (err) {
      this.logger.error(`PAC stamp ${this.adapter.provider} falló: ${(err as Error).message}`);
      if (this.fallbackToMock && this.adapter.provider !== 'mock') {
        this.logger.warn(`Cayendo a mock para timbrar ${input.invoiceNumber}`);
        return this.mock.stamp(input);
      }
      throw err;
    }
  }

  async stampPayment(input: PacPaymentComplementInput): Promise<PacStampResult> {
    this.assertProductionReady();
    try {
      if (!this.adapter.stampPayment) {
        throw new Error(`El PAC ${this.adapter.provider} no soporta complemento de pago en este ERP`);
      }
      return await this.adapter.stampPayment(input);
    } catch (err) {
      this.logger.error(`PAC stampPayment ${this.adapter.provider} falló: ${(err as Error).message}`);
      if (this.fallbackToMock && this.adapter.provider !== 'mock') {
        this.logger.warn(`Cayendo a mock para complemento de pago ${input.invoiceNumber}`);
        return this.mock.stampPayment(input);
      }
      throw err;
    }
  }

  async cancel(input: PacCancelInput): Promise<PacCancelResult> {
    this.assertProductionReady();
    try {
      return await this.adapter.cancel(input);
    } catch (err) {
      this.logger.error(`PAC cancel ${this.adapter.provider} falló: ${(err as Error).message}`);
      if (this.fallbackToMock && this.adapter.provider !== 'mock') {
        this.logger.warn(`Cayendo a mock para cancelar ${input.uuid}`);
        return this.mock.cancel(input);
      }
      throw err;
    }
  }

  /** Diagnóstico del CSD cargado (sin exponer llaves). */
  csdInfo() {
    return this.csd.info();
  }

  private buildAdapter(provider: PacProvider): IPacAdapter {
    try {
      if (provider === 'facturama') {
        return new FacturamaAdapter(
          process.env.FACTURAMA_USER || '',
          process.env.FACTURAMA_PASSWORD || '',
          process.env.FACTURAMA_BASE_URL || 'https://apisandbox.facturama.mx',
        );
      }
      if (provider === 'sw') {
        return new SwSapienAdapter(
          {
            baseUrl: process.env.SW_BASE_URL || 'https://services.test.sw.com.mx',
            token: process.env.SW_TOKEN,
            user: process.env.SW_USER,
            password: process.env.SW_PASSWORD,
            useIssueJson: process.env.SW_USE_ISSUE_JSON === '1',
          },
          this.csd,
        );
      }
      if (provider === 'finkok') {
        return new FinkokAdapter(
          {
            baseUrl: process.env.FINKOK_BASE_URL || 'https://demo-facturacion.finkok.com',
            user: process.env.FINKOK_USER || '',
            password: process.env.FINKOK_PASSWORD || '',
          },
          this.csd,
        );
      }
      return this.mock;
    } catch (err) {
      this.logger.error(`No se pudo inicializar PAC ${provider}: ${(err as Error).message}`);
      if (this.isProduction) {
        // En prod, propagar: no queremos mock silencioso.
        throw err;
      }
      this.logger.warn('Usando mock PAC en su lugar');
      return this.mock;
    }
  }
}
