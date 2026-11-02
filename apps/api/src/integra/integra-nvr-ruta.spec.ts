import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isHostAllowed } from '../common/security/security.utils';
import { parseXml } from '../hikvision-isapi/xml';
import { fallbackDeviceIp, identifiesDevice, normalizeAlert } from './integra-push.parse';
import { IntegraPushService } from './integra-push.service';

/**
 * El NVR de Oficinas nunca entró a `integra_push_events`: su firmware manda
 * `Host: 5.78.215.109` y Traefik contestaba 404. Abrir la ruta tiene dos trampas,
 * y estas pruebas las fijan:
 *
 * - La API rechaza un Host con IP y castiga a quien llama. Sin la reescritura, al
 *   tercer aviso bloquearía 1 h la IP de toda la oficina.
 * - El aviso no dice su IP. Sin respaldo, la fila quedaría con la IP pública y la
 *   foto se le pediría a esa dirección.
 */

/** VMD del NVR capturado en el puerto 80 el 02-11, con la serie tapada. */
const XML_NVR = `<?xml version="1.0" encoding="UTF-8"?><EventNotificationAlert version="1.0" xmlns="urn:psialliance-org">
<channelID>45</channelID>
<dateTime>2026-11-02T12:41:23-06:00</dateTime>
<activePostCount>1098455</activePostCount>
<eventType>VMD</eventType>
<eventState>active</eventState>
<Extensions>
<serialNumber xmlns="urn:selfextension:psiaext-ver10-xsd">SERIE</serialNumber>
<eventPush xmlns="urn:selfextension:psiaext-ver10-xsd">VMD&amp;&amp;SERIE,2026-11-02T12:41:23-06:00,45,1.0</eventPush>
</Extensions>
</EventNotificationAlert>`;

const IP_OFICINA = '187.191.42.145';
const HOST_DEL_SITIO = 'http://192.168.9.34';

describe('ruta del NVR en Traefik', () => {
  const yml = readFileSync(
    path.resolve(__dirname, '../../../../deploy/traefik/nexara.yml'),
    'utf8',
  ).replace(/\r\n/g, '\n');
  const router = /\n {4}integra-hik-push-http:\n([\s\S]*?)\n\n/.exec(yml)?.[1] ?? '';

  it('acepta el Host con la IP que manda el NVR, solo en el buzón de equipos', () => {
    expect(router).toContain('Host(`5.78.215.109`)');
    expect(router).toContain('Host(`integra.nexara.com.mx`)');
    expect(router).toContain('&& PathPrefix(`/api/integra/hik`)');
  });

  it('reescribe el Host a uno que la API admite, porque la IP la haría castigar a la oficina', () => {
    expect(isHostAllowed('5.78.215.109')).toBe(false);
    expect(router).toContain('- integra-hik-host');
    const destino = /\n {4}integra-hik-host:\n {6}headers:\n {8}customRequestHeaders:\n {10}Host: (\S+)/.exec(yml)?.[1];
    expect(destino).toBe('integra.nexara.com.mx');
    expect(isHostAllowed(destino)).toBe(true);
  });
});

describe('identidad de un aviso sin ipAddress', () => {
  it('fallbackDeviceIp saca la IP de la cabecera del sitio', () => {
    expect(fallbackDeviceIp(HOST_DEL_SITIO, IP_OFICINA)).toBe('192.168.9.34');
    expect(fallbackDeviceIp('http://192.168.9.34:8080/', IP_OFICINA)).toBe('192.168.9.34');
    expect(fallbackDeviceIp('', IP_OFICINA)).toBe(IP_OFICINA);
    expect(fallbackDeviceIp(null, IP_OFICINA)).toBe(IP_OFICINA);
  });

  it('el XML real del NVR se apunta a la cabecera y no se da por identificado', () => {
    const ev = normalizeAlert(parseXml(XML_NVR) as Record<string, unknown>, fallbackDeviceIp(HOST_DEL_SITIO, IP_OFICINA));
    expect(ev?.eventType).toBe('VMD');
    expect(ev?.deviceIp).toBe('192.168.9.34');
    expect(identifiesDevice(ev!)).toBe(false);
  });

  it('un equipo que dice su IP la conserva, aunque haya respaldo', () => {
    const ev = normalizeAlert(
      { ipAddress: '192.168.9.171', eventType: 'facedetection', dateTime: '2026-11-02T12:41:23-06:00' },
      fallbackDeviceIp(HOST_DEL_SITIO, IP_OFICINA),
    );
    expect(ev?.deviceIp).toBe('192.168.9.171');
    expect(identifiesDevice(ev!)).toBe(true);
  });
});

describe('foto de un aviso sin ipAddress', () => {
  const montar = () => {
    const resolveClient = jest.fn().mockResolvedValue({ isapiForHost: null });
    const prisma = {
      integraPushEvent: {
        create: jest.fn().mockResolvedValue({
          id: 1,
          deviceIp: '192.168.9.34',
          deviceName: null,
          eventType: 'fielddetection',
          label: null,
          occurredAt: new Date(),
          personId: null,
          personName: null,
          doorNo: null,
          verifyMode: null,
          photoPath: null,
          targets: null,
        }),
      },
    };
    const servicio = new IntegraPushService(
      prisma as never,
      { resolveClient } as never,
      {} as never,
      {} as never,
    );
    return { servicio, resolveClient };
  };

  const aviso = (extra: Record<string, unknown>) =>
    normalizeAlert(
      { eventType: 'fielddetection', dateTime: new Date().toISOString(), ...extra },
      fallbackDeviceIp(HOST_DEL_SITIO, IP_OFICINA),
    )!;

  it('la detección del grabador se guarda sin pedirle foto a nadie', async () => {
    const { servicio, resolveClient } = montar();
    await servicio.ingest({ id: 1, companyId: 2 }, aviso({}));
    expect(resolveClient).not.toHaveBeenCalled();
  });

  it('la detección de una cámara que dice su IP sí pide foto', async () => {
    const { servicio, resolveClient } = montar();
    await servicio.ingest({ id: 1, companyId: 2 }, aviso({ ipAddress: '192.168.9.171' }));
    expect(resolveClient).toHaveBeenCalledTimes(1);
  });
});
