import {
  HD_GRACIA_MS,
  decidirLiberacionHd,
  elegirModoHd,
  hdTranscodeSource,
  notaHd,
  requiereTranscodificacion,
  reservarRanuraHd,
  type RanuraHd,
} from './integra-media.hd';

/**
 * Por qué existe esta prueba.
 *
 * Foco se veía pixelado porque consumía el canal secundario a 640×360. El
 * principal es 1920×1080 pero va en H.265, que MSE no decodifica, así que la
 * única forma de dar 1080p de verdad es transcodificar en el servidor.
 *
 * Eso convierte una decisión que antes era «sí o no» en una con tres salidas y
 * un recurso escaso detrás: **hay CPU para una transcodificación, no para
 * trece**. Si el tope se rompe en silencio, no se cae Foco: se cae el servidor
 * entero y con él el muro y la API. Por eso la lógica es pura y vive aquí.
 */
describe('alta calidad en Foco · elección de fuente, tope y liberación', () => {
  /* ────────────────────────────────────────────────────────────────────
   * 1 · La cadena que se le pasa a go2rtc
   * ──────────────────────────────────────────────────────────────────── */

  describe('hdTranscodeSource · la cadena ffmpeg', () => {
    // La sintaxis sale del README de go2rtc, sección «Source: FFmpeg»:
    // `ffmpeg:<input>#video=h264` transcodifica el video y descarta el audio.
    // No es una cadena inventada ni improvisada.
    it('pide h264 por su nombre de plantilla, no argumentos sueltos de ffmpeg', () => {
      expect(hdTranscodeSource('rtsp://admin:x@192.168.9.171:554/Streaming/Channels/101', false)).toBe(
        'ffmpeg:rtsp://admin:x@192.168.9.171:554/Streaming/Channels/101#video=h264',
      );
    });

    it('con micrófono encendido añade la pista AAC, igual que el camino de audio ya probado', () => {
      expect(hdTranscodeSource('rtsp://cam/101', true)).toBe('ffmpeg:rtsp://cam/101#video=h264#audio=aac');
    });

    it('NO reescala: el objetivo es 1080p de verdad, no un 720p disfrazado', () => {
      const src = hdTranscodeSource('rtsp://cam/101', false);
      expect(src).not.toContain('width');
      expect(src).not.toContain('height');
      expect(src).not.toContain('scale');
    });

    it('no toca el audio cuando nadie lo pidió: reencodear G.711 sería CPU regalada', () => {
      expect(hdTranscodeSource('rtsp://cam/101', false)).not.toContain('audio');
    });
  });

  /* ────────────────────────────────────────────────────────────────────
   * 2 · Elección de fuente según el códec
   * ──────────────────────────────────────────────────────────────────── */

  describe('elegirModoHd · qué se sirve y por qué', () => {
    const base = { hayPrincipal: true, cupo: true } as const;

    it('el muro no negocia nada: pide sub, recibe sub y sin nota', () => {
      // Trece mosaicos pidiendo alta calidad es justo lo que tumbaría el server.
      expect(elegirModoHd({ ...base, quality: 'sub', codec: 'H.265' })).toEqual({
        modo: 'secundario',
        razon: null,
      });
    });

    it('las cuatro terminales de puerta van en H.264: se sirven tal cual, sin ffmpeg', () => {
      // Medido: .160 a .163 entregan H.264 1280×720 en su canal principal.
      expect(elegirModoHd({ ...base, quality: 'main', codec: 'H.264' }).modo).toBe('nativo');
      expect(requiereTranscodificacion({ quality: 'main', codec: 'H.264', hayPrincipal: true })).toBe(
        false,
      );
    });

    it('las trece de vigilancia van en H.265: se transcodifican', () => {
      // Medido el 2026-09-05 contra integra_cameras: 13 filas 1920x1080 H.265.
      expect(elegirModoHd({ ...base, quality: 'main', codec: 'H.265' })).toEqual({
        modo: 'transcodificado',
        razon: null,
      });
      expect(requiereTranscodificacion({ quality: 'main', codec: 'H.265', hayPrincipal: true })).toBe(
        true,
      );
    });

    it('un códec desconocido NO gasta la ranura: se intenta tal cual', () => {
      // El espejo puede no haberlo guardado aún. Quemar el único cupo del
      // servidor en una corazonada sería peor que dejar que el reproductor
      // caiga a respaldo.
      for (const codec of [null, undefined, '', 'MJPEG']) {
        expect(elegirModoHd({ ...base, quality: 'main', codec }).modo).toBe('nativo');
        expect(requiereTranscodificacion({ quality: 'main', codec, hayPrincipal: true })).toBe(false);
      }
    });

    it('un equipo con un solo perfil no tiene nada que transcodificar, y lo dice', () => {
      const r = elegirModoHd({ quality: 'main', codec: 'H.265', hayPrincipal: false, cupo: true });
      expect(r.modo).toBe('secundario');
      expect(r.razon).toContain('un solo perfil');
      // Y sobre todo: no pide la ranura para nada.
      expect(requiereTranscodificacion({ quality: 'main', codec: 'H.265', hayPrincipal: false })).toBe(
        false,
      );
    });

    it('sin cupo se cae al secundario en vez de arrancar un segundo ffmpeg', () => {
      const r = elegirModoHd({ quality: 'main', codec: 'H.265', hayPrincipal: true, cupo: false });
      expect(r.modo).toBe('secundario');
      expect(r.razon).toContain('una a la vez');
    });

    it('la razón nunca lleva «·», que es como el front trocea la nota', () => {
      const razones = [
        elegirModoHd({ quality: 'main', codec: 'H.265', hayPrincipal: true, cupo: false }).razon,
        elegirModoHd({ quality: 'main', codec: 'H.265', hayPrincipal: false, cupo: true }).razon,
      ];
      for (const razon of razones) expect(razon).not.toContain('·');
    });
  });

  /* ────────────────────────────────────────────────────────────────────
   * 3 · El tope duro: UNA transcodificación
   * ──────────────────────────────────────────────────────────────────── */

  describe('reservarRanuraHd · solo cabe una', () => {
    const t0 = 1_700_000_000_000;
    const camA = { cameraIndexCode: '192.168.9.34|301', streamName: 'cam_192_168_9_34_301_hd' };
    const camB = { cameraIndexCode: '192.168.9.34|401', streamName: 'cam_192_168_9_34_401_hd' };

    it('la ranura libre se concede', () => {
      const r = reservarRanuraHd(null, camA, t0);
      expect(r.concedida).toBe(true);
      expect(r.ranura).toEqual({ ...camA, pedidoEn: t0 });
      expect(r.liberar).toBeNull();
    });

    it('una SEGUNDA cámara se queda fuera: es el tope que evita tumbar el servidor', () => {
      const ocupada = reservarRanuraHd(null, camA, t0).ranura;
      const r = reservarRanuraHd(ocupada, camB, t0 + 1_000);
      expect(r.concedida).toBe(false);
      // Y no se le roba la ranura a quien está mirando: si se la quitáramos, el
      // operador de A se quedaría sin imagen y al siguiente clic se la robaría
      // de vuelta, dejando los dos ffmpeg arrancando y parando en bucle.
      expect(r.ranura).toBe(ocupada);
      expect(r.liberar).toBeNull();
    });

    it('trece peticiones seguidas solo consiguen una concesión', () => {
      let ranura: RanuraHd | null = null;
      let concedidas = 0;
      for (let i = 0; i < 13; i++) {
        const r = reservarRanuraHd(
          ranura,
          { cameraIndexCode: `192.168.9.34|${i}01`, streamName: `cam_${i}_hd` },
          t0 + i,
        );
        if (r.concedida) concedidas++;
        ranura = r.ranura;
      }
      expect(concedidas).toBe(1);
    });

    it('la misma cámara insistiendo renueva, no cuenta como una segunda', () => {
      // El front repregunta cada vez que se entra en Foco: si cada pregunta
      // gastara un cupo nuevo, la propia cámara se bloquearía a sí misma.
      const ocupada = reservarRanuraHd(null, camA, t0).ranura;
      const r = reservarRanuraHd(ocupada, camA, t0 + 120_000);
      expect(r.concedida).toBe(true);
      expect(r.ranura?.pedidoEn).toBe(t0 + 120_000);
      expect(r.liberar).toBeNull();
    });

    it('encender el micrófono cambia el nombre: se manda matar el ffmpeg anterior', () => {
      // Sin esto quedaría un transcodificador huérfano de la misma cámara —el
      // goteo exacto que el tope existe para evitar.
      const ocupada = reservarRanuraHd(null, camA, t0).ranura;
      const conAudio = { ...camA, streamName: `${camA.streamName}_a` };
      const r = reservarRanuraHd(ocupada, conAudio, t0 + 5_000);
      expect(r.concedida).toBe(true);
      expect(r.liberar).toBe(camA.streamName);
      expect(r.ranura?.streamName).toBe(conAudio.streamName);
    });

    it('cuando la anterior se libera, la que rebotó ya entra', () => {
      const ocupada = reservarRanuraHd(null, camA, t0).ranura;
      expect(reservarRanuraHd(ocupada, camB, t0 + 1_000).concedida).toBe(false);
      // …se libera (nadie miraba A) y B lo vuelve a intentar.
      expect(reservarRanuraHd(null, camB, t0 + 200_000).concedida).toBe(true);
    });
  });

  /* ────────────────────────────────────────────────────────────────────
   * 4 · Liberar lo que ya no mira nadie
   * ──────────────────────────────────────────────────────────────────── */

  describe('decidirLiberacionHd · cuándo se apaga el ffmpeg', () => {
    const t0 = 1_700_000_000_000;
    const ranura: RanuraHd = {
      cameraIndexCode: '192.168.9.34|301',
      streamName: 'cam_192_168_9_34_301_hd',
      pedidoEn: t0,
    };

    it('sin ranura no hay nada que hacer', () => {
      expect(decidirLiberacionHd(null, t0, 0)).toBe('nada');
    });

    it('dentro del margen no se corta aunque aún no haya nadie enganchado', () => {
      // Es el hueco real entre registrar el stream y que el reproductor abra el
      // HLS: el handshake RTSP medido tarda de 0,7 a 2,5 s, más el keyframe.
      expect(decidirLiberacionHd(ranura, t0 + 1_000, 0)).toBe('esperar');
      expect(decidirLiberacionHd(ranura, t0 + HD_GRACIA_MS - 1, 0)).toBe('esperar');
    });

    it('el margen cubre salir de Foco, mirar otra cámara y volver', () => {
      // Volver a los 30 s no debe costar un arranque de ffmpeg nuevo.
      expect(decidirLiberacionHd(ranura, t0 + 30_000, 0)).toBe('esperar');
    });

    it('si alguien la está mirando se renueva, por largo que sea el turno', () => {
      // El reloj solo no vale: el front pide la URL UNA vez y luego se queda
      // con el HLS abierto minutos. Un TTL a secas mataría lo que se está
      // viendo. Por eso la señal es el consumidor, no el reloj.
      expect(decidirLiberacionHd(ranura, t0 + HD_GRACIA_MS + 1, 1)).toBe('renovar');
      expect(decidirLiberacionHd(ranura, t0 + 3_600_000, 2)).toBe('renovar');
    });

    it('pasado el margen y sin nadie mirando, fuera el ffmpeg', () => {
      expect(decidirLiberacionHd(ranura, t0 + HD_GRACIA_MS + 1, 0)).toBe('liberar');
    });

    it('si go2rtc no contesta se espera: no se corta por un fallo de consulta', () => {
      // Cortar aquí dejaría al operador sin imagen justo cuando algo va mal.
      expect(decidirLiberacionHd(ranura, t0 + 3_600_000, null)).toBe('esperar');
    });
  });

  /* ────────────────────────────────────────────────────────────────────
   * 5 · La nota, que es lo único que ve el operador
   * ──────────────────────────────────────────────────────────────────── */

  describe('notaHd · los tres casos, y el contrato con el front', () => {
    /**
     * El front (`apps/web/app/(panels)/integra/_quality.ts`, `motivoDelBackend`)
     * busca esta expresión en la nota. Si la encuentra, da la alta calidad por
     * imposible y se queda en el secundario — y además lo recuerda para toda la
     * sesión. Copiada aquí a propósito: si alguien cambia el texto de una nota
     * de éxito, esta prueba se cae antes de que el 1080p se tire a la basura en
     * producción sin que nadie lo note.
     */
    const REGEX_DEL_FRONT = /alta calidad no disponible:\s*([^·]+)/i;

    it('HD nativo: se distingue y NO dispara el rechazo del front', () => {
      const nota = notaHd('nativo');
      expect(nota).toContain('HD nativo');
      expect(nota).not.toMatch(REGEX_DEL_FRONT);
    });

    it('HD transcodificado: se distingue del nativo y tampoco dispara el rechazo', () => {
      const nota = notaHd('transcodificado');
      expect(nota).toContain('transcodificado');
      expect(nota).toContain('H.264');
      expect(nota).not.toMatch(REGEX_DEL_FRONT);
      expect(nota).not.toBe(notaHd('nativo'));
    });

    it('solo secundario: dice el porqué, y por la vía que el front sabe leer', () => {
      const razon = 'el principal va en H.265 y ya hay otra cámara transcodificando';
      const nota = notaHd('secundario', razon);
      const leido = REGEX_DEL_FRONT.exec(String(nota));
      expect(leido?.[1].trim()).toBe(razon);
    });

    it('el muro no lleva nota de calidad: no pidió ninguna', () => {
      expect(notaHd('secundario', null)).toBeNull();
    });
  });
});
