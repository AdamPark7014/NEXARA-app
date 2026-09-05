import { describe, expect, it } from "vitest";

import {
  HD_MIN_ELEMENT_PX,
  RELEVO_INICIAL,
  SUB_WIDTH_PX,
  elegirObjetivoHd,
  etiquetaCalidad,
  evaluarRespuestaHd,
  go2rtcStreamName,
  motivoDelBackend,
  reducirRelevo,
  relevoPintaAlgo,
  sameGo2rtcStream,
  shouldRequestHd,
  subUpscale,
  textoCortoSinHd,
  textoSinHd,
  type EstadoRelevo,
  type EventoRelevo,
} from "./_quality";

/**
 * Por qué existen estas pruebas.
 *
 * La decisión de calidad es lógica que **se rompe en silencio**. Nadie nota que
 * dejó de pedirse alta calidad —la imagen sigue saliendo, solo que peor— ni que
 * empezó a pedirse para nueve mosaicos a la vez, hasta que el NVR se queda sin
 * sesiones. Y el caso que más duele, «el HD no llegó», es justo el que nunca se
 * prueba a mano porque hace falta una cámara H.265 delante.
 */

describe("umbral de alta calidad · qué tamaño la justifica", () => {
  it("el secundario mide 640 px: ese es el único metro que importa", () => {
    expect(SUB_WIDTH_PX).toBe(640);
    expect(subUpscale(640)).toBe(1);
    expect(subUpscale(1920)).toBe(3);
    expect(subUpscale(0)).toBe(0);
    expect(subUpscale(Number.NaN)).toBe(0);
  });

  it("una celda de muro no llega al umbral, con rejilla o sin ella", () => {
    // Medidas reales sobre 1920 con el rail abierto (~1550 px de escenario):
    // 3×3 ≈ 500 px por celda, 2×2 ≈ 760 px. Ninguna se acerca a 1100.
    expect(shouldRequestHd(500)).toBe(false);
    expect(shouldRequestHd(760)).toBe(false);
    // Y tampoco un 1×1 en una ventana a media pantalla.
    expect(shouldRequestHd(940)).toBe(false);
  });

  it("un escenario grande sí lo justifica: ahí la ampliación ya se ve", () => {
    expect(shouldRequestHd(HD_MIN_ELEMENT_PX)).toBe(true);
    expect(shouldRequestHd(1400)).toBe(true);
    // Pantalla completa sobre 1920: el secundario se ampliaría 3×.
    expect(shouldRequestHd(1920)).toBe(true);
    expect(subUpscale(1920)).toBeGreaterThan(2.9);
  });

  it("el umbral cae entre 1,5× y 2× de ampliación, que es donde deja de dar igual", () => {
    expect(subUpscale(HD_MIN_ELEMENT_PX)).toBeGreaterThan(1.5);
    expect(subUpscale(HD_MIN_ELEMENT_PX)).toBeLessThan(2);
  });

  it("sin medida no se pide nada: ante la duda, lo de siempre", () => {
    expect(shouldRequestHd(null)).toBe(false);
    expect(shouldRequestHd(undefined)).toBe(false);
    expect(shouldRequestHd(Number.NaN)).toBe(false);
    expect(shouldRequestHd(0)).toBe(false);
  });
});

describe("a quién le toca el canal principal · como máximo una", () => {
  const base = {
    mode: "focus" as const,
    focusId: "cam-1",
    focusProvider: "ISAPI",
    playbackActive: false,
    stageWidthPx: 1400,
  };

  it("Foco con escenario grande: esa, y solo esa", () => {
    const { objetivo, motivo } = elegirObjetivoHd(base);
    expect(objetivo).toEqual({ cameraId: "cam-1", widthPx: 1400 });
    expect(motivo).toBeNull();
  });

  it("el muro no pide principal nunca, esté como esté la rejilla", () => {
    expect(elegirObjetivoHd({ ...base, mode: "wall" }).objetivo).toBeNull();
    // Ni con una celda enorme: en muro no hay «la que se mira grande».
    expect(elegirObjetivoHd({ ...base, mode: "wall", stageWidthPx: 1920 }).objetivo).toBeNull();
  });

  it("Foco en una ventana estrecha tampoco: la regla es el tamaño, no el modo", () => {
    const { objetivo, motivo } = elegirObjetivoHd({ ...base, stageWidthPx: 700 });
    expect(objetivo).toBeNull();
    expect(motivo).toBe("pequeno");
  });

  it("viendo grabación no se pide: el playback ya sale del canal principal", () => {
    const { objetivo, motivo } = elegirObjetivoHd({ ...base, playbackActive: true });
    expect(objetivo).toBeNull();
    expect(motivo).toBe("playback");
  });

  it("HCT queda fuera: lo pinta otro reproductor y no negocia esto", () => {
    const { objetivo, motivo } = elegirObjetivoHd({ ...base, focusProvider: "HCT" });
    expect(objetivo).toBeNull();
    expect(motivo).toBe("proveedor");
  });

  it("sin cámara en Foco no hay a quién pedírselo", () => {
    expect(elegirObjetivoHd({ ...base, focusId: null }).objetivo).toBeNull();
  });

  it("devuelve UN id, no una lista: es lo que impide dos sesiones de 1080p", () => {
    const r = elegirObjetivoHd(base);
    expect(typeof r.objetivo?.cameraId).toBe("string");
  });
});

describe("la respuesta del backend · desconfiar es la política", () => {
  const sub = { hls: "http://go2rtc/api/stream.m3u8?src=cam_9_101", streamName: "cam_9_101" };

  it("un stream distinto sí sirve", () => {
    const v = evaluarRespuestaHd(
      { hls: "http://go2rtc/api/stream.m3u8?src=cam_9_101_hd", streamName: "cam_9_101_hd" },
      sub,
    );
    expect(v.usable).toBe(true);
    if (v.usable) expect(v.src).toContain("cam_9_101_hd");
  });

  it("el MISMO stream no sirve, aunque la API responda 200", () => {
    // Es el estado real de hoy: el servicio acepta `quality`, pero el
    // controlador HTTP todavía no lee `?quality`, así que devuelve el
    // secundario. Montar un segundo reproductor encima no daría un píxel más y
    // la etiqueta «HD» sería mentira.
    const v = evaluarRespuestaHd({ hls: sub.hls, streamName: sub.streamName }, sub);
    expect(v.usable).toBe(false);
    if (!v.usable) expect(v.motivo).toBe("sin-canal");
  });

  it("lo detecta también sin `streamName`, mirando la URL", () => {
    const v = evaluarRespuestaHd({ hls: sub.hls }, { hls: sub.hls });
    expect(v.usable).toBe(false);
    if (!v.usable) expect(v.motivo).toBe("sin-canal");
  });

  it("si el backend degradó por códec, se dice por qué", () => {
    const v = evaluarRespuestaHd(
      {
        hls: "http://go2rtc/api/stream.m3u8?src=cam_9_101",
        note: "RTSP vía grabador nvr, canal 901 · alta calidad no disponible: el principal va en H.265 · go2rtc MSE",
      },
      sub,
    );
    expect(v.usable).toBe(false);
    if (!v.usable) {
      expect(v.motivo).toBe("codec");
      expect(v.detalle).toBe("el principal va en H.265");
    }
  });

  it("sin HLS no hay nada que reproducir", () => {
    const v = evaluarRespuestaHd({ hls: null }, sub);
    expect(v.usable).toBe(false);
    if (!v.usable) expect(v.motivo).toBe("sin-respuesta");
  });

  it("una petición que ni llegó cuenta como sin respuesta", () => {
    const v = evaluarRespuestaHd(null, sub);
    expect(v.usable).toBe(false);
    if (!v.usable) expect(v.motivo).toBe("sin-respuesta");
  });
});

describe("nombres de stream en go2rtc", () => {
  it("saca el nombre de la URL HLS", () => {
    expect(go2rtcStreamName("http://x/api/stream.m3u8?src=cam_9_101_hd")).toBe("cam_9_101_hd");
    expect(go2rtcStreamName("http://x/api/stream.m3u8?foo=1&src=cam%5F1")).toBe("cam_1");
    expect(go2rtcStreamName(null)).toBeNull();
    expect(go2rtcStreamName("http://x/otra")).toBeNull();
  });

  it("compara por nombre, no por URL: el host público puede cambiar", () => {
    expect(
      sameGo2rtcStream("http://a/api/stream.m3u8?src=cam_1", "https://b/api/stream.m3u8?src=cam_1"),
    ).toBe(true);
    expect(
      sameGo2rtcStream("http://a/api/stream.m3u8?src=cam_1", "http://a/api/stream.m3u8?src=cam_1_hd"),
    ).toBe(false);
  });

  it("saca el motivo que manda el backend en la nota", () => {
    expect(motivoDelBackend("go2rtc MSE · alta calidad no disponible: el principal va en H.265")).toBe(
      "el principal va en H.265",
    );
    expect(motivoDelBackend("RTSP vía grabador nvr, canal 901 · go2rtc MSE")).toBeNull();
    expect(motivoDelBackend(null)).toBeNull();
  });
});

describe("el relevo · qué pasa exactamente si el HD no llega", () => {
  const correr = (eventos: EventoRelevo[]): EstadoRelevo => {
    let e = RELEVO_INICIAL;
    for (const ev of eventos) {
      e = reducirRelevo(e, ev);
      // La invariante, comprobada en CADA paso y no solo al final: nunca puede
      // haber un instante sin nada pintando. Ese hueco es exactamente lo que se
      // veía antes al abrir una cámara.
      expect(relevoPintaAlgo(e)).toBe(true);
    }
    return e;
  };

  it("arranca con el secundario puesto, que es el que está caliente", () => {
    expect(RELEVO_INICIAL.subMontado).toBe(true);
    expect(RELEVO_INICIAL.hdMontado).toBe(false);
    expect(RELEVO_INICIAL.hdVisible).toBe(false);
  });

  it("ofrecer alta calidad NO desmonta el secundario", () => {
    const e = correr([{ t: "hd-ofrecido" }]);
    expect(e.subMontado).toBe(true);
    expect(e.hdMontado).toBe(true);
    expect(e.hdVisible).toBe(false);
  });

  it("el cambio ocurre al primer fotograma del principal, no antes", () => {
    const e = correr([{ t: "hd-ofrecido" }, { t: "hd-fotograma" }]);
    expect(e.hdVisible).toBe(true);
    // Y el secundario sigue montado: la red no se retira en el mismo instante.
    expect(e.subMontado).toBe(true);
  });

  it("el secundario solo se suelta después, y solo si el principal pinta", () => {
    const e = correr([{ t: "hd-ofrecido" }, { t: "hd-fotograma" }, { t: "sub-liberado" }]);
    expect(e.subMontado).toBe(false);
    expect(e.hdVisible).toBe(true);

    // Intentar soltarlo sin principal pintando no hace nada.
    const sinCambio = correr([{ t: "hd-ofrecido" }, { t: "sub-liberado" }]);
    expect(sinCambio.subMontado).toBe(true);
  });

  it("si el principal no da imagen a tiempo, se queda el secundario", () => {
    const e = correr([{ t: "hd-ofrecido" }, { t: "hd-timeout" }]);
    expect(e.subMontado).toBe(true);
    expect(e.hdMontado).toBe(false);
    expect(e.hdVisible).toBe(false);
    expect(e.motivo).toBe("sin-fotograma");
  });

  it("si el principal falla, igual: nunca queda peor que antes", () => {
    const e = correr([{ t: "hd-ofrecido" }, { t: "hd-error" }]);
    expect(e.subMontado).toBe(true);
    expect(e.hdMontado).toBe(false);
    expect(e.motivo).toBe("sin-respuesta");
  });

  it("un fallo TARDÍO, ya soltado el secundario, lo recupera", () => {
    // El peor caso: el principal pintó, se soltó el secundario y entonces se
    // cae. Sin esto el operador se quedaría mirando un cuadro negro.
    const e = correr([
      { t: "hd-ofrecido" },
      { t: "hd-fotograma" },
      { t: "sub-liberado" },
      { t: "hd-error" },
    ]);
    expect(e.subMontado).toBe(true);
    expect(e.hdVisible).toBe(false);
  });

  it("retirar la oferta —salir de Foco— devuelve al secundario con su motivo", () => {
    const e = correr([
      { t: "hd-ofrecido" },
      { t: "hd-fotograma" },
      { t: "sub-liberado" },
      { t: "hd-retirado", motivo: "codec" },
    ]);
    expect(e.subMontado).toBe(true);
    expect(e.hdMontado).toBe(false);
    expect(e.motivo).toBe("codec");
  });

  it("cambiar de cámara vuelve al principio", () => {
    const e = correr([{ t: "hd-ofrecido" }, { t: "hd-fotograma" }, { t: "reinicio" }]);
    expect(e).toEqual(RELEVO_INICIAL);
  });

  it("un fotograma sin oferta no cambia nada", () => {
    const e = correr([{ t: "hd-fotograma" }]);
    expect(e.hdVisible).toBe(false);
    expect(e.subMontado).toBe(true);
  });

  it("es idempotente: repetir un evento no genera estado nuevo", () => {
    // Importa de verdad: `onSize` puede dispararse varias veces y devolver un
    // objeto nuevo cada vez metería la interfaz en un bucle de repintado.
    const a = reducirRelevo(RELEVO_INICIAL, { t: "hd-ofrecido" });
    expect(reducirRelevo(a, { t: "hd-ofrecido" })).toBe(a);

    const b = reducirRelevo(a, { t: "hd-fotograma" });
    expect(reducirRelevo(b, { t: "hd-fotograma" })).toBe(b);

    const c = reducirRelevo(b, { t: "sub-liberado" });
    expect(reducirRelevo(c, { t: "sub-liberado" })).toBe(c);

    const d = reducirRelevo(c, { t: "hd-timeout" });
    expect(reducirRelevo(d, { t: "hd-timeout" })).toBe(d);

    const e = reducirRelevo(RELEVO_INICIAL, { t: "hd-retirado", motivo: "codec" });
    expect(reducirRelevo(e, { t: "hd-retirado", motivo: "codec" })).toBe(e);
  });

  it("en ninguna secuencia de eventos se queda el cuadro sin nada que pintar", () => {
    const todos: EventoRelevo[] = [
      { t: "hd-ofrecido" },
      { t: "hd-fotograma" },
      { t: "sub-liberado" },
      { t: "hd-timeout" },
      { t: "hd-error" },
      { t: "hd-retirado", motivo: null },
      { t: "reinicio" },
    ];
    // Todas las parejas y tríos posibles: si alguna combinación deja el cuadro
    // vacío, esto lo caza sin tener que imaginarla.
    for (const a of todos) {
      for (const b of todos) {
        for (const c of todos) {
          let e = RELEVO_INICIAL;
          for (const ev of [a, b, c]) {
            e = reducirRelevo(e, ev);
            expect(relevoPintaAlgo(e)).toBe(true);
          }
        }
      }
    }
  });
});

describe("lo que ve el operador", () => {
  it("la etiqueta sale de las dimensiones REALES del video, no de lo prometido", () => {
    expect(etiquetaCalidad({ width: 640, height: 360 })).toBe("SD 640×360");
    expect(etiquetaCalidad({ width: 1920, height: 1080 })).toBe("HD 1920×1080");
    // Las terminales de puerta van a 1280×720 en su único canal.
    expect(etiquetaCalidad({ width: 1280, height: 720 })).toBe("HD 1280×720");
  });

  it("sin dimensiones no se inventa nada", () => {
    expect(etiquetaCalidad(null)).toBeNull();
    expect(etiquetaCalidad({ width: 0, height: 0 })).toBeNull();
    expect(etiquetaCalidad({ width: Number.NaN, height: 360 })).toBeNull();
  });

  it("el motivo del backend llega tal cual hasta la pantalla", () => {
    expect(textoSinHd("codec", "el principal va en H.265")).toContain("el principal va en H.265");
    expect(textoCortoSinHd("codec", "el principal va en H.265")).toBe("el principal va en H.265");
  });

  it("cada motivo tiene su explicación, y las que no la necesitan callan", () => {
    expect(textoSinHd("sin-canal")).toContain("no ofrece un canal distinto");
    expect(textoSinHd("sin-fotograma")).toContain("no dio imagen a tiempo");
    expect(textoSinHd("sin-respuesta")).toContain("no respondió");
    expect(textoSinHd("playback")).toContain("canal principal");
    // Que el escenario sea pequeño no es un problema que explicarle a nadie.
    expect(textoSinHd("pequeno")).toBeNull();
    expect(textoSinHd("proveedor")).toBeNull();
    expect(textoSinHd(null)).toBeNull();
    expect(textoCortoSinHd(null)).toBeNull();
    expect(textoCortoSinHd("pequeno")).toBeNull();
  });
});
