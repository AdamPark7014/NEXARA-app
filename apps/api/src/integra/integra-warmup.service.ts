import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { runScheduledJob } from '../common/cron/run-scheduled-job';
import { enteroDeEntorno, interruptorEncendido } from './integra-automatizacion.env';
import { IntegraDetectionService } from './integra-detection.service';
import { IntegraMediaService, nombreStreamMuro } from './integra-media.service';

/**
 * Lo que la consola hacía esperando a que alguien pulsara un botón.
 *
 * ## Precalentado de streams (`precalentar`)
 *
 * Hasta ahora una cámara solo existía en go2rtc cuando alguien abría ESA
 * cámara: el primer mosaico del muro pagaba el PUT de registro y, encima, el
 * saludo RTSP —medido en 0,7–2,5 s con 85 ms de RTT—. Con los streams ya
 * registrados, entrar en el muro es pedir un HLS que go2rtc ya sabe servir.
 *
 * **Registrar en go2rtc NO abre una sesión RTSP.** Está en su documentación:
 * «By default, go2rtc establishes a connection to the source when any client
 * requests it. Go2rtc drops the connection to the source when it has no
 * clients left» (go2rtc, sección *Preload stream*; por eso «preload» existe
 * como opción aparte, que aquí NO se usa). Registrar escribe la definición del
 * stream y nada más: el saludo RTSP lo dispara el primer consumidor. Si no
 * fuera así, precalentar diecisiete cámaras abriría diecisiete sesiones contra
 * un NVR que las cuenta, y sería peor que el problema que resuelve.
 *
 * Consecuencias de eso, que gobiernan el diseño de aquí abajo:
 *
 * - Se registra SOLO el secundario y mudo (`cam_<slug>`), que es el que pide el
 *   muro. Nada de `ffmpeg:` —eso sí arranca un proceso— ni de `_hd`.
 * - Primero se pregunta a go2rtc qué tiene ya, y solo se registra lo que falta.
 *   En régimen estacionario la vuelta es UN GET y cero escrituras, que importa
 *   porque go2rtc reescribe su YAML en cada PUT.
 * - Los registros van **escalonados**, uno detrás de otro con su pausa. Ni un
 *   abanico de diecisiete PUT ni diecisiete resoluciones de sitio a la vez.
 *
 * Esa misma vuelta es la que corrige la **deriva base ↔ go2rtc**: una cámara
 * que está en el espejo y no en go2rtc se registra sola. Es lo que un día dejó
 * el muro con dieciséis de diecisiete y nadie se enteró hasta mirar a mano.
 *
 * ## Sondeo de capacidades (`sondearCapacidadesPendientes`)
 *
 * `GET /ISAPI/Smart/capabilities` es una LECTURA por equipo, y nunca se había
 * corrido contra el parque porque estaba detrás de un botón. Aquí se sondea una
 * vez al día, escalonado, y **solo las cámaras que no tienen fila**: la fila se
 * guarda incluso cuando el equipo contesta 403, así que reintentar cada día lo
 * que ya se sabe que no contesta sería aporrear el parque para nada.
 *
 * ## Interruptores (todos encendidos por defecto)
 *
 * | Variable | Qué apaga | Defecto |
 * |---|---|---|
 * | `INTEGRA_WARMUP_ENABLED=0` | precalentado y deriva | encendido |
 * | `INTEGRA_WARMUP_STAGGER_MS` | pausa entre registros | 400 ms |
 * | `INTEGRA_WARMUP_MAX_POR_VUELTA` | tope de registros por vuelta | 40 |
 * | `INTEGRA_WARMUP_BOOT_DELAY_MS` | espera tras arrancar la API | 20 000 ms |
 * | `INTEGRA_CAPABILITIES_PROBE_ENABLED=0` | sondeo automático | encendido |
 * | `INTEGRA_CAPABILITIES_STAGGER_MS` | pausa entre sondeos | 1 500 ms |
 * | `INTEGRA_CAPABILITIES_MAX_POR_VUELTA` | tope de sondeos por vuelta | 25 |
 */

/** Cada 10 min. Barato: un GET a go2rtc y, si no hay deriva, nada más. */
const CRON_PRECALENTADO = '*/10 * * * *';
/** Una vez al día, de madrugada. Es una lectura por equipo del cliente. */
const CRON_CAPACIDADES = '41 3 * * *';

const ESCALON_PRECALENTADO_MS = 400;
const ESCALON_CAPACIDADES_MS = 1_500;
const MAX_PRECALENTADAS_POR_VUELTA = 40;
const MAX_SONDEOS_POR_VUELTA = 25;
const RETRASO_ARRANQUE_MS = 20_000;

/** Por qué una vuelta no llegó a hacer nada. */
export type RazonNoEjecutado = 'apagado' | 'ya-en-curso' | 'go2rtc-no-disponible';

export type ResumenPrecalentado = {
  ejecutado: boolean;
  razon: RazonNoEjecutado | null;
  /** Sitios ISAPI activos mirados en esta vuelta. */
  sitios: number;
  /** Cámaras que ya estaban registradas en go2rtc: ni se tocan. */
  yaCalientes: number;
  /** Cámaras del espejo que go2rtc no conocía y se acaban de registrar. */
  registradas: number;
  /** Cámaras que se intentaron registrar y no salieron. */
  fallos: number;
  /** Se llegó al tope de la vuelta: quedan cámaras para la siguiente. */
  truncado: boolean;
};

export type ResumenCapacidades = {
  ejecutado: boolean;
  razon: RazonNoEjecutado | null;
  sitios: number;
  /** Cámaras sin fila de capacidades que se sondearon en esta vuelta. */
  sondeadas: number;
  /** De esas, cuántas contestaron. */
  ok: number;
  truncado: boolean;
};

@Injectable()
export class IntegraWarmupService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(IntegraWarmupService.name);

  /**
   * Guardias de reentrada. Una vuelta que tarda más que su intervalo NO debe
   * solaparse consigo misma: serían dos series de registros contra el mismo
   * go2rtc y, en el sondeo, dos lecturas simultáneas al mismo equipo.
   */
  private precalentando = false;
  private sondeando = false;

  /** El disparo de arranque, para poder cancelarlo si el módulo se cae antes. */
  private arranque: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: IntegraMediaService,
    private readonly detection: IntegraDetectionService,
    private readonly config: ConfigService,
  ) {}

  /* ── Ciclo de vida ────────────────────────────────────────────────── */

  /**
   * Precalentado nada más arrancar, pero no en el mismo instante.
   *
   * Al levantar el contenedor, go2rtc puede tardar en estar listo y la API
   * todavía está atendiendo su propio arranque. Veinte segundos después no le
   * quita el sitio a nadie y sigue siendo mucho antes de que llegue el primer
   * operador.
   */
  onApplicationBootstrap(): void {
    if (!this.precalentadoEncendido()) {
      this.logger.log('Precalentado de streams APAGADO por INTEGRA_WARMUP_ENABLED');
      return;
    }
    const espera = enteroDeEntorno(
      this.config.get<string>('INTEGRA_WARMUP_BOOT_DELAY_MS'),
      RETRASO_ARRANQUE_MS,
      0,
      600_000,
    );
    this.arranque = setTimeout(() => {
      void runScheduledJob('integra-precalentado-arranque', this.logger, () => this.precalentar());
    }, espera);
    // Que un temporizador de arranque no sea lo que mantiene vivo el proceso.
    this.arranque.unref?.();
  }

  onModuleDestroy(): void {
    if (this.arranque) clearTimeout(this.arranque);
    this.arranque = null;
  }

  /* ── Precalentado y deriva ────────────────────────────────────────── */

  @Cron(CRON_PRECALENTADO, { name: 'integra-precalentado-streams' })
  async cronPrecalentar(): Promise<void> {
    await runScheduledJob('integra-precalentado-streams', this.logger, () => this.precalentar());
  }

  /**
   * Registra en go2rtc los streams del espejo que aún no estén.
   *
   * Devuelve el resumen en vez de lanzar: quien la llama es un cron, y un cron
   * que revienta no dice qué dejó a medias.
   */
  async precalentar(): Promise<ResumenPrecalentado> {
    const vacio: ResumenPrecalentado = {
      ejecutado: false,
      razon: null,
      sitios: 0,
      yaCalientes: 0,
      registradas: 0,
      fallos: 0,
      truncado: false,
    };

    if (!this.precalentadoEncendido()) return { ...vacio, razon: 'apagado' };
    if (this.precalentando) {
      this.logger.warn('Precalentado: la vuelta anterior sigue en curso, esta se salta');
      return { ...vacio, razon: 'ya-en-curso' };
    }

    this.precalentando = true;
    try {
      // Si no se sabe qué hay registrado, no se registra a ciegas: con go2rtc
      // caído serían N escrituras contra nada y N pausas para nada.
      const registrados = await this.media.streamsRegistrados();
      if (!registrados) {
        this.logger.warn('Precalentado: go2rtc no contesta o no está configurado');
        return { ...vacio, razon: 'go2rtc-no-disponible' };
      }

      const escalon = this.escalonPrecalentado();
      const tope = enteroDeEntorno(
        this.config.get<string>('INTEGRA_WARMUP_MAX_POR_VUELTA'),
        MAX_PRECALENTADAS_POR_VUELTA,
        1,
        500,
      );

      const sitios = await this.sitiosIsapiActivos();
      const resumen: ResumenPrecalentado = { ...vacio, ejecutado: true, sitios: sitios.length };

      for (const sitio of sitios) {
        const camaras = await this.prisma.integraCamera.findMany({
          where: { siteId: sitio.id },
          select: { cameraIndexCode: true, name: true },
          orderBy: { cameraIndexCode: 'asc' },
        });

        for (const camara of camaras) {
          if (registrados.has(nombreStreamMuro(camara.cameraIndexCode))) {
            resumen.yaCalientes += 1;
            continue;
          }
          if (resumen.registradas + resumen.fallos >= tope) {
            resumen.truncado = true;
            break;
          }

          try {
            // Mismo camino que el muro: secundario y mudo. Reutiliza `publish()`
            // para que el nombre del stream sea exactamente el que se pedirá.
            const salida = await this.media.liveStream(
              sitio.companyId,
              camara.cameraIndexCode,
              sitio.id,
              { audio: false, quality: 'sub' },
            );
            if (salida.hls) {
              resumen.registradas += 1;
            } else {
              resumen.fallos += 1;
              this.logger.warn(
                `Precalentado: ${camara.cameraIndexCode} sin HLS — ${salida.note ?? 'sin nota'}`,
              );
            }
          } catch (e) {
            resumen.fallos += 1;
            this.logger.warn(
              `Precalentado: ${camara.cameraIndexCode} falló — ` +
                (e instanceof Error ? e.message : String(e)),
            );
          }

          // Escalonado: los PUT van de uno en uno, con su pausa. Una cámara ya
          // caliente no gasta pausa porque no ha tocado nada.
          await this.dormir(escalon);
        }

        if (resumen.truncado) break;
      }

      if (resumen.registradas > 0 || resumen.fallos > 0) {
        this.logger.log(
          `Precalentado: ${resumen.registradas} registradas · ${resumen.yaCalientes} ya calientes · ` +
            `${resumen.fallos} fallos${resumen.truncado ? ' · truncado por el tope' : ''}`,
        );
      }
      return resumen;
    } finally {
      this.precalentando = false;
    }
  }

  /* ── Sondeo de capacidades ────────────────────────────────────────── */

  @Cron(CRON_CAPACIDADES, { name: 'integra-sondeo-capacidades' })
  async cronSondearCapacidades(): Promise<void> {
    await runScheduledJob('integra-sondeo-capacidades', this.logger, () =>
      this.sondearCapacidadesPendientes(),
    );
  }

  /**
   * Sondea las cámaras que NUNCA se han sondeado, y solo esas.
   *
   * `integra_camera_capabilities` guarda fila incluso cuando el equipo no
   * contesta (`probeOk=false`), porque «esta cámara responde 403» también es un
   * dato. Por eso «pendiente» aquí es **no tener fila**: reintentar a diario lo
   * que ya se sabe que no contesta sería aporrear equipos de un cliente sin
   * aprender nada nuevo.
   */
  async sondearCapacidadesPendientes(): Promise<ResumenCapacidades> {
    const vacio: ResumenCapacidades = {
      ejecutado: false,
      razon: null,
      sitios: 0,
      sondeadas: 0,
      ok: 0,
      truncado: false,
    };

    if (!interruptorEncendido(this.config.get<string>('INTEGRA_CAPABILITIES_PROBE_ENABLED'))) {
      return { ...vacio, razon: 'apagado' };
    }
    if (this.sondeando) {
      this.logger.warn('Sondeo de capacidades: la vuelta anterior sigue en curso, esta se salta');
      return { ...vacio, razon: 'ya-en-curso' };
    }

    this.sondeando = true;
    try {
      const escalon = enteroDeEntorno(
        this.config.get<string>('INTEGRA_CAPABILITIES_STAGGER_MS'),
        ESCALON_CAPACIDADES_MS,
        0,
        60_000,
      );
      const tope = enteroDeEntorno(
        this.config.get<string>('INTEGRA_CAPABILITIES_MAX_POR_VUELTA'),
        MAX_SONDEOS_POR_VUELTA,
        1,
        200,
      );

      const sitios = await this.sitiosIsapiActivos();
      const resumen: ResumenCapacidades = { ...vacio, ejecutado: true, sitios: sitios.length };

      for (const sitio of sitios) {
        const [camaras, sondeadas] = await Promise.all([
          this.prisma.integraCamera.findMany({
            where: { siteId: sitio.id },
            select: { cameraIndexCode: true },
            orderBy: { cameraIndexCode: 'asc' },
          }),
          this.prisma.integraCameraCapability.findMany({
            where: { siteId: sitio.id },
            select: { cameraId: true },
          }),
        ]);
        const yaSondeadas = new Set(sondeadas.map((c) => c.cameraId));

        for (const camara of camaras) {
          if (yaSondeadas.has(camara.cameraIndexCode)) continue;
          if (resumen.sondeadas >= tope) {
            resumen.truncado = true;
            break;
          }

          resumen.sondeadas += 1;
          try {
            const dto = await this.detection.probeCapabilities(
              sitio.companyId,
              camara.cameraIndexCode,
              sitio.id,
            );
            if (dto.probeOk) resumen.ok += 1;
          } catch (e) {
            // El sondeo guarda fila incluso al fallar; si ni eso pudo, se anota
            // y se sigue. Una cámara muda no puede cortar la vuelta.
            this.logger.warn(
              `Capacidades: ${camara.cameraIndexCode} — ` +
                (e instanceof Error ? e.message : String(e)),
            );
          }
          await this.dormir(escalon);
        }

        if (resumen.truncado) break;
      }

      if (resumen.sondeadas > 0) {
        this.logger.log(
          `Capacidades: ${resumen.sondeadas} sondeadas · ${resumen.ok} contestaron` +
            `${resumen.truncado ? ' · truncado por el tope' : ''}`,
        );
      }
      return resumen;
    } finally {
      this.sondeando = false;
    }
  }

  /* ── Interior ─────────────────────────────────────────────────────── */

  private precalentadoEncendido(): boolean {
    return interruptorEncendido(this.config.get<string>('INTEGRA_WARMUP_ENABLED'));
  }

  private escalonPrecalentado(): number {
    return enteroDeEntorno(
      this.config.get<string>('INTEGRA_WARMUP_STAGGER_MS'),
      ESCALON_PRECALENTADO_MS,
      0,
      30_000,
    );
  }

  /**
   * Sitios que de verdad tienen streams que precalentar.
   *
   * HCT sirve el video por token de nube y no pasa por go2rtc (ADR-0019), y
   * ARTEMIS resuelve el RTSP pidiéndoselo a la plataforma en cada petición: ni
   * uno ni otro se precalienta desde el espejo.
   */
  private sitiosIsapiActivos(): Promise<Array<{ id: number; companyId: number }>> {
    return this.prisma.integraSite.findMany({
      where: { isActive: true, provider: 'ISAPI' },
      select: { id: true, companyId: true },
      orderBy: { id: 'asc' },
    });
  }

  /** La pausa del escalonado. Método para poder observarla desde las pruebas. */
  private dormir(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      t.unref?.();
    });
  }
}
