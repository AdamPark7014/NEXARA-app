import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { isNonEmployeeEmail } from '../../common/platform-accounts.js';
import { workDateColumn, workDateKey } from '../../common/time/workday.js';
import { OPEN_ACTIVITY_WHERE } from '../../activities/activity-status.js';
import { isChainTopAuthority } from '../../activities/activity-superiors.js';
import { ChatService } from '../../chat/chat.service.js';
import { LigasService, type ActorLiga } from '../../chat/ligas/ligas.service.js';
import { rutaDeLiga } from '../../chat/ligas/ligas.js';
import { ClaudeService } from '../claude/claude.service.js';
import { AsistenteActividadesService } from '../asistente/asistente-actividades.service.js';
import { TEMAS_AYUDA } from './ayuda-core.js';
import { detectarIntencion, type CuandoPendientes, type Intencion } from './intenciones.js';
import { limpiarSalida, peticionAsistenteChat, type SalidaAsistenteChat } from './asistente-chat-ia.js';
import { preguntaLimpia } from './texto.js';

export type PropuestaChat = {
  resumen: string;
  titulo: string;
  responsable: string | null;
  cuando: string | null;
  faltantes: string[];
  avisos: string[];
  /** Cuerpo listo para `POST /activities` (la web lo manda solo si la persona confirma). */
  payload: Record<string, unknown>;
};

export type RespuestaAsistenteChat = {
  intencion: Intencion['tipo'];
  /** `codigo`: lo contestaron las reglas y la base, sin IA. `ia`: lo contestó Claude. */
  fuente: 'codigo' | 'ia';
  /** Markdown del chat: ligas `[…](/erp/…)` que la web pinta como tarjetas. */
  texto: string;
  /** Preguntas que se pueden mandar con un toque. */
  sugerencias: string[];
  /** «Asígnale a…»: propuestas que la persona confirma antes de crear nada. */
  accion: { tipo: 'crear-actividades'; propuestas: PropuestaChat[] } | null;
};

const SUGERENCIAS_BASE = ['Mis pendientes de hoy', '¿Quién está en jornada?', '¿Cómo subo evidencias?'];

const FUERA_DE_TEMA =
  'Solo te ayudo con NEXARA Core: actividades, asistencia, cotizaciones, clientes, proyectos, viáticos, reuniones y el chat. Pregúntame algo de eso.';

/** Por persona y día: las preguntas abiertas que van a la IA (lo demás no tiene tope). */
const TOPE_IA_POR_PERSONA = 20;

type Actor = ActorLiga & { nombre?: string | null; email?: string | null; roleKey?: string | null };

/**
 * Asistente de NEXARA dentro de #general. Responde solo a quien pregunta (la web lo pinta como
 * «solo tú lo ves»): nada se publica en el canal, así nadie ve datos que su rol no alcanza.
 */
@Injectable()
export class AsistenteChatService {
  private readonly logger = new Logger('AsistenteChat');
  private readonly usoIA = new Map<string, number>();
  private readonly conteo = new Map<string, { codigo: number; ia: number; porIntencion: Record<string, number> }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
    private readonly ligas: LigasService,
    private readonly claude: ClaudeService,
    private readonly asistenteActividades: AsistenteActividadesService,
  ) {}

  /** Cuántas respondió el código y cuántas la IA hoy (para medir que la IA sea la excepción). */
  estado(user: Actor) {
    const dia = workDateKey(new Date());
    const hoy = [...this.conteo.entries()].filter(([k]) => k.endsWith(`:${dia}`)).map(([, v]) => v);
    const total = hoy.reduce(
      (acc, v) => {
        acc.codigo += v.codigo;
        acc.ia += v.ia;
        for (const [k, n] of Object.entries(v.porIntencion)) acc.porIntencion[k] = (acc.porIntencion[k] ?? 0) + n;
        return acc;
      },
      { codigo: 0, ia: 0, porIntencion: {} as Record<string, number> },
    );
    return {
      disponible: true,
      ia: this.claude.disponible(),
      ...(isChainTopAuthority(user) ? { hoy: total } : {}),
    };
  }

  async responder(
    user: Actor,
    companyId: number | null | undefined,
    body: { texto?: unknown; channelId?: unknown },
  ): Promise<RespuestaAsistenteChat> {
    const tenantId = requireCompanyId(companyId);
    await this.asegurarGeneral(Number(body?.channelId), user.id, tenantId);
    const pregunta = preguntaLimpia(String(body?.texto ?? '')).slice(0, 600);
    const intencion = detectarIntencion(pregunta);
    const respuesta = await this.contestar(intencion, pregunta, user, tenantId);
    this.contar(tenantId, respuesta);
    return respuesta;
  }

  /** Solo en #general de su empresa y siendo miembro. */
  private async asegurarGeneral(channelId: number, userId: number, tenantId: number) {
    if (!Number.isInteger(channelId) || channelId <= 0) {
      throw new BadRequestException('El asistente solo responde en #general.');
    }
    const canal = await this.prisma.chatChannel.findFirst({
      where: { id: channelId, companyId: tenantId, slug: 'general', isArchived: false },
      select: { id: true, members: { where: { userId }, select: { userId: true }, take: 1 } },
    });
    if (!canal) throw new BadRequestException('El asistente solo responde en #general.');
    if (!canal.members.length) throw new BadRequestException('No eres miembro de #general.');
  }

  private contar(tenantId: number, r: RespuestaAsistenteChat) {
    const clave = `${tenantId}:${workDateKey(new Date())}`;
    const c = this.conteo.get(clave) ?? { codigo: 0, ia: 0, porIntencion: {} };
    c[r.fuente] += 1;
    c.porIntencion[r.intencion] = (c.porIntencion[r.intencion] ?? 0) + 1;
    this.conteo.set(clave, c);
    for (const k of this.conteo.keys()) if (!k.endsWith(`:${workDateKey(new Date())}`)) this.conteo.delete(k);
  }

  private async contestar(
    intencion: Intencion,
    pregunta: string,
    user: Actor,
    tenantId: number,
  ): Promise<RespuestaAsistenteChat> {
    const de = (texto: string, sugerencias = SUGERENCIAS_BASE): RespuestaAsistenteChat => ({
      intencion: intencion.tipo,
      fuente: 'codigo',
      texto,
      sugerencias,
      accion: null,
    });
    switch (intencion.tipo) {
      case 'saludo':
        return de(`¡Hola${user.nombre ? `, ${user.nombre.split(' ')[0]}` : ''}! ¿En qué te ayudo con NEXARA?`);
      case 'gracias':
        return de('¡Con gusto! Aquí sigo si necesitas algo más.', []);
      case 'capacidades':
        return de(
          [
            'Te ayudo con NEXARA Core aquí mismo (solo tú ves mis respuestas):',
            '• Tus pendientes de hoy, de mañana o los vencidos.',
            '• Quién está en jornada o quién no ha checado (si tienes equipo).',
            '• Tu asistencia de hoy.',
            '• El estado de una actividad o cotización: escribe su folio (AN-0351, NEX-…).',
            '• Cómo hacer algo o dónde está: «¿cómo pido viáticos?», «¿dónde veo mis retardos?».',
            ...(isChainTopAuthority(user) ? ['• Asignar trabajo: «asígnale a Raúl revisar las cámaras mañana a las 10» (te pido confirmación).'] : []),
          ].join('\n'),
        );
      case 'fuera-de-tema':
        return de(FUERA_DE_TEMA);
      case 'ayuda': {
        const tema = TEMAS_AYUDA.find((t) => t.id === intencion.temaId)!;
        return de(`${tema.respuesta}\n[Abrir ${tema.titulo}](${tema.ruta})`, []);
      }
      case 'pendientes':
        return de(await this.pendientes(user, tenantId, intencion.cuando));
      case 'jornada':
        return de(await this.jornada(user, tenantId, intencion.ver), ['Mis pendientes de hoy', '¿Quién no ha checado?']);
      case 'mi-asistencia':
        return de(await this.miAsistencia(user, tenantId), ['Mis pendientes de hoy']);
      case 'folios':
        return de(await this.folios(user, tenantId, intencion.folios), []);
      case 'asignar':
        return this.asignar(pregunta, user, tenantId);
      case 'ia':
      default:
        return this.conIA(pregunta, user, tenantId);
    }
  }

  // ─────────────────────────── consultas (sin IA) ───────────────────────────

  private async pendientes(user: Actor, tenantId: number, cuando: CuandoPendientes): Promise<string> {
    const filas = await this.prisma.activityAssignee.findMany({
      where: { userId: user.id, retiradoAt: null, companyId: tenantId, activity: { ...OPEN_ACTIVITY_WHERE, companyId: tenantId } },
      select: {
        activity: {
          select: { id: true, anNumber: true, titulo: true, estatus: true, fechaMaxima: true, fechaEntregaEsperada: true },
        },
      },
      take: 200,
    });
    const ahora = new Date();
    const hoy = workDateKey(ahora);
    const manana = workDateKey(new Date(ahora.getTime() + 24 * 3600 * 1000));
    const unicas = [...new Map(filas.map((f) => [f.activity.id, f.activity])).values()];
    const conLimite = unicas.map((a) => {
      const limite = a.fechaMaxima ?? a.fechaEntregaEsperada ?? null;
      return { ...a, limite, dia: limite ? workDateKey(limite) : null };
    });
    const enRevision = (e: string) => /valid|revis/i.test(e);
    const elegidas = conLimite
      .filter((a) => {
        if (cuando === 'hoy') return a.dia === hoy;
        if (cuando === 'manana') return a.dia === manana;
        if (cuando === 'vencidas') return Boolean(a.limite && a.limite < ahora && !enRevision(a.estatus));
        return true;
      })
      .sort((a, b) => (a.limite?.getTime() ?? Infinity) - (b.limite?.getTime() ?? Infinity));

    const que = { hoy: 'para hoy', manana: 'para mañana', vencidas: 'vencidas', todas: 'abiertas' }[cuando];
    if (!elegidas.length) {
      const extra = isChainTopAuthority(user)
        ? '\nTu bandeja como CEO es lo que espera revisión: [En espera de revisión](/erp/pizarra?vista=revision)'
        : '\n[Abrir Mis actividades](/erp/pizarra?vista=mias)';
      return `No tienes actividades ${que} a tu nombre.${extra}`;
    }
    const hora = (d: Date) =>
      d.toLocaleString('es-MX', {
        timeZone: 'America/Mexico_City',
        ...(workDateKey(d) === hoy ? {} : { day: 'numeric', month: 'short' }),
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    const lineas = elegidas.slice(0, 8).map((a) => {
      const limite = a.limite ? ` — ${a.limite < ahora && !enRevision(a.estatus) ? 'venció' : 'límite'} ${hora(a.limite)}` : '';
      return `• [${a.anNumber} · ${a.titulo}](${rutaDeLiga.actividad(a.id)}) · ${a.estatus}${limite}`;
    });
    const resto = elegidas.length > 8 ? `\n…y ${elegidas.length - 8} más.` : '';
    return `Tienes ${elegidas.length} ${elegidas.length === 1 ? 'actividad' : 'actividades'} ${que}:\n${lineas.join('\n')}${resto}\n[Abrir Mis actividades](/erp/pizarra?vista=mias)`;
  }

  private async jornada(user: Actor, tenantId: number, ver: 'en-jornada' | 'sin-entrada'): Promise<string> {
    const alcance = await this.chat.resolveChatScope(user.id, tenantId);
    const todo = Boolean(user.isSuperAdmin) || alcance.isOmniscient;
    if (!todo && !alcance.reportIds.length) {
      return 'Quién está en jornada lo ven el CEO y los jefes con equipo. Tu propia jornada: escribe «mi asistencia».';
    }
    const hoy = workDateColumn(new Date());
    const personas = await this.prisma.user.findMany({
      where: {
        isActive: true,
        companyMemberships: { some: { companyId: tenantId } },
        ...(todo ? {} : { id: { in: alcance.reportIds } }),
      },
      select: { id: true, nombre: true, email: true },
      orderBy: { nombre: 'asc' },
    });
    const equipo = personas.filter((p) => p.id !== user.id && !isNonEmployeeEmail(p.email) && !isChainTopAuthority(p));
    const checadas = await this.prisma.attendance.findMany({
      where: { companyId: tenantId, workDate: hoy, userId: { in: equipo.map((p) => p.id) } },
      select: { userId: true, type: true, timestamp: true },
    });
    const entrada = new Map<number, Date>();
    const salio = new Set<number>();
    for (const c of checadas) {
      if (c.type === 'entrada') entrada.set(c.userId, c.timestamp);
      if (c.type === 'salida') salio.add(c.userId);
    }
    const hora = (d: Date) =>
      d.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false });
    const enJornada = equipo.filter((p) => entrada.has(p.id) && !salio.has(p.id));
    const sinEntrada = equipo.filter((p) => !entrada.has(p.id));
    const resumen = `${enJornada.length} en jornada · ${equipo.filter((p) => salio.has(p.id)).length} ya salieron · ${sinEntrada.length} sin checar.`;
    const lista =
      ver === 'en-jornada'
        ? enJornada.slice(0, 15).map((p) => `• ${p.nombre} — entró ${hora(entrada.get(p.id)!)}`)
        : sinEntrada.slice(0, 15).map((p) => `• ${p.nombre}`);
    const total = ver === 'en-jornada' ? enJornada.length : sinEntrada.length;
    const titulo = ver === 'en-jornada' ? 'En jornada ahora' : 'Sin checar entrada hoy';
    const resto = total > 15 ? `\n…y ${total - 15} más.` : '';
    return `${resumen}\n${total ? `${titulo}:\n${lista.join('\n')}${resto}` : `${titulo}: nadie.`}\n[Abrir Asistencias](/erp/asistencias)`;
  }

  private async miAsistencia(user: Actor, tenantId: number): Promise<string> {
    const hoy = workDateKey(new Date());
    const ref = rutaDeLiga.asistencia(user.id, hoy);
    const tarjetas = await this.ligas.resolver(user, tenantId, [ref]);
    const t = tarjetas[ref];
    if (!t || !t.acceso) return `No encontré tu asistencia de hoy.\n[Abrir Asistencias](/erp/asistencias)`;
    const detalle = t.detalle.length ? ` ${t.detalle.join(' · ')}.` : '';
    return `Hoy: ${t.estado}.${detalle}\n[Asistencia · ${t.titulo} · ${t.folio}](${ref})`;
  }

  private async folios(user: Actor, tenantId: number, folios: string[]): Promise<string> {
    const refs = folios.map((f) => `folio:${f}`);
    const tarjetas = await this.ligas.resolver(user, tenantId, refs);
    const lineas = refs.map((ref, i) => {
      const t = tarjetas[ref];
      if (!t) return `• ${folios[i]}: no lo encontré.`;
      if (!t.acceso) return `• ${folios[i]}: ${t.motivo === 'Sin acceso' ? 'no tienes acceso a ese registro' : 'no lo encontré'}.`;
      const detalle = t.detalle.length ? ` · ${t.detalle.join(' · ')}` : '';
      const monto = t.monto
        ? ` · ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: t.monto.moneda || 'MXN' }).format(t.monto.total)}`
        : '';
      return `• [${t.folio ?? folios[i]} · ${t.titulo}](${t.href}) — ${t.estado ?? 'sin estado'}${detalle}${monto}`;
    });
    return lineas.join('\n');
  }

  // ─────────────────────────── acciones ───────────────────────────

  /** «Asígnale a…»: reusa el asistente de actividades (el del CEO) y no crea nada sin confirmar. */
  private async asignar(pregunta: string, user: Actor, tenantId: number): Promise<RespuestaAsistenteChat> {
    const base = { intencion: 'asignar' as const, sugerencias: [] as string[] };
    if (!isChainTopAuthority(user)) {
      return {
        ...base,
        fuente: 'codigo',
        texto:
          'Asignar con IA es solo del CEO. Tú puedes asignar desde Actividades › «Mi equipo» (botón «＋ Asignar») o crearte una con «Nueva actividad».\n[Abrir Mi equipo](/erp/pizarra?vista=equipo)',
        accion: null,
      };
    }
    if (!this.claude.disponible()) {
      return { ...base, fuente: 'codigo', texto: 'La IA no está disponible ahora: usa «Asignar» en Mi equipo.', accion: null };
    }
    const r = await this.asistenteActividades.interpretar(pregunta, user, tenantId);
    const fecha = (iso: unknown) =>
      typeof iso === 'string' && iso
        ? new Date(iso).toLocaleString('es-MX', {
            timeZone: 'America/Mexico_City',
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })
        : null;
    const propuestas: PropuestaChat[] = r.propuestas.map((p) => ({
      resumen: p.resumen,
      titulo: p.titulo,
      responsable: p.responsable?.nombre ?? p.textoResponsable ?? null,
      cuando: fecha(p.payload?.fechaInicio) ?? fecha(p.fechaInicio),
      faltantes: p.faltantes ?? [],
      avisos: p.avisos ?? [],
      payload: p.payload,
    }));
    const texto = propuestas.length
      ? `Te propongo ${propuestas.length === 1 ? 'esta actividad' : `estas ${propuestas.length} actividades`}. Revisa y confirma; nada se crea sin tu OK.`
      : (r.aclaracion ?? 'No encontré qué asignar: dime qué hay que hacer y quién.');
    return { ...base, fuente: 'ia', texto, accion: propuestas.length ? { tipo: 'crear-actividades', propuestas } : null };
  }

  // ─────────────────────────── IA (lo que el código no resolvió) ───────────────────────────

  private registrarUsoIA(user: Actor, tenantId: number): boolean {
    const dia = workDateKey(new Date());
    const persona = `${tenantId}:${user.id}:${dia}`;
    const empresa = `${tenantId}:*:${dia}`;
    const topeEmpresa = Math.max(1, Number(process.env.CHAT_ASISTENTE_TOPE_DIARIO) || 150);
    const usadasPersona = this.usoIA.get(persona) ?? 0;
    const usadasEmpresa = this.usoIA.get(empresa) ?? 0;
    if (usadasPersona >= TOPE_IA_POR_PERSONA || usadasEmpresa >= topeEmpresa) return false;
    for (const k of this.usoIA.keys()) if (!k.endsWith(`:${dia}`)) this.usoIA.delete(k);
    this.usoIA.set(persona, usadasPersona + 1);
    this.usoIA.set(empresa, usadasEmpresa + 1);
    return true;
  }

  private async conIA(pregunta: string, user: Actor, tenantId: number): Promise<RespuestaAsistenteChat> {
    const base = { intencion: 'ia' as const, sugerencias: SUGERENCIAS_BASE, accion: null };
    if (!this.claude.disponible()) {
      return { ...base, fuente: 'codigo', texto: 'Esa no la sé contestar sin la IA, y ahora no está disponible. Prueba con «¿qué puedes hacer?».' };
    }
    if (!this.registrarUsoIA(user, tenantId)) {
      return {
        ...base,
        fuente: 'codigo',
        texto:
          'Por hoy se acabaron las preguntas abiertas. Las comunes siguen funcionando: tus pendientes, quién está en jornada, tu asistencia, un folio o «¿cómo hago…?».',
      };
    }
    let salida: SalidaAsistenteChat;
    try {
      const peticion = peticionAsistenteChat(pregunta, user.roleKey ?? null);
      const { datos } = await this.claude.json<SalidaAsistenteChat>({
        ...peticion,
        proceso: 'chat-asistente',
        companyId: tenantId,
        modelo: process.env.CHAT_ASISTENTE_MODELO || peticion.modelo,
      });
      salida = limpiarSalida(datos);
    } catch (e) {
      const motivo = e instanceof ServiceUnavailableException ? e.message : 'La IA no respondió: intenta de nuevo.';
      this.logger.warn(`[chat-asistente] sin respuesta de la IA: ${motivo}`);
      return { ...base, fuente: 'codigo', texto: motivo };
    }
    if (salida.fueraDeTema) return { ...base, fuente: 'ia', intencion: 'ia', texto: FUERA_DE_TEMA };
    const tema = salida.tema ? TEMAS_AYUDA.find((t) => t.id === salida.tema) : null;
    const texto = salida.respuesta || (tema ? tema.respuesta : 'No tengo esa información; pregúntale a tu jefe o a administración.');
    return { ...base, fuente: 'ia', texto: tema ? `${texto}\n[Abrir ${tema.titulo}](${tema.ruta})` : texto, sugerencias: [] };
  }
}
