import { createInMemoryIpBanList, hasSuspiciousInputPayload, isPathSuspicious, parseIpList } from './security.utils';

/**
 * 17-11-2026: toda la oficina (una sola IP pública) quedó fuera una hora con «IP temporarily blocked».
 * Dos guardados de una cotización con puntos suspensivos («...») sumaron 3 + 3 puntos de «input
 * sospechoso» y los puntos nunca caducaban.
 */
describe('castigo por IP', () => {
  afterEach(() => jest.useRealTimers());

  it('los puntos suspensivos en el cuerpo no son input sospechoso', () => {
    expect(hasSuspiciousInputPayload({ contenido: 'Listo...' })).toBe(false);
    expect(hasSuspiciousInputPayload({ nota: 'espera.. ya voy' })).toBe(false);
    expect(hasSuspiciousInputPayload({ comentario: 'Revisé la cámara 3... todo bien' })).toBe(false);
    expect(hasSuspiciousInputPayload({ partidas: [{ descripcion: 'Cable UTP... 305 m' }] })).toBe(false);
    // Lo claro sigue detectándose.
    expect(hasSuspiciousInputPayload({ q: "' or 1=1 --" })).toBe(true);
    expect(hasSuspiciousInputPayload({ q: '<script>alert(1)</script>' })).toBe(true);
  });

  it('en la URL «..» sigue siendo ruta sospechosa', () => {
    expect(isPathSuspicious('/api/uploads/../../etc/passwd')).toBe(true);
    expect(isPathSuspicious('/api/uploads/%2e%2e/x')).toBe(true);
  });

  it('los puntos caducan: solo cuentan los de la ventana', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-17T19:00:00Z'));
    const box = createInMemoryIpBanList({ maxStrikes: 6, banWindowMs: 15 * 60_000, strikeWindowMs: 10 * 60_000 });
    box.addStrike('1.2.3.4', 3, 'ruta sospechosa', '/api/x');
    jest.setSystemTime(new Date('2026-11-17T19:11:00Z'));
    box.addStrike('1.2.3.4', 3, 'ruta sospechosa', '/api/x');
    expect(box.isBanned('1.2.3.4')).toBe(false);
    box.addStrike('1.2.3.4', 3, 'ruta sospechosa', '/api/x');
    expect(box.isBanned('1.2.3.4')).toBe(true);
  });

  it('el bloqueo dura lo configurado (15 min) y luego se levanta', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-17T19:00:00Z'));
    const box = createInMemoryIpBanList({ maxStrikes: 6, banWindowMs: 15 * 60_000, strikeWindowMs: 10 * 60_000 });
    box.addStrike('1.2.3.4', 5, 'honeypot', '/wp-admin');
    box.addStrike('1.2.3.4', 1, 'honeypot', '/wp-admin');
    expect(box.isBanned('1.2.3.4')).toBe(true);
    expect(box.retryAfterMs('1.2.3.4')).toBe(15 * 60_000);
    jest.setSystemTime(new Date('2026-11-17T19:15:01Z'));
    expect(box.isBanned('1.2.3.4')).toBe(false);
  });

  it('una IP exenta nunca se bloquea', () => {
    const box = createInMemoryIpBanList({ maxStrikes: 2, banWindowMs: 60_000, exempt: parseIpList(' 187.191.42.145 , 10.0.0.1') });
    box.addStrike('187.191.42.145', 5, 'honeypot', '/.env');
    expect(box.isBanned('187.191.42.145')).toBe(false);
    expect(box.isBanned('::ffff:187.191.42.145')).toBe(false);
    box.addStrike('8.8.8.8', 5, 'honeypot', '/.env');
    expect(box.isBanned('8.8.8.8')).toBe(true);
  });

  it('registra cada punto y cada bloqueo con IP, motivo y ruta sin querystring', () => {
    const eventos: any[] = [];
    const box = createInMemoryIpBanList({ maxStrikes: 4, banWindowMs: 60_000, onEvent: (e) => eventos.push(e) });
    box.addStrike('8.8.8.8', 2, 'método no permitido', '/api/x?token=secreto');
    box.addStrike('8.8.8.8', 2, 'host inválido', '/api/y');
    expect(eventos.map((e) => [e.tipo, e.ip, e.motivo, e.ruta])).toEqual([
      ['punto', '8.8.8.8', 'método no permitido', '/api/x'],
      ['punto', '8.8.8.8', 'host inválido', '/api/y'],
      ['bloqueo', '8.8.8.8', 'host inválido', '/api/y'],
    ]);
    expect(JSON.stringify(eventos)).not.toContain('secreto');
  });

  it('parseIpList ignora vacíos', () => {
    expect([...parseIpList(undefined)]).toEqual([]);
    expect([...parseIpList('a, ,b')]).toEqual(['a', 'b']);
  });
});
