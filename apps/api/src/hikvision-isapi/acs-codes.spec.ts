import {
  ACS_CODES,
  ACS_MAJOR_DEVICE,
  acsCodeLabel,
  classifyAcsMinor,
  isAcsDenied,
  isAcsDoorAlarm,
  isAcsGranted,
  isAcsOperationalNoise,
} from './acs-codes';

/**
 * Los casos de prueba NO son inventados: son secuencias reales tomadas de los
 * 47.343 eventos de la instalación de Oficinas. Se escriben aquí porque esta
 * clasificación estaba mal, copiada en tres sitios, y sin una sola prueba que
 * lo destapara.
 */
describe('Códigos ACS · clasificación', () => {
  describe('la cadena real del equipo, por serialNo consecutivo', () => {
    /**
     * Acceso General, 2026-09-05. El equipo numera sus eventos y esta secuencia
     * salió tal cual de la base:
     *
     *   13863 · 75 · CONCEDIDO a Joan Sebastián · 02:48:39
     *   13864 · 21 ·                             · 02:48:39  (mismo segundo)
     *   13865 · 22 ·                             · 02:48:44  (+5 s, el relé)
     */
    it('una concesión abre la puerta, y esa apertura no es otra denegación', () => {
      expect(isAcsGranted(5, 75)).toBe(true);

      // El 21 y el 22 son CONSECUENCIA del 75. Contarlos como denegación
      // significaba que cada entrada legítima fabricaba dos denegados falsos.
      expect(isAcsDenied(5, 21)).toBe(false);
      expect(isAcsDenied(5, 22)).toBe(false);
      expect(classifyAcsMinor(5, 21).kind).toBe('door_state');
      expect(classifyAcsMinor(5, 22).kind).toBe('door_state');
    });

    /**
     * La otra cadena, la del botón: 23 → 21 → 24 → 22 en seriales seguidos.
     * Hay 10.445 eventos `23` y 10.444 `24`: son pares de pulsar y soltar.
     */
    it('el botón de salida no es una denegación, y aportaba el 46,8 % del KPI', () => {
      for (const minor of [23, 24]) {
        expect(isAcsDenied(5, minor)).toBe(false);
        expect(classifyAcsMinor(5, minor).kind).toBe('exit_button');
      }
    });
  });

  describe('minor 76 · el que cerraba jornadas', () => {
    /**
     * 48 de 48 traen FaceRect y 0 de 48 traen persona. Ráfagas de reintento a
     * 4, 4, 4, 5, 11 y 13 segundos. Siete van seguidos, en menos de dos minutos
     * y en el mismo equipo, de un 75 CON nombre. Pico a las 10:00 y ni uno solo
     * después de las 18:00: un evento de salida que nunca pasa al salir.
     */
    it('no es una concesión: el equipo no reconoció a nadie', () => {
      expect(isAcsGranted(5, 76)).toBe(false);
      expect(classifyAcsMinor(5, 76).kind).toBe('auth_failed');
    });

    it('tampoco es una denegación: no se rechazó a nadie, no se supo quién era', () => {
      // La distinción importa de verdad. Un repunte de fallos de rostro es un
      // lector sucio o mal calibrado; tratarlo como denegación lo convierte en
      // una alarma de intruso y enseña al operador a ignorar las alarmas.
      expect(isAcsDenied(5, 76)).toBe(false);
    });
  });

  describe('las denegaciones de verdad, que antes se tiraban enteras', () => {
    it.each([
      [6, 'Sin permiso para esta puerta'],
      [7, 'Fuera de su horario'],
      [8, 'Credencial caducada'],
      [9, 'Tarjeta no registrada'],
      [10, 'Antipassback: no registró su entrada'],
      [113, 'Persona en lista negra'],
    ])('minor %i se clasifica como denegación (%s)', (minor, label) => {
      expect(isAcsDenied(5, minor as number)).toBe(true);
      expect(acsCodeLabel(5, minor as number)).toBe(label);
    });
  });

  describe('incidentes de puerta', () => {
    it('puerta forzada y mantenida abierta son alarma, no denegación', () => {
      for (const minor of [27, 28]) {
        expect(isAcsDoorAlarm(5, minor)).toBe(true);
        expect(isAcsDenied(5, minor)).toBe(false);
      }
    });

    it('están marcados como no observados: cero eventos en tres meses', () => {
      // Honestidad sobre la evidencia: se clasifican por documentación, no por
      // haberlos visto. Conviene confirmarlos en campo antes de fiarse.
      expect(ACS_CODES[27].evidence).toBe('documented');
      expect(ACS_CODES[28].evidence).toBe('documented');
    });
  });

  describe('ruido de funcionamiento', () => {
    it('agrupa el 94,3 % del tráfico que inflaba el KPI de denegados', () => {
      for (const minor of [21, 22, 23, 24, 29, 31, 32]) {
        expect(isAcsOperationalNoise(5, minor)).toBe(true);
      }
    });

    it('una concesión o una denegación nunca son ruido', () => {
      for (const minor of [1, 75, 6, 8, 10]) {
        expect(isAcsOperationalNoise(5, minor)).toBe(false);
      }
    });
  });

  describe('bordes', () => {
    it('otro major no se clasifica como evento de acceso', () => {
      expect(classifyAcsMinor(1, 1034).kind).toBe('unknown');
      expect(isAcsGranted(1, 75)).toBe(false);
    });

    it('un minor desconocido se admite como desconocido, sin fingir que se entiende', () => {
      const r = classifyAcsMinor(5, 9999);
      expect(r.kind).toBe('unknown');
      expect(r.label).toContain('9999');
    });

    it('nulos no revientan ni se cuelan como concedidos', () => {
      expect(isAcsGranted(null, null)).toBe(false);
      expect(isAcsDenied(ACS_MAJOR_DEVICE, null)).toBe(false);
      expect(classifyAcsMinor(undefined, undefined).kind).toBe('unknown');
    });

    it('el minor 39 se deja FUERA a propósito', () => {
      // Se comporta como fallo de autenticación (29 eventos con la misma firma
      // de ráfaga que el 76) pero no está confirmado en el Apéndice C.
      // Clasificarlo sin respaldo repetiría el error que este módulo corrige.
      expect(ACS_CODES[39]).toBeUndefined();
      expect(classifyAcsMinor(5, 39).kind).toBe('unknown');
    });
  });
});
