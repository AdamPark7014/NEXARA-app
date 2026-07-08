import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import * as forge from 'node-forge';

/**
 * CsdService — manejo del Certificado de Sello Digital (CSD) del emisor.
 *
 * Cumple el requisito SAT de firmado con CSD para el sellado de CFDI:
 *  - Carga el `.cer` (DER) → extrae NoCertificado y el Certificado en base64.
 *  - Carga la llave privada `.key` (PKCS#8 encriptada por el SAT) y la desencripta
 *    con la contraseña de la clave privada.
 *  - Firma la cadena original con RSA-SHA256 → devuelve el Sello (base64).
 *
 * Configuración por variables de entorno (dos modos):
 *  A) Por contenido base64 (recomendado en contenedores):
 *       CSD_CER_BASE64, CSD_KEY_BASE64, CSD_KEY_PASSWORD
 *  B) Por ruta a archivos montados:
 *       CSD_CER_PATH, CSD_KEY_PATH, CSD_KEY_PASSWORD
 *
 * Nota: el `.key` del SAT viene en formato DER PKCS#8 encriptado. node-forge lo
 * soporta vía `pki.decryptRsaPrivateKey` tras convertirlo a PEM.
 */
@Injectable()
export class CsdService {
  private readonly logger = new Logger(CsdService.name);

  private cerPem: string | null = null;
  private privateKey: forge.pki.rsa.PrivateKey | null = null;
  private _noCertificado: string | null = null;
  private _certBase64: string | null = null;
  private _validFrom: Date | null = null;
  private _validTo: Date | null = null;
  private loadError: string | null = null;

  constructor() {
    try {
      this.load();
    } catch (err) {
      this.loadError = (err as Error).message;
      this.logger.warn(`CSD no cargado: ${this.loadError}`);
    }
  }

  /** ¿Hay un CSD válido cargado y listo para sellar? */
  isConfigured(): boolean {
    return Boolean(this.privateKey && this._noCertificado && this._certBase64);
  }

  /** NoCertificado (20 dígitos) que va en el atributo `NoCertificado` del CFDI. */
  get noCertificado(): string {
    if (!this._noCertificado) throw new Error('CSD sin cargar: NoCertificado no disponible');
    return this._noCertificado;
  }

  /** Certificado en base64 (DER) que va en el atributo `Certificado`. */
  get certificadoBase64(): string {
    if (!this._certBase64) throw new Error('CSD sin cargar: Certificado no disponible');
    return this._certBase64;
  }

  /** Firma la cadena original con RSA-SHA256 y devuelve el sello en base64. */
  sign(cadenaOriginal: string): string {
    if (!this.privateKey) throw new Error('CSD sin cargar: no se puede sellar');
    const md = forge.md.sha256.create();
    md.update(cadenaOriginal, 'utf8');
    const signature = this.privateKey.sign(md);
    return forge.util.encode64(signature);
  }

  /** Info de diagnóstico (sin exponer llaves). */
  info() {
    return {
      configured: this.isConfigured(),
      noCertificado: this._noCertificado,
      validFrom: this._validFrom,
      validTo: this._validTo,
      expired: this._validTo ? this._validTo.getTime() < Date.now() : null,
      error: this.loadError,
    };
  }

  private load(): void {
    const cerBuf = this.readSource('CSD_CER_BASE64', 'CSD_CER_PATH');
    const keyBuf = this.readSource('CSD_KEY_BASE64', 'CSD_KEY_PATH');
    const password = process.env['CSD_KEY_PASSWORD'] || '';

    if (!cerBuf || !keyBuf) {
      this.loadError = 'CSD no configurado (faltan CSD_CER_* / CSD_KEY_*)';
      return;
    }
    if (!password) {
      throw new Error('CSD_KEY_PASSWORD requerido para desencriptar la llave privada');
    }

    // Certificado (.cer) — DER → forge cert
    const cerAsn1 = forge.asn1.fromDer(forge.util.createBuffer(cerBuf.toString('binary')));
    const cert = forge.pki.certificateFromAsn1(cerAsn1);
    this.cerPem = forge.pki.certificateToPem(cert);
    this._validFrom = cert.validity.notBefore;
    this._validTo = cert.validity.notAfter;

    // NoCertificado: el serialNumber del CSD viene en hex; el SAT lo representa
    // como la cadena ASCII de 20 dígitos codificada en esos bytes hex.
    this._noCertificado = this.serialToNoCertificado(cert.serialNumber);

    // Certificado base64 (DER sin encabezados PEM)
    const derBytes = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    this._certBase64 = forge.util.encode64(derBytes);

    // Llave privada (.key) — DER PKCS#8 encriptada → PEM → desencriptar
    const keyPem = this.derKeyToEncryptedPem(keyBuf);
    const privateKey = forge.pki.decryptRsaPrivateKey(keyPem, password);
    if (!privateKey) {
      throw new Error('No se pudo desencriptar la llave privada (contraseña incorrecta o formato inválido)');
    }
    this.privateKey = privateKey;

    this.logger.log(
      `CSD cargado: NoCertificado=${this._noCertificado}, vigencia ${this._validFrom?.toISOString().slice(0, 10)} → ${this._validTo?.toISOString().slice(0, 10)}`,
    );
  }

  private readSource(base64Env: string, pathEnv: string): Buffer | null {
    const b64 = process.env[base64Env];
    if (b64 && b64.trim()) return Buffer.from(b64.trim(), 'base64');
    const path = process.env[pathEnv];
    if (path && path.trim()) return readFileSync(path.trim());
    return null;
  }

  /**
   * El serialNumber de forge es hex. El NoCertificado del SAT es la cadena ASCII
   * resultante de interpretar esos bytes hex como caracteres. Ej: hex "3330..." → "30...".
   */
  private serialToNoCertificado(serialHex: string): string {
    let hex = serialHex;
    if (hex.length % 2 !== 0) hex = `0${hex}`;
    let ascii = '';
    for (let i = 0; i < hex.length; i += 2) {
      ascii += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    }
    // Si el resultado son 20 dígitos, es el NoCertificado. Si no, devolver hex tal cual.
    return /^\d{20}$/.test(ascii) ? ascii : serialHex;
  }

  /** Convierte el DER binario de la llave privada encriptada del SAT a PEM. */
  private derKeyToEncryptedPem(der: Buffer): string {
    const b64 = der.toString('base64');
    const lines = b64.match(/.{1,64}/g) || [b64];
    return `-----BEGIN ENCRYPTED PRIVATE KEY-----\n${lines.join('\n')}\n-----END ENCRYPTED PRIVATE KEY-----\n`;
  }
}
