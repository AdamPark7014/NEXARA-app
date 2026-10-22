import { estatusUi } from "./activity-labels";
import { notificationKind } from "./notification-kind";
import { statusTone } from "@/components/base/estado-tono";
import { tonoDeEstado } from "@/components/chat/folios";
import { estadoDeActividad } from "@/components/pizarra/equipo-estado";
import { puedeIniciar } from "./actividad-tiempos";

describe("estatus «No cumplida»", () => {
  it("se ve como falla, no como «Por empezar» ni como cancelada", () => {
    expect(estatusUi("No cumplida")).toMatchObject({ label: "No cumplida", tone: "danger" });
    expect(statusTone("No cumplida").tone).toBe("danger");
    expect(tonoDeEstado("No cumplida")).toBe("alta");
    expect(estadoDeActividad({ estatus: "No cumplida", semaforo: "rojo" })).toBe("No cumplida");
  });

  it("está cerrada: ya no se puede iniciar", () => {
    expect(
      puedeIniciar({ estatus: "No cumplida", aceptacion: "ACEPTADA", despachador: false, inicioRealAt: null } as never),
    ).toBe(false);
  });

  it("los avisos del cierre de jornada usan el ícono de vencida", () => {
    expect(notificationKind("activities", "Mantenimiento de CCTV: no cumplida")).toBe("vencida");
    expect(notificationKind("activities", "Mantenimiento de CCTV cierra a las 18:00")).toBe("vencida");
  });
});
