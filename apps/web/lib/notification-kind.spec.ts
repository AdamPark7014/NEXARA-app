import { notificationKind } from "./notification-kind";

describe("íconos de avisos de permisos, cancelación y faltas", () => {
  it("cancelación con motivo", () => {
    expect(notificationKind("activities", "Mantenimiento de CCTV fue cancelada")).toBe("cancelada");
  });

  it("pasar a otro compañero es reasignación, no actividad nueva", () => {
    expect(notificationKind("activities", "Te asignaron Mantenimiento de CCTV para continuarla")).toBe("reasignada");
    expect(notificationKind("activities", "Mantenimiento de CCTV pasó a Roberto Vivanco")).toBe("reasignada");
  });

  it("alta de cliente para Christian", () => {
    expect(notificationKind("sales", "Ana López agregó el cliente Plaza Dorada")).toBe("cliente");
  });
});
