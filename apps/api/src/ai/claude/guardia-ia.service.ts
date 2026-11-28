import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { direccionReal } from '../../common/piloto/destinatarios.js';
import { leerModoPiloto } from '../../common/piloto/interruptor-piloto.js';
import { PLATFORM_DEVELOPER_EMAIL, PLATFORM_OWNER_EMAIL } from '../../common/platform-accounts.js';
import { withTenantBypassAsync } from '../../common/tenant/tenant-context.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CATEGORIA_AVISO_IA,
  CLAVE_AVISO_DIRECCION,
  ENTIDAD_IA_CAIDA,
  ENTIDAD_IA_VOLVIO,
  textoAvisoIa,
  type AudienciaAvisoIa,
} from './aviso-ia.js';
import { ClaudeService } from './claude.service.js';
import type { EventoCompuerta } from './compuerta-ia.js';

/** Cuánto atrás se busca la última tarjeta de la IA de una persona (más viejo que esto cuenta como «no hay»). */
const VENTANA_ULTIMA_TARJETA_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Cuánto tiempo una tarjeta `IA_CAIDA` sin «volvió» posterior sigue tapando OTRA caída. El estado de la compuerta vive en
 * memoria: si el API se reinicia mientras la IA ya volvió (recrear el contenedor ES el arreglo de
 * `token_nexara_invalido`), el proceso nuevo nunca ve la caída ni el regreso y la tarjeta se queda «abierta». Sin este
 * tope esa tarjeta callaba cualquier caída nueva hasta 30 días; con él, pasadas estas horas una caída nueva SÍ avisa
 * (y en una caída larga con reinicios sirve de recordatorio). Solo vale para decidir `CAIDA`: para decidir `VOLVIO`
 * la última caída cuenta dentro de toda la ventana de 30 días (una caída larga que de verdad terminó se avisa).
 */
const CAIDA_VIGENTE_MS = 12 * 60 * 60 * 1000;

/** Cuántas veces se reintenta (una por vuelta) la revisión del arranque si la base falla. */
const INTENTOS_REVISION_ARRANQUE = 5;

type Destino = { userId: number; audiencia: AudienciaAvisoIa };

/**
 * Lo que vigila la IA de NEXARA cuando nadie la está usando.
 *
 * 1) La vuelta de la sonda. Cada minuto le pregunta a `ClaudeService` si toca sondear la puerta (en caída, al llegar
 * su próximo intento; en `ok`, cada 30 min) y, 45 s después de arrancar, hace una primera vuelta para no esperar
 * a que alguien use la IA y enterarse de una llave muerta.
 *
 * Va con `setInterval` y `unref`, NO con `@Cron`: así no depende del catálogo de tareas programadas ni de
 * `ScheduleModule`, y un timer sin referencia nunca retiene el proceso. Corre solo donde corren los crons: no en el
 * contenedor de relevo de un despliegue (`NEXARA_RELEVO=1`) ni en pruebas (`NODE_ENV=test`). En el relevo solo opera el
 * permiso de sonda pasivo de `pedirPaso()`, y es lo esperado.
 *
 * 2) El aviso de «la IA cayó» y «la IA volvió». Se suscribe a los cambios de estado de la compuerta
 * (`compuerta.alCambiar`) y deja UNA tarjeta informativa (categoría `ia-estado`) en el centro de avisos de la cuenta de
 * desarrollo, y la misma a la dirección si el interruptor `ia.aviso_direccion.modo` está `activo` (de fábrica, apagado).
 * La tarjeta no ejecuta nada. Sale también con la compuerta en `observar` (es lo que se quiere: enterarse); con la
 * compuerta `apagada` no hay eventos y por tanto no hay tarjeta. A diferencia de la sonda, la suscripción SÍ vive en el
 * contenedor de relevo: allí también hay peticiones de personas que pueden abrir o cerrar la caída.
 *
 * Una sola tarjeta por episodio, sin candados de base: antes de crear se busca la ÚLTIMA tarjeta `ia-estado` de esa
 * persona. `CAIDA` solo sale si la última NO es una caída sin cerrar (y reciente: ver `CAIDA_VIGENTE_MS`); `VOLVIO` solo
 * si la última ES una caída. Así un reinicio del API, dos contenedores que conviven en un relevo o una caída que se
 * reabre no repiten la tarjeta. (`pg_try_advisory_lock` no sirve con el pool de Prisma: el candado y la consulta caen en
 * conexiones distintas.) Lo que queda sin cubrir: dos contenedores que reciben el MISMO evento en el mismo instante
 * pueden crear una tarjeta cada uno; llegan con la misma `collapseKey`, así que en el teléfono la segunda reemplaza a la
 * primera. Dentro de un mismo proceso los avisos van en fila, uno tras otro: `CAIDA` seguido de `VOLVIO` nunca se
 * atropellan.
 *
 * Un regreso que este proceso no vio. El estado de la compuerta es de memoria: si el API se reinicia (o se recrea el
 * contenedor para arreglar la causa) cuando la IA ya volvió, el proceso nuevo arranca en `ok`, su primera sonda sale
 * bien y la compuerta no emite `VOLVIO` (solo lo emite al salir de una caída que ella misma vio). Para no dejar la
 * tarjeta de la caída abierta, la primera vez que la compuerta ve responder a la IA (`revisarCaidaSinCerrar`), si la
 * última tarjeta de la persona sigue siendo una caída, se manda el «volvió» que faltaba, contado desde la hora de la
 * tarjeta de la caída (es lo más cercano que se sabe: el proceso no vio cuándo empezó).
 *
 * Nunca lanza: una falla aquí se anota y se sigue. Quien dispara el evento es una petición de una persona (con su
 * empresa activa) y no debe enterarse de nada de esto.
 */
@Injectable()
export class GuardiaIaService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('GuardiaIA');
  static readonly VUELTA_MS = 60_000;
  static readonly ARRANQUE_MS = 45_000;

  private reloj?: ReturnType<typeof setInterval>;
  private arranque?: ReturnType<typeof setTimeout>;
  private enCurso = false;
  private dejarDeAvisar?: () => void;
  /** Los avisos pendientes de este proceso, en fila. Nunca queda rechazada. */
  private cola: Promise<void> = Promise.resolve();
  /** ¿Ya se revisó (o se está revisando) si quedó una caída sin cerrar de antes de este arranque? Una vez por proceso. */
  private revisadaCaidaSinCerrar = false;
  private intentosRevision = 0;

  /**
   * `prisma` y `notifications` son opcionales a propósito: sin ellos (pruebas de la sonda sola) la guardia solo sondea y
   * no se suscribe al aviso. En la aplicación los inyecta Nest (`AiModule` importa `NotificationsModule`).
   */
  constructor(
    private readonly claude: ClaudeService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /** ¿Este proceso debe correr la vuelta? (No en pruebas ni en el contenedor de relevo.) */
  static debeCorrer(): boolean {
    return process.env.NODE_ENV !== 'test' && process.env.NEXARA_RELEVO !== '1';
  }

  onModuleInit(): void {
    try {
      if (!this.prisma || !this.notifications || this.dejarDeAvisar) return;
      this.dejarDeAvisar = this.claude.compuerta.alCambiar((evento) => {
        void this.avisarCambio(evento);
      });
    } catch (error) {
      this.logger.warn(`No se pudo suscribir el aviso de la IA: ${String((error as Error)?.message ?? error)}`);
    }
  }

  onApplicationBootstrap(): void {
    try {
      if (!GuardiaIaService.debeCorrer()) return;
      this.arranque = setTimeout(() => void this.vuelta(), GuardiaIaService.ARRANQUE_MS);
      this.arranque.unref?.();
      this.reloj = setInterval(() => void this.vuelta(), GuardiaIaService.VUELTA_MS);
      this.reloj.unref?.();
    } catch (error) {
      this.logger.warn(`No se pudo programar la sonda de la IA: ${String((error as Error)?.message ?? error)}`);
    }
  }

  onModuleDestroy(): void {
    if (this.arranque) clearTimeout(this.arranque);
    if (this.reloj) clearInterval(this.reloj);
    this.arranque = undefined;
    this.reloj = undefined;
    this.dejarDeAvisar?.();
    this.dejarDeAvisar = undefined;
  }

  /** Una vuelta. Si la anterior sigue en curso (una sonda lenta) se salta. Devuelve `true` si mandó una sonda. */
  async vuelta(): Promise<boolean> {
    if (this.enCurso) return false;
    this.enCurso = true;
    try {
      const mando = await this.claude.sondearSiToca();
      this.revisarCaidaSinCerrar();
      return mando;
    } catch (error) {
      this.logger.warn(`La vuelta de la sonda de la IA falló: ${String((error as Error)?.message ?? error)}`);
      return false;
    } finally {
      this.enCurso = false;
    }
  }

  /**
   * Pone el aviso de este cambio de estado en la fila de este proceso. Devuelve la promesa de ESE aviso (siempre se
   * cumple, nunca lanza); la suscripción no la espera, y las pruebas sí.
   */
  avisarCambio(evento: EventoCompuerta): Promise<void> {
    return this.encolar(evento.tipo, () => this.avisar(evento));
  }

  /** Para las pruebas: espera a que terminen todos los avisos que ya están en la fila. Nunca lanza. */
  esperarAvisos(): Promise<void> {
    return this.cola;
  }

  /** Pone `tarea` al final de la fila de este proceso. La promesa que devuelve siempre se cumple: una falla se anota. */
  private encolar(que: string, tarea: () => Promise<void>): Promise<void> {
    const suya = this.cola.then(tarea).catch((error) => {
      this.logger.warn(`No se pudo avisar del estado de la IA (${que}): ${String((error as Error)?.message ?? error)}`);
    });
    this.cola = suya;
    return suya;
  }

  /**
   * Una vez por proceso, cuando la compuerta ya vio responder a la IA (una sonda o una llamada buena) sin haber pasado
   * por una caída: si la última tarjeta de alguien sigue siendo una `IA_CAIDA`, ese regreso se lo perdió este proceso
   * (se reinició mientras la IA volvía) y se manda ahora. No espera a la base: el aviso va en la fila de este proceso,
   * detrás de cualquier `CAIDA` o `VOLVIO` que ya esté pendiente, así que siempre ve su resultado. No lanza.
   * Si el proceso SÍ vio una caída y el regreso, la última tarjeta es el «volvió» y esto no hace nada.
   */
  private revisarCaidaSinCerrar(): void {
    if (this.revisadaCaidaSinCerrar || !this.prisma || !this.notifications) return;
    const foto = this.claude.compuerta.instantanea();
    if (foto.estado !== 'ok' || !foto.ultimaBuena) return;
    this.revisadaCaidaSinCerrar = true;
    void this.encolar('revisión al arrancar', () => this.cerrarCaidasSinCerrar());
  }

  private async cerrarCaidasSinCerrar(): Promise<void> {
    const { prisma, notifications } = this;
    if (!prisma || !notifications) return;
    let completo = true;
    try {
      await withTenantBypassAsync(async () => {
        const destinos = await this.destinos(prisma);
        const ahora = Date.now();
        for (const destino of destinos) {
          try {
            await this.avisarA(prisma, notifications, destino, { tipo: 'VOLVIO', desde: ahora, hasta: ahora }, true);
          } catch (error) {
            completo = false;
            this.logger.warn(
              `No se pudo revisar la última tarjeta de la IA de ${destino.audiencia}: ${String((error as Error)?.message ?? error)}`,
            );
          }
        }
      });
    } catch (error) {
      completo = false;
      this.logger.warn(`No se pudo revisar si quedó una caída de la IA sin cerrar: ${String((error as Error)?.message ?? error)}`);
    }
    // Si la base falló, se vuelve a intentar en la vuelta siguiente (unas pocas veces; después queda el tope de horas).
    if (!completo && ++this.intentosRevision < INTENTOS_REVISION_ARRANQUE) this.revisadaCaidaSinCerrar = false;
  }

  private async avisar(evento: EventoCompuerta): Promise<void> {
    const { prisma, notifications } = this;
    if (!prisma || !notifications) return;
    // El evento nace dentro de la petición de quien llamó a la IA, con SU empresa activa en el contexto: sin esto, la
    // búsqueda de la cuenta y la tarjeta quedarían amarradas a esa empresa. Cada `await` va DENTRO de la función: una
    // consulta de Prisma corre al esperarla, y si se esperara afuera ya no tendría el bypass.
    await withTenantBypassAsync(async () => {
      const destinos = await this.destinos(prisma);
      for (const destino of destinos) {
        try {
          await this.avisarA(prisma, notifications, destino, evento);
        } catch (error) {
          this.logger.warn(
            `No se pudo avisar a ${destino.audiencia} del estado de la IA (${evento.tipo}): ${String((error as Error)?.message ?? error)}`,
          );
        }
      }
    });
  }

  /** A quién le toca la tarjeta: siempre la cuenta de desarrollo; la dirección solo con su interruptor en `activo`. */
  private async destinos(prisma: PrismaService): Promise<Destino[]> {
    const destinos: Destino[] = [];
    const desarrollo = await prisma.user.findFirst({
      where: { email: PLATFORM_DEVELOPER_EMAIL, isActive: true },
      select: { id: true },
    });
    if (desarrollo) destinos.push({ userId: desarrollo.id, audiencia: 'desarrollo' });
    else this.logger.warn(`Sin cuenta activa ${PLATFORM_DEVELOPER_EMAIL}: no se avisó a desarrollo del estado de la IA`);

    const modo = await leerModoPiloto(prisma, CLAVE_AVISO_DIRECCION, 'apagado');
    if (modo === 'apagado') return destinos;
    const direccion = await this.direccion(prisma);
    if (modo === 'observar') {
      this.logger.log(`Aviso de la IA a dirección en modo observar: le llegaría a ${direccion.length} persona(s); no se mandó`);
      return destinos;
    }
    for (const persona of direccion) {
      if (!destinos.some((d) => d.userId === persona.id)) destinos.push({ userId: persona.id, audiencia: 'direccion' });
    }
    return destinos;
  }

  /**
   * CEO y directores reales de la empresa del dueño de la plataforma (su empresa predeterminada). La empresa se saca de
   * ahí porque el evento es del proceso, no de una empresa, y `direccionReal` exige una explícita. Sin dueño o sin
   * empresa: nadie.
   */
  private async direccion(prisma: PrismaService) {
    const dueno = await prisma.user.findFirst({
      where: { email: PLATFORM_OWNER_EMAIL, isActive: true },
      select: {
        companyMemberships: { select: { companyId: true }, orderBy: [{ isDefault: 'desc' }, { id: 'asc' }], take: 1 },
      },
    });
    const companyId = dueno?.companyMemberships?.[0]?.companyId;
    if (companyId == null) return [];
    return direccionReal(prisma, companyId);
  }

  /**
   * Crea la tarjeta de `destino` si le toca. Devuelve `true` si la creó.
   * `regresoNoVisto`: el `VOLVIO` no lo vio la compuerta de este proceso (revisión del arranque), así que no trae desde
   * cuándo estuvo caída; se cuenta desde la hora de la tarjeta de la caída.
   */
  private async avisarA(
    prisma: PrismaService,
    notifications: NotificationsService,
    destino: Destino,
    evento: EventoCompuerta,
    regresoNoVisto = false,
  ): Promise<boolean> {
    const ahora = Date.now();
    const ultima = await prisma.notification.findFirst({
      where: {
        userId: destino.userId,
        category: CATEGORIA_AVISO_IA,
        createdAt: { gte: new Date(ahora - VENTANA_ULTIMA_TARJETA_MS) },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { entityType: true, createdAt: true },
    });
    const caidaSinCerrar = ultima?.entityType === ENTIDAD_IA_CAIDA ? ultima : null;
    if (evento.tipo === 'CAIDA') {
      // No repetir la caída que ya se avisó, mientras esa tarjeta sea reciente. Si es vieja, el cierre se perdió (el
      // proceso se reinició cuando la IA volvía): esta caída es otra, y avisa.
      if (caidaSinCerrar && ahora - caidaSinCerrar.createdAt.getTime() < CAIDA_VIGENTE_MS) return false;
    } else if (!caidaSinCerrar) {
      return false; // Regreso: solo si antes se avisó una caída (de cualquier edad dentro de la ventana de 30 días).
    }

    const aviso: EventoCompuerta =
      regresoNoVisto && evento.tipo === 'VOLVIO' && caidaSinCerrar ? { ...evento, desde: caidaSinCerrar.createdAt.getTime() } : evento;
    const texto = textoAvisoIa(aviso, destino.audiencia);
    const creada = await notifications.createNotification({
      userId: destino.userId,
      // Sin tipo propio (exigiría migrar el enum): igual que `aviso-recortes`; la categoría lo distingue.
      type: 'WORKFLOW_PENDING',
      category: CATEGORIA_AVISO_IA,
      entityType: evento.tipo === 'CAIDA' ? ENTIDAD_IA_CAIDA : ENTIDAD_IA_VOLVIO,
      title: texto.title,
      message: texto.message,
      priority: texto.priority,
      relatedUrl: '/erp/notifications-center',
      // La misma llave en la caída y en el regreso: en el teléfono el aviso de «volvió» reemplaza al de «cayó».
      collapseKey: `nx_ia_estado_u${destino.userId}`,
      entrega: 'siempre',
      dedupeSeconds: 0,
    });
    if (!creada) return false;
    this.logger.log(`Aviso de la IA enviado (${evento.tipo}) a ${destino.audiencia}`);
    return true;
  }
}
