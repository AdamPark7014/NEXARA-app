import { notificationKind } from "./notification-kind";

describe("íconos de avisos de permisos, cancelación y faltas", () => {
  it("cancelación con motivo", () => {
    expect(notificationKind("activities", "Mantenimiento de CCTV fue cancelada")).toBe("cancelada");
  });

  it("pasar a otro compañero es reasignación, no actividad nueva", () => {
    expect(notificationKind("activities", "Te asignaron Mantenimiento de CCTV para continuarla")).toBe("reasignada");
    expect(notificationKind("activities", "Mantenimiento de CCTV pasó a Roberto Vivanco")).toBe("reasignada");
  });

  it("falta justificada (persona y jefes), sin confundirse con entrada o salida", () => {
    expect(notificationKind("attendance", "Tu falta del jue 17 sep quedó justificada")).toBe("falta_justificada");
    expect(notificationKind("attendance", "Israel Ramos: falta del jue 17 sep justificada")).toBe("falta_justificada");
    expect(notificationKind("attendance", "Israel Ramos entró a trabajar")).toBe("entrada");
  });

  it("alta de cliente para Christian", () => {
    expect(notificationKind("sales", "Ana López agregó el cliente Plaza Dorada")).toBe("cliente");
  });
});

describe("íconos de cumpleaños y aniversarios", () => {
  it("cumpleaños: a quien celebra y al resto del equipo", () => {
    expect(notificationKind("celebraciones", "¡Feliz cumpleaños, Ana! 🎂")).toBe("cumpleanos");
    expect(notificationKind("celebraciones", "Hoy es cumpleaños de Ana López 🎂")).toBe("cumpleanos");
  });

  it("aniversario: a quien celebra y al resto del equipo", () => {
    expect(notificationKind("celebraciones", "¡Felicidades, Ana! 🎉")).toBe("aniversario");
    expect(notificationKind("celebraciones", "Ana López cumple 3 años en NEXARA 🎉")).toBe("aniversario");
    expect(notificationKind("celebraciones", "Ana López cumple 1 año en NEXARA 🎉")).toBe("aniversario");
  });

  it("se reconocen por el título aunque falte la categoría", () => {
    expect(notificationKind(null, "Hoy es cumpleaños de Israel Ramos 🎂")).toBe("cumpleanos");
    expect(notificationKind("general", "Israel Ramos cumple 2 años en NEXARA 🎉")).toBe("aniversario");
  });

  it("un nombre con palabras del checador no cambia el ícono", () => {
    expect(notificationKind("celebraciones", "Hoy es cumpleaños de Luis Salida Entrada 🎂")).toBe("cumpleanos");
  });

  it("solo la categoría (chip de la bandeja) usa el ícono de celebración", () => {
    expect(notificationKind("celebraciones", null)).toBe("aniversario");
  });
});
