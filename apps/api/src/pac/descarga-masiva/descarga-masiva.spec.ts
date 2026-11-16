import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fechaSat, leerEfirma, resumenCertificado, validarPeriodo, MENSAJE_FALTA_EFIRMA } from './credencial-efirma.js';
import { DescargaMasivaService, type LibreriaSat } from './descarga-masiva.service.js';

/** Certificado de prueba con el RFC donde lo pone el SAT (x500UniqueIdentifier). Sin openssl, se salta. */
function certificadoDePrueba(dias: number): Buffer | null {
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'efirma-'));
    const pem = path.join(dir, 'c.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'k.pem'), '-out', pem, '-days', String(dias), '-subj', '/CN=EMPRESA DE PRUEBA SA DE CV/x500UniqueIdentifier=AAA010101AAA \\/ XAXX010101HPLRRR09'], { stdio: 'ignore' });
    const der = path.join(dir, 'c.cer');
    execFileSync('openssl', ['x509', '-in', pem, '-outform', 'DER', '-out', der], { stdio: 'ignore' });
    return fs.readFileSync(der);
  } catch {
    return null;
  }
}

describe('credencial de la e.firma', () => {
  it('lee la carpeta montada y quita el salto de línea de la contraseña', () => {
    const archivos: Record<string, string> = {
      '/s/efirma.cer': 'CER',
      '/s/efirma.key': 'KEY',
      '/s/password': 'secreta\n',
    };
    const leer = (r: string) => {
      if (!(r in archivos)) throw new Error('no existe');
      return Buffer.from(archivos[r]!);
    };
    const m = leerEfirma({ SAT_EFIRMA_DIR: '/s' }, leer)!;
    expect(m.password).toBe('secreta');
    expect(m.cer.toString()).toBe('CER');
  });

  it('sin carpeta usa las variables; sin nada, null', () => {
    const nada = () => {
      throw new Error('no');
    };
    expect(leerEfirma({ EFIRMA_CER_BASE64: 'Q0VS', EFIRMA_KEY_BASE64: 'S0VZ', EFIRMA_KEY_PASSWORD: 'p' }, nada)?.key.toString()).toBe('KEY');
    expect(leerEfirma({}, nada)).toBeNull();
  });

  it('del certificado saca el RFC, el titular y la vigencia', () => {
    const cer = certificadoDePrueba(30);
    if (!cer) return;
    const r = resumenCertificado(cer, new Date());
    expect(r.rfc).toBe('AAA010101AAA');
    expect(r.titular).toBe('EMPRESA DE PRUEBA SA DE CV');
    expect(r.vencido).toBe(false);
    expect(resumenCertificado(cer, new Date(Date.now() + 60 * 86_400_000)).vencido).toBe(true);
  });

  it('valida el periodo como lo pide el SAT y da el formato de la librería', () => {
    const ahora = new Date('2026-11-15T12:00:00Z');
    expect(validarPeriodo('2026-10-01', '2026-10-31', ahora)).toBeNull();
    expect(validarPeriodo('2026-10-31', '2026-10-01', ahora)).toMatch(/antes/);
    expect(validarPeriodo('2026-11-01', '2026-12-01', ahora)).toMatch(/futuro/);
    expect(validarPeriodo('2024-01-01', '2026-01-01', ahora)).toMatch(/un año/);
    expect(validarPeriodo('ayer', '2026-01-01', ahora)).toMatch(/no son válidas/);
    expect(fechaSat('2026-10-01')).toBe('2026-10-01 00:00:00');
    expect(fechaSat('2026-10-31', true)).toBe('2026-10-31 23:59:59');
    expect(fechaSat('2026-10-31T10:30')).toBe('2026-10-31 10:30:00');
  });
});

describe('DescargaMasivaService', () => {
  function armar(material: ReturnType<typeof leerEfirma>, valida = true) {
    const consultas: unknown[] = [];
    const lib = {
      Fiel: { create: jest.fn(() => ({ isValid: () => valida, getRfc: () => 'AAA010101AAA' })) },
      HttpsWebClient: class {},
      FielRequestBuilder: class {},
      Service: class {
        async query(q: unknown) {
          consultas.push(q);
          return { getStatus: () => ({ isAccepted: () => true, getMessage: () => '' }), getRequestId: () => '4e80345d-917f-40bb-a98f-4a73939343c5' };
        }
        async verify() {
          return {
            getStatus: () => ({ isAccepted: () => true, getMessage: () => '' }),
            getStatusRequest: () => ({ isTypeOf: (t: string) => t === 'Finished' }),
            getPackageIds: () => ['4E80345D-917F-40BB-A98F-4A73939343C5_01'],
            countPackages: () => 1,
          };
        }
        async download() {
          return { getStatus: () => ({ isAccepted: () => true, getMessage: () => '' }), getPackageContent: () => Buffer.from('ZIP').toString('base64') };
        }
      },
      QueryParameters: {
        create: (p: unknown) => {
          const q: Record<string, unknown> = { p };
          const self = {
            withDownloadType: (x: unknown) => ((q.tipo = x), self),
            withRequestType: (x: unknown) => ((q.formato = x), self),
            q,
          };
          return self;
        },
      },
      DateTimePeriod: { createFromValues: (a: string, b: string) => `${a}|${b}` },
      DownloadType: { issued: () => 'emitidos', received: () => 'recibidos' },
      RequestType: { xml: () => 'xml', metadata: () => 'metadata' },
    } as unknown as LibreriaSat;
    const s = new DescargaMasivaService();
    s.cargarLibreria = async () => lib;
    s.leerMaterial = () => material;
    return { s, lib, consultas };
  }
  const material = { cer: Buffer.from('c'), key: Buffer.from('k'), password: 'nunca-se-muestra' };

  it('sin e.firma dice cómo subirla', async () => {
    const { s } = armar(null);
    expect(s.estado()).toEqual({ lista: false, certificado: null, mensaje: MENSAJE_FALTA_EFIRMA });
    await expect(s.solicitar({ desde: '2026-10-01', hasta: '2026-10-31', tipo: 'recibidos', formato: 'xml' })).rejects.toThrow(MENSAJE_FALTA_EFIRMA);
  });

  it('un CSD no sirve para la descarga y la contraseña no aparece en el error', async () => {
    const { s } = armar(material, false);
    const e = await s.solicitar({ desde: '2026-10-01', hasta: '2026-10-31', tipo: 'recibidos', formato: 'xml' }, new Date('2026-11-15')).catch((x: Error) => x);
    expect(String(e)).toMatch(/no es una e\.firma vigente/);
    expect(String(e)).not.toContain('nunca-se-muestra');
  });

  it('solicita, verifica y deja el paquete en la carpeta privada', async () => {
    const { s, consultas } = armar(material);
    const r = await s.solicitar({ desde: '2026-10-01', hasta: '2026-10-31', tipo: 'recibidos', formato: 'xml' }, new Date('2026-11-15'));
    expect(r.idSolicitud).toBe('4e80345d-917f-40bb-a98f-4a73939343c5');
    expect((consultas[0] as { q: Record<string, unknown> }).q).toEqual({ p: '2026-10-01 00:00:00|2026-10-31 23:59:59', tipo: 'recibidos', formato: 'xml' });
    const v = await s.verificar(r.idSolicitud);
    expect(v).toMatchObject({ estado: 'lista', lista: true, paquetes: ['4E80345D-917F-40BB-A98F-4A73939343C5_01'] });
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-'));
    const antes = process.env.UPLOADS_ROOT;
    process.env.UPLOADS_ROOT = raiz;
    try {
      const d = await s.descargar(v.paquetes[0]!);
      expect(d.guardadoEn).toMatch(/^sat-descargas\/AAA010101AAA\/4E80345D-917F-40BB-A98F-4A73939343C5_01\.zip$/);
      expect(fs.readFileSync(path.join(raiz, d.guardadoEn), 'utf8')).toBe('ZIP');
    } finally {
      process.env.UPLOADS_ROOT = antes;
    }
  });

  it('rechaza identificadores raros', async () => {
    const { s } = armar(material);
    await expect(s.verificar('../../etc/passwd')).rejects.toThrow(/no válido/);
    await expect(s.descargar('a/b')).rejects.toThrow(/no válido/);
  });
});
