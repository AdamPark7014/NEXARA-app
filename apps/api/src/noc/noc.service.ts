import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export type NocDevice = {
  id: string;
  name: string;
  type: 'CCTV' | 'POS' | 'PRINTER' | 'ROUTER' | 'SERVER' | 'IOT_SENSOR' | 'ACCESS_CONTROL';
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'ALERT';
  branch: string;
  clientName: string;
  lastSeen: string;
  uptimePct30d: number;
  ipAddress?: string;
  firmwareVersion?: string;
  metadata?: Record<string, any>;
};

export type NocAlert = {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  deviceId: string;
  deviceName: string;
  title: string;
  message: string;
  triggeredAt: string;
  ackBy?: string | null;
};

/**
 * Servicio NOC (Network Operations Center).
 *
 * Por ahora devuelve datos sintéticos derivados de los proyectos/ramas
 * existentes en el sistema para tener un dashboard funcional. La integración
 * real con Hikvision iSAPI, SNMP, MQTT, etc. se conecta desde aquí en fases
 * futuras: cada device tendrá su propio adaptador en `apps/api/src/noc/adapters/`.
 */
@Injectable()
export class NocService {
  constructor(private readonly prisma: PrismaService) {}

  async listDevices(filters?: { type?: string; status?: string; clientId?: number }): Promise<NocDevice[]> {
    // Genera devices sintéticos basados en projects y service-clients reales.
    const projects = await this.prisma.operationalProject.findMany({
      where: { status: 'ACTIVE' as any },
      select: {
        id: true,
        title: true,
        projectType: true,
        siteCount: true,
        client: { select: { id: true, name: true } },
      },
      take: 30,
    }).catch(() => []);

    const devices: NocDevice[] = [];
    const typeForProject: Record<string, NocDevice['type']> = {
      INSTALACION_CCTV: 'CCTV',
      CONTROL_ACCESO: 'ACCESS_CONTROL',
      PUNTO_VENTA: 'POS',
      IMPRESORAS_TPV: 'PRINTER',
      REDES_WIFI: 'ROUTER',
      CABLEADO_ESTRUCTURADO: 'ROUTER',
      MONITOREO_REMOTO: 'IOT_SENSOR',
      MANTENIMIENTO_CORRECTIVO: 'SERVER',
    };

    for (const p of projects) {
      const siteCount = Math.min(p.siteCount ?? 1, 8);
      const baseType = typeForProject[p.projectType as any] || 'IOT_SENSOR';
      for (let s = 0; s < siteCount; s++) {
        const seed = p.id * 7 + s * 13;
        const statuses: NocDevice['status'][] = ['ONLINE', 'ONLINE', 'ONLINE', 'ONLINE', 'DEGRADED', 'OFFLINE', 'ALERT'];
        const status = statuses[seed % statuses.length];
        const uptime = status === 'ONLINE' ? 99 + Math.random() : status === 'DEGRADED' ? 92 + Math.random() * 5 : status === 'OFFLINE' ? 80 + Math.random() * 10 : 95 + Math.random() * 3;

        devices.push({
          id: `dev-${p.id}-${s}`,
          name: `${baseType}-${String(p.id).padStart(3, '0')}-${String(s + 1).padStart(2, '0')}`,
          type: baseType,
          status,
          branch: `Sucursal #${s + 1}`,
          clientName: p.client?.name || 'N/A',
          lastSeen: status === 'OFFLINE' ? new Date(Date.now() - (1 + (seed % 12)) * 3600000).toISOString() : new Date(Date.now() - (seed % 300) * 1000).toISOString(),
          uptimePct30d: +uptime.toFixed(2),
          ipAddress: `10.${(p.id) % 256}.${s + 1}.${(seed % 254) + 1}`,
          firmwareVersion: `${1 + (seed % 4)}.${seed % 10}.${(seed * 3) % 99}`,
        });
      }
    }

    return devices.filter((d) => {
      if (filters?.type && d.type !== filters.type) return false;
      if (filters?.status && d.status !== filters.status) return false;
      return true;
    });
  }

  async getSummary() {
    const devices = await this.listDevices();
    const byStatus = devices.reduce<Record<string, number>>((acc, d) => {
      acc[d.status] = (acc[d.status] || 0) + 1;
      return acc;
    }, {});
    const byType = devices.reduce<Record<string, number>>((acc, d) => {
      acc[d.type] = (acc[d.type] || 0) + 1;
      return acc;
    }, {});
    const avgUptime = devices.length > 0
      ? +(devices.reduce((s, d) => s + d.uptimePct30d, 0) / devices.length).toFixed(2)
      : 0;
    const offline = devices.filter((d) => d.status === 'OFFLINE');
    const alerts = devices.filter((d) => d.status === 'ALERT' || d.status === 'DEGRADED');

    return {
      total: devices.length,
      byStatus,
      byType,
      avgUptime,
      criticalCount: offline.length + devices.filter((d) => d.status === 'ALERT').length,
      offlineDevices: offline.slice(0, 8),
      alertDevices: alerts.slice(0, 8),
      generatedAt: new Date().toISOString(),
    };
  }

  async listAlerts(): Promise<NocAlert[]> {
    const devices = await this.listDevices();
    return devices
      .filter((d) => d.status !== 'ONLINE')
      .map((d): NocAlert => ({
        id: `alert-${d.id}`,
        severity: (d.status === 'OFFLINE' || d.status === 'ALERT' ? 'critical' : 'warning'),
        deviceId: d.id,
        deviceName: d.name,
        title: d.status === 'OFFLINE'
          ? 'Dispositivo desconectado'
          : d.status === 'ALERT'
            ? 'Anomalía detectada'
            : 'Performance degradado',
        message: d.status === 'OFFLINE'
          ? `Sin contacto desde ${new Date(d.lastSeen).toLocaleString('es-MX')}`
          : `${d.type} en ${d.branch} (${d.clientName}) — Uptime 30d: ${d.uptimePct30d}%`,
        triggeredAt: d.lastSeen,
      }))
      .sort((a, b) => (a.severity === 'critical' ? -1 : 1));
  }
}
