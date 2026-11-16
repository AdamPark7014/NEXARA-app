/**
 * Descarga Masiva de CFDI del SAT con la e.firma de la empresa (`@nodecfdi/sat-ws-descarga-masiva`).
 *
 * Flujo del SAT: solicitar (periodo, emitidos o recibidos, XML o metadatos) → verificar hasta que esté
 * lista → descargar cada paquete ZIP. Los ZIP se guardan en `uploads/sat-descargas/<rfc>/`, carpeta que
 * `/uploads` nunca sirve (`PRIVATE_UPLOAD_PREFIXES`).
 *
 * DESPLIEGUE: montar en el contenedor de la API, de solo lectura,
 *   /etc/nexara-secrets/sat/efirma:/etc/nexara-secrets/sat/efirma:ro
 * La librería es solo ESM: se carga con `import()` dinámico la primera vez que se usa.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { resolveUploadsDir } from '../../common/uploads-path.js';
import {
  MENSAJE_FALTA_EFIRMA,
  fechaSat,
  leerEfirma,
  resumenCertificado,
  validarPeriodo,
  type MaterialEfirma,
  type ResumenCertificado,
} from './credencial-efirma.js';

export type EstadoEfirma =
  | { lista: true; certificado: ResumenCertificado; mensaje: string }
  | { lista: false; certificado: ResumenCertificado | null; mensaje: string };

export type SolicitudDescarga = { desde: string; hasta: string; tipo: 'emitidos' | 'recibidos'; formato: 'xml' | 'metadata' };

/** Lo que se usa de la librería (permite simularla en las pruebas). */
export type LibreriaSat = {
  Fiel: { create(cer: string, key: string, pass: string): { isValid(): boolean; getRfc(): string } };
  HttpsWebClient: new () => unknown;
  FielRequestBuilder: new (fiel: unknown) => unknown;
  Service: new (builder: unknown, client: unknown) => {
    query(q: unknown): Promise<{ getStatus(): { isAccepted(): boolean; getMessage(): string }; getRequestId(): string }>;
    verify(id: string): Promise<{
      getStatus(): { isAccepted(): boolean; getMessage(): string };
      getStatusRequest(): { isTypeOf(t: string): boolean; getValue?(): unknown };
      getPackageIds(): string[];
      countPackages(): number;
    }>;
    download(id: string): Promise<{ getStatus(): { isAccepted(): boolean; getMessage(): string }; getPackageContent(): string }>;
  };
  QueryParameters: { create(period?: unknown): { withDownloadType(x: unknown): any; withRequestType(x: unknown): any } };
  DateTimePeriod: { createFromValues(a: string, b: string): unknown };
  DownloadType: { issued(): unknown; received(): unknown };
  RequestType: { xml(): unknown; metadata(): unknown };
};

const ESTADOS = ['Accepted', 'InProgress', 'Finished', 'Failure', 'Rejected', 'Expired'] as const;
const ESTADO_ES: Record<(typeof ESTADOS)[number], string> = {
  Accepted: 'aceptada',
  InProgress: 'en proceso',
  Finished: 'lista',
  Failure: 'falló',
  Rejected: 'rechazada',
  Expired: 'vencida',
};

@Injectable()
export class DescargaMasivaService {
  private readonly logger = new Logger('DescargaMasiva');
  private libreria: Promise<LibreriaSat> | null = null;

  constructor() {}

  /** Se puede sustituir en pruebas. */
  cargarLibreria: () => Promise<LibreriaSat> = () =>
    (this.libreria ??= import('@nodecfdi/sat-ws-descarga-masiva') as unknown as Promise<LibreriaSat>);

  /** Se puede sustituir en pruebas. */
  leerMaterial: () => MaterialEfirma | null = () => leerEfirma();

  estado(ahora: Date = new Date()): EstadoEfirma {
    const m = this.leerMaterial();
    if (!m) return { lista: false, certificado: null, mensaje: MENSAJE_FALTA_EFIRMA };
    let certificado: ResumenCertificado;
    try {
      certificado = resumenCertificado(m.cer, ahora);
    } catch {
      return { lista: false, certificado: null, mensaje: 'El archivo .cer de la e.firma no se pudo leer: vuelve a subirlo.' };
    }
    if (certificado.vencido) return { lista: false, certificado, mensaje: 'La e.firma está vencida: renuévala en el SAT y súbela de nuevo.' };
    const esperado = (process.env.EMPRESA_RFC || process.env.COMPANY_RFC || process.env.PAC_RFC_EMISOR || '').trim().toUpperCase();
    if (esperado && certificado.rfc && certificado.rfc !== esperado) {
      return { lista: false, certificado, mensaje: `La e.firma es de ${certificado.rfc}, no de la empresa (${esperado}).` };
    }
    return { lista: true, certificado, mensaje: 'e.firma lista para la Descarga Masiva.' };
  }

  private async servicio() {
    const m = this.leerMaterial();
    if (!m) throw new ServiceUnavailableException(MENSAJE_FALTA_EFIRMA);
    const lib = await this.cargarLibreria();
    let fiel: ReturnType<LibreriaSat['Fiel']['create']>;
    try {
      fiel = lib.Fiel.create(m.cer.toString('binary'), m.key.toString('binary'), m.password);
    } catch {
      throw new ServiceUnavailableException('La contraseña no abre la llave de la e.firma: vuelve a subirla.');
    }
    // `isValid` es falso con un CSD (no sirve para autenticarse ante el SAT) o con una e.firma vencida.
    if (!fiel.isValid()) throw new ServiceUnavailableException('Ese certificado no es una e.firma vigente (¿es el CSD?).');
    return { lib, rfc: fiel.getRfc(), service: new lib.Service(new lib.FielRequestBuilder(fiel), new lib.HttpsWebClient()) };
  }

  async solicitar(s: SolicitudDescarga, ahora: Date = new Date()) {
    const error = validarPeriodo(s.desde, s.hasta, ahora);
    if (error) throw new BadRequestException(error);
    if (s.tipo !== 'emitidos' && s.tipo !== 'recibidos') throw new BadRequestException('Tipo: emitidos o recibidos.');
    if (s.formato !== 'xml' && s.formato !== 'metadata') throw new BadRequestException('Formato: xml o metadata.');
    const { lib, service } = await this.servicio();
    const consulta = lib.QueryParameters.create(lib.DateTimePeriod.createFromValues(fechaSat(s.desde), fechaSat(s.hasta, true)))
      .withDownloadType(s.tipo === 'emitidos' ? lib.DownloadType.issued() : lib.DownloadType.received())
      .withRequestType(s.formato === 'xml' ? lib.RequestType.xml() : lib.RequestType.metadata());
    const r = await service.query(consulta);
    if (!r.getStatus().isAccepted()) throw new BadRequestException(`El SAT no aceptó la solicitud: ${r.getStatus().getMessage()}`);
    this.logger.log(`Solicitud de descarga ${r.getRequestId()} (${s.tipo}, ${s.formato}, ${s.desde}–${s.hasta})`);
    return { idSolicitud: r.getRequestId() };
  }

  async verificar(idSolicitud: string) {
    if (!/^[0-9a-f-]{20,60}$/i.test(idSolicitud)) throw new BadRequestException('Identificador de solicitud no válido.');
    const { service } = await this.servicio();
    const v = await service.verify(idSolicitud);
    if (!v.getStatus().isAccepted()) throw new BadRequestException(`El SAT no pudo verificar la solicitud: ${v.getStatus().getMessage()}`);
    const sr = v.getStatusRequest();
    const estado = ESTADOS.find((e) => sr.isTypeOf(e)) ?? 'InProgress';
    return { idSolicitud, estado: ESTADO_ES[estado], lista: estado === 'Finished', paquetes: estado === 'Finished' ? v.getPackageIds() : [] };
  }

  async descargar(idPaquete: string) {
    if (!/^[0-9a-z_-]{10,80}$/i.test(idPaquete)) throw new BadRequestException('Identificador de paquete no válido.');
    const { service, rfc } = await this.servicio();
    const d = await service.download(idPaquete);
    if (!d.getStatus().isAccepted()) throw new BadRequestException(`El SAT no entregó el paquete: ${d.getStatus().getMessage()}`);
    const contenido = Buffer.from(d.getPackageContent(), 'base64');
    const carpeta = resolveUploadsDir('sat-descargas', rfc.replace(/[^A-Z0-9&Ñ]/gi, ''));
    await fs.mkdir(carpeta, { recursive: true });
    const ruta = path.join(carpeta, `${idPaquete}.zip`);
    await fs.writeFile(ruta, contenido, { mode: 0o600 });
    return { idPaquete, bytes: contenido.length, guardadoEn: path.relative(resolveUploadsDir(), ruta).replace(/\\/g, '/') };
  }
}
