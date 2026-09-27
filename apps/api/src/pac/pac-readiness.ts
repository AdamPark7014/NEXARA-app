import { digitoRfcCorrecto } from './rfc-checksum.js';
import { SAT_FISCAL_REGIMES } from './sat.service.js';

/**
 * Reporte de preparación para facturar (CFDI 4.0) — LÓGICA PURA.
 *
 * Responde una sola pregunta: «¿si hoy encendemos el timbrado real, qué se
 * rompe?». No hace red, no toca la base de datos, no lee `process.env`: recibe
 * todo por parámetro (variables de entorno, datos de la empresa, estado del CSD)
 * y devuelve el reporte. Eso lo hace testeable y permite usar exactamente la
 * misma lógica en el endpoint `GET /pac/readiness` y en el CLI
 * `pac-preflight.cli.ts`.
 *
 * REGLA DE SEGURIDAD: el reporte solo contiene booleanos, enumeraciones,
 * números y textos escritos aquí. NUNCA copia el valor de una variable de
 * entorno (usuarios, contraseñas, tokens, base64 del CSD…). De la URL del PAC
 * solo se conserva el *hostname*; de las variables, solo su nombre cuando falta.
 * `pac-readiness.spec.ts` lo verifica con valores centinela.
 *
 * El comportamiento que se reproduce aquí (proveedor efectivo, respaldo a mock,
 * URL por omisión, cuándo el CSD vive en el servidor) es el de
 * `PacService.buildAdapter()` y `CsdService`. Si cambian allí, cambia aquí.
 */

export type PacProviderId = 'mock' | 'facturama' | 'sw' | 'finkok';

export type PacAmbiente = 'sandbox' | 'produccion' | 'desconocido';

export type PacEtapa =
  | 'apagado_mock'
  | 'configuracion_incompleta'
  | 'pruebas_sandbox'
  | 'listo_para_produccion';

export type PacCsdEstado =
  | 'no_aplica'
  | 'no_configurado'
  | 'con_error'
  | 'vigente'
  | 'por_vencer'
  | 'vencido'
  | 'aun_no_vigente';

export type PacCsdMotivoError = 'falta_contrasena' | 'llave_invalida' | 'error_de_lectura';

/** Algo que el dueño debe saber, con una acción concreta. */
export interface PacHallazgo {
  /** Identificador estable (para pruebas y para la interfaz). */
  codigo: string;
  /** Qué pasa, en español llano. */
  mensaje: string;
  /** Qué hay que hacer. */
  accion: string;
}

/** Estado del CSD tal como lo reporta `CsdService.info()`. */
export interface PacCsdEstadoEntrada {
  configured: boolean;
  noCertificado: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  /** Texto crudo de error de `CsdService`. Solo se clasifica, jamás se copia. */
  error: string | null;
}

/** Datos fiscales del emisor ya resueltos (misma precedencia que al facturar). */
export interface PacEmisorEntrada {
  rfc: string | null;
  legalName: string | null;
  fiscalRegime: string | null;
  fiscalPostalCode: string | null;
  fuente: 'ajustes' | 'perfil_empresa' | 'sin_datos';
}

export interface PacFacturasEntrada {
  /** Facturas por cobrar con UUID (timbradas). */
  timbradas: number;
  /** De esas, las que llevan el número de certificado SAT de prueba. */
  conSelloDePrueba: number;
  /** Timbradas, no de prueba, sin póliza `INV-STAMP-<id>`. */
  timbradasSinPoliza: number;
}

export interface PacReadinessInput {
  /** Normalmente `process.env`. */
  env: Record<string, string | undefined>;
  /**
   * `undefined` = no se consultó la base de datos (el reporte queda como
   * «no verificado» y bloquea). `null` = se consultó y no hay empresa.
   */
  company?: PacEmisorEntrada | null;
  /** `null`/`undefined` = sin información del CSD. */
  csd?: PacCsdEstadoEntrada | null;
  /** `null`/`undefined` = no se consultó la base de datos. */
  invoices?: PacFacturasEntrada | null;
  now?: Date;
}

export interface PacReadinessReport {
  generadoEn: string;
  listoParaProduccion: boolean;
  etapa: PacEtapa;
  resumen: string;
  servidor: {
    nodeEnv: 'production' | 'no_produccion';
    esProduccion: boolean;
  };
  pac: {
    /** Proveedor que realmente usará el sistema. */
    proveedor: PacProviderId;
    /** Lo que dice `PAC_PROVIDER` (o `no_reconocido` si tiene un valor inválido). */
    proveedorDeclarado: PacProviderId | 'no_reconocido';
    esMock: boolean;
    respaldoAMock: { configurado: boolean; efectivo: boolean };
    url: {
      definida: boolean;
      esPorDefecto: boolean;
      valida: boolean | null;
      /** Solo el hostname; nunca ruta, usuario, contraseña ni parámetros. */
      hostname: string | null;
      https: boolean | null;
      ambiente: PacAmbiente | null;
    };
    credenciales: {
      /** ¿Están todas las credenciales que exige el proveedor? */
      completas: boolean;
      /** Nombres (no valores) de las variables que faltan. */
      faltantes: string[];
    };
    /** ¿El CSD vive en la cuenta del proveedor (no en el servidor)? */
    csdEnElProveedor: boolean;
  };
  csd: {
    requeridoEnServidor: boolean;
    cargado: boolean;
    estado: PacCsdEstado;
    motivoError: PacCsdMotivoError | null;
    variables: { certificado: boolean; llave: boolean; contrasena: boolean };
    numeroCertificado: string | null;
    vigenteDesde: string | null;
    vigenteHasta: string | null;
    diasRestantes: number | null;
  };
  emisor: {
    /** `false` si no se consultó la base de datos. */
    verificado: boolean;
    completo: boolean;
    fuente: 'ajustes' | 'perfil_empresa' | 'sin_datos' | null;
    /** Claves faltantes: rfc, legalName, fiscalRegime, fiscalPostalCode. */
    camposFaltantes: string[];
    rfcValido: boolean | null;
    tipoPersona: 'MORAL' | 'FISICA' | 'GENERICO' | null;
    regimenValido: boolean | null;
    codigoPostalValido: boolean | null;
  };
  facturas: PacFacturasEntrada | null;
  bloqueos: PacHallazgo[];
  advertencias: PacHallazgo[];
  /** Cosas que este reporte NO puede comprobar y una persona debe confirmar. */
  verificacionManual: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const PROVEEDORES: readonly PacProviderId[] = ['mock', 'facturama', 'sw', 'finkok'];

/** Mismos valores por omisión que `PacService.buildAdapter()`: todos son SANDBOX. */
const URL_POR_OMISION: Record<Exclude<PacProviderId, 'mock'>, string> = {
  facturama: 'https://apisandbox.facturama.mx',
  sw: 'https://services.test.sw.com.mx',
  finkok: 'https://demo-facturacion.finkok.com',
};

const VARIABLE_URL: Record<Exclude<PacProviderId, 'mock'>, string> = {
  facturama: 'FACTURAMA_BASE_URL',
  sw: 'SW_BASE_URL',
  finkok: 'FINKOK_BASE_URL',
};

const NOMBRE_PROVEEDOR: Record<PacProviderId, string> = {
  mock: 'modo de prueba (mock)',
  facturama: 'Facturama',
  sw: 'SW Sapien',
  finkok: 'Finkok',
};

/** Hostnames de producción conocidos por proveedor. */
const HOSTS_PRODUCCION: Record<Exclude<PacProviderId, 'mock'>, readonly string[]> = {
  facturama: ['api.facturama.mx'],
  sw: ['services.sw.com.mx', 'api.sw.com.mx'],
  finkok: ['facturacion.finkok.com'],
};

/** Número de certificado SAT que devuelve el mock (y el «relleno» de los adaptadores). */
export const SAT_CERT_NUMBER_DE_PRUEBA = '00001000000000000000';

/** Días de anticipación para avisar que el CSD está por vencer. */
export const CSD_DIAS_POR_VENCER = 30;

const MS_POR_DIA = 86_400_000;

const ETIQUETA_CAMPO: Record<string, string> = {
  rfc: 'RFC',
  legalName: 'razón social',
  fiscalRegime: 'régimen fiscal',
  fiscalPostalCode: 'código postal fiscal (lugar de expedición)',
};

const CAMPOS_EMISOR = ['rfc', 'legalName', 'fiscalRegime', 'fiscalPostalCode'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────────────────

const hayTexto = (v: string | null | undefined): v is string =>
  typeof v === 'string' && v.trim().length > 0;

function clasificaHost(host: string, proveedor: Exclude<PacProviderId, 'mock'>): PacAmbiente {
  const h = host.toLowerCase();
  if (/sandbox|(^|[.-])test([.-]|$)|(^|[.-])demo([.-]|$)|staging|localhost|^127\.|^0\.0\.0\.0$/.test(h)) {
    return 'sandbox';
  }
  if (HOSTS_PRODUCCION[proveedor].includes(h)) return 'produccion';
  return 'desconocido';
}

/** Clasifica el texto de error del CSD sin copiarlo. */
function clasificaErrorCsd(error: string | null | undefined): PacCsdMotivoError | 'no_configurado' | null {
  if (!error) return null;
  if (/no configurado/i.test(error)) return 'no_configurado';
  if (/CSD_KEY_PASSWORD requerido/i.test(error)) return 'falta_contrasena';
  if (/desencriptar|contraseña|password/i.test(error)) return 'llave_invalida';
  return 'error_de_lectura';
}

const aFechaIso = (d: Date | null | undefined): string | null =>
  d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;

// ── RFC ──────────────────────────────────────────────────────────────────────

const RFC_MORAL = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/;
const RFC_FISICA = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/;

/** La fecha embebida (AAMMDD) debe ser un mes/día posibles. */
function fechaRfcPosible(rfc: string): boolean {
  const cuerpo = rfc.length === 13 ? rfc.slice(4, 10) : rfc.slice(3, 9);
  const mes = Number(cuerpo.slice(2, 4));
  const dia = Number(cuerpo.slice(4, 6));
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31;
}

export interface RfcRevision {
  formatoValido: boolean;
  tipo: 'MORAL' | 'FISICA' | 'GENERICO' | null;
  digitoCorrecto: boolean | null;
}

export function revisaRfc(valor: string | null | undefined): RfcRevision {
  const rfc = (valor ?? '').trim().toUpperCase();
  if (rfc === 'XAXX010101000' || rfc === 'XEXX010101000') {
    return { formatoValido: true, tipo: 'GENERICO', digitoCorrecto: true };
  }
  let tipo: 'MORAL' | 'FISICA' | null = null;
  if (RFC_MORAL.test(rfc)) tipo = 'MORAL';
  else if (RFC_FISICA.test(rfc)) tipo = 'FISICA';
  if (!tipo || !fechaRfcPosible(rfc)) return { formatoValido: false, tipo, digitoCorrecto: null };
  return { formatoValido: true, tipo, digitoCorrecto: digitoRfcCorrecto(rfc) };
}

// ── Régimen fiscal ───────────────────────────────────────────────────────────

/**
 * Acepta exactamente lo que acepta `AccountingService.normalizeFiscalRegime`:
 * `601` o `R601`. Cualquier otro texto («601 - General de Ley…») se rechaza al
 * crear la factura, así que aquí también es inválido.
 */
function codigoRegimen(valor: string | null | undefined): string | null {
  const m = /^R?(\d{3})$/.exec((valor ?? '').trim().toUpperCase());
  return m ? m[1] : null;
}

// ── Ajustes → emisor (misma regla que AccountingService.getInvoiceIssuerProfile) ──

const normalizaClaveAjuste = (v?: string | null): string =>
  (v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

export interface AjusteEmpresa {
  key: string;
  value: string;
  label?: string | null;
}

/** Réplica de `pickSettingValue` de AccountingService (mismo criterio de búsqueda). */
function tomaAjuste(ajustes: AjusteEmpresa[], candidatos: string[]): string | null {
  const c = candidatos.map((x) => normalizaClaveAjuste(x));
  const hit = ajustes.find((s) => {
    const k = normalizaClaveAjuste(s.key);
    const l = normalizaClaveAjuste(s.label || '');
    return c.some((x) => k.includes(x) || l.includes(x));
  });
  const v = hit?.value?.trim();
  return v ? v : null;
}

/**
 * Datos del emisor a partir de los ajustes «empresa»/«fiscal». Igual que al
 * facturar: si existe CUALQUIERA de los cuatro, los ajustes mandan y el perfil
 * de empresa ya no se consulta.
 */
export function emisorDesdeAjustes(ajustes: AjusteEmpresa[]): Omit<PacEmisorEntrada, 'fuente'> | null {
  const rfc = tomaAjuste(ajustes, ['rfc', 'fiscalrfc', 'empresarfc']);
  const legalName = tomaAjuste(ajustes, ['razonsocial', 'nombreempresa', 'empresa', 'socialname']);
  const fiscalRegime = tomaAjuste(ajustes, ['regimenfiscal', 'regimen']);
  const fiscalPostalCode = tomaAjuste(ajustes, ['codigopostal', 'cp', 'zip']);
  if (!rfc && !legalName && !fiscalRegime && !fiscalPostalCode) return null;
  return { rfc, legalName, fiscalRegime, fiscalPostalCode };
}

// ─────────────────────────────────────────────────────────────────────────────
// Constructor del reporte
// ─────────────────────────────────────────────────────────────────────────────

export function buildPacReadinessReport(input: PacReadinessInput): PacReadinessReport {
  const env = input.env;
  const now = input.now ?? new Date();
  const bloqueos: PacHallazgo[] = [];
  const advertencias: PacHallazgo[] = [];
  const verificacionManual: string[] = [];
  const bloquea = (codigo: string, mensaje: string, accion: string) =>
    bloqueos.push({ codigo, mensaje, accion });
  const avisa = (codigo: string, mensaje: string, accion: string) =>
    advertencias.push({ codigo, mensaje, accion });

  // ── Servidor ───────────────────────────────────────────────────────────────
  const esProduccion = (env['NODE_ENV'] || 'development') === 'production';

  // ── Proveedor (misma lectura que PacService: sin trim, distingue mayúsculas) ──
  const crudo = env['PAC_PROVIDER'];
  const declarado = crudo || 'mock';
  const reconocido = (PROVEEDORES as readonly string[]).includes(declarado);
  // Un valor desconocido cae a mock en PacService.buildAdapter().
  const proveedor: PacProviderId = reconocido ? (declarado as PacProviderId) : 'mock';
  const esMock = proveedor === 'mock';
  const real = proveedor === 'mock' ? null : proveedor;

  if (!reconocido) {
    bloquea(
      'proveedor_no_reconocido',
      'El proveedor de timbrado está escrito con un valor que el sistema no reconoce, así que se comportaría como modo de prueba.',
      'Escribir exactamente «facturama» (en minúsculas) como proveedor y reiniciar la API. Ver docs/CFDI-GO-LIVE.md.',
    );
  } else if (esMock) {
    bloquea(
      'proveedor_mock',
      'El timbrado está en modo de prueba: las facturas llevarían un folio fiscal (UUID) inventado y no tendrían ninguna validez ante el SAT.',
      'Conectar el servicio de timbrado (Facturama) por etapas, siguiendo docs/CFDI-GO-LIVE.md.',
    );
  }

  // ── Respaldo a mock ────────────────────────────────────────────────────────
  const respaldoConfigurado = env['PAC_FALLBACK_TO_MOCK'] !== '0';
  const respaldoEfectivo = esProduccion ? false : respaldoConfigurado;

  if (!esProduccion) {
    bloquea(
      'servidor_no_es_produccion',
      'El servidor no está en modo producción, y las protecciones contra timbrar con un UUID falso solo funcionan en producción' +
        (respaldoEfectivo && !esMock
          ? '; además, si el proveedor falla el sistema guardaría una factura con UUID inventado en lugar de avisar.'
          : '.'),
      'Ejecutar la API con NODE_ENV=production (así corre en el servidor de Nexara) y volver a revisar.',
    );
  } else if (respaldoConfigurado && !esMock) {
    avisa(
      'respaldo_mock_ignorado_en_produccion',
      'La opción de «respaldo a modo de prueba» no está apagada. En producción el sistema la ignora, pero conviene dejarla apagada para no depender de ese candado.',
      'Poner el respaldo a modo de prueba en 0 en el archivo de entorno del servidor.',
    );
  }

  // ── URL del proveedor ──────────────────────────────────────────────────────
  let urlDefinida = false;
  let urlPorOmision = false;
  let urlValida: boolean | null = null;
  let hostname: string | null = null;
  let https: boolean | null = null;
  let ambiente: PacAmbiente | null = null;

  if (real) {
    const variable = VARIABLE_URL[real];
    const cruda = env[variable];
    urlDefinida = Boolean(cruda); // igual que `process.env.X || default`
    urlPorOmision = !urlDefinida;
    const efectiva = cruda || URL_POR_OMISION[real];
    try {
      const u = new URL(efectiva.trim());
      urlValida = true;
      hostname = u.hostname;
      https = u.protocol === 'https:';
      ambiente = clasificaHost(u.hostname, real);
    } catch {
      urlValida = false;
    }

    if (urlPorOmision) {
      bloquea(
        'url_no_definida',
        `No se indicó la dirección del servicio de ${NOMBRE_PROVEEDOR[real]}. Si no se indica, el sistema usa por omisión su ambiente de PRUEBAS, y las facturas no tendrían validez fiscal.`,
        `Definir ${variable} con la dirección de producción del proveedor. Ver docs/CFDI-GO-LIVE.md.`,
      );
    } else if (urlValida === false) {
      bloquea(
        'url_invalida',
        'La dirección del servicio de timbrado no tiene un formato válido.',
        `Corregir ${variable} (debe empezar con https://).`,
      );
    } else {
      if (https === false) {
        bloquea(
          'url_sin_https',
          'La dirección del servicio de timbrado no usa https: los datos fiscales viajarían sin cifrar.',
          `Corregir ${variable} para que empiece con https://.`,
        );
      }
      if (ambiente === 'sandbox') {
        bloquea(
          'url_ambiente_pruebas',
          'El servicio de timbrado apunta al ambiente de PRUEBAS del proveedor: lo que se timbre no tiene validez ante el SAT (sirve para ensayar, no para facturar).',
          'Para ensayar, esto es correcto. Para facturar de verdad, cambiar a la dirección de producción del proveedor en la etapa final del runbook.',
        );
      } else if (ambiente === 'desconocido') {
        avisa(
          'url_desconocida',
          'La dirección del servicio de timbrado no coincide con las direcciones oficiales conocidas del proveedor elegido.',
          'Confirmar con el proveedor que esa es su dirección de producción antes de facturar.',
        );
      }
    }
  }

  // ── Credenciales ───────────────────────────────────────────────────────────
  const faltantes: string[] = [];
  if (real === 'facturama') {
    if (!hayTexto(env['FACTURAMA_USER'])) faltantes.push('FACTURAMA_USER');
    if (!hayTexto(env['FACTURAMA_PASSWORD'])) faltantes.push('FACTURAMA_PASSWORD');
  } else if (real === 'sw') {
    const token = hayTexto(env['SW_TOKEN']);
    const par = hayTexto(env['SW_USER']) && hayTexto(env['SW_PASSWORD']);
    if (!token && !par) faltantes.push('SW_TOKEN (o bien SW_USER y SW_PASSWORD)');
  } else if (real === 'finkok') {
    if (!hayTexto(env['FINKOK_USER'])) faltantes.push('FINKOK_USER');
    if (!hayTexto(env['FINKOK_PASSWORD'])) faltantes.push('FINKOK_PASSWORD');
  }
  const credencialesCompletas = real === null ? true : faltantes.length === 0;
  if (real && !credencialesCompletas) {
    bloquea(
      'credenciales_incompletas',
      `Faltan las credenciales de acceso a ${NOMBRE_PROVEEDOR[real]}.` +
        (esProduccion
          ? ' Ojo: con el servidor en producción, la API NO arrancaría si se cambia de proveedor sin ellas.'
          : ' Fuera de producción el sistema seguiría usando el modo de prueba sin avisar.'),
      'Cargar las credenciales en el archivo de entorno del servidor ANTES de cambiar el proveedor. Ver docs/CFDI-GO-LIVE.md.',
    );
  }

  // ── CSD ────────────────────────────────────────────────────────────────────
  const csdEnElProveedor =
    real === 'facturama' || (real === 'sw' && env['SW_USE_ISSUE_JSON'] === '1');
  const csdRequerido = real === 'finkok' || (real === 'sw' && !csdEnElProveedor);

  const variablesCsd = {
    certificado: hayTexto(env['CSD_CER_BASE64']) || hayTexto(env['CSD_CER_PATH']),
    llave: hayTexto(env['CSD_KEY_BASE64']) || hayTexto(env['CSD_KEY_PATH']),
    contrasena: hayTexto(env['CSD_KEY_PASSWORD']),
  };

  const csdIn = input.csd ?? null;
  const cargado = Boolean(csdIn?.configured);
  const clase = clasificaErrorCsd(csdIn?.error);
  const validTo = csdIn?.validTo instanceof Date && !Number.isNaN(csdIn.validTo.getTime()) ? csdIn.validTo : null;
  const validFrom =
    csdIn?.validFrom instanceof Date && !Number.isNaN(csdIn.validFrom.getTime()) ? csdIn.validFrom : null;
  const diasRestantes = cargado && validTo ? Math.floor((validTo.getTime() - now.getTime()) / MS_POR_DIA) : null;

  let csdEstado: PacCsdEstado;
  let csdMotivo: PacCsdMotivoError | null = null;
  if (cargado) {
    if (validTo && validTo.getTime() < now.getTime()) csdEstado = 'vencido';
    else if (validFrom && validFrom.getTime() > now.getTime()) csdEstado = 'aun_no_vigente';
    else if (diasRestantes !== null && diasRestantes < CSD_DIAS_POR_VENCER) csdEstado = 'por_vencer';
    else csdEstado = 'vigente';
  } else if (clase && clase !== 'no_configurado') {
    csdEstado = 'con_error';
    csdMotivo = clase;
  } else if (csdRequerido) {
    csdEstado = 'no_configurado';
  } else if (variablesCsd.certificado || variablesCsd.llave) {
    // Hay archivos pero no cargó (contraseña faltante, llave mala…). Una contraseña sola no cuenta.
    csdEstado = 'con_error';
    csdMotivo = variablesCsd.certificado && variablesCsd.llave && !variablesCsd.contrasena
      ? 'falta_contrasena'
      : 'error_de_lectura';
  } else {
    csdEstado = 'no_aplica';
  }

  const nombreProveedorCsd = real ? NOMBRE_PROVEEDOR[real] : 'el proveedor';
  const gravedadCsd = csdRequerido ? bloquea : avisa;
  const sufijoNoUsado = csdRequerido
    ? ''
    : ` Con ${nombreProveedorCsd} el certificado que sella las facturas es el que se sube a la cuenta del proveedor; esta copia del servidor no se usa para sellar.`;

  if (csdEstado === 'no_configurado') {
    bloquea(
      'csd_no_configurado',
      `Falta el certificado de sello digital (CSD) en el servidor; con ${nombreProveedorCsd} el sistema tiene que sellar cada factura localmente.`,
      'Cargar el .cer, el .key y la contraseña del CSD en el archivo de entorno del servidor (nunca en el repositorio). Ver docs/CFDI-GO-LIVE.md.',
    );
  } else if (csdEstado === 'con_error') {
    const causa =
      csdMotivo === 'falta_contrasena'
        ? 'falta la contraseña de la llave privada'
        : csdMotivo === 'llave_invalida'
          ? 'la llave privada no se pudo abrir (contraseña incorrecta o archivo dañado)'
          : 'no se pudo leer';
    gravedadCsd(
      csdRequerido ? 'csd_con_error' : 'csd_local_con_error',
      `El certificado de sello digital (CSD) del servidor no cargó: ${causa}.${sufijoNoUsado}`,
      'Revisar que el .cer y el .key correspondan al mismo CSD y que la contraseña sea la de la llave privada (no la del portal del SAT).',
    );
  } else if (csdEstado === 'vencido') {
    gravedadCsd(
      csdRequerido ? 'csd_vencido' : 'csd_local_vencido',
      `El certificado de sello digital (CSD) cargado en el servidor está vencido${
        diasRestantes !== null ? ` desde hace ${Math.abs(diasRestantes)} día(s)` : ''
      }: el SAT rechaza facturas selladas con un CSD vencido.${sufijoNoUsado}` +
        (csdRequerido ? '' : ' Si es el mismo que subiste a Facturama, allá también estará vencido.'),
      'Tramitar un CSD nuevo en el portal del SAT (Certisat Web) y cargarlo.',
    );
  } else if (csdEstado === 'aun_no_vigente') {
    gravedadCsd(
      csdRequerido ? 'csd_aun_no_vigente' : 'csd_local_aun_no_vigente',
      `El certificado de sello digital (CSD) cargado todavía no inicia su vigencia.${sufijoNoUsado}`,
      'Confirmar que se cargó el CSD correcto y la fecha del servidor.',
    );
  } else if (csdEstado === 'por_vencer') {
    avisa(
      'csd_por_vencer',
      `El certificado de sello digital (CSD) cargado vence en ${diasRestantes} día(s). Cuando venza, no se podrá facturar.${sufijoNoUsado}`,
      'Tramitar la renovación del CSD en el portal del SAT con tiempo y cargar el nuevo.',
    );
  }

  if (cargado && csdIn?.noCertificado && !/^\d{20}$/.test(csdIn.noCertificado)) {
    avisa(
      'csd_numero_certificado_raro',
      'El número de certificado del CSD no tiene el formato esperado (20 dígitos). Puede ser un archivo que no es un CSD.',
      'Confirmar que el .cer cargado es el Certificado de Sello Digital y no la e.firma (FIEL).',
    );
  }

  if (csdEnElProveedor && real) {
    verificacionManual.push(
      `Entrar a la cuenta de ${NOMBRE_PROVEEDOR[real]} y confirmar que el CSD de Nexara (no la e.firma) está cargado, vigente y que corresponde al mismo RFC que el emisor de las facturas. Este reporte no puede verlo.`,
    );
  }

  // ── Emisor ─────────────────────────────────────────────────────────────────
  const verificadoEmisor = input.company !== undefined;
  const c = input.company ?? null;
  const camposFaltantes: string[] = [];
  let rfcValido: boolean | null = null;
  let tipoPersona: 'MORAL' | 'FISICA' | 'GENERICO' | null = null;
  let regimenValido: boolean | null = null;
  let cpValido: boolean | null = null;

  if (!verificadoEmisor) {
    bloquea(
      'emisor_sin_verificar',
      'No se revisaron los datos fiscales de Nexara (emisor) porque no se consultó la base de datos.',
      'Volver a correr la revisión con acceso a la base de datos (opción --db) o desde la pantalla de facturación.',
    );
  } else {
    for (const campo of CAMPOS_EMISOR) {
      if (!hayTexto(c?.[campo])) camposFaltantes.push(campo);
    }
    if (camposFaltantes.length > 0) {
      bloquea(
        'emisor_datos_incompletos',
        c
          ? `Faltan datos fiscales de Nexara (el emisor de las facturas): ${camposFaltantes
              .map((k) => ETIQUETA_CAMPO[k])
              .join(', ')}.`
          : 'No hay datos fiscales de Nexara (el emisor de las facturas).',
        'Completarlos en el perfil de la empresa exactamente como aparecen en la Constancia de Situación Fiscal.',
      );
    }

    if (hayTexto(c?.rfc)) {
      const rev = revisaRfc(c?.rfc);
      rfcValido = rev.formatoValido;
      tipoPersona = rev.tipo;
      if (!rev.formatoValido) {
        bloquea(
          'emisor_rfc_formato',
          'El RFC de Nexara no tiene un formato válido de RFC (12 caracteres para persona moral, 13 para persona física).',
          'Corregir el RFC en el perfil de la empresa.',
        );
      } else if (rev.tipo === 'GENERICO') {
        bloquea(
          'emisor_rfc_generico',
          'El RFC de Nexara es un RFC genérico (público en general / extranjero); no puede emitir facturas.',
          'Capturar el RFC real de la empresa.',
        );
      } else if (rev.digitoCorrecto === false) {
        avisa(
          'emisor_rfc_digito',
          'El último carácter (dígito verificador) del RFC de Nexara no cuadra. Puede haber un error de captura.',
          'Compararlo letra por letra con la Constancia de Situación Fiscal.',
        );
      }
    }

    if (hayTexto(c?.fiscalRegime)) {
      const codigo = codigoRegimen(c?.fiscalRegime);
      const catalogo = codigo ? SAT_FISCAL_REGIMES.find((r) => r.code === codigo) : undefined;
      if (!catalogo) {
        regimenValido = false;
        bloquea(
          'emisor_regimen_invalido',
          'El régimen fiscal de Nexara no es un código válido del catálogo del SAT (debe ser solo el código de 3 dígitos, por ejemplo 601).',
          'Corregir el régimen en el perfil de la empresa según la Constancia de Situación Fiscal.',
        );
      } else if (
        (tipoPersona === 'MORAL' && !catalogo.moral) ||
        (tipoPersona === 'FISICA' && !catalogo.fisica)
      ) {
        regimenValido = false;
        bloquea(
          'emisor_regimen_incompatible',
          `El régimen fiscal ${catalogo.code} no corresponde a una persona ${
            tipoPersona === 'MORAL' ? 'moral' : 'física'
          } (por el RFC de Nexara). El SAT rechazaría la factura.`,
          'Revisar el RFC y el régimen contra la Constancia de Situación Fiscal.',
        );
      } else {
        regimenValido = true;
      }
    }

    if (hayTexto(c?.fiscalPostalCode)) {
      cpValido = /^\d{5}$/.test(c?.fiscalPostalCode ?? '');
      if (!cpValido) {
        bloquea(
          'emisor_cp_invalido',
          'El código postal fiscal de Nexara debe ser de exactamente 5 dígitos, sin espacios ni guiones (es el «lugar de expedición» de cada factura).',
          'Corregirlo en el perfil de la empresa.',
        );
      }
    }

    if (hayTexto(c?.legalName) && /\b(S\.?\s?A\.?(\s?P\.?\s?I\.?)?\s?(DE\s)?C\.?\s?V\.?|S\.?\s?DE\s?R\.?\s?L\.?(\s?DE\s?C\.?\s?V\.?)?|S\.?\s?A\.?\s?S\.?)\b/i.test(c?.legalName ?? '')) {
      avisa(
        'emisor_razon_social_con_regimen',
        'La razón social de Nexara parece incluir el tipo de sociedad (por ejemplo «S.A. de C.V.»). En CFDI 4.0 el nombre debe coincidir con el que aparece en la Constancia de Situación Fiscal, y el SAT/PAC pueden rechazar la factura si no coincide.',
        'Confirmar con la Constancia y con el contador cómo debe escribirse exactamente.',
      );
    }
  }

  // ── Facturas existentes ────────────────────────────────────────────────────
  const facturas = input.invoices ?? null;
  if (facturas && facturas.conSelloDePrueba > 0) {
    avisa(
      'facturas_con_sello_de_prueba',
      `Hay ${facturas.conSelloDePrueba} factura(s) «timbradas» en modo de prueba, con un UUID inventado. No son válidas ante el SAT.`,
      'No enviarlas como facturas reales a clientes; con el contador, decidir si se reemiten ya con timbrado real.',
    );
  }
  if (facturas && facturas.timbradasSinPoliza > 0) {
    avisa(
      'facturas_sin_poliza',
      `Hay ${facturas.timbradasSinPoliza} factura(s) timbrada(s) sin su póliza contable automática. Los libros no cuadran con lo facturado.`,
      'Generar la póliza a mano en Contabilidad (referencia INV-STAMP-<id de la factura>).',
    );
  }

  // ── Veredicto ──────────────────────────────────────────────────────────────
  const listoParaProduccion = !esMock && bloqueos.length === 0;
  // Ensayo en sandbox: todo está bien salvo que apunta a pruebas (y, si se ensaya
  // en una máquina de desarrollo, que NODE_ENV no es production).
  const soloFaltaSalirDeSandbox =
    !esMock &&
    ambiente === 'sandbox' &&
    bloqueos.length > 0 &&
    bloqueos.every((b) => b.codigo === 'url_ambiente_pruebas' || b.codigo === 'servidor_no_es_produccion');

  let etapa: PacEtapa;
  if (esMock) etapa = 'apagado_mock';
  else if (listoParaProduccion) etapa = 'listo_para_produccion';
  else if (soloFaltaSalirDeSandbox) etapa = 'pruebas_sandbox';
  else etapa = 'configuracion_incompleta';

  const resumen =
    etapa === 'apagado_mock'
      ? 'La facturación electrónica está apagada (modo de prueba). Ninguna factura tiene validez ante el SAT.'
      : etapa === 'pruebas_sandbox'
        ? 'El timbrado está conectado al ambiente de PRUEBAS de ' +
          `${NOMBRE_PROVEEDOR[proveedor]}. Sirve para ensayar; todavía no factura de verdad.`
        : etapa === 'listo_para_produccion'
          ? 'Todo lo que se puede comprobar automáticamente está en orden para timbrar en producción. Falta la confirmación manual de los puntos de «verificación manual» y la decisión de encender.'
          : `Todavía no se puede facturar en producción: ${bloqueos.length} pendiente(s) que bloquean.`;

  return {
    generadoEn: now.toISOString(),
    listoParaProduccion,
    etapa,
    resumen,
    servidor: { nodeEnv: esProduccion ? 'production' : 'no_produccion', esProduccion },
    pac: {
      proveedor,
      proveedorDeclarado: reconocido ? (declarado as PacProviderId) : 'no_reconocido',
      esMock,
      respaldoAMock: { configurado: respaldoConfigurado, efectivo: respaldoEfectivo },
      url: {
        definida: urlDefinida,
        esPorDefecto: urlPorOmision,
        valida: urlValida,
        hostname,
        https,
        ambiente,
      },
      credenciales: { completas: credencialesCompletas, faltantes },
      csdEnElProveedor,
    },
    csd: {
      requeridoEnServidor: csdRequerido,
      cargado,
      estado: csdEstado,
      motivoError: csdMotivo,
      variables: variablesCsd,
      numeroCertificado: cargado ? (csdIn?.noCertificado ?? null) : null,
      vigenteDesde: cargado ? aFechaIso(validFrom) : null,
      vigenteHasta: cargado ? aFechaIso(validTo) : null,
      diasRestantes,
    },
    emisor: {
      verificado: verificadoEmisor,
      completo: verificadoEmisor && camposFaltantes.length === 0,
      fuente: verificadoEmisor ? (c?.fuente ?? 'sin_datos') : null,
      camposFaltantes,
      rfcValido,
      tipoPersona,
      regimenValido,
      codigoPostalValido: cpValido,
    },
    facturas,
    bloqueos,
    advertencias,
    verificacionManual,
  };
}
