import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PLATFORM_DEVELOPER_EMAIL } from '../../common/platform-accounts.js';
import { withTenantBypassAsync } from '../../common/tenant/tenant-context.js';
import { requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { WORKDAY_TIMEZONE } from '../../common/time/workday.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CATEGORIA_AVISO_IA, ENTIDAD_IA_CAIDA } from '../claude/aviso-ia.js';
import { ClaudeService } from '../claude/claude.service.js';
import { CLAVES_IA, type InstantaneaCompuerta, type ModoIa, type MotivoFallo } from '../claude/compuerta-ia.js';

/**
 * `GET /ai/salud`: el estado de la IA de NEXARA, de solo lectura, para dirección y desarrollo.
 *
 * Responde tres preguntas que hoy nadie podía contestar sin entrar al servidor: ¿la IA responde? (y si no, desde cuándo
 * y por qué), ¿cuándo fue la última llamada buena y el último fallo?, y ¿qué se dejó de hacer mientras estuvo caída?
 * Lo primero sale de la compuerta (memoria de ESTE proceso); lo último, de tres señales que ya viven en la base y no
 * piden migración. No escribe nada, no llama a la puerta y no gasta cupo.
 *
 * Qué empresa ve qué. Las cuentas del día (`hoy`) y las señales de la base son SOLO de la empresa de quien consulta:
 * el Map de la compuerta tiene todas las empresas, y aquí se filtra por la del token. Lo que no es de ninguna empresa
 * (si la puerta responde, la hora de la última llamada buena y su función, el último fallo) es del proceso. Nunca
 * sale una llave, un token ni el texto del error de la puerta: de la dirección de la puerta solo el anfitrión.
 *
 * Es honesto con `disponible`: a diferencia de `ClaudeService.disponible()`, que en modo `observar` sigue diciendo que
 * sí aunque la compuerta ya esté en caída (la compuerta cuenta pero no decide), este dice la verdad de la puerta.
 *
 * Una señal de la base que falle no tumba la respuesta: queda en `sinDatos` y el resto sale.
 */

export type EstadoSaludIa = 'ok' | 'caida' | 'con_fallos' | 'sondeando' | 'sin_configurar' | 'sin_vigilar';

export type SaludIa = {
  generadoEn: string;
  /** Posición del interruptor `ia.compuerta.modo` (sin fila: observar). */
  modo: ModoIa;
  /** Hay llave y, en producción, dirección de la puerta. No dice que la puerta responda. */
  configurada: boolean;
  /**
   * `true` si ahora mismo una llamada de esta empresa tendría con qué salir bien: configurada, puerta sana y cupo del
   * día. Es `false` en `con_fallos`: con lo último visto siendo un fallo no se puede prometer que salga bien.
   */
  disponible: boolean;
  /**
   *  - `ok`: ya hubo una llamada o sonda buena en este proceso y nada peor después.
   *  - `caida`: la compuerta abrió el corte (llave, token, proyecto o presupuesto); ver `motivo` y `desde`.
   *  - `con_fallos`: el corte no está abierto, pero lo último que vio este proceso fue un fallo del servicio (sin conexión,
   *    error del servidor, saturada, un 401 que aún no llega al umbral…) o una sonda fallida, y ninguna llamada buena
   *    después. Es el caso de una puerta caída que nunca abre el corte: ver `ultimoFallo`, `ultimaSonda` y `explicacion`.
   *  - `sondeando`: este proceso todavía no ha visto una llamada buena ni un fallo del servicio (la primera sonda sale
   *    ~45 s tras arrancar).
   *  - `sin_configurar`: falta la llave o la dirección de la puerta.
   *  - `sin_vigilar`: la compuerta está apagada: no se cuenta nada y el estado no es confiable.
   */
  estado: EstadoSaludIa;
  /** Clave del motivo de la caída (`llave_puerta_invalida`, …); `null` si no hay caída. */
  motivo: MotivoFallo | null;
  /** El estado en una frase, en español. */
  explicacion: string;
  /** Desde cuándo está caída (ISO). Si el API se reinició durante la caída, el más viejo entre la memoria y la tarjeta. */
  desde: string | null;
  ultimaBuena: { en: string; proceso: string; modelo: string } | null;
  ultimoFallo: { en: string; motivo: MotivoFallo; proceso: string; detalle: string } | null;
  fallosSeguidos: number;
  /** Cuántos fallos seguidos abren el corte. */
  umbral: number;
  proximoIntento: string | null;
  sondaEnVuelo: boolean;
  /** La última sonda terminada; `null` si en este proceso todavía no termina ninguna. */
  ultimaSonda: { en: string; ok: boolean; motivo: MotivoFallo | null } | null;
  /** Cuándo arrancó este proceso: las cuentas en memoria cuentan desde aquí y se pierden al reiniciar. */
  procesoDesde: string;
  /** Solo el anfitrión de `CLAUDE_BASE_URL` (`puerta-ia:8080`); `null` si no hay o no se pudo leer. */
  puerta: string | null;
  hoy: {
    /** Día de México de las cuentas. */
    dia: string;
    porProceso: Array<{ proceso: string; llamadas: number; buenas: number; fallosSinCosto: number; fallosOtros: number }>;
    cupo: { tope: number; usadas: number };
  };
  senales: {
    /** Actividades asignadas por día de México (últimos 8 días) y cuántas llevan la complejidad que sugirió la IA. */
    complejidadPorDia: Array<{ dia: string; total: number; conSugerencia: number; porcentaje: number | null }> | null;
    pendientesPorCaida: {
      /** Grabaciones de reunión en ERROR cuyo error menciona la IA. */
      reunionesConError: number;
      /** Usos de vehículo cuyo análisis de daños quedó sin IA o con error. */
      usosDeVehiculoSinIa: number;
    } | null;
    /** La última actividad que sí recibió sugerencia de la IA (solo número y fecha; ni títulos ni contenido). */
    ultimaSenalEnBase: { actividadId: number; fechaAsignacion: string } | null;
  };
  /** Señales de la base que no se pudieron leer (la respuesta sale sin ellas). */
  sinDatos: string[];
};

/** Cuánto atrás se busca la última tarjeta de la IA (la misma ventana que usa la guardia). */
const VENTANA_TARJETAS_MS = 30 * 24 * 60 * 60 * 1000;
const DIAS_DE_SENAL = 8;

const EXPLICACION_MOTIVO: Record<MotivoFallo, string> = {
  llave_puerta_invalida: 'La puerta de IA rechaza la llave de Anthropic (401).',
  token_nexara_invalido: 'La puerta de IA no reconoce el token de NEXARA (401).',
  proyecto_desactivado: 'La puerta de IA tiene desactivado el proyecto de NEXARA (403).',
  presupuesto_agotado: 'Se acabó el presupuesto mensual de IA de NEXARA en la puerta (429).',
  saturada: 'La puerta o Anthropic estaban saturadas.',
  modelo_no_permitido: 'La puerta no permite el modelo que se pidió.',
  solicitud_grande: 'La solicitud era demasiado grande para la puerta.',
  solicitud_rechazada: 'La puerta rechazó la solicitud.',
  error_servicio: 'La puerta o Anthropic contestaron con un error del servidor.',
  sin_conexion: 'No hubo conexión con la puerta o se agotó el tiempo.',
  desconocido: 'Error no esperado.',
};

/**
 * Qué fallos dicen algo del SERVICIO (la puerta, la llave o Anthropic) y cuáles solo de UNA solicitud: una solicitud muy
 * grande, rechazada o con un modelo no permitido la contestó la puerta, así que no prueban que esté mal. Con `Record`
 * un motivo nuevo no compila hasta decidir de qué lado cae.
 */
const FALLO_DEL_SERVICIO: Record<MotivoFallo, boolean> = {
  llave_puerta_invalida: true,
  token_nexara_invalido: true,
  proyecto_desactivado: true,
  presupuesto_agotado: true,
  saturada: true,
  error_servicio: true,
  sin_conexion: true,
  modelo_no_permitido: false,
  solicitud_grande: false,
  solicitud_rechazada: false,
  desconocido: false,
};

/**
 * El motivo que impide decir «la IA responde», o `null` si no hay. Es lo que cierra el hueco de las caídas que nunca
 * abren el corte (puerta sin conexión, 5xx, tiempo agotado): sin esto, cinco `sin_conexion` seguidos y una sonda
 * fallida daban «La IA responde.». Cuenta si no hubo ninguna llamada buena, o si el fallo (o la sonda fallida) es
 * posterior a la última buena. Un fallo de una sola solicitud no cuenta, pero una sonda fallida sí, sea cual sea el motivo.
 */
function falloSinConfirmar(foto: InstantaneaCompuerta): MotivoFallo | null {
  const ultimaBuena = foto.ultimaBuena?.at ?? Number.NEGATIVE_INFINITY;
  const fallo = foto.ultimoFallo;
  if (fallo && fallo.at > ultimaBuena && FALLO_DEL_SERVICIO[fallo.motivo]) return fallo.motivo;
  const sonda = foto.ultimaSondaResultado;
  if (sonda && !sonda.ok && sonda.at > ultimaBuena) return sonda.motivo ?? 'desconocido';
  return null;
}

/** Solo el anfitrión (y el puerto) de la URL de la puerta: nunca usuario, clave, ruta ni parámetros. */
export function anfitrionDeLaPuerta(base: string | undefined = process.env.CLAUDE_BASE_URL): string | null {
  const texto = (base ?? '').trim();
  if (!texto) return null;
  try {
    return new URL(texto).host || null;
  } catch {
    return null;
  }
}

const iso = (ms: number): string => new Date(ms).toISOString();

/** `::date` de Postgres llega como `Date` a medianoche UTC; en pruebas puede llegar el texto ya hecho. */
function textoDeDia(dia: Date | string): string {
  return (dia instanceof Date ? dia.toISOString() : String(dia)).slice(0, 10);
}

type FilaComplejidad = { dia: Date | string; total: number | bigint; con_sugerencia: number | bigint };

@Injectable()
export class SaludIaService {
  private readonly logger = new Logger('SaludIA');

  constructor(
    private readonly claude: ClaudeService,
    private readonly prisma: PrismaService,
  ) {}

  /** El estado de la IA visto por `companyId` (la empresa del token de quien consulta; sin ella no se responde). */
  async estado(companyId: number | null | undefined): Promise<SaludIa> {
    const empresa = requireCompanyId(companyId);
    const sinDatos: string[] = [];
    const ahora = Date.now();

    const modo = await this.claude.modoIa(CLAVES_IA.COMPUERTA).catch(() => this.claude.compuerta.modo);
    const configurada = this.claude.configurada();
    const foto = this.claude.compuerta.instantanea();
    const cupo = this.claude.cupoDelDia(empresa);
    const cupoAgotado = cupo.usadas >= cupo.tope;

    // «Ok» pide una llamada buena en este proceso y nada peor después: haber visto solo fallos que no abren el corte
    // (puerta sin conexión, 5xx, tiempo agotado) no es señal de que la IA responda.
    const fallo = falloSinConfirmar(foto);
    let estado: EstadoSaludIa;
    if (!configurada) estado = 'sin_configurar';
    else if (modo === 'apagado') estado = 'sin_vigilar';
    else if (foto.estado === 'caida') estado = 'caida';
    else if (fallo != null) estado = 'con_fallos';
    else estado = foto.ultimaBuena == null ? 'sondeando' : 'ok';

    // Solo hace falta la tarjeta cuando hay caída o no se sabe nada: con la IA respondiendo, una tarjeta vieja sin
    // «volvió» es asunto de la guardia (que la cierra), no un dato del estado de hoy.
    const buscarTarjeta = estado === 'caida' || estado === 'sondeando';

    const [tarjeta, complejidad, pendientes, ultimaSenal] = await Promise.all([
      buscarTarjeta ? this.intentar('tarjeta_caida', sinDatos, () => this.caidaSinCerrar()) : Promise.resolve(null),
      this.intentar('complejidad_por_dia', sinDatos, () => this.complejidadPorDia(empresa, ahora)),
      this.intentar('pendientes_por_caida', sinDatos, () => this.pendientesPorCaida(empresa)),
      this.intentar('ultima_senal_en_base', sinDatos, () => this.ultimaSenalEnBase(empresa)),
    ]);

    // Si el API se reinició durante la caída, la memoria solo sabe desde que arrancó: la tarjeta guarda el comienzo.
    let desde = foto.desde;
    if (tarjeta != null) desde = desde == null ? tarjeta : Math.min(desde, tarjeta);

    const porProceso = foto.hoy.filas
      .filter((fila) => fila.companyId === empresa)
      .map((fila) => ({
        proceso: fila.proceso,
        llamadas: fila.llamadas,
        buenas: fila.buenas,
        fallosSinCosto: fila.sinCosto,
        fallosOtros: fila.otros,
      }))
      .sort((a, b) => b.llamadas - a.llamadas || a.proceso.localeCompare(b.proceso));

    return {
      generadoEn: iso(ahora),
      modo,
      configurada,
      disponible: configurada && foto.estado === 'ok' && estado !== 'con_fallos' && !cupoAgotado,
      estado,
      motivo: foto.estado === 'caida' ? foto.motivo : null,
      explicacion: this.explicar(estado, modo, foto, cupoAgotado, fallo),
      desde: desde == null ? null : iso(desde),
      ultimaBuena: foto.ultimaBuena
        ? { en: iso(foto.ultimaBuena.at), proceso: foto.ultimaBuena.proceso, modelo: foto.ultimaBuena.modelo }
        : null,
      ultimoFallo: foto.ultimoFallo
        ? {
            en: iso(foto.ultimoFallo.at),
            motivo: foto.ultimoFallo.motivo,
            proceso: foto.ultimoFallo.proceso,
            detalle: foto.ultimoFallo.detalle,
          }
        : null,
      fallosSeguidos: foto.fallosSeguidos,
      umbral: foto.umbral,
      proximoIntento: foto.proximoIntento == null ? null : iso(foto.proximoIntento),
      sondaEnVuelo: foto.sondaEnVuelo,
      ultimaSonda: foto.ultimaSondaResultado
        ? { en: iso(foto.ultimaSondaResultado.at), ok: foto.ultimaSondaResultado.ok, motivo: foto.ultimaSondaResultado.motivo }
        : null,
      procesoDesde: iso(ahora - Math.round(process.uptime() * 1000)),
      puerta: anfitrionDeLaPuerta(),
      hoy: { dia: foto.hoy.dia, porProceso, cupo: { tope: cupo.tope, usadas: cupo.usadas } },
      senales: {
        complejidadPorDia: complejidad,
        pendientesPorCaida: pendientes,
        ultimaSenalEnBase: ultimaSenal,
      },
      sinDatos,
    };
  }

  private explicar(
    estado: EstadoSaludIa,
    modo: ModoIa,
    foto: InstantaneaCompuerta,
    cupoAgotado: boolean,
    fallo: MotivoFallo | null,
  ): string {
    const fallos = foto.fallosSeguidos > 0 ? ` Van ${foto.fallosSeguidos} de ${foto.umbral} fallos seguidos para abrir el corte.` : '';
    const cupo = cupoAgotado ? ' Esta empresa ya gastó su cupo de IA de hoy.' : '';
    switch (estado) {
      case 'sin_configurar':
        return 'Falta la llave de IA o la dirección de la puerta en el servidor: la IA no se puede llamar.';
      case 'sin_vigilar':
        return 'La compuerta está apagada (ia.compuerta.modo): no se cuenta ni se prueba nada, así que este estado no es confiable.';
      case 'sondeando':
        return 'Este proceso todavía no ha visto una llamada buena de la IA; la primera prueba de la puerta sale unos 45 segundos después de arrancar.';
      case 'con_fallos': {
        const causa = fallo ? EXPLICACION_MOTIVO[fallo] : 'La última llamada falló.';
        const buena = foto.ultimaBuena
          ? 'Desde la última llamada buena no ha salido otra bien.'
          : 'Este proceso todavía no ha visto una llamada buena.';
        return `No se puede confirmar que la IA responda. ${causa} ${buena}${fallos}${cupo}`;
      }
      case 'caida': {
        const causa = foto.motivo ? EXPLICACION_MOTIVO[foto.motivo] : 'La puerta de IA no responde.';
        const regla =
          modo === 'activo'
            ? 'La compuerta está en activo: las llamadas se niegan hasta que una prueba salga bien.'
            : 'La compuerta está en observar: avisa, pero la IA se sigue intentando.';
        return `${causa} ${regla}`;
      }
      case 'ok':
        return `La IA responde.${fallos}${cupo}`;
    }
  }

  /**
   * Una señal de la base que falla no tumba la respuesta: se anota y esa parte sale vacía. Al log va solo el tipo del
   * error, nunca su mensaje (puede traer pedazos de la consulta).
   */
  private async intentar<T>(nombre: string, sinDatos: string[], consulta: () => Promise<T>): Promise<T | null> {
    try {
      return await consulta();
    } catch (error) {
      sinDatos.push(nombre);
      this.logger.warn(`GET /ai/salud: no se pudo leer ${nombre}: ${String((error as Error)?.name ?? 'error')}`);
      return null;
    }
  }

  /**
   * Cuándo se avisó la caída que sigue sin cerrar: la última tarjeta de la IA de la cuenta de desarrollo, si es una
   * «cayó» (no una «volvió»). Es lo que sobrevive a un reinicio del API. No son datos de ninguna empresa (el estado de
   * la puerta es del proceso) y solo se lee el tipo y la fecha; por eso va sin el filtro de empresa, con cada consulta
   * DENTRO de la función del bypass (una consulta de Prisma corre al esperarla).
   */
  private async caidaSinCerrar(): Promise<number | null> {
    const desde = new Date(Date.now() - VENTANA_TARJETAS_MS);
    return withTenantBypassAsync(async () => {
      const ultima = await this.prisma.notification.findFirst({
        where: { category: CATEGORIA_AVISO_IA, user: { email: PLATFORM_DEVELOPER_EMAIL }, createdAt: { gte: desde } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { entityType: true, createdAt: true },
      });
      return ultima?.entityType === ENTIDAD_IA_CAIDA ? ultima.createdAt.getTime() : null;
    });
  }

  /**
   * La señal que mostró la caída del 21 al 28-11: el 92.8 % de las actividades del día llevaba sugerencia de complejidad y
   * bajó a 16.4 %. Es la única forma de ver, sin servidor, que la IA dejó de servir aunque nadie la haya probado. El día
   * es el de México; `fechaAsignacion` es una hora UTC sin zona, de ahí el doble `AT TIME ZONE`.
   */
  private async complejidadPorDia(companyId: number, ahora: number): Promise<NonNullable<SaludIa['senales']['complejidadPorDia']>> {
    const desde = new Date(ahora - DIAS_DE_SENAL * 86_400_000);
    const filas = await this.prisma.$queryRaw<FilaComplejidad[]>(Prisma.sql`
      SELECT ((a."fechaAsignacion" AT TIME ZONE 'UTC') AT TIME ZONE ${WORKDAY_TIMEZONE})::date AS dia,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE a."complejidadSugerida" IS NOT NULL)::int AS con_sugerencia
      FROM "Activity" a
      WHERE a."companyId" = ${companyId}
        AND a."deletedAt" IS NULL
        AND a."fechaAsignacion" >= ${desde}
      GROUP BY 1
      ORDER BY 1 DESC
    `);
    return filas.map((fila) => {
      const total = Number(fila.total);
      const conSugerencia = Number(fila.con_sugerencia);
      return {
        dia: textoDeDia(fila.dia),
        total,
        conSugerencia,
        porcentaje: total > 0 ? Math.round((conSugerencia / total) * 1000) / 10 : null,
      };
    });
  }

  /** Lo que quedó pendiente por la caída y se puede contar sin leer contenido. */
  private async pendientesPorCaida(companyId: number): Promise<NonNullable<SaludIa['senales']['pendientesPorCaida']>> {
    const [reunionesConError, usosDeVehiculoSinIa] = await Promise.all([
      this.prisma.meetingRecording.count({ where: { companyId, estado: 'ERROR', error: { contains: 'IA' } } }),
      this.prisma.vehicleControl.count({ where: { companyId, analisisDanosEstatus: { in: ['SIN_IA', 'ERROR'] } } }),
    ]);
    return { reunionesConError, usosDeVehiculoSinIa };
  }

  /** La última actividad con sugerencia de la IA: solo su número y su fecha. */
  private async ultimaSenalEnBase(companyId: number): Promise<SaludIa['senales']['ultimaSenalEnBase']> {
    const fila = await this.prisma.activity.findFirst({
      where: { companyId, deletedAt: null, complejidadSugerida: { not: null } },
      orderBy: { id: 'desc' },
      select: { id: true, fechaAsignacion: true },
    });
    return fila ? { actividadId: fila.id, fechaAsignacion: fila.fechaAsignacion.toISOString() } : null;
  }
}
