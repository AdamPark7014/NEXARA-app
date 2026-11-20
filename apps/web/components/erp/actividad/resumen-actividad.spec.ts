import { describe, expect, it } from "vitest";
import {
  armarResumenActividad,
  contarAyudantes,
  labelTipoServicio,
} from "./resumen-actividad";

const MOM = ["ANTES", "EN_PROGRESO", "DESPUES"];
const notaCams = "Antes: punto. · Durante: fijada. · Después: en vivo.";

function cams(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    nombre: `Cámara ${i + 1}`,
    momentos: [...MOM],
    notas: notaCams,
  }));
}

describe("labelTipoServicio", () => {
  it("marca falla, preventivo, instalación y emergencia", () => {
    expect(labelTipoServicio("CORRECTIVO")).toEqual({ label: "Falla (correctivo)", tono: "danger" });
    expect(labelTipoServicio("PREVENTIVO")).toEqual({ label: "Preventivo", tono: "success" });
    expect(labelTipoServicio("INSTALACION")).toEqual({ label: "Instalación", tono: "brand" });
    expect(labelTipoServicio("EMERGENCIA")).toEqual({ label: "Garantía / emergencia", tono: "warning" });
  });
});

describe("contarAyudantes", () => {
  it("cuenta activos que no son responsable ni LEAD", () => {
    const n = contarAyudantes({
      responsable: { id: 1, nombre: "Carlos" },
      assignees: [
        { rol: "LEAD", user: { id: 9, nombre: "Luis" } },
        { rol: "TECNICO", user: { id: 1, nombre: "Carlos" } },
        { rol: "TECNICO", user: { id: 2, nombre: "Ana" } },
        { rol: "APOYO", user: { id: 3, nombre: "Bet" } },
        { rol: "TECNICO", retiradoAt: "2026-01-01", user: { id: 4, nombre: "Viejo" } },
      ],
    });
    expect(n).toBe(2);
  });
});

describe("armarResumenActividad", () => {
  it("proyecto con cámaras: QUÉ resume grupos y PARA QUIÉN liga cliente/proyecto", () => {
    const vista = armarResumenActividad({
      activity: {
        titulo: "Instalación Plaza Norte",
        coreKind: "proyecto",
        prioridad: "ALTA",
        estatus: "En Proceso",
        client: { id: 10, name: "Anfora", salesClients: [{ id: 55, name: "Anfora" }] },
        project: { id: 30, title: "CCTV Plaza Norte" },
        projectMilestone: { id: 7, name: "Cableado" },
        branchName: "Sucursal Centro",
        branchCity: "Puebla",
        responsable: { id: 1, nombre: "Carlos Pérez" },
        creador: { id: 8, nombre: "Luis" },
        assignees: [
          { rol: "TECNICO", user: { id: 1, nombre: "Carlos Pérez" } },
          { rol: "APOYO", user: { id: 2, nombre: "Ana" } },
        ],
        fechaInicio: "2026-11-20T10:00:00.000Z",
        fechaEntregaEsperada: "2026-11-20T18:00:00.000Z",
        tiempoEstandarMin: 240,
        cotizacion: { id: 90, quoteNumber: "COT-2026-001", status: "APROBADA" },
      },
      camposEvidencia: [
        ...cams(4),
        { nombre: "Grabador (NVR)", momentos: [...MOM], notas: "NVR" },
        { nombre: "Pruebas y entrega", momentos: ["DESPUES"], notas: "ok" },
      ],
    });

    const que = vista.bloques.find((b) => b.id === "que")!;
    expect(que.titulo).toBe("Instalación Plaza Norte");
    expect(que.lineas[0]?.texto).toContain("Cámara 1");
    expect(que.lineas[0]?.texto).toContain("Grabador (NVR)");

    const para = vista.bloques.find((b) => b.id === "paraQuien")!;
    expect(para.titulo).toBe("Anfora");
    expect(para.href).toBe("/erp/clientes/55");
    expect(para.lineas.some((l) => l.href === "/erp/proyectos/30")).toBe(true);

    const porQue = vista.bloques.find((b) => b.id === "porQue")!;
    expect(porQue.titulo).toBe("COT-2026-001");
    expect(porQue.href).toBe("/erp/cotizaciones/90");

    const quien = vista.bloques.find((b) => b.id === "quien")!;
    expect(quien.titulo).toBe("Carlos Pérez");
    expect(quien.lineas.some((l) => /1 ayudante/.test(l.texto))).toBe(true);

    const cuando = vista.bloques.find((b) => b.id === "cuando")!;
    expect(cuando.lineas.some((l) => /Tiempo estándar/.test(l.texto))).toBe(true);
    expect(cuando.lineas.some((l) => /Entrega a más tardar/.test(l.texto))).toBe(true);

    expect(vista.cabecera.prioridad?.clave).toBe("ALTA");
  });

  it("servicio correctivo pone falla en POR QUÉ", () => {
    const vista = armarResumenActividad({
      activity: {
        titulo: "DVR sin grabar",
        coreKind: "servicio",
        ticketType: "CORRECTIVO",
        estatus: "Asignada",
        client: { name: "Cliente X" },
      },
    });
    const porQue = vista.bloques.find((b) => b.id === "porQue")!;
    expect(porQue.titulo).toBe("Falla (correctivo)");
    expect(porQue.tono).toBe("danger");
  });

  it("tarea Otro libre muestra el nombre en QUÉ", () => {
    const vista = armarResumenActividad({
      activity: {
        titulo: "Trámite IMSS",
        coreKind: "tarea",
        ticketType: "OTRO",
        ticketTypeCustom: "Otro: Póliza IMSS",
      },
    });
    const que = vista.bloques.find((b) => b.id === "que")!;
    expect(que.lineas[0]?.texto).toBe("Póliza IMSS");
  });

  it("administrativa sin campos usa el tipo como subtítulo", () => {
    const vista = armarResumenActividad({
      activity: {
        titulo: "Factura del mes",
        coreKind: "administrativa",
        ticketType: "OTRO",
        ticketTypeCustom: "ADMINISTRATIVA",
      },
    });
    const que = vista.bloques.find((b) => b.id === "que")!;
    expect(que.lineas[0]?.texto).toBe("Administrativa");
  });

  it("comercial sin cotización: Asignada por el creador", () => {
    const vista = armarResumenActividad({
      activity: {
        titulo: "Propuesta Anfora",
        coreKind: "comercial",
        creador: { id: 3, nombre: "Ana" },
      },
    });
    const porQue = vista.bloques.find((b) => b.id === "porQue")!;
    expect(porQue.titulo).toBe("Asignada por Ana");
  });

  it("cabecera: por vencer y retraso según entrega a más tardar", () => {
    const ahora = new Date("2026-11-20T12:00:00.000Z");
    const porVencer = armarResumenActividad({
      ahora,
      activity: {
        titulo: "A",
        estatus: "En Proceso",
        inicioRealAt: "2026-11-20T10:00:00.000Z",
        fechaEntregaEsperada: "2026-11-20T12:15:00.000Z",
      },
    });
    expect(porVencer.cabecera.tiempo?.semaforo).toBe("amarillo");
    expect(porVencer.cabecera.tiempo?.chip).toMatch(/Por vencer|Atención/);
    expect(porVencer.cabecera.tiempo?.reloj).toMatch(/Faltan/);

    const tarde = armarResumenActividad({
      ahora,
      activity: {
        titulo: "B",
        estatus: "En Proceso",
        inicioRealAt: "2026-11-20T10:00:00.000Z",
        fechaEntregaEsperada: "2026-11-20T11:00:00.000Z",
      },
    });
    expect(tarde.cabecera.tiempo?.semaforo).toBe("rojo");
    expect(tarde.cabecera.tiempo?.chip).toMatch(/Atrasada/);
    expect(tarde.cabecera.tiempo?.reloj).toMatch(/Retraso/);
  });
});
