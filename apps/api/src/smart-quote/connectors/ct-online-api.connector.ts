import { Injectable, Logger } from '@nestjs/common';

/** CT-CONNECT API (órdenes, existencia en vivo, tipo de cambio). */
const DEFAULT_BASE = 'https://api.ctonline.mx';

export type CtTokenResponse = { token: string; time?: string };

export type CtPedidoProducto = {
  cantidad: number;
  clave: string;
  precio: number;
  moneda: string;
};

export type CtPedidoEnvio = {
  nombre: string;
  direccion: string;
  entreCalles?: string;
  noExterior: string;
  noInterior?: string;
  colonia: string;
  estado: string;
  ciudad: string;
  codigoPostal: number | string;
  telefono: number | string;
};

export type CtSolicitarPedidoRequest = {
  idPedido: number;
  almacen: string;
  tipoPago?: string;
  cfdi?: string;
  envio: CtPedidoEnvio[];
  producto: CtPedidoProducto[];
};

export type CtSolicitarPedidoResponse = {
  idPedido?: number;
  almacen?: string;
  respuestaCT?: {
    pedidoWeb?: string;
    tipoDeCambio?: number;
    estatus?: string;
    errores?: unknown[];
  };
};

@Injectable()
export class CtOnlineApiConnector {
  private readonly logger = new Logger(CtOnlineApiConnector.name);
  private cachedToken: { token: string; expiresAt: number } | null = null;

  private baseUrl() {
    return (process.env.CT_API_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
  }

  private credentials() {
    const email = process.env.CT_API_EMAIL || '';
    const cliente = process.env.CT_API_CLIENTE || '';
    const rfc = process.env.CT_API_RFC || '';
    if (!email || !cliente || !rfc) {
      throw new Error('CT API no configurada (CT_API_EMAIL, CT_API_CLIENTE, CT_API_RFC)');
    }
    return { email, cliente, rfc };
  }

  isConfigured(): boolean {
    return Boolean(process.env.CT_API_EMAIL && process.env.CT_API_CLIENTE && process.env.CT_API_RFC);
  }

  async getToken(force = false): Promise<string> {
    if (!force && this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.token;
    }
    const creds = this.credentials();
    const res = await fetch(`${this.baseUrl()}/cliente/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`CT token ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as CtTokenResponse;
    if (!data.token) throw new Error('CT token vacío');
    // Token ~24h; renovar cada 12h por seguridad.
    this.cachedToken = { token: data.token, expiresAt: Date.now() + 12 * 60 * 60 * 1000 };
    return data.token;
  }

  private async authGet(path: string): Promise<Response> {
    const token = await this.getToken();
    const res = await fetch(`${this.baseUrl()}${path}`, {
      headers: { 'x-auth': token },
    });
    if (res.status === 401) {
      const token2 = await this.getToken(true);
      return fetch(`${this.baseUrl()}${path}`, { headers: { 'x-auth': token2 } });
    }
    return res;
  }

  private async authPost(path: string, body: unknown): Promise<Response> {
    const token = await this.getToken();
    const res = await fetch(`${this.baseUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth': token },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      const token2 = await this.getToken(true);
      return fetch(`${this.baseUrl()}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth': token2 },
        body: JSON.stringify(body),
      });
    }
    return res;
  }

  async getTipoCambio(): Promise<number> {
    const res = await this.authGet('/pedido/tipoCambio');
    if (!res.ok) throw new Error(`CT tipoCambio ${res.status}`);
    const data = (await res.json()) as { tipoCambio?: number };
    return Number(data.tipoCambio) || Number(process.env.CT_FALLBACK_FX || 17);
  }

  async getPromocionPrecio(codigo: string) {
    const res = await this.authGet(`/existencia/promociones/${encodeURIComponent(codigo)}`);
    if (!res.ok) throw new Error(`CT promociones/${codigo} ${res.status}`);
    return res.json();
  }

  async solicitarPedido(payload: CtSolicitarPedidoRequest): Promise<CtSolicitarPedidoResponse> {
    const res = await this.authPost('/pedido', payload);
    const text = await res.text();
    let data: CtSolicitarPedidoResponse;
    try {
      data = JSON.parse(text) as CtSolicitarPedidoResponse;
    } catch {
      throw new Error(`CT pedido respuesta inválida: ${text.slice(0, 300)}`);
    }
    if (!res.ok) {
      this.logger.warn(`CT pedido ${res.status}: ${text.slice(0, 400)}`);
      throw new Error(
        data.respuestaCT?.errores?.length
          ? `CT rechazó pedido: ${JSON.stringify(data.respuestaCT.errores)}`
          : `CT pedido ${res.status}`,
      );
    }
    return data;
  }

  async confirmarPedido(folio: string) {
    const res = await this.authPost('/pedido/confirmar', { folio });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`CT confirmar ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }

  async consultarEstatus(folio: string) {
    const res = await this.authGet(`/pedido/estatus/${encodeURIComponent(folio)}`);
    if (!res.ok) throw new Error(`CT estatus ${res.status}`);
    return res.json();
  }
}
