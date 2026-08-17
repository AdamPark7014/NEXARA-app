import { BadRequestException } from '@nestjs/common';
import { assertPublicHttpUrl, isPrivateAddress } from './url-guard.js';

/**
 * Un webhook apunta a donde diga quien lo configura, y su respuesta se guarda y
 * se muestra en el registro de entregas. Sin este filtro servía para leer de la
 * red interna: la base, otro contenedor del mismo host —hay cuatro proyectos de
 * clientes más— o la metadata del proveedor.
 */

const rechaza = (url: string) => expect(() => assertPublicHttpUrl(url)).toThrow(BadRequestException);
const acepta = (url: string) => expect(() => assertPublicHttpUrl(url)).not.toThrow();

describe('direcciones internas', () => {
  it('bucle local', () => {
    for (const ip of ['127.0.0.1', '127.1.2.3', '0.0.0.0']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });

  it('rangos privados RFC1918', () => {
    for (const ip of ['10.0.0.1', '172.16.5.4', '172.31.255.255', '192.168.1.1']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });

  it('metadata del proveedor', () => {
    // El clasico: 169.254.169.254 sirve credenciales de la instancia.
    expect(isPrivateAddress('169.254.169.254')).toBe(true);
  });

  it('CGNAT y multicast', () => {
    expect(isPrivateAddress('100.64.0.1')).toBe(true);
    expect(isPrivateAddress('224.0.0.1')).toBe(true);
  });

  it('IPv6 interna', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fd00::1', 'fc00::abcd']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });

  it('IPv6 con IPv4 embebida se juzga por la parte IPv4', () => {
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateAddress('::ffff:8.8.8.8')).toBe(false);
  });

  it('direcciones publicas pasan', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '192.169.0.1']) {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  });

  it('172.15 y 172.32 quedan FUERA del rango privado', () => {
    // El rango es 172.16-172.31; equivocarse aqui bloquea destinos legitimos.
    expect(isPrivateAddress('172.15.0.1')).toBe(false);
    expect(isPrivateAddress('172.32.0.1')).toBe(false);
  });
});

describe('URL de webhook', () => {
  it('acepta un destino publico normal', () => {
    acepta('https://hooks.ejemplo.com/nexara');
    acepta('http://api.cliente.com.mx:8080/webhook');
  });

  it('rechaza protocolos que no son http', () => {
    for (const u of ['file:///etc/passwd', 'ftp://x.com', 'gopher://x.com']) rechaza(u);
  });

  it('rechaza localhost y sus variantes', () => {
    for (const u of ['http://localhost/x', 'http://localhost:5432', 'http://algo.localhost/x']) {
      rechaza(u);
    }
  });

  it('rechaza un nombre de contenedor', () => {
    // `nexara-db` no tiene punto: es la red del contenedor, no internet.
    for (const u of ['http://nexara-db:5432', 'http://redis:6379', 'http://api']) rechaza(u);
  });

  it('rechaza sufijos de red local', () => {
    for (const u of ['http://caja.local/x', 'http://srv.internal/x', 'http://x.lan/y']) rechaza(u);
  });

  it('rechaza IP interna literal', () => {
    for (const u of [
      'http://127.0.0.1:3001/api',
      'http://10.0.0.5/',
      'http://192.168.1.1/',
      'http://169.254.169.254/latest/meta-data/',
    ]) {
      rechaza(u);
    }
  });

  it('rechaza credenciales embebidas en la URL', () => {
    // Se enviarian en cada entrega sin verse en pantalla.
    rechaza('https://usuario:secreto@hooks.ejemplo.com/x');
  });

  it('rechaza una URL que no se puede interpretar', () => {
    rechaza('no-es-una-url');
    rechaza('');
  });

  it('devuelve la URL ya interpretada cuando pasa', () => {
    const u = assertPublicHttpUrl('https://hooks.ejemplo.com/nexara?a=1');
    expect(u.hostname).toBe('hooks.ejemplo.com');
  });
});
