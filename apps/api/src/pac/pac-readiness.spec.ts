import {
  buildPacReadinessReport,
  emisorDesdeAjustes,
  revisaRfc,
  type PacCsdEstadoEntrada,
  type PacEmisorEntrada,
  type PacReadinessInput,
  type PacReadinessReport,
} from './pac-readiness.js';
import { formateaReporteTexto } from './pac-readiness.format.js';
import { puedeVerPreparacionPac } from './pac-readiness.acceso.js';
import { leeEmisor, leeFacturas, type PacReadinessDb } from './pac-readiness.data.js';
import { PacController } from './pac.controller.js';
import { PacModule } from './pac.module.js';
import { PacReadinessService } from './pac-readiness.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Test } from '@nestjs/testing';
import { checkUrlAccess } from '../common/rbac/url-matrix';

/**
 * Reporte de preparación para facturar (CFDI 4.0).
 *
 * Fija dos cosas: (1) el veredicto — qué escenarios bloquean, cuáles solo
 * advierten y cuál da luz verde — y (2) que el reporte JAMÁS contenga el valor
 * de un secreto. Para (2) se usan valores centinela y se busca cada uno en el
 * JSON serializado y en el texto de la terminal.
 */

const AHORA = new Date('2026-09-27T12:00:00Z');
const DIA = 86_400_000;

const EMISOR_OK: PacEmisorEntrada = {
  rfc: 'EKU9003173C9', // RFC de prueba del SAT (persona moral)
  legalName: 'ESCUELA KEMPER URGATE',
  fiscalRegime: '601',
  fiscalPostalCode: '64000',
  fuente: 'perfil_empresa',
};

const csd = (diasParaVencer: number, extra: Partial<PacCsdEstadoEntrada> = {}): PacCsdEstadoEntrada => ({
  configured: true,
  noCertificado: '30001000000500003416',
  validFrom: new Date(AHORA.getTime() - 365 * DIA),
  validTo: new Date(AHORA.getTime() + diasParaVencer * DIA),
  error: null,
  ...extra,
});

const CSD_NO_CARGADO: PacCsdEstadoEntrada = {
  configured: false,
  noCertificado: null,
  validFrom: null,
  validTo: null,
  error: 'CSD no configurado (faltan CSD_CER_* / CSD_KEY_*)',
};

const ENV_FACTURAMA_PROD = {
  NODE_ENV: 'production',
  PAC_PROVIDER: 'facturama',
  PAC_FALLBACK_TO_MOCK: '0',
  FACTURAMA_USER: 'usuario-x',
  FACTURAMA_PASSWORD: 'clave-x',
  FACTURAMA_BASE_URL: 'https://api.facturama.mx',
};

const ENV_FINKOK_PROD = {
  NODE_ENV: 'production',
  PAC_PROVIDER: 'finkok',
  PAC_FALLBACK_TO_MOCK: '0',
  FINKOK_USER: 'usuario-x',
  FINKOK_PASSWORD: 'clave-x',
  FINKOK_BASE_URL: 'https://facturacion.finkok.com',
};

function reporte(over: Partial<PacReadinessInput> & { env: PacReadinessInput['env'] }): PacReadinessReport {
  return buildPacReadinessReport({ company: EMISOR_OK, csd: CSD_NO_CARGADO, now: AHORA, ...over });
}

const codigos = (r: PacReadinessReport) => r.bloqueos.map((b) => b.codigo);
const codigosAv = (r: PacReadinessReport) => r.advertencias.map((b) => b.codigo);

describe('reporte de preparación · modo mock (estado actual del servidor)', () => {
  const r = reporte({ env: { PAC_PROVIDER: 'mock', PAC_FALLBACK_TO_MOCK: '1', NODE_ENV: 'production' } });

  it('está apagado y no está listo', () => {
    expect(r.etapa).toBe('apagado_mock');
    expect(r.listoParaProduccion).toBe(false);
    expect(r.pac.esMock).toBe(true);
    expect(r.pac.proveedor).toBe('mock');
    expect(codigos(r)).toContain('proveedor_mock');
  });

  it('en producción el respaldo a mock queda forzado a apagado, aunque la variable diga 1', () => {
    expect(r.servidor.esProduccion).toBe(true);
    expect(r.pac.respaldoAMock).toEqual({ configurado: true, efectivo: false });
  });

  it('sin variable alguna equivale a mock y a fuera de producción', () => {
    const vacio = reporte({ env: {} });
    expect(vacio.pac.proveedor).toBe('mock');
    expect(vacio.servidor.nodeEnv).toBe('no_produccion');
    expect(codigos(vacio)).toEqual(expect.arrayContaining(['proveedor_mock', 'servidor_no_es_produccion']));
    expect(vacio.pac.respaldoAMock.efectivo).toBe(true);
  });

  it('no exige CSD ni credenciales en mock', () => {
    expect(r.csd.requeridoEnServidor).toBe(false);
    expect(r.csd.estado).toBe('no_aplica');
    expect(r.pac.credenciales.completas).toBe(true);
    expect(r.pac.url.ambiente).toBeNull();
  });
});

describe('reporte de preparación · proveedor mal escrito', () => {
  it('«Facturama» con mayúscula no se reconoce y el sistema usaría mock', () => {
    const r = reporte({ env: { ...ENV_FACTURAMA_PROD, PAC_PROVIDER: 'Facturama' } });
    expect(r.pac.proveedorDeclarado).toBe('no_reconocido');
    expect(r.pac.proveedor).toBe('mock');
    expect(codigos(r)).toContain('proveedor_no_reconocido');
    expect(r.listoParaProduccion).toBe(false);
  });
});

describe('reporte de preparación · Facturama sin credenciales', () => {
  const r = reporte({
    env: { NODE_ENV: 'production', PAC_PROVIDER: 'facturama', PAC_FALLBACK_TO_MOCK: '0' },
  });

  it('bloquea por credenciales y por dirección no definida', () => {
    expect(r.listoParaProduccion).toBe(false);
    expect(r.etapa).toBe('configuracion_incompleta');
    expect(r.pac.credenciales.completas).toBe(false);
    expect(r.pac.credenciales.faltantes).toEqual(['FACTURAMA_USER', 'FACTURAMA_PASSWORD']);
    expect(codigos(r)).toEqual(expect.arrayContaining(['credenciales_incompletas', 'url_no_definida']));
  });

  it('avisa que sin dirección se usaría el ambiente de pruebas por omisión', () => {
    expect(r.pac.url).toMatchObject({ definida: false, esPorDefecto: true, hostname: 'apisandbox.facturama.mx', ambiente: 'sandbox' });
    const b = r.bloqueos.find((x) => x.codigo === 'url_no_definida');
    expect(b?.mensaje).toMatch(/PRUEBAS/);
  });

  it('advierte que en producción la API no arrancaría', () => {
    const b = r.bloqueos.find((x) => x.codigo === 'credenciales_incompletas');
    expect(b?.mensaje).toMatch(/NO arrancaría/);
  });

  it('un usuario en blanco cuenta como faltante', () => {
    const espacios = reporte({ env: { ...ENV_FACTURAMA_PROD, FACTURAMA_USER: '   ' } });
    expect(espacios.pac.credenciales.faltantes).toEqual(['FACTURAMA_USER']);
  });
});

describe('reporte de preparación · Facturama completo (producción)', () => {
  const r = reporte({ env: ENV_FACTURAMA_PROD });

  it('da luz verde', () => {
    expect(r.bloqueos).toEqual([]);
    expect(r.listoParaProduccion).toBe(true);
    expect(r.etapa).toBe('listo_para_produccion');
    expect(r.pac.credenciales.completas).toBe(true);
    expect(r.pac.url).toMatchObject({ definida: true, esPorDefecto: false, hostname: 'api.facturama.mx', https: true, ambiente: 'produccion' });
  });

  it('no exige CSD en el servidor (vive en Facturama) pero pide confirmarlo a mano', () => {
    expect(r.pac.csdEnElProveedor).toBe(true);
    expect(r.csd.requeridoEnServidor).toBe(false);
    expect(r.verificacionManual.join(' ')).toMatch(/Facturama/);
    expect(r.verificacionManual.join(' ')).toMatch(/CSD/);
  });

  it('con el emisor completo y válido', () => {
    expect(r.emisor).toMatchObject({
      verificado: true,
      completo: true,
      camposFaltantes: [],
      rfcValido: true,
      tipoPersona: 'MORAL',
      regimenValido: true,
      codigoPostalValido: true,
    });
  });
});

describe('reporte de preparación · ensayo en sandbox', () => {
  const env = { ...ENV_FACTURAMA_PROD, FACTURAMA_BASE_URL: 'https://apisandbox.facturama.mx' };

  it('en el servidor: solo bloquea por apuntar a pruebas → etapa sandbox', () => {
    const r = reporte({ env });
    expect(codigos(r)).toEqual(['url_ambiente_pruebas']);
    expect(r.etapa).toBe('pruebas_sandbox');
    expect(r.listoParaProduccion).toBe(false);
  });

  it('en una máquina de desarrollo (sin NODE_ENV=production) sigue siendo ensayo', () => {
    const { NODE_ENV: _omitida, ...dev } = env;
    const r = reporte({ env: dev });
    expect(r.etapa).toBe('pruebas_sandbox');
    expect(codigos(r).sort()).toEqual(['servidor_no_es_produccion', 'url_ambiente_pruebas']);
  });

  it('http (sin cifrar) bloquea', () => {
    const r = reporte({ env: { ...ENV_FACTURAMA_PROD, FACTURAMA_BASE_URL: 'http://api.facturama.mx' } });
    expect(codigos(r)).toContain('url_sin_https');
  });

  it('una dirección ilegible bloquea', () => {
    const r = reporte({ env: { ...ENV_FACTURAMA_PROD, FACTURAMA_BASE_URL: 'esto no es una url' } });
    expect(codigos(r)).toContain('url_invalida');
    expect(r.pac.url.valida).toBe(false);
    expect(r.pac.url.hostname).toBeNull();
  });

  it('una dirección de otro proveedor solo advierte', () => {
    const r = reporte({ env: { ...ENV_FACTURAMA_PROD, FACTURAMA_BASE_URL: 'https://facturacion.finkok.com' } });
    expect(codigosAv(r)).toContain('url_desconocida');
    expect(r.listoParaProduccion).toBe(true);
  });
});

describe('reporte de preparación · respaldo a mock', () => {
  it('en producción con la variable sin apagar: advertencia, no bloqueo', () => {
    const r = reporte({ env: { ...ENV_FACTURAMA_PROD, PAC_FALLBACK_TO_MOCK: '1' } });
    expect(codigosAv(r)).toContain('respaldo_mock_ignorado_en_produccion');
    expect(r.pac.respaldoAMock).toEqual({ configurado: true, efectivo: false });
    expect(r.listoParaProduccion).toBe(true);
  });

  it('fuera de producción el respaldo es efectivo y el bloqueo lo dice', () => {
    const r = reporte({ env: { ...ENV_FACTURAMA_PROD, NODE_ENV: 'development', PAC_FALLBACK_TO_MOCK: '1' } });
    expect(r.pac.respaldoAMock.efectivo).toBe(true);
    expect(r.bloqueos.find((b) => b.codigo === 'servidor_no_es_produccion')?.mensaje).toMatch(/UUID inventado/);
  });
});

describe('reporte de preparación · CSD', () => {
  it('Finkok exige CSD en el servidor: sin él bloquea', () => {
    const r = reporte({ env: ENV_FINKOK_PROD, csd: CSD_NO_CARGADO });
    expect(r.csd.requeridoEnServidor).toBe(true);
    expect(r.csd.estado).toBe('no_configurado');
    expect(codigos(r)).toContain('csd_no_configurado');
  });

  it('SW con issue-JSON no exige CSD local; SW sin él, sí', () => {
    const base = { NODE_ENV: 'production', PAC_PROVIDER: 'sw', PAC_FALLBACK_TO_MOCK: '0', SW_TOKEN: 'token-x', SW_BASE_URL: 'https://services.sw.com.mx' };
    expect(reporte({ env: { ...base, SW_USE_ISSUE_JSON: '1' } }).csd.requeridoEnServidor).toBe(false);
    const sinJson = reporte({ env: base });
    expect(sinJson.csd.requeridoEnServidor).toBe(true);
    expect(codigos(sinJson)).toContain('csd_no_configurado');
  });

  it('vigente: sin avisos y con datos públicos del certificado', () => {
    const r = reporte({ env: ENV_FINKOK_PROD, csd: csd(400) });
    expect(r.csd).toMatchObject({ cargado: true, estado: 'vigente', numeroCertificado: '30001000000500003416', diasRestantes: 400 });
    expect(r.csd.vigenteHasta).toBe('2027-11-01'); // 27-sep-2026 + 400 días
    expect(r.bloqueos).toEqual([]);
    expect(r.advertencias).toEqual([]);
    expect(r.listoParaProduccion).toBe(true);
  });

  it('por vencer (<30 días): advertencia, no bloquea', () => {
    const r = reporte({ env: ENV_FINKOK_PROD, csd: csd(12) });
    expect(r.csd.estado).toBe('por_vencer');
    expect(r.csd.diasRestantes).toBe(12);
    expect(codigosAv(r)).toContain('csd_por_vencer');
    expect(r.advertencias.find((a) => a.codigo === 'csd_por_vencer')?.mensaje).toMatch(/12 día/);
    expect(r.listoParaProduccion).toBe(true);
  });

  it('justo en 30 días ya no avisa; en 29 sí', () => {
    expect(reporte({ env: ENV_FINKOK_PROD, csd: csd(30) }).csd.estado).toBe('vigente');
    expect(reporte({ env: ENV_FINKOK_PROD, csd: csd(29.5) }).csd.estado).toBe('por_vencer');
  });

  it('vencido con Finkok: bloquea', () => {
    const r = reporte({ env: ENV_FINKOK_PROD, csd: csd(-5) });
    expect(r.csd.estado).toBe('vencido');
    expect(codigos(r)).toContain('csd_vencido');
    expect(r.bloqueos.find((b) => b.codigo === 'csd_vencido')?.mensaje).toMatch(/5 día/);
    expect(r.listoParaProduccion).toBe(false);
  });

  it('vencido con Facturama (copia local sin uso): solo advierte, con el matiz', () => {
    const r = reporte({ env: ENV_FACTURAMA_PROD, csd: csd(-5) });
    expect(r.csd.estado).toBe('vencido');
    expect(codigos(r)).not.toContain('csd_vencido');
    expect(codigosAv(r)).toContain('csd_local_vencido');
    expect(r.advertencias.find((a) => a.codigo === 'csd_local_vencido')?.mensaje).toMatch(/Facturama/);
    expect(r.listoParaProduccion).toBe(true);
  });

  it('por vencer con Facturama: advierte', () => {
    const r = reporte({ env: ENV_FACTURAMA_PROD, csd: csd(10) });
    expect(codigosAv(r)).toContain('csd_por_vencer');
  });

  it('aún no vigente bloquea cuando se exige localmente', () => {
    const futuro = csd(500, { validFrom: new Date(AHORA.getTime() + 3 * DIA) });
    const r = reporte({ env: ENV_FINKOK_PROD, csd: futuro });
    expect(r.csd.estado).toBe('aun_no_vigente');
    expect(codigos(r)).toContain('csd_aun_no_vigente');
  });

  it('clasifica el error del CSD sin copiar su texto', () => {
    const sinPass = reporte({
      env: { ...ENV_FINKOK_PROD, CSD_CER_BASE64: 'x', CSD_KEY_BASE64: 'y' },
      csd: { ...CSD_NO_CARGADO, error: 'CSD_KEY_PASSWORD requerido para desencriptar la llave privada' },
    });
    expect(sinPass.csd).toMatchObject({ estado: 'con_error', motivoError: 'falta_contrasena' });
    expect(codigos(sinPass)).toContain('csd_con_error');

    const mala = reporte({
      env: ENV_FINKOK_PROD,
      csd: { ...CSD_NO_CARGADO, error: 'No se pudo desencriptar la llave privada (contraseña incorrecta o formato inválido)' },
    });
    expect(mala.csd.motivoError).toBe('llave_invalida');

    const rara = reporte({
      env: ENV_FINKOK_PROD,
      csd: { ...CSD_NO_CARGADO, error: "ENOENT: no such file or directory, open '/run/secrets/SECRETO-EN-LA-RUTA.key'" },
    });
    expect(rara.csd.motivoError).toBe('error_de_lectura');
    expect(JSON.stringify(rara)).not.toContain('SECRETO-EN-LA-RUTA');
  });

  it('número de certificado con formato raro (¿e.firma?) advierte', () => {
    const r = reporte({ env: ENV_FINKOK_PROD, csd: csd(400, { noCertificado: '0123abcd' }) });
    expect(codigosAv(r)).toContain('csd_numero_certificado_raro');
  });

  it('una contraseña de CSD suelta (sin .cer ni .key) no es un error', () => {
    const r = reporte({ env: { ...ENV_FACTURAMA_PROD, CSD_KEY_PASSWORD: 'x' }, csd: CSD_NO_CARGADO });
    expect(r.csd.estado).toBe('no_aplica');
    expect(r.csd.variables).toEqual({ certificado: false, llave: false, contrasena: true });
  });

  it('variables de CSD presentes pero sin cargar con Facturama: aviso, no bloqueo', () => {
    const r = reporte({ env: { ...ENV_FACTURAMA_PROD, CSD_CER_BASE64: 'x', CSD_KEY_BASE64: 'y' }, csd: CSD_NO_CARGADO });
    expect(r.csd.variables).toEqual({ certificado: true, llave: true, contrasena: false });
    expect(r.csd.estado).toBe('con_error');
    expect(codigosAv(r)).toContain('csd_local_con_error');
    expect(r.listoParaProduccion).toBe(true);
  });
});

describe('reporte de preparación · datos fiscales del emisor', () => {
  const con = (parcial: Partial<PacEmisorEntrada>) =>
    reporte({ env: ENV_FACTURAMA_PROD, company: { ...EMISOR_OK, ...parcial } });

  it('incompletos: lista las claves que faltan', () => {
    const r = con({ rfc: null, fiscalPostalCode: '  ' });
    expect(r.emisor.completo).toBe(false);
    expect(r.emisor.camposFaltantes).toEqual(['rfc', 'fiscalPostalCode']);
    expect(codigos(r)).toContain('emisor_datos_incompletos');
    expect(r.bloqueos.find((b) => b.codigo === 'emisor_datos_incompletos')?.mensaje).toMatch(/RFC.*código postal fiscal/);
    expect(r.listoParaProduccion).toBe(false);
  });

  it('sin empresa: faltan los cuatro', () => {
    const r = reporte({ env: ENV_FACTURAMA_PROD, company: null });
    expect(r.emisor.camposFaltantes).toEqual(['rfc', 'legalName', 'fiscalRegime', 'fiscalPostalCode']);
    expect(r.emisor.fuente).toBe('sin_datos');
    expect(r.listoParaProduccion).toBe(false);
  });

  it('sin consultar la base de datos: no da el visto bueno', () => {
    const r = reporte({ env: ENV_FACTURAMA_PROD, company: undefined });
    expect(r.emisor.verificado).toBe(false);
    expect(r.emisor.fuente).toBeNull();
    expect(codigos(r)).toEqual(['emisor_sin_verificar']);
    expect(r.listoParaProduccion).toBe(false);
  });

  it('RFC con formato inválido, genérico o con dígito dudoso', () => {
    expect(codigos(con({ rfc: 'ABC123' }))).toContain('emisor_rfc_formato');
    expect(codigos(con({ rfc: 'XAXX010101000' }))).toContain('emisor_rfc_generico');
    const dudoso = con({ rfc: 'EKU9003173C8' }); // dígito verificador cambiado
    expect(codigos(dudoso)).not.toContain('emisor_rfc_formato');
    expect(codigosAv(dudoso)).toContain('emisor_rfc_digito');
    expect(dudoso.listoParaProduccion).toBe(true);
  });

  it('régimen: código con texto, fuera de catálogo o incompatible con el tipo de persona', () => {
    expect(codigos(con({ fiscalRegime: '601 - General de Ley Personas Morales' }))).toContain('emisor_regimen_invalido');
    expect(codigos(con({ fiscalRegime: '999' }))).toContain('emisor_regimen_invalido');
    expect(codigos(con({ fiscalRegime: 'R605' }))).toContain('emisor_regimen_incompatible'); // 605 es de persona física
    const fisicaMoral = con({ rfc: 'CACX7605101P8', fiscalRegime: 'R601' }); // persona física con régimen de moral
    expect(codigos(fisicaMoral)).toContain('emisor_regimen_incompatible');
    expect(con({ fiscalRegime: 'R601' }).emisor.regimenValido).toBe(true);
    expect(con({ rfc: 'CACX7605101P8', fiscalRegime: '612' }).emisor.regimenValido).toBe(true);
  });

  it('código postal: exactamente 5 dígitos', () => {
    expect(codigos(con({ fiscalPostalCode: '6400' }))).toContain('emisor_cp_invalido');
    expect(codigos(con({ fiscalPostalCode: '64000-1' }))).toContain('emisor_cp_invalido');
    expect(con({ fiscalPostalCode: '64000' }).emisor.codigoPostalValido).toBe(true);
  });

  it('razón social con «S.A. DE C.V.»: advertencia, no bloqueo', () => {
    for (const nombre of ['NEXARA S.A. DE C.V.', 'NEXARA SA DE CV', 'NEXARA S DE RL DE CV', 'NEXARA SAPI DE CV']) {
      const r = con({ legalName: nombre });
      expect(codigosAv(r)).toContain('emisor_razon_social_con_regimen');
      expect(r.listoParaProduccion).toBe(true);
    }
    expect(codigosAv(con({ legalName: 'ESCUELA KEMPER URGATE' }))).not.toContain('emisor_razon_social_con_regimen');
    expect(codigosAv(con({ legalName: 'CASA DEL CAMPO' }))).not.toContain('emisor_razon_social_con_regimen');
  });
});

describe('reporte de preparación · facturas existentes', () => {
  it('avisa de facturas con sello de prueba y de facturas sin póliza', () => {
    const r = reporte({
      env: ENV_FACTURAMA_PROD,
      invoices: { timbradas: 5, conSelloDePrueba: 3, timbradasSinPoliza: 1 },
    });
    expect(codigosAv(r)).toEqual(expect.arrayContaining(['facturas_con_sello_de_prueba', 'facturas_sin_poliza']));
    expect(r.facturas).toEqual({ timbradas: 5, conSelloDePrueba: 3, timbradasSinPoliza: 1 });
    expect(r.listoParaProduccion).toBe(true);
  });

  it('sin consulta a la base: facturas nulas y sin avisos', () => {
    const r = reporte({ env: ENV_FACTURAMA_PROD });
    expect(r.facturas).toBeNull();
    expect(r.advertencias).toEqual([]);
  });
});

describe('RFC: revisión de formato y dígito verificador', () => {
  it.each(['EKU9003173C9', 'CACX7605101P8', 'XIQB891116QE4', 'URE180429TM6', 'XIA190128J61'])(
    '%s (RFC de prueba del SAT) es correcto',
    (rfc) => {
      expect(revisaRfc(rfc)).toMatchObject({ formatoValido: true, digitoCorrecto: true });
    },
  );

  it('distingue moral de física y reconoce los genéricos', () => {
    expect(revisaRfc('EKU9003173C9').tipo).toBe('MORAL');
    expect(revisaRfc('CACX7605101P8').tipo).toBe('FISICA');
    expect(revisaRfc('xaxx010101000').tipo).toBe('GENERICO');
  });

  it('rechaza fechas imposibles y formatos ajenos', () => {
    expect(revisaRfc('EKU9013323C9').formatoValido).toBe(false); // mes 13
    expect(revisaRfc('').formatoValido).toBe(false);
    expect(revisaRfc(null).formatoValido).toBe(false);
  });
});

describe('ajustes → emisor (misma regla que al facturar)', () => {
  it('sin ajustes reconocibles devuelve null (se usa el perfil de empresa)', () => {
    expect(emisorDesdeAjustes([{ key: 'tema', value: 'oscuro' }])).toBeNull();
    expect(emisorDesdeAjustes([{ key: 'rfc', value: '   ' }])).toBeNull();
  });

  it('cualquiera de los cuatro datos basta para que manden los ajustes', () => {
    const e = emisorDesdeAjustes([{ key: 'rfc', value: 'EKU9003173C9' }]);
    expect(e).toEqual({ rfc: 'EKU9003173C9', legalName: null, fiscalRegime: null, fiscalPostalCode: null });
  });

  it('réplica fiel de una rareza de AccountingService: una clave que contiene «empresa» también se toma como razón social', () => {
    // `pickSettingValue` busca por «contiene» y uno de sus candidatos para la razón social es «empresa».
    // Si algún día se corrige allí (ver el reporte de riesgos), este caso debe actualizarse a la par.
    const e = emisorDesdeAjustes([{ key: 'empresa_rfc', value: 'EKU9003173C9' }]);
    expect(e).toMatchObject({ rfc: 'EKU9003173C9', legalName: 'EKU9003173C9' });
  });

  it('reconoce razón social, régimen y código postal por clave', () => {
    const e = emisorDesdeAjustes([
      { key: 'razon_social', value: 'ACME' },
      { key: 'regimen_fiscal', value: '601' },
      { key: 'codigo_postal', value: '64000' },
    ]);
    expect(e).toMatchObject({ legalName: 'ACME', fiscalRegime: '601', fiscalPostalCode: '64000' });
  });
});

describe('quién puede ver el reporte', () => {
  it.each(['ceo', 'dir_admin', 'contabilidad'])('%s sí', (roleKey) => {
    expect(puedeVerPreparacionPac({ roleKey })).toBe(true);
  });

  it.each(['coord_admin', 'administrativo', 'dir_operaciones', 'coord_ventas', 'vendedor', 'rh', 'ing_campo', 'cliente'])(
    '%s no',
    (roleKey) => {
      expect(puedeVerPreparacionPac({ roleKey })).toBe(false);
    },
  );

  it('superadmin sí; sin usuario o sin rol no', () => {
    expect(puedeVerPreparacionPac({ roleKey: 'super_admin' })).toBe(true);
    expect(puedeVerPreparacionPac({ isSuperAdmin: true })).toBe(true);
    expect(puedeVerPreparacionPac(null)).toBe(false);
    expect(puedeVerPreparacionPac({})).toBe(false);
    expect(puedeVerPreparacionPac({ roleKey: 'rol_inventado' })).toBe(false);
  });

  it('respeta el puente legacy (orgRoleKey / admin) igual que la guard de URLs', () => {
    expect(puedeVerPreparacionPac({ orgRoleKey: 'accountant' })).toBe(true);
    expect(puedeVerPreparacionPac({ orgRoleKey: 'director_admin' })).toBe(true);
    expect(puedeVerPreparacionPac({ admin: true })).toBe(true);
    expect(puedeVerPreparacionPac({ orgRoleKey: 'sales_rep' })).toBe(false);
    expect(puedeVerPreparacionPac({ vendedor: true })).toBe(false);
  });
});

describe('endpoint GET /pac/readiness', () => {
  const reporteFalso = { listoParaProduccion: false } as unknown as PacReadinessReport;
  const construye = () => {
    const readiness = jest.fn(async () => reporteFalso);
    return { controlador: new PacController({ readiness } as never), readiness };
  };

  it('CEO, dirección administrativa y contabilidad reciben el reporte de SU empresa', async () => {
    for (const roleKey of ['ceo', 'dir_admin', 'contabilidad']) {
      const { controlador, readiness } = construye();
      await expect(controlador.getReadiness({ roleKey }, 7)).resolves.toBe(reporteFalso);
      expect(readiness).toHaveBeenCalledWith(7);
    }
  });

  it('cualquier otro rol recibe 403 y no se genera el reporte', () => {
    for (const roleKey of ['coord_admin', 'administrativo', 'dir_operaciones', 'vendedor', 'cliente']) {
      const { controlador, readiness } = construye();
      expect(() => controlador.getReadiness({ roleKey }, 7)).toThrow(/Solo dirección general/);
      expect(readiness).not.toHaveBeenCalled();
    }
  });

  it('la matriz de URLs deja pasar a contabilidad solo por GET, y solo a esa ruta', () => {
    expect(checkUrlAccess('contabilidad', '/api/pac/readiness', 'GET').allowed).toBe(true);
    expect(checkUrlAccess('contabilidad', '/api/pac/readiness', 'POST').allowed).toBe(false);
    expect(checkUrlAccess('contabilidad', '/api/pac/otra-cosa', 'GET').allowed).toBe(false);
    // CEO y dirección administrativa ya cubren `/api/**` por GET.
    expect(checkUrlAccess('ceo', '/api/pac/readiness', 'GET').allowed).toBe(true);
    expect(checkUrlAccess('dir_admin', '/api/pac/readiness', 'GET').allowed).toBe(true);
  });
});

describe('cableado del módulo PAC', () => {
  it('Nest resuelve controlador y servicio, y el servicio arma el reporte con lo que lee de la base', async () => {
    const prismaFalso = {
      systemSetting: { findMany: async () => [] },
      companyProfile: {
        findFirst: async () => ({ rfc: 'EKU9003173C9', legalName: 'ACME', fiscalRegime: '601', fiscalPostalCode: '64000' }),
      },
      invoice: { count: async () => 0, findMany: async () => [] },
      journalEntry: { findMany: async () => [] },
    };
    const modulo = await Test.createTestingModule({ imports: [PacModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaFalso)
      .compile();
    try {
      const r = await modulo.get(PacController).getReadiness({ roleKey: 'ceo' }, 1);
      expect(modulo.get(PacReadinessService)).toBeDefined();
      expect(r.emisor).toMatchObject({ verificado: true, completo: true, fuente: 'perfil_empresa' });
      expect(r.facturas).toEqual({ timbradas: 0, conSelloDePrueba: 0, timbradasSinPoliza: 0 });
    } finally {
      await modulo.close();
    }
  });

  it('si la base de datos falla, el reporte sale igual con el emisor «sin verificar»', async () => {
    const roto = async () => {
      throw new Error('base caída');
    };
    const prismaRoto = {
      systemSetting: { findMany: roto },
      companyProfile: { findFirst: roto },
      invoice: { count: roto, findMany: roto },
      journalEntry: { findMany: roto },
    };
    const modulo = await Test.createTestingModule({ imports: [PacModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaRoto)
      .compile();
    try {
      const r = await modulo.get(PacReadinessService).readiness(1);
      expect(r.emisor.verificado).toBe(false);
      expect(r.facturas).toBeNull();
      expect(r.listoParaProduccion).toBe(false);
    } finally {
      await modulo.close();
    }
  });
});

describe('el reporte nunca contiene un secreto', () => {
  const S = {
    fUser: 'CENTINELA_FACTURAMA_USER_a1b2',
    fPass: 'CENTINELA_FACTURAMA_PASS_c3d4',
    swToken: 'CENTINELA_SW_TOKEN_e5f6',
    swUser: 'CENTINELA_SW_USER_g7h8',
    swPass: 'CENTINELA_SW_PASS_i9j0',
    kUser: 'CENTINELA_FINKOK_USER_k1l2',
    kPass: 'CENTINELA_FINKOK_PASS_m3n4',
    cer: 'CENTINELA_CER_BASE64_o5p6',
    key: 'CENTINELA_KEY_BASE64_q7r8',
    csdPass: 'CENTINELA_CSD_PASSWORD_s9t0',
    cerPath: '/run/secrets/CENTINELA_RUTA_CER_u1v2.cer',
    urlPass: 'CENTINELA_PASS_EN_URL_w3x4',
    urlQs: 'CENTINELA_TOKEN_EN_QUERY_y5z6',
    urlPath: 'CENTINELA_RUTA_EN_URL_a7b8',
    efirma: 'CENTINELA_EFIRMA_c9d0',
    nombre: 'CENTINELA RAZON SOCIAL SA DE CV',
    rfc: 'CENTINELARFC1',
    errorCsd: 'CENTINELA_ERROR_CRUDO_e1f2',
  };
  const todos = Object.values(S);

  const envConTodo = (over: Record<string, string>) => ({
    NODE_ENV: 'production',
    FACTURAMA_USER: S.fUser,
    FACTURAMA_PASSWORD: S.fPass,
    SW_TOKEN: S.swToken,
    SW_USER: S.swUser,
    SW_PASSWORD: S.swPass,
    FINKOK_USER: S.kUser,
    FINKOK_PASSWORD: S.kPass,
    CSD_CER_BASE64: S.cer,
    CSD_KEY_BASE64: S.key,
    CSD_KEY_PASSWORD: S.csdPass,
    CSD_CER_PATH: S.cerPath,
    EFIRMA_KEY_PASSWORD: S.efirma,
    FACTURAMA_BASE_URL: `https://${S.fUser}:${S.urlPass}@api.facturama.mx/${S.urlPath}?token=${S.urlQs}`,
    SW_BASE_URL: `https://${S.swUser}:${S.urlPass}@services.sw.com.mx/${S.urlPath}?token=${S.urlQs}`,
    FINKOK_BASE_URL: `https://${S.kUser}:${S.urlPass}@facturacion.finkok.com/${S.urlPath}?token=${S.urlQs}`,
    ...over,
  });

  const emisorConCentinela: PacEmisorEntrada = { ...EMISOR_OK, rfc: S.rfc, legalName: S.nombre };

  const escenarios: Array<[string, Record<string, string>]> = [
    ['mock', { PAC_PROVIDER: 'mock' }],
    ['facturama', { PAC_PROVIDER: 'facturama' }],
    ['sw', { PAC_PROVIDER: 'sw' }],
    ['sw issue-json', { PAC_PROVIDER: 'sw', SW_USE_ISSUE_JSON: '1' }],
    ['finkok', { PAC_PROVIDER: 'finkok' }],
    ['proveedor mal escrito', { PAC_PROVIDER: `Facturama-${S.fPass}` }],
  ];

  it.each(escenarios)('%s: ni el JSON ni el texto de terminal traen un secreto', (_nombre, over) => {
    for (const csdEstado of [
      csd(400),
      csd(-3),
      { ...CSD_NO_CARGADO, error: `boom ${S.errorCsd} ${S.csdPass} ${S.cerPath}` },
    ]) {
      const r = reporte({
        env: envConTodo(over),
        company: emisorConCentinela,
        csd: csdEstado,
        invoices: { timbradas: 1, conSelloDePrueba: 0, timbradasSinPoliza: 0 },
      });
      const json = JSON.stringify(r);
      const texto = formateaReporteTexto(r);
      for (const secreto of todos) {
        expect(json).not.toContain(secreto);
        expect(texto).not.toContain(secreto);
      }
    }
  });

  it('de la URL solo sobrevive el hostname', () => {
    const r = reporte({ env: envConTodo({ PAC_PROVIDER: 'facturama' }) });
    expect(r.pac.url.hostname).toBe('api.facturama.mx');
    expect(JSON.stringify(r.pac.url)).not.toMatch(/@|token=|CENTINELA/);
  });

  it('las variables faltantes se nombran, pero nunca con su valor', () => {
    const r = reporte({ env: { NODE_ENV: 'production', PAC_PROVIDER: 'facturama', FACTURAMA_USER: S.fUser } });
    expect(r.pac.credenciales.faltantes).toEqual(['FACTURAMA_PASSWORD']);
    expect(JSON.stringify(r)).not.toContain(S.fUser);
  });

  it('el reporte es JSON serializable (sin BigInt ni fechas crudas)', () => {
    const r = reporte({ env: ENV_FINKOK_PROD, csd: csd(100) });
    expect(() => JSON.stringify(r)).not.toThrow();
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});

describe('texto de terminal', () => {
  it('lista los bloqueos y el veredicto', () => {
    const t = formateaReporteTexto(reporte({ env: { PAC_PROVIDER: 'mock' } }));
    expect(t).toMatch(/¿Listo para producción\?\s+NO/);
    expect(t).toMatch(/BLOQUEOS/);
    expect(t).toMatch(/proveedor_mock/);
  });

  it('con luz verde lo dice y muestra la verificación manual', () => {
    const t = formateaReporteTexto(reporte({ env: ENV_FACTURAMA_PROD }));
    expect(t).toMatch(/LISTO PARA PRODUCCIÓN/);
    expect(t).toMatch(/¿Listo para producción\?\s+SÍ/);
    expect(t).toMatch(/VERIFICACIÓN MANUAL/);
    expect(t).not.toMatch(/BLOQUEOS/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lecturas de base de datos (con un Prisma de mentira)
// ─────────────────────────────────────────────────────────────────────────────

function dbFalsa(over: {
  ajustes?: Array<{ key: string; value: string; label?: string | null; companyId: number | null }>;
  perfil?: { rfc: string; legalName: string; fiscalRegime: string | null; fiscalPostalCode: string | null } | null;
  facturas?: Array<{ id: number; satCertNumber: string | null }>;
  totalTimbradas?: number;
  totalDePrueba?: number;
  polizas?: string[];
}) {
  const llamadas: { perfil: unknown[]; conteos: unknown[]; polizas: unknown[] } = { perfil: [], conteos: [], polizas: [] };
  const db = {
    systemSetting: { findMany: jest.fn(async () => over.ajustes ?? []) },
    companyProfile: {
      findFirst: jest.fn(async (args: unknown) => {
        llamadas.perfil.push(args);
        return over.perfil ?? null;
      }),
    },
    invoice: {
      count: jest.fn(async (args: { where: { satCertNumber?: string } }) => {
        llamadas.conteos.push(args);
        return args.where.satCertNumber ? (over.totalDePrueba ?? 0) : (over.totalTimbradas ?? 0);
      }),
      findMany: jest.fn(async () => over.facturas ?? []),
    },
    journalEntry: {
      findMany: jest.fn(async (args: unknown) => {
        llamadas.polizas.push(args);
        return (over.polizas ?? []).map((reference) => ({ reference }));
      }),
    },
  };
  return { db: db as unknown as PacReadinessDb, raw: db, llamadas };
}

describe('lecturas de base de datos', () => {
  it('emisor: los ajustes mandan sobre el perfil, y la fila de la empresa gana a la de plataforma', async () => {
    const { db, raw } = dbFalsa({
      ajustes: [
        { key: 'rfc', value: 'AAA010101AAA', companyId: null },
        { key: 'rfc', value: 'EKU9003173C9', companyId: 7 },
      ],
    });
    const e = await leeEmisor(db, 7);
    expect(e).toMatchObject({ rfc: 'EKU9003173C9', fuente: 'ajustes' });
    expect(raw.companyProfile.findFirst).not.toHaveBeenCalled();
  });

  it('emisor: sin ajustes usa el perfil de la empresa activa (o el principal)', async () => {
    const perfil = { rfc: 'EKU9003173C9', legalName: 'ACME', fiscalRegime: 'R601', fiscalPostalCode: '64000' };
    const conEmpresa = dbFalsa({ perfil });
    expect(await leeEmisor(conEmpresa.db, 7)).toMatchObject({ rfc: 'EKU9003173C9', fuente: 'perfil_empresa' });
    expect(conEmpresa.llamadas.perfil[0]).toMatchObject({ where: { id: 7, isActive: true } });

    const principal = dbFalsa({ perfil });
    await leeEmisor(principal.db, null);
    expect(principal.llamadas.perfil[0]).toMatchObject({ where: { isPrimary: true, isActive: true } });
  });

  it('emisor: sin ajustes ni perfil devuelve null', async () => {
    expect(await leeEmisor(dbFalsa({}).db, null)).toBeNull();
  });

  it('facturas: cuenta las de prueba y las que no tienen póliza', async () => {
    const { db, llamadas } = dbFalsa({
      totalTimbradas: 4,
      totalDePrueba: 1,
      facturas: [
        { id: 10, satCertNumber: '00001000000000000000' }, // de prueba: no se revisa su póliza
        { id: 11, satCertNumber: '30001000000500003416' },
        { id: 12, satCertNumber: '30001000000500003416' },
        { id: 13, satCertNumber: '30001000000500003416' },
      ],
      polizas: ['INV-STAMP-11', 'INV-STAMP-13'],
    });
    const f = await leeFacturas(db, 7);
    expect(f).toEqual({ timbradas: 4, conSelloDePrueba: 1, timbradasSinPoliza: 1 }); // falta la de la 12
    expect(llamadas.polizas[0]).toMatchObject({
      where: { reference: { in: ['INV-STAMP-11', 'INV-STAMP-12', 'INV-STAMP-13'] }, companyId: 7 },
    });
  });

  it('facturas: sin timbradas no consulta pólizas', async () => {
    const { db, raw } = dbFalsa({});
    expect(await leeFacturas(db, null)).toEqual({ timbradas: 0, conSelloDePrueba: 0, timbradasSinPoliza: 0 });
    expect(raw.journalEntry.findMany).not.toHaveBeenCalled();
  });

  it('solo lee: el Prisma falso ni siquiera tiene métodos de escritura', async () => {
    const { raw } = dbFalsa({});
    for (const modelo of Object.values(raw)) {
      expect(Object.keys(modelo).every((m) => ['findMany', 'findFirst', 'count'].includes(m))).toBe(true);
    }
  });
});
