import { RADIO_ACTIVIDAD_M, distanciaM, formatoDistancia, mensajeSalidaFueraDeZona, puntoReal } from "./activity-geofence";
import { notificationKind } from "./notification-kind";

describe("geocerca de actividades (web)", () => {
  const zocaloPuebla = { latitude: 19.0414, longitude: -98.2063 };

  it("mide en metros como la API: ~0.001° de latitud son ~111 m", () => {
    const d = distanciaM(zocaloPuebla, { latitude: 19.0424, longitude: -98.2063 });
    expect(d).toBeGreaterThanOrEqual(109);
    expect(d).toBeLessThanOrEqual(113);
    expect(d).toBeGreaterThan(RADIO_ACTIVIDAD_M);
  });

  it("descarta lecturas sin GPS: (0,0), vacías o fuera de rango", () => {
    expect(puntoReal(0, 0)).toBeNull();
    expect(puntoReal(null, -98.2)).toBeNull();
    expect(puntoReal("", "")).toBeNull();
    expect(puntoReal(91, 0)).toBeNull();
    expect(puntoReal("19.0414", "-98.2063")).toEqual(zocaloPuebla);
  });

  it("bloquea la salida con el mismo mensaje que la API", () => {
    expect(mensajeSalidaFueraDeZona(245)).toBe(
      "La salida se registra donde iniciaste la actividad: estás a 245 m y el máximo es 100 m. " +
        "Regresa al punto de inicio para tomar la foto de salida.",
    );
  });

  it("formatea distancias cortas en metros y largas en kilómetros", () => {
    expect(formatoDistancia(35)).toBe("35 m");
    expect(formatoDistancia(1250)).toBe("1.3 km");
    expect(formatoDistancia(null)).toBe("—");
  });

  it("clasifica los avisos de salida de zona con su propio icono", () => {
    expect(notificationKind("activities", "Estás fuera de la zona de tu actividad")).toBe("fuera_zona");
    expect(notificationKind("activities", "Luis Pérez salió de la zona de su actividad")).toBe("fuera_zona");
    expect(notificationKind("activities", "Luis Pérez justificó su salida de zona")).toBe("fuera_zona");
    expect(notificationKind("attendance", "Registraste tu salida")).toBe("salida");
  });
});
