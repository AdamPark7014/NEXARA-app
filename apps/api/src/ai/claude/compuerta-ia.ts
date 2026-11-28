/**
 * La compuerta de la IA: un corte de circuito en memoria para la puerta única de Claude.
 *
 * El problema que resuelve. Cuando la llave de la puerta muere (401), el token de NEXARA se invalida, el proyecto se
 * desactiva (403) o se acaba el presupuesto (429 `budget_exceeded`), TODAS las llamadas siguientes fallan igual. Sin
 * compuerta, cada clic de cada persona le vuelve a pegar a la puerta, gasta cupo diario, llena el log y las pantallas
 * siguen diciendo «IA disponible». Del 23 al 27-11-2026 fueron 407 llamadas, todas 401.
 *
 * Qué hace. Cuenta los fallos SEGUIDOS que no tienen remedio de este lado (`cuentaParaCorte`); al tercero pasa a
 * «caída». En caída deja pasar UNA sola llamada de prueba (la «sonda») cuando toca; si la sonda sale bien vuelve a
 * «ok», si falla espera más (5, 10, 20 y 30 min). Un solo éxito cierra la caída.
 *
 * Qué NO hace. No toca la base ni arranca timers (los evals hacen `new ClaudeService()` sin argumentos), no lee
 * interruptores ni habla con la puerta: recibe el modo y el reloj desde fuera. El único import de Nest es la clase de
 * excepción HTTP (sin inyección de dependencias).
 *
 * Los tres modos (los fija `ClaudeService` desde `system_settings`, clave `ia.compuerta.modo`):
 *   - `apagado` : no cuenta, no emite, no niega.
 *   - `observar`: cuenta y emite eventos, pero `pedirPaso()` NUNCA niega (la IA sigue como si no hubiera compuerta).
 *   - `activo`  : en caída niega las llamadas con `IaNoDisponibleException` salvo la sonda.
 *
 * El estado es por proceso de Node. Hoy solo existe el contenedor `nexara-api`.
 */
import Anthropic from '@anthropic-ai/sdk';
import { ServiceUnavailableException } from '@nestjs/common';
import type { ModoPiloto } from '../../common/piloto/interruptor-piloto.js';
import { workDateKey } from '../../common/time/workday.js';

export type ModoIa = ModoPiloto;

/** Claves de `system_settings` de la IA (las lee `leerModoPiloto`: no hay otro lector). */
export const CLAVES_IA = {
  COMPUERTA: 'ia.compuerta.modo',
  TOPES: 'ia.topes.modo',
  RELLENO_COMPLEJIDAD: 'ia.relleno_complejidad.modo',
} as const;
export type ClaveIa = (typeof CLAVES_IA)[keyof typeof CLAVES_IA];

/** Sin fila en la base, lo nuevo de la IA nace en `observar`: cuenta y avisa, nunca bloquea. */
export const MODO_IA_POR_OMISION: ModoIa = 'observar';

/** Los fallos que abren el corte: la causa es de todo el proyecto en la puerta, no de una función. */
export type MotivoCorte =
  | 'llave_puerta_invalida'
  | 'token_nexara_invalido'
  | 'proyecto_desactivado'
  | 'presupuesto_agotado';

/** Fallos que NO abren el corte (pasajeros o de una sola llamada). */
export type MotivoNoCorte =
  | 'saturada'
  | 'modelo_no_permitido'
  | 'solicitud_grande'
  | 'solicitud_rechazada'
  | 'error_servicio'
  | 'sin_conexion'
  | 'desconocido';

export type MotivoFallo = MotivoCorte | MotivoNoCorte;

export type ClaseFallo =
  | {
      motivo: MotivoCorte;
      /** Estos cuatro cuentan para el corte. */
      cuentaParaCorte: true;
      /** La puerta no cobra ni gasta cupo en ellos. */
      sinCosto: true;
      detalle: string;
    }
  | {
      motivo: MotivoNoCorte;
      cuentaParaCorte: false;
      /** `true` = la puerta tampoco lo cobra y el cupo se puede devolver; `false` = pudo costar. */
      sinCosto: boolean;
      detalle: string;
    };

export type EventoCompuerta =
  | {
      tipo: 'CAIDA';
      motivo: MotivoCorte;
      /** Milisegundos desde 1970 en que se abrió el corte. */
      desde: number;
      detalle: string;
      origen: 'llamada' | 'sonda';
      /** Fallos seguidos que contaron hasta abrir (1 cuando abre una sonda). */
      fallos: number;
    }
  | { tipo: 'VOLVIO'; desde: number; hasta: number };

/** Lo que `pedirPaso()` entrega a quien va a llamar. */
export type PasoIa = {
  /** `true` = esta llamada lleva el único permiso de sonda de la caída: su resultado cierra o reabre el corte. */
  esSonda: boolean;
};

export type FilaConteoDia = {
  companyId: number;
  proceso: string;
  /** Llamadas que llegaron a la puerta (buenas + con error). */
  llamadas: number;
  buenas: number;
  /** Con error que la puerta no cobra (401, 403, presupuesto, 429, modelo no permitido, 413). */
  sinCosto: number;
  /** Con error que pudo costar (5xx, tiempo agotado, sin conexión, otros). */
  otros: number;
};

export type InstantaneaCompuerta = {
  estado: 'ok' | 'caida';
  motivo: MotivoCorte | null;
  desde: number | null;
  detalle: string;
  fallosSeguidos: number;
  /** Cuántos fallos seguidos abren el corte. */
  umbral: number;
  proximoIntento: number | null;
  sondaEnVuelo: boolean;
  /** Cuándo arrancó la última sonda. */
  ultimaSonda: number | null;
  ultimaBuena: { at: number; proceso: string; modelo: string } | null;
  /** Cuánto esperará la próxima vez que la sonda falle, en minutos. */
  esperaActualMin: number;
  hoy: { dia: string; filas: FilaConteoDia[] };
};

/** Sondeo cuando la compuerta está en caída: 5, 10, 20 y 30 min (el tope baja con `IA_CORTE_MINUTOS_MAX`). */
export const ESCALERA_MINUTOS: readonly number[] = [5, 10, 20, 30];
/** Una sonda que lleva más de esto en vuelo se da por colgada y libera el permiso. */
export const SONDA_COLGADA_MS = 30_000;

/** Tipo de error que manda la puerta (o Anthropic) en el cuerpo: `budget_exceeded`, etc. */
export function tipoDeError(error: InstanceType<typeof Anthropic.APIError>): string | null {
  const cuerpo = error.error as { error?: { type?: unknown } } | undefined;
  return typeof cuerpo?.error?.type === 'string' ? cuerpo.error.type : null;
}

/** Texto del error de la puerta (el SDK lo trae en `message` y en el cuerpo). Solo para reconocerlo, nunca para el log. */
function textoDelError(error: InstanceType<typeof Anthropic.APIError>): string {
  const cuerpo = error.error as { error?: { message?: unknown } } | undefined;
  const interno = typeof cuerpo?.error?.message === 'string' ? cuerpo.error.message : '';
  return `${error.message ?? ''} ${interno}`;
}

/**
 * Qué clase de fallo es y qué hacer con él:
 *  - 401 con «Token de proyecto» (lo dice la puerta): `token_nexara_invalido`; cualquier otro 401: `llave_puerta_invalida`.
 *  - 403: `proyecto_desactivado`. 429 `budget_exceeded`: `presupuesto_agotado`.
 *    Estos cuatro cuentan para el corte y no gastan cupo.
 *  - 429 normal (saturada), 400 «no está permitido» (modelo) y 413: no cuentan y no gastan cupo.
 *  - 5xx, tiempo agotado, sin conexión y lo demás: no cuentan y SÍ gastan cupo (pudieron costar).
 * `detalle` lleva solo el estado y el tipo: el mensaje del error puede repetir parte de lo enviado.
 */
export function clasificarFallo(error: unknown): ClaseFallo {
  if (!(error instanceof Anthropic.APIError)) {
    const nombre = error instanceof Error && error.name ? error.name : typeof error;
    return { motivo: 'desconocido', cuentaParaCorte: false, sinCosto: false, detalle: `error no esperado (${nombre})` };
  }
  const detalle = `${error.status ?? 'sin estado'} ${tipoDeError(error) ?? ''}`.trim();

  if (error instanceof Anthropic.AuthenticationError) {
    const motivo: MotivoCorte = /Token de proyecto/i.test(textoDelError(error))
      ? 'token_nexara_invalido'
      : 'llave_puerta_invalida';
    return { motivo, cuentaParaCorte: true, sinCosto: true, detalle };
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return { motivo: 'proyecto_desactivado', cuentaParaCorte: true, sinCosto: true, detalle };
  }
  if (error instanceof Anthropic.RateLimitError) {
    if (tipoDeError(error) === 'budget_exceeded') {
      return { motivo: 'presupuesto_agotado', cuentaParaCorte: true, sinCosto: true, detalle };
    }
    return { motivo: 'saturada', cuentaParaCorte: false, sinCosto: true, detalle };
  }
  if (error instanceof Anthropic.BadRequestError && /no está permitido/.test(textoDelError(error))) {
    // La puerta solo deja usar los modelos de la política de NEXARA.
    return { motivo: 'modelo_no_permitido', cuentaParaCorte: false, sinCosto: true, detalle };
  }
  if (error.status === 413) {
    return { motivo: 'solicitud_grande', cuentaParaCorte: false, sinCosto: true, detalle };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    // Incluye el tiempo agotado (`APIConnectionTimeoutError`): no se sabe si la puerta llegó a cobrar.
    return { motivo: 'sin_conexion', cuentaParaCorte: false, sinCosto: false, detalle: 'sin conexión o tiempo agotado' };
  }
  if (error instanceof Anthropic.BadRequestError) {
    return { motivo: 'solicitud_rechazada', cuentaParaCorte: false, sinCosto: false, detalle };
  }
  return { motivo: 'error_servicio', cuentaParaCorte: false, sinCosto: false, detalle };
}

/**
 * Lo que ve la persona cuando la llave o el token de la IA no sirven. Una sola frase sin nombres de variables: el
 * detalle técnico (qué llave, qué código) queda en el log, en `GET /ai/salud` y en el aviso al administrador.
 */
export const TEXTO_IA_NO_DISPONIBLE = 'La IA no está disponible por ahora: ya se avisó al administrador.';

/**
 * Lo que se le dice a la persona cuando el corte niega una llamada. El de presupuesto es el de siempre; el de llave y
 * token es el mismo que sale cuando la puerta contesta 401 (`TEXTO_IA_NO_DISPONIBLE`); el de proyecto desactivado es
 * nuevo porque hoy un 403 sale como «no respondió».
 */
export function textoDeCorte(motivo: MotivoCorte): string {
  switch (motivo) {
    case 'llave_puerta_invalida':
    case 'token_nexara_invalido':
      return TEXTO_IA_NO_DISPONIBLE;
    case 'presupuesto_agotado':
      return 'Se acabó el presupuesto de IA de este mes: avísale al administrador.';
    case 'proyecto_desactivado':
      return 'La IA de NEXARA está desactivada: avísale al administrador.';
  }
}

/**
 * La IA no está disponible. Es un 503 como siempre (`ServiceUnavailableException`, con el mismo `message` para quien
 * ya lo atrapaba), pero ahora lleva `code: 'IA_NO_DISPONIBLE'`: el filtro global de errores lo reenvía al cliente y el
 * vigía de fallas lo reconoce para no contarlo como un error 5xx del servidor.
 */
export class IaNoDisponibleException extends ServiceUnavailableException {
  constructor(
    message: string,
    /** Por qué (`null` si no se supo clasificar). */
    readonly motivo: MotivoFallo | null = null,
    /** `true` = la llamada no llegó a gastar nada, ni en la puerta ni en el cupo. */
    readonly sinCosto: boolean = false,
    /** Segundos que faltan para que la compuerta deje pasar otra prueba; solo cuando la negó el corte. */
    readonly reintentoEn?: number,
  ) {
    super({ statusCode: 503, error: 'Service Unavailable', message, code: 'IA_NO_DISPONIBLE' });
  }
}

export type OpcionesCompuerta = {
  /** Milisegundos desde 1970. Las pruebas lo reemplazan. */
  reloj?: () => number;
  modo?: ModoIa;
  /** Fallos seguidos que abren el corte (`IA_CORTE_FALLOS`, 3). */
  fallosParaCortar?: number;
  /** Espera máxima entre sondas, en minutos (`IA_CORTE_MINUTOS_MAX`, 30). */
  minutosMax?: number;
};

function enteroPositivo(valor: unknown, porOmision: number): number {
  const n = Math.floor(Number(valor));
  return Number.isFinite(n) && n >= 1 ? n : porOmision;
}

export class CompuertaIa {
  /** Lo fija quien la usa (`ClaudeService`) cada vez que lee el interruptor. */
  modo: ModoIa;

  private readonly reloj: () => number;
  private readonly umbral: number;
  private readonly minutosMax: number;

  private estado: 'ok' | 'caida' = 'ok';
  private fallosSeguidos = 0;
  /** Posición en la escalera de espera (0 = 5 min). */
  private nivel = 0;
  private desde: number | null = null;
  private motivo: MotivoCorte | null = null;
  private detalle = '';
  private proximoIntento: number | null = null;
  /** Desde cuándo hay una sonda en vuelo (`null` = ninguna). */
  private sondaDesde: number | null = null;
  private ultimaSondaAt: number | null = null;
  private ultimaBuena: { at: number; proceso: string; modelo: string } | null = null;
  private readonly oyentes = new Set<(evento: EventoCompuerta) => void>();

  private diaConteo = '';
  private readonly conteo = new Map<string, FilaConteoDia>();

  constructor(opciones: OpcionesCompuerta = {}) {
    this.reloj = opciones.reloj ?? (() => Date.now());
    this.modo = opciones.modo ?? 'observar';
    this.umbral = enteroPositivo(opciones.fallosParaCortar ?? process.env.IA_CORTE_FALLOS, 3);
    this.minutosMax = enteroPositivo(opciones.minutosMax ?? process.env.IA_CORTE_MINUTOS_MAX, 30);
  }

  /** Avisa de cada cambio de estado (CAIDA, VOLVIO). Devuelve la función que deja de avisar. */
  alCambiar(oyente: (evento: EventoCompuerta) => void): () => void {
    this.oyentes.add(oyente);
    return () => {
      this.oyentes.delete(oyente);
    };
  }

  private emitir(evento: EventoCompuerta): void {
    for (const oyente of this.oyentes) {
      try {
        oyente(evento);
      } catch {
        // Un oyente con error no debe tumbar la llamada de la IA.
      }
    }
  }

  private esperaMs(nivel: number): number {
    const paso = ESCALERA_MINUTOS[Math.min(nivel, ESCALERA_MINUTOS.length - 1)];
    return Math.min(paso, this.minutosMax) * 60_000;
  }

  private sondaViva(ahora: number): boolean {
    return this.sondaDesde != null && ahora - this.sondaDesde < SONDA_COLGADA_MS;
  }

  /**
   * ¿Una llamada nueva pasaría ahora? Solo mira: no consume el permiso de sonda. Es lo que contesta `disponible()` en
   * modo activo. Con el modo apagado siempre es sí.
   */
  permite(): boolean {
    if (this.modo === 'apagado' || this.estado === 'ok') return true;
    const ahora = this.reloj();
    if (ahora < (this.proximoIntento ?? 0)) return false;
    return !this.sondaViva(ahora);
  }

  /**
   * Se pide antes de cada llamada a la puerta. En caída, pasado `proximoIntento`, entrega UN solo permiso de sonda
   * (`esSonda: true`) y los pedidos siguientes se niegan mientras esa sonda siga en vuelo. En modo `activo` un pedido
   * negado lanza `IaNoDisponibleException`; en `observar` nunca niega (la máquina de estados es la misma, solo cambia
   * que la llamada sigue).
   */
  pedirPaso(): PasoIa {
    if (this.modo === 'apagado' || this.estado === 'ok') return { esSonda: false };
    const ahora = this.reloj();
    const toca = ahora >= (this.proximoIntento ?? 0);
    if (toca && !this.sondaViva(ahora)) {
      this.sondaDesde = ahora;
      this.ultimaSondaAt = ahora;
      return { esSonda: true };
    }
    if (this.modo !== 'activo') return { esSonda: false };
    const faltaMs = toca ? SONDA_COLGADA_MS - (ahora - (this.sondaDesde ?? ahora)) : (this.proximoIntento ?? ahora) - ahora;
    throw new IaNoDisponibleException(
      textoDeCorte(this.motivo ?? 'llave_puerta_invalida'),
      this.motivo,
      true,
      Math.max(1, Math.ceil(faltaMs / 1000)),
    );
  }

  /**
   * Para quien recibió el permiso de sonda pero no llegó a llamar (p. ej. el cupo diario lo frenó): lo devuelve para
   * que no quede ocupado hasta que se dé por colgado.
   */
  soltarSonda(): void {
    this.sondaDesde = null;
  }

  /**
   * Para la vuelta periódica de la sonda: ¿toca sondear ahora? Si toca, reserva el turno (marca la sonda) y devuelve
   * `true`; quien lo recibe debe sondear. En caída toca al llegar `proximoIntento` y sin otra sonda en vuelo; en `ok`,
   * cuando pasaron `intervaloMs` desde la última (o nunca hubo una), para enterarse de una llave muerta aunque nadie
   * use la IA. Con el modo apagado nunca toca.
   */
  reservarSonda(intervaloMs: number): boolean {
    if (this.modo === 'apagado') return false;
    const ahora = this.reloj();
    if (this.estado === 'caida') {
      if (ahora < (this.proximoIntento ?? 0) || this.sondaViva(ahora)) return false;
      this.sondaDesde = ahora;
      this.ultimaSondaAt = ahora;
      return true;
    }
    if (this.ultimaSondaAt != null && ahora - this.ultimaSondaAt < intervaloMs) return false;
    this.ultimaSondaAt = ahora;
    return true;
  }

  /**
   * Una llamada salió bien (la sonda o una real). Reinicia la cuenta de fallos; si había caída, la cierra, devuelve la
   * escalera a 5 min y emite `VOLVIO`. `companyId` es para la cuenta del día (la sonda no lleva).
   */
  registrarBuena(proceso: string, modelo: string, companyId?: number): void {
    if (this.modo === 'apagado') return;
    const ahora = this.reloj();
    this.contar(companyId, proceso, 'buenas');
    this.ultimaBuena = { at: ahora, proceso, modelo };
    this.fallosSeguidos = 0;
    this.sondaDesde = null;
    if (this.estado === 'caida') {
      const desde = this.desde ?? ahora;
      this.estado = 'ok';
      this.nivel = 0;
      this.motivo = null;
      this.detalle = '';
      this.desde = null;
      this.proximoIntento = null;
      this.emitir({ tipo: 'VOLVIO', desde, hasta: ahora });
    }
  }

  /**
   * Una llamada falló. Solo los fallos que `cuentaParaCorte` suman (y solo un éxito los reinicia: los demás ni suman ni
   * reinician). Al llegar al umbral abre la caída y emite UN `CAIDA`. Una sonda que falla por alguno de los cuatro
   * motivos abre al instante, sin esperar el umbral; si ya estaba en caída, reabre con la espera siguiente de la
   * escalera (sin otro `CAIDA`). Una sonda que falla por otra razón (5xx, tiempo agotado) deja el estado como está y
   * vuelve a esperar lo mismo.
   * `esSonda` es el que entregó `pedirPaso()` (o `true` si es la sonda del cron).
   */
  registrarFallo(clase: ClaseFallo, proceso: string, esSonda = false, companyId?: number): void {
    if (this.modo === 'apagado') return;
    const ahora = this.reloj();
    this.contar(companyId, proceso, clase.sinCosto ? 'sinCosto' : 'otros');
    if (esSonda) this.sondaDesde = null;

    if (!clase.cuentaParaCorte) {
      // La sonda de una caída que falla por otra cosa: no se sabe si volvió; espera lo mismo otra vez, sin subir.
      if (esSonda && this.estado === 'caida') this.proximoIntento = ahora + this.esperaMs(this.nivel);
      return;
    }

    if (this.estado === 'caida') {
      if (!esSonda) return; // ya está caída: más fallos de llamadas rezagadas no cambian nada.
      this.nivel = Math.min(this.nivel + 1, ESCALERA_MINUTOS.length - 1);
      this.proximoIntento = ahora + this.esperaMs(this.nivel);
      this.motivo = clase.motivo;
      this.detalle = clase.detalle;
      return;
    }

    this.fallosSeguidos += 1;
    if (!esSonda && this.fallosSeguidos < this.umbral) return;
    this.estado = 'caida';
    this.nivel = 0;
    this.desde = ahora;
    this.motivo = clase.motivo;
    this.detalle = clase.detalle;
    this.proximoIntento = ahora + this.esperaMs(0);
    this.sondaDesde = null;
    this.emitir({
      tipo: 'CAIDA',
      motivo: clase.motivo,
      desde: ahora,
      detalle: clase.detalle,
      origen: esSonda ? 'sonda' : 'llamada',
      fallos: this.fallosSeguidos,
    });
  }

  // ── Cuenta del día (hora de México), por empresa y proceso ────────────────────────────────────────────────────────

  private contar(companyId: number | undefined, proceso: string, campo: 'buenas' | 'sinCosto' | 'otros'): void {
    if (companyId == null) return;
    this.cambiarDeDiaSiToca();
    const clave = `${companyId}:${proceso}`;
    let fila = this.conteo.get(clave);
    if (!fila) {
      fila = { companyId, proceso, llamadas: 0, buenas: 0, sinCosto: 0, otros: 0 };
      this.conteo.set(clave, fila);
    }
    fila.llamadas += 1;
    fila[campo] += 1;
  }

  private cambiarDeDiaSiToca(): string {
    const dia = workDateKey(new Date(this.reloj()));
    if (dia !== this.diaConteo) {
      this.conteo.clear();
      this.diaConteo = dia;
    }
    return dia;
  }

  /** Lo contado hoy (día de México) por empresa y proceso. Cambia de día a la medianoche de México. */
  contadoresDelDia(): { dia: string; filas: FilaConteoDia[] } {
    const dia = this.cambiarDeDiaSiToca();
    return { dia, filas: [...this.conteo.values()].map((f) => ({ ...f })) };
  }

  /** Foto del estado para el panel y las pruebas. Solo datos simples. */
  instantanea(): InstantaneaCompuerta {
    const ahora = this.reloj();
    return {
      estado: this.estado,
      motivo: this.motivo,
      desde: this.desde,
      detalle: this.detalle,
      fallosSeguidos: this.fallosSeguidos,
      umbral: this.umbral,
      proximoIntento: this.proximoIntento,
      sondaEnVuelo: this.sondaViva(ahora),
      ultimaSonda: this.ultimaSondaAt,
      ultimaBuena: this.ultimaBuena ? { ...this.ultimaBuena } : null,
      esperaActualMin: this.esperaMs(this.nivel) / 60_000,
      hoy: this.contadoresDelDia(),
    };
  }
}
