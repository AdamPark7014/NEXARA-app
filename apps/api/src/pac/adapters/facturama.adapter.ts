import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { cents } from '../cfdi-xml.builder.js';
import type {
  IPacAdapter,
  PacCancelInput,
  PacCancelResult,
  PacPaymentComplementInput,
  PacStampInput,
  PacStampResult,
} from '../pac.types.js';

/**
 * Adapter Facturama, modalidad API Web (https://facturama.mx/docs/es/api-web/crear-cfdi).
 * Requiere FACTURAMA_USER y FACTURAMA_PASSWORD (son las mismas del portal: no hay llaves de API) y
 * FACTURAMA_BASE_URL. Opcional: FACTURAMA_TIMEOUT_MS (45 s por omisión). Auth: HTTP Basic.
 *
 * En API Web el emisor y su CSD salen del perfil fiscal de la cuenta de Facturama, no del payload.
 *
 * Tres cosas que la API no resuelve sola y aquí sí:
 *  - La respuesta de emisión no trae el XML: se descarga después con el `Id` del CFDI.
 *  - Cancelar pide ese `Id`, no el UUID: si no viene, se busca en Facturama antes de cancelar.
 *  - Un corte de red después de timbrar invitaría a timbrar otra vez: antes de emitir se busca si
 *    ya hay un CFDI vigente con la misma serie y folio, y si es el mismo se reutiliza.
 */

/** Corte de red, tiempo agotado o error 5xx: no se sabe si Facturama alcanzó a procesar. */
class FacturamaSinRespuesta extends Error {}

type Metodo = 'GET' | 'POST' | 'DELETE';

/** Lo que identifica a un CFDI ya emitido para no timbrarlo dos veces. */
interface ClaveCfdi {
  serie: string;
  folio: string;
  emisorRfc: string;
  receptorRfc: string;
  /** Total a comparar; `null` en los complementos de pago (su Total es 0). */
  total: number | null;
}

const RFC_PUBLICO_EN_GENERAL = 'XAXX010101000';

function seisDecimales(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Fecha del pago en el formato de Facturama (aaaa-mm-ddThh:mm:ss) y en hora de Ciudad de México.
 * `payments.paymentDate` es una fecha sin hora (`@db.Date`) y llega como medianoche UTC, que en
 * México ya es el día anterior: a esas se les respeta el día de calendario.
 */
export function fechaPagoCfdi(valor: string | Date): string {
  const iso = valor instanceof Date ? valor.toISOString() : String(valor).trim();
  const soloDia = /^(\d{4}-\d{2}-\d{2})(?:T00:00:00(?:\.0+)?Z)?$/.exec(iso);
  if (soloDia) return `${soloDia[1]}T12:00:00`;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) throw new BadRequestException(`Fecha de pago inválida: ${valor}`);
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(fecha)
      .map((p) => [p.type, p.value]),
  );
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}:${partes.second}`;
}

/** Facturama y el SAT dan las fechas en hora de Ciudad de México sin zona (UTC-6 todo el año). */
function fechaMexico(texto: string): Date {
  return new Date(/(Z|[+-]\d{2}:\d{2})$/.test(texto) ? texto : `${texto}-06:00`);
}

/** El SAT rechaza PUE con forma 99 y PPD con una forma distinta de 99. */
export function formaYMetodoDePago(forma?: string | null, metodo?: string | null) {
  const metodoPago = (metodo || 'PUE').trim().toUpperCase();
  if (metodoPago !== 'PUE' && metodoPago !== 'PPD') {
    throw new BadRequestException(`Método de pago inválido: ${metodo} (debe ser PUE o PPD).`);
  }
  if (metodoPago === 'PPD') return { PaymentForm: '99', PaymentMethod: 'PPD' };
  const formaPago = (forma || '').trim().toUpperCase().replace(/^FP/, '');
  if (!formaPago || formaPago === '99') {
    throw new BadRequestException(
      'Con método PUE (pago en una sola exhibición) la forma de pago no puede ser «99 · Por definir»: ' +
        'elige cómo pagó el cliente (por ejemplo 03 · Transferencia) o cambia el método a PPD.',
    );
  }
  return { PaymentForm: formaPago, PaymentMethod: 'PUE' };
}

/** Junta el `Message` y los `ModelState` que devuelve Facturama en un 400. */
function detalleError(texto: string): string {
  try {
    const cuerpo = JSON.parse(texto);
    const partes: string[] = [];
    if (cuerpo?.Message) partes.push(String(cuerpo.Message));
    for (const mensajes of Object.values(cuerpo?.ModelState ?? {})) {
      for (const m of Array.isArray(mensajes) ? mensajes : [mensajes]) partes.push(String(m));
    }
    if (partes.length) return [...new Set(partes)].join(' · ');
  } catch {
    // No era JSON: se devuelve el texto tal cual.
  }
  return texto.slice(0, 400) || 'sin detalle';
}

/** Atributos del nodo TimbreFiscalDigital (no de otros nodos con `UUID`, como CfdiRelacionado). */
function atributoTimbre(xml: string, nombre: string): string | null {
  const nodo = /<[^>]*TimbreFiscalDigital\b[^>]*>/.exec(xml)?.[0];
  if (!nodo) return null;
  return new RegExp(`\\b${nombre}="([^"]*)"`).exec(nodo)?.[1] ?? null;
}

export class FacturamaAdapter implements IPacAdapter {
  readonly provider = 'facturama' as const;
  private readonly logger = new Logger(FacturamaAdapter.name);

  constructor(
    private readonly user: string,
    private readonly password: string,
    private readonly baseUrl: string = 'https://apisandbox.facturama.mx',
    private readonly timeoutMs: number = Number(process.env['FACTURAMA_TIMEOUT_MS']) || 45_000,
  ) {
    if (!user || !password) {
      throw new Error('Facturama: FACTURAMA_USER y FACTURAMA_PASSWORD requeridos');
    }
  }

  private get authHeader(): string {
    const token = Buffer.from(`${this.user}:${this.password}`).toString('base64');
    return `Basic ${token}`;
  }

  async stamp(input: PacStampInput): Promise<PacStampResult> {
    try {
      const payload = this.payloadFactura(input);
      return await this.emitir(payload, 'timbrado', {
        serie: payload['Serie'] as string,
        folio: payload['Folio'] as string,
        emisorRfc: input.emisor.rfc,
        receptorRfc: input.receptor.rfc,
        total: cents(input.total),
      });
    } catch (err) {
      throw this.comoHttp(err, 'timbrado');
    }
  }

  async stampPayment(input: PacPaymentComplementInput): Promise<PacStampResult> {
    try {
      const payload = this.payloadPago(input);
      return await this.emitir(payload, 'complemento de pago', {
        serie: payload['Serie'] as string,
        folio: payload['Folio'] as string,
        emisorRfc: input.emisor.rfc,
        receptorRfc: input.receptor.rfc,
        total: null,
      });
    } catch (err) {
      throw this.comoHttp(err, 'complemento de pago');
    }
  }

  async cancel(input: PacCancelInput): Promise<PacCancelResult> {
    try {
      return await this.cancelar(input);
    } catch (err) {
      throw this.comoHttp(err, 'cancelación');
    }
  }

  // ── Payloads ──────────────────────────────────────────────────────

  private payloadFactura(input: PacStampInput): Record<string, unknown> {
    const tipo = input.tipoComprobante || 'I';
    const lugar = this.lugarExpedicion(input.emisor.zipCode);
    const moneda = input.currency || 'MXN';
    const payload: Record<string, unknown> = {
      NameId: tipo === 'E' ? '2' : '1',
      Serie: input.serie || 'A',
      Folio: this.folio(input.folio, input.invoiceNumber),
      CfdiType: tipo,
      ...formaYMetodoDePago(input.paymentForm, input.paymentMethod),
      Currency: moneda,
      ExpeditionPlace: lugar,
      Exportation: '01',
      Receiver: this.receptor(input.receptor, input.cfdiUsage || (tipo === 'E' ? 'G02' : 'G03'), lugar),
      Items: input.items.map((item) => this.concepto(item)),
    };
    if (moneda !== 'MXN') {
      if (!input.exchangeRate) throw new BadRequestException(`Falta el tipo de cambio para facturar en ${moneda}.`);
      payload['ExchangeRate'] = input.exchangeRate;
    }
    if (input.relatedUuids && input.relatedUuids.length) {
      payload['Relations'] = {
        Type: input.relationType || '01',
        Cfdis: input.relatedUuids.map((u) => ({ Uuid: u })),
      };
    }
    return payload;
  }

  private payloadPago(input: PacPaymentComplementInput): Record<string, unknown> {
    const lugar = this.lugarExpedicion(input.emisor.zipCode);
    const pago = input.payment;
    const moneda = pago.currency || 'MXN';
    const forma = (pago.paymentForm || '').trim().toUpperCase().replace(/^FP/, '');
    if (!forma || forma === '99') {
      throw new BadRequestException('El complemento de pago necesita la forma en que se pagó (no puede ser «99 · Por definir»).');
    }
    if (moneda !== 'MXN' && !pago.exchangeRate) {
      throw new BadRequestException(`Falta el tipo de cambio del pago en ${moneda}.`);
    }
    const payment: Record<string, unknown> = {
      Date: fechaPagoCfdi(pago.date),
      PaymentForm: forma,
      Currency: moneda,
      ExchangeRate: moneda === 'MXN' ? 1 : pago.exchangeRate,
      Amount: cents(pago.amount),
      RelatedDocuments: input.relatedDocs.map((d) => this.documentoRelacionado(d, moneda)),
    };
    if (pago.operationNumber) payment['OperationNumber'] = pago.operationNumber;
    return {
      NameId: '14',
      CfdiType: 'P',
      Serie: input.serie || 'P',
      Folio: this.folio(input.folio, input.invoiceNumber),
      ExpeditionPlace: lugar,
      Receiver: { ...this.receptor(input.receptor, 'CP01', lugar), CfdiUse: 'CP01' },
      Complemento: { Payments: [payment] },
    };
  }

  private concepto(item: PacStampInput['items'][number]): Record<string, unknown> {
    // Mismo redondeo que el ERP (`cents` antes de sumar): así el total timbrado cuadra con el guardado.
    const subtotal = cents(item.unitPrice * item.quantity);
    const descuento = cents(item.discount || 0);
    const base = cents(subtotal - descuento);
    const tasa = item.taxRate != null ? item.taxRate / 100 : 0.16;
    const iva = cents(base * tasa);
    const taxes: Array<Record<string, unknown>> = [
      { Name: 'IVA', Rate: tasa, Base: base, Total: iva, IsRetention: false },
    ];
    let retenido = 0;
    for (const [nombre, monto] of [
      ['IVA', item.ivaRetAmount],
      ['ISR', item.isrRetAmount],
    ] as const) {
      if (!monto || monto <= 0) continue;
      const total = cents(monto);
      retenido += total;
      taxes.push({ Name: nombre, Rate: base > 0 ? seisDecimales(total / base) : 0, Base: base, Total: total, IsRetention: true });
    }
    return {
      ProductCode: item.satProductKey || '01010101',
      IdentificationNumber: '',
      Description: item.description,
      Unit: item.unitName || 'Servicio',
      UnitCode: item.satUnitKey || 'E48',
      UnitPrice: item.unitPrice,
      Quantity: item.quantity,
      Subtotal: subtotal,
      Discount: descuento,
      TaxObject: '02',
      Taxes: taxes,
      Total: cents(base + iva - retenido),
    };
  }

  /** Pagos 2.0 pide el IVA de cada documento pagado, proporcional a lo pagado. */
  private documentoRelacionado(
    d: PacPaymentComplementInput['relatedDocs'][number],
    monedaPago: string,
  ): Record<string, unknown> {
    const moneda = d.currency || 'MXN';
    if (moneda !== monedaPago) {
      throw new BadRequestException(
        `La factura ${d.uuid} está en ${moneda} y el pago en ${monedaPago}: el complemento con equivalencia entre monedas no está soportado.`,
      );
    }
    const tasa = d.ivaRate != null ? d.ivaRate / 100 : 0.16;
    const base = seisDecimales(d.amountPaid / (1 + tasa));
    return {
      Uuid: d.uuid,
      ...(d.serie ? { Serie: d.serie } : {}),
      ...(d.folio ? { Folio: d.folio } : {}),
      Currency: moneda,
      EquivalenceDocRel: 1,
      PartialityNumber: d.partialityNumber,
      PreviousBalanceAmount: cents(d.previousBalance),
      AmountPaid: cents(d.amountPaid),
      ImpSaldoInsoluto: cents(d.remainingBalance),
      TaxObject: '02',
      Taxes: [{ Name: 'IVA', Rate: tasa, Base: base, Total: seisDecimales(base * tasa), IsRetention: false }],
    };
  }

  private receptor(
    r: PacStampInput['receptor'],
    usoCfdi: string,
    lugar: string,
  ): Record<string, unknown> {
    const rfc = (r.rfc || '').trim().toUpperCase();
    if (rfc === RFC_PUBLICO_EN_GENERAL) {
      // Público en general: el SAT exige régimen 616, uso S01 y el CP del lugar de expedición.
      return { Rfc: rfc, Name: r.name.trim(), CfdiUse: 'S01', FiscalRegime: '616', TaxZipCode: lugar };
    }
    const regimen = (r.regime || '').trim().toUpperCase().replace(/^R/, '');
    if (!/^\d{3}$/.test(regimen)) {
      throw new BadRequestException(`Falta el régimen fiscal del cliente ${r.name} (${rfc}).`);
    }
    const cp = (r.zipCode || '').trim();
    if (!/^\d{5}$/.test(cp)) {
      throw new BadRequestException(`Falta el código postal fiscal del cliente ${r.name} (${rfc}).`);
    }
    return { Rfc: rfc, Name: r.name.trim(), CfdiUse: usoCfdi, FiscalRegime: regimen, TaxZipCode: cp };
  }

  private lugarExpedicion(cp?: string | null): string {
    const lugar = (cp || '').trim();
    if (!/^\d{5}$/.test(lugar)) {
      throw new BadRequestException(
        'Falta el código postal fiscal de la empresa emisora (lugar de expedición): captúralo en el perfil de la empresa.',
      );
    }
    return lugar;
  }

  private folio(folio: string | null | undefined, invoiceNumber: string): string {
    const valor = (folio || invoiceNumber.replace(/[^0-9]/g, '')).trim();
    if (!valor) throw new BadRequestException(`La factura ${invoiceNumber} no tiene folio numérico para el CFDI.`);
    return valor;
  }

  // ── Emisión idempotente ───────────────────────────────────────────

  private async emitir(payload: Record<string, unknown>, etiqueta: string, clave: ClaveCfdi): Promise<PacStampResult> {
    const previo = await this.buscarEmitido(clave);
    if (previo) {
      this.logger.warn(
        `Facturama ya tenía el CFDI serie ${clave.serie} folio ${clave.folio} ` +
          `(${previo?.Complement?.TaxStamp?.Uuid}): se reutiliza en vez de timbrar otro.`,
      );
      return this.resultado(previo, clave);
    }
    let creado: any;
    try {
      creado = await this.llamar('POST', '/3/cfdis', payload, etiqueta);
    } catch (err) {
      if (!(err instanceof FacturamaSinRespuesta)) throw err;
      // Pudo timbrar y cortarse antes de contestar: se busca antes de rendirse.
      const recuperado = await this.buscarEmitido(clave).catch(() => null);
      if (recuperado) return this.resultado(recuperado, clave);
      throw new ServiceUnavailableException(
        `Facturama no respondió a la solicitud de ${etiqueta} (${err.message}) y no aparece un CFDI con la serie ` +
          `${clave.serie} y folio ${clave.folio}. Reintenta en unos minutos: antes de timbrar se vuelve a buscar ` +
          'ese folio, así que no se duplica.',
      );
    }
    return this.resultado(creado, clave);
  }

  /** CFDI vigente con la misma serie y folio. Si es de otro cliente o por otro importe, se detiene. */
  private async buscarEmitido(clave: ClaveCfdi): Promise<any | null> {
    const qs = new URLSearchParams({ type: 'issued', page: '0', status: 'active', folio: clave.folio, Serie: clave.serie });
    const lista = await this.llamar('GET', `/cfdi?${qs}`, undefined, 'consulta');
    const candidatos = (Array.isArray(lista) ? lista : []).filter(
      (c: any) => String(c?.Folio ?? '') === clave.folio && String(c?.Serie ?? '') === clave.serie && c?.Id,
    );
    for (const candidato of candidatos) {
      const cfdi = await this.llamar('GET', `/cfdi/${encodeURIComponent(candidato.Id)}?type=issued`, undefined, 'consulta');
      if (String(cfdi?.Status || '').toLowerCase() !== 'active') continue;
      const uuid = cfdi?.Complement?.TaxStamp?.Uuid;
      const mismoReceptor = String(cfdi?.Receiver?.Rfc || '').toUpperCase() === clave.receptorRfc.trim().toUpperCase();
      const mismoTotal = clave.total == null || Math.abs(Number(cfdi?.Total) - clave.total) < 0.01;
      if (uuid && mismoReceptor && mismoTotal) return cfdi;
      throw new BadRequestException(
        `Ya hay en Facturama un CFDI vigente con la serie ${clave.serie} y folio ${clave.folio} ` +
          `(UUID ${uuid || 'sin UUID'}) para otro cliente o por otro importe. Revísalo en el portal de Facturama ` +
          'antes de timbrar de nuevo.',
      );
    }
    return null;
  }

  private async resultado(cfdi: any, clave: ClaveCfdi): Promise<PacStampResult> {
    const id: string | null = cfdi?.Id ?? null;
    const timbre = cfdi?.Complement?.TaxStamp ?? {};
    const emisor = String(cfdi?.Issuer?.Rfc || '').toUpperCase();
    if (emisor && emisor !== clave.emisorRfc.trim().toUpperCase()) {
      this.logger.error(
        `Facturama timbró con el RFC ${emisor} y el ERP esperaba ${clave.emisorRfc}: revisa el perfil fiscal de la cuenta (CFDI ${id}).`,
      );
    }
    const xml = id ? await this.descargarXml(id) : '';
    const fecha = timbre.Date || atributoTimbre(xml, 'FechaTimbrado');
    return {
      uuid: timbre.Uuid || atributoTimbre(xml, 'UUID') || '',
      stampedAt: fecha ? fechaMexico(fecha) : new Date(),
      satCertNumber: atributoTimbre(xml, 'NoCertificadoSAT') || timbre.SatCertNumber || '',
      satSignature: atributoTimbre(xml, 'SelloSAT') || timbre.SatSign || null,
      xml,
      // El PDF de Facturama solo se baja con las credenciales (no hay URL pública): se pide con `pacDocumentId`.
      pdfUrl: null,
      provider: 'facturama',
      pacDocumentId: id,
    };
  }

  /** La respuesta de emisión no trae el XML. Si no se logra bajar, el CFDI ya existe: no se falla. */
  private async descargarXml(id: string): Promise<string> {
    for (let intento = 1; intento <= 2; intento++) {
      try {
        const archivo = await this.llamar('GET', `/cfdi/xml/issued/${encodeURIComponent(id)}`, undefined, 'descarga del XML');
        if (archivo?.Content) return Buffer.from(String(archivo.Content), 'base64').toString('utf8').replace(/^﻿/, '');
      } catch (err) {
        this.logger.warn(`Facturama: no se pudo bajar el XML del CFDI ${id} (intento ${intento}): ${(err as Error).message}`);
      }
    }
    this.logger.error(`Facturama: el CFDI ${id} quedó timbrado pero sin XML en el ERP; bájalo del portal de Facturama.`);
    return '';
  }

  // ── Cancelación ───────────────────────────────────────────────────

  private async cancelar(input: PacCancelInput): Promise<PacCancelResult> {
    const id = input.pacDocumentId || (await this.buscarIdPorUuid(input));
    const actual = await this.llamar('GET', `/cfdi/${encodeURIComponent(id)}?type=issued`, undefined, 'consulta');
    if (String(actual?.Status || '').toLowerCase() === 'canceled') {
      return { accepted: true, acuse: null, cancelledAt: new Date(), provider: 'facturama' };
    }
    const qs = new URLSearchParams({ type: 'issued', motive: input.cancelReason });
    // La doc avisa: mandar uuidReplacement (aunque vaya vacío) fuera del motivo 01 hace fallar la cancelación.
    if (input.cancelReason === '01') {
      if (!input.substitutionUuid) {
        throw new BadRequestException('El motivo 01 necesita el UUID de la factura que sustituye a esta.');
      }
      qs.set('uuidReplacement', input.substitutionUuid);
    }
    const r = await this.llamar('DELETE', `/cfdi/${encodeURIComponent(id)}?${qs}`, undefined, 'cancelación');
    const estado = String(r?.Status || '').toLowerCase();
    if (estado === 'canceled') {
      return {
        accepted: true,
        acuse: r?.AcuseXmlBase64 ? Buffer.from(String(r.AcuseXmlBase64), 'base64').toString('utf8') : null,
        cancelledAt: r?.CancelationDate ? fechaMexico(String(r.CancelationDate)) : new Date(),
        provider: 'facturama',
      };
    }
    if (estado === 'pending') {
      // Se lanza en vez de devolver `accepted: false` para que el ERP no la marque cancelada:
      // ante el SAT sigue vigente hasta que el cliente responda.
      throw new BadRequestException(
        `El SAT recibió la solicitud de cancelación del CFDI ${input.uuid}, pero el cliente tiene que aceptarla` +
          `${r?.ExpirationDate ? ` (plazo: ${r.ExpirationDate})` : ''}. Mientras no responda la factura sigue vigente; ` +
          'vuelve a cancelarla cuando responda para dejarla registrada.',
      );
    }
    throw new BadRequestException(
      `Facturama no canceló el CFDI ${input.uuid}: ${r?.Message || r?.AcuseStatusDetails || 'sin detalle'}.`,
    );
  }

  private async buscarIdPorUuid(input: PacCancelInput): Promise<string> {
    const uuid = input.uuid.trim().toLowerCase();
    const consultas = [new URLSearchParams({ type: 'issued', page: '0', status: 'all', keyword: input.uuid })];
    if (input.folio) {
      const porFolio = new URLSearchParams({ type: 'issued', page: '0', status: 'all', folio: input.folio });
      if (input.serie) porFolio.set('Serie', input.serie);
      consultas.push(porFolio);
    }
    for (const qs of consultas) {
      const lista = await this.llamar('GET', `/cfdi?${qs}`, undefined, 'consulta');
      for (const c of Array.isArray(lista) ? lista : []) {
        if (!c?.Id) continue;
        const suyo = String(c.Uuid ?? c.UUID ?? '').toLowerCase();
        if (suyo === uuid) return c.Id;
        if (suyo) continue;
        const cfdi = await this.llamar('GET', `/cfdi/${encodeURIComponent(c.Id)}?type=issued`, undefined, 'consulta');
        if (String(cfdi?.Complement?.TaxStamp?.Uuid || '').toLowerCase() === uuid) return c.Id;
      }
    }
    throw new BadRequestException(
      `No encontré en Facturama el CFDI ${input.uuid}. Si se timbró en otro sistema o directo en el portal, cancélalo desde ahí.`,
    );
  }

  // ── HTTP ──────────────────────────────────────────────────────────

  private async llamar(metodo: Metodo, ruta: string, cuerpo: unknown, etiqueta: string): Promise<any> {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), this.timeoutMs);
    let estado: number;
    let texto: string;
    try {
      const respuesta = await fetch(`${this.baseUrl}${ruta}`, {
        method: metodo,
        headers: {
          Authorization: this.authHeader,
          ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
        signal: control.signal,
      });
      estado = respuesta.status;
      texto = await respuesta.text();
    } catch (err) {
      const e = err as Error;
      throw new FacturamaSinRespuesta(
        e.name === 'AbortError' ? `sin respuesta en ${Math.round(this.timeoutMs / 1000)} s` : e.message,
      );
    } finally {
      clearTimeout(reloj);
    }
    if (estado >= 500) throw new FacturamaSinRespuesta(`HTTP ${estado}: ${detalleError(texto)}`);
    if (estado === 401 || estado === 403) {
      throw new ServiceUnavailableException(
        'Facturama rechazó las credenciales de la cuenta: pídele a administración que revise la conexión de timbrado.',
      );
    }
    if (estado < 200 || estado >= 300) {
      throw new BadRequestException(`Facturama rechazó la solicitud de ${etiqueta}: ${detalleError(texto)}`);
    }
    if (!texto) return null;
    try {
      return JSON.parse(texto);
    } catch {
      return texto;
    }
  }

  private comoHttp(err: unknown, etiqueta: string): Error {
    if (err instanceof FacturamaSinRespuesta) {
      return new ServiceUnavailableException(
        `Facturama no respondió a la solicitud de ${etiqueta} (${err.message}). Reintenta en unos minutos.`,
      );
    }
    return err as Error;
  }
}
