import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCompanyAccess, companyWhere, requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { generarZip, type EntradaZip } from '../../common/zip-stream.js';
import { ActivityEvidenceFieldsService } from './activity-evidence-fields.service.js';
import {
  etiquetaMomento,
  etiquetaMomentoArchivo,
  limpiarNombreDeArchivo,
  type Momento,
} from './evidence-fields.helpers.js';

/** Dónde viven de verdad los archivos que la API sirve como `/activities/x.jpg`. */
function raicesDeUploads(): string[] {
  const raices: string[] = [];
  const env = process.env.UPLOADS_ROOT?.trim();
  if (env) raices.push(env);
  // Mismo cálculo que `resolveProjectRoot`: la carpeta que contiene `apps/`.
  const segmentos = __dirname.split(path.sep);
  const i = segmentos.lastIndexOf('apps');
  const raizProyecto = i > 0 ? segmentos.slice(0, i).join(path.sep) || path.sep : path.resolve(__dirname, '../../..');
  raices.push(path.join(raizProyecto, 'uploads'));
  // Instalaciones viejas guardaban dentro de apps/api.
  raices.push(path.join(raizProyecto, 'apps', 'api', 'uploads'));
  return raices;
}

const FECHA_MX = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Mexico_City',
});

function fecha(valor: Date | null | undefined): string {
  return valor ? FECHA_MX.format(valor) : '—';
}

function coordenadas(lat: unknown, lng: unknown): string {
  if (lat == null || lng == null) return '—';
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return '—';
  return `${a.toFixed(6)}, ${b.toFixed(6)} (https://maps.google.com/?q=${a},${b})`;
}

const REVISION: Record<string, string> = {
  APPROVED: 'Aprobada',
  REJECTED: 'Devuelta para corregir',
  PENDING: 'Pendiente de revisión',
};

/**
 * «Descargar evidencia»: la actividad completa como carpeta, en un ZIP.
 *
 *   <Proyecto o Cliente>/<AN-0001 Título>/
 *     resumen.txt
 *     entrada.jpg · salida.jpg · hoja-de-servicio.pdf
 *     <Campo>/<Campo> - antes.jpg · <Campo> - despues.jpg
 *     Fotos/                      ← las fotos libres de las actividades viejas
 *
 * Con equipo, la entrada y la salida llevan el nombre de quien las tomó, porque cada
 * persona tiene las suyas; los campos son de la actividad y van una sola vez.
 */
@Injectable()
export class ActivityEvidenceZipService {
  private readonly logger = new Logger(ActivityEvidenceZipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly campos: ActivityEvidenceFieldsService,
  ) {}

  /** Ruta en disco de un `/activities/x.jpg`, o `null` si no se puede ubicar. */
  private rutaEnDisco(url: string | null | undefined): string | null {
    const limpio = (url || '').trim();
    if (!limpio || limpio.startsWith('data:') || /^https?:\/\//i.test(limpio)) return null;

    const relativa = limpio.replace(/^\/+/, '').replace(/^uploads\//, '').split('?')[0];
    if (!relativa || relativa.includes('..')) return null;

    for (const raiz of raicesDeUploads()) {
      const completa = path.resolve(raiz, relativa);
      // Nunca salir de la carpeta de uploads, aunque la URL venga manipulada.
      if (!completa.startsWith(path.resolve(raiz))) continue;
      return completa;
    }
    return null;
  }

  private extension(url: string, porOmision = '.jpg'): string {
    const ext = path.extname((url || '').split('?')[0]);
    return ext && ext.length <= 6 ? ext.toLowerCase() : porOmision;
  }

  /** Nombre del archivo ZIP que ve la persona. */
  nombreDeArchivo(anNumber: string | null, titulo: string | null): string {
    const base = limpiarNombreDeArchivo(`${anNumber || 'actividad'} ${titulo || ''}`.trim(), 'evidencia');
    return `${base}.zip`;
  }

  async datosDeActividad(activityId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, ...companyWhere(tenantId) },
      select: {
        id: true,
        companyId: true,
        anNumber: true,
        titulo: true,
        descripcion: true,
        estatus: true,
        prioridad: true,
        coreKind: true,
        fechaInicio: true,
        fechaFinalizacion: true,
        branchName: true,
        responsable: { select: { id: true, nombre: true } },
        project: { select: { name: true } },
        client: { select: { name: true } },
      },
    });
    assertCompanyAccess(activity, tenantId, 'Actividad');
    return activity!;
  }

  /**
   * Arma el ZIP. Devuelve el generador para mandarlo al navegador por partes: la
   * evidencia de una actividad grande no tiene por qué caber entera en memoria.
   */
  async construir(activityId: number, companyId?: number | null) {
    const activity = await this.datosDeActividad(activityId, companyId);

    const [evidencias, campos] = await Promise.all([
      this.prisma.activityEvidence.findMany({
        where: { activityId, ...companyWhere(activity.companyId) },
        orderBy: { id: 'asc' },
        include: { user: { select: { id: true, nombre: true } } },
      }),
      this.campos.listarCamposDeActividad(activityId, activity.companyId),
    ]);

    const raiz = [
      limpiarNombreDeArchivo(activity.project?.name || activity.client?.name || 'Sin proyecto'),
      limpiarNombreDeArchivo(`${activity.anNumber || ''} ${activity.titulo || ''}`.trim(), 'Actividad'),
    ].join('/');

    const entradas: EntradaZip[] = [];
    const saltadas: string[] = [];

    // Una carpeta por campo, y dentro la foto de cada momento.
    for (const campo of campos) {
      const carpeta = limpiarNombreDeArchivo(campo.nombre);
      for (const momento of campo.momentos) {
        const foto = campo.fotos[momento as Momento];
        if (!foto) continue;
        const disco = this.rutaEnDisco(foto.photoUrl);
        if (!disco) {
          saltadas.push(`${campo.nombre} (${etiquetaMomento(momento as Momento)})`);
          continue;
        }
        entradas.push({
          ruta: `${raiz}/${carpeta}/${carpeta} - ${etiquetaMomentoArchivo(momento as Momento)}${this.extension(foto.photoUrl)}`,
          desdeArchivo: disco,
          modificado: foto.capturedAt ?? undefined,
        });
      }
    }

    const variasPersonas = evidencias.length > 1;
    const sufijo = (nombre: string | null | undefined) =>
      variasPersonas ? ` - ${limpiarNombreDeArchivo(nombre || 'Sin nombre')}` : '';

    for (const ev of evidencias) {
      const quien = ev.user?.nombre ?? null;

      const entrada = this.rutaEnDisco(ev.entryPhotoUrl);
      if (entrada) {
        entradas.push({
          ruta: `${raiz}/entrada${sufijo(quien)}${this.extension(ev.entryPhotoUrl!)}`,
          desdeArchivo: entrada,
          modificado: ev.entryPhotoUploadedAt ?? undefined,
        });
      }

      const salida = this.rutaEnDisco(ev.exitPhotoUrl);
      if (salida) {
        entradas.push({
          ruta: `${raiz}/salida${sufijo(quien)}${this.extension(ev.exitPhotoUrl!)}`,
          desdeArchivo: salida,
          modificado: ev.exitPhotoUploadedAt ?? undefined,
        });
      }

      const hoja = this.rutaEnDisco(ev.serviceSheetPdfUrl);
      if (hoja) {
        entradas.push({
          ruta: `${raiz}/hoja-de-servicio${sufijo(quien)}${this.extension(ev.serviceSheetPdfUrl!, '.pdf')}`,
          desdeArchivo: hoja,
          modificado: ev.serviceSheetUploadedAt ?? undefined,
        });
      }

      // Las fotos libres de siempre (actividades sin campos) van aparte, numeradas.
      const libres = Array.isArray(ev.evidencePhotos) ? ev.evidencePhotos : [];
      libres.forEach((url, i) => {
        const disco = this.rutaEnDisco(url);
        if (!disco) return;
        const carpeta = variasPersonas ? `Fotos/${limpiarNombreDeArchivo(quien || 'Sin nombre')}` : 'Fotos';
        entradas.push({
          ruta: `${raiz}/${carpeta}/${String(i + 1).padStart(2, '0')}${this.extension(url)}`,
          desdeArchivo: disco,
          modificado: ev.evidencePhotosUploadedAt ?? undefined,
        });
      });
    }

    entradas.unshift({
      ruta: `${raiz}/resumen.txt`,
      contenido: this.resumen(activity, evidencias, campos, saltadas),
    });

    const generador = generarZip(entradas, {
      alSaltar: (ruta, motivo) => this.logger.warn(`ZIP ${activityId}: se saltó ${ruta} (${motivo})`),
    });

    return {
      generador,
      nombreArchivo: this.nombreDeArchivo(activity.anNumber, activity.titulo),
      archivos: entradas.length,
    };
  }

  /** `resumen.txt`: quién la hizo, fechas, GPS y en qué quedó la revisión. */
  private resumen(
    activity: Awaited<ReturnType<ActivityEvidenceZipService['datosDeActividad']>>,
    evidencias: Array<Record<string, any>>,
    campos: Array<{ nombre: string; momentos: string[]; fotos: Record<string, any> }>,
    saltadas: string[],
  ): string {
    const l: string[] = [];
    l.push(`${activity.anNumber || ''} ${activity.titulo || ''}`.trim());
    l.push('='.repeat(Math.max(8, `${activity.anNumber || ''} ${activity.titulo || ''}`.trim().length)));
    l.push('');
    l.push(`Proyecto o cliente: ${activity.project?.name || activity.client?.name || '—'}`);
    if (activity.branchName) l.push(`Sucursal: ${activity.branchName}`);
    l.push(`Responsable: ${activity.responsable?.nombre || '—'}`);
    l.push(`Estatus: ${activity.estatus || '—'}`);
    if (activity.prioridad) l.push(`Prioridad: ${activity.prioridad}`);
    l.push(`Inicio: ${fecha(activity.fechaInicio)}`);
    l.push(`Finalización: ${fecha(activity.fechaFinalizacion)}`);
    if (activity.descripcion) {
      l.push('');
      l.push('Descripción:');
      l.push(String(activity.descripcion));
    }

    l.push('');
    l.push('QUIÉN LA HIZO');
    l.push('-'.repeat(13));
    if (evidencias.length === 0) l.push('Sin evidencia registrada.');
    for (const ev of evidencias) {
      l.push('');
      l.push(`• ${ev.user?.nombre || 'Sin nombre'}`);
      l.push(`  Entrada: ${fecha(ev.entryPhotoUploadedAt)}`);
      l.push(`  GPS de entrada: ${coordenadas(ev.entryLatitude, ev.entryLongitude)}`);
      l.push(`  Salida: ${fecha(ev.exitPhotoUploadedAt)}`);
      l.push(`  GPS de salida: ${coordenadas(ev.exitLatitude, ev.exitLongitude)}`);
      l.push(`  Fotos libres: ${Array.isArray(ev.evidencePhotos) ? ev.evidencePhotos.length : 0}`);
      l.push(`  Hoja de servicio: ${ev.serviceSheetPdfUrl ? 'sí' : 'no'}`);
      l.push(`  Revisión: ${REVISION[String(ev.reviewStatus)] || String(ev.reviewStatus || '—')}`);
      if (ev.reviewedAt) l.push(`  Revisada el: ${fecha(ev.reviewedAt)}`);
      if (ev.reviewNotes) l.push(`  Observaciones: ${String(ev.reviewNotes)}`);
      if (ev.eficienciaScore != null) l.push(`  Calificación: ${ev.eficienciaScore} de 5`);
    }

    if (campos.length > 0) {
      l.push('');
      l.push('QUÉ SE DOCUMENTÓ');
      l.push('-'.repeat(16));
      for (const campo of campos) {
        const detalle = campo.momentos
          .map((m) => `${etiquetaMomento(m as Momento)}: ${campo.fotos?.[m] ? 'sí' : 'falta'}`)
          .join(' · ');
        l.push(`• ${campo.nombre} — ${detalle}`);
      }
    }

    if (saltadas.length > 0) {
      l.push('');
      l.push('No se pudo incluir el archivo de: ' + saltadas.join(', '));
    }

    l.push('');
    l.push(`Generado el ${fecha(new Date())} desde NEXARA Core.`);
    return l.join('\r\n');
  }
}
