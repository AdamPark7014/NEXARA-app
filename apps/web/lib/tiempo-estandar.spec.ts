import { describe, expect, it } from "vitest";
import {
  calcularEstandar,
  claveEstandar,
  estandarDeRegistro,
  motivoValido,
  payloadEstandar,
  reglaPara,
  resumenEstandar,
  textoFaltan,
  type ReglaEstandar,
  type TablaEstandar,
} from "./tiempo-estandar";

const u = (clave: string, singular: string, plural: string, porUnidadMin: number) => ({
  clave,
  singular,
  plural,
  pregunta: `¿Cuántos ${plural}?`,
  porUnidadMin,
});

// Copia de las reglas de la API que se prueban (apps/api/src/ai/estandar/tabla-estandar.ts).
const TABLA: TablaEstandar = {
  topeMin: 720,
  origen: { nombre: "Oficina NEXARA" },
  reglas: [
    { clave: "comercial", nombre: "Cotización", baseMin: 40, unidades: [u("partidas", "partida", "partidas", 4)], destino: false, enLugarMin: 0 },
    { clave: "tarea:Instalación", nombre: "Instalación", baseMin: 30, unidades: [u("dispositivos", "dispositivo", "dispositivos", 45)], destino: false, enLugarMin: 0 },
    {
      clave: "tarea:Cableado y canalización",
      nombre: "Cableado y canalización",
      baseMin: 0,
      unidades: [u("nodos", "nodo", "nodos", 45), u("metros", "metro de tubería", "metros de tubería", 4)],
      destino: false,
      enLugarMin: 0,
    },
    {
      clave: "tarea:Preparación de equipo",
      nombre: "Preparación de equipo",
      baseMin: 0,
      unidades: [],
      porComplejidad: { BASICA: 15, ESTANDAR: 15, COMPLEJA: 45, CRITICA: 45 },
      destino: false,
      enLugarMin: 0,
    },
    { clave: "tarea:Recolección", nombre: "Recolección", baseMin: 0, unidades: [], destino: true, enLugarMin: 15 },
    { clave: "tarea:Junta", nombre: "Junta", baseMin: 0, unidades: [], destino: false, enLugarMin: 0, agenda: true },
    { clave: "servicio:CORRECTIVO", nombre: "Servicio correctivo", baseMin: 0, unidades: [], porComplejidad: { BASICA: 60, ESTANDAR: 120, COMPLEJA: 210, CRITICA: 300 }, destino: true, enLugarMin: 0 },
    {
      clave: "obra",
      nombre: "Obra",
      baseMin: 30,
      unidades: [u("dispositivos", "dispositivo", "dispositivos", 45), u("nodos", "nodo", "nodos", 45), u("metros", "metro de tubería", "metros de tubería", 4)],
      destino: false,
      enLugarMin: 0,
    },
  ],
};
const regla = (clave: string) => TABLA.reglas.find((r) => r.clave === clave) as ReglaEstandar;

describe("la misma cuenta que la API (§8)", () => {
  it("cotización: 40 min + 4 por partida (5 → 1 h, 50 → 4 h)", () => {
    expect(calcularEstandar(regla("comercial"), { cantidad: 5 }).totalMin).toBe(60);
    const r = calcularEstandar(regla("comercial"), { cantidad: 50 });
    expect(r.totalMin).toBe(240);
    expect(r.desglose).toEqual([
      { concepto: "Base de cotización", minutos: 40 },
      { concepto: "50 partidas × 4 min", minutos: 200 },
    ]);
  });

  it("instalación por dispositivo, con tope de 12 h", () => {
    expect(calcularEstandar(regla("tarea:Instalación"), { cantidad: 8 }).totalMin).toBe(390);
    expect(calcularEstandar(regla("tarea:Instalación"), { cantidad: 20 })).toMatchObject({ totalMin: 720, topado: true });
  });

  it("sin cantidad no hay total y dice qué falta", () => {
    const r = calcularEstandar(regla("tarea:Instalación"), {});
    expect(r).toMatchObject({ totalMin: null, faltan: ["cantidad"] });
    expect(textoFaltan(r.faltan, regla("tarea:Instalación"))).toBe("Para calcularlo falta la cantidad de dispositivos.");
  });

  it("cableado por metros si se elige esa unidad; obra con las mismas tarifas", () => {
    expect(calcularEstandar(regla("tarea:Cableado y canalización"), { cantidad: 120, unidad: "metros" }).totalMin).toBe(480);
    expect(calcularEstandar(regla("obra"), { cantidad: 60, unidad: "metros" }).totalMin).toBe(270);
    expect(calcularEstandar(regla("obra"), { cantidad: 4 }).totalMin).toBe(210);
  });

  it("por complejidad en los tipos sin cantidad; el servicio pide además el destino", () => {
    expect(calcularEstandar(regla("tarea:Preparación de equipo"), { complejidad: "COMPLEJA" }).totalMin).toBe(45);
    const r = calcularEstandar(regla("servicio:CORRECTIVO"), {});
    expect(r.faltan).toEqual(["complejidad", "destino"]);
    expect(textoFaltan(r.faltan, regla("servicio:CORRECTIVO"))).toBe("Para calcularlo falta la complejidad y el destino.");
  });

  it("salidas: ida + vuelta + en el lugar, redondeado a 5 min", () => {
    const r = calcularEstandar(regla("tarea:Recolección"), { traslado: { idaMin: 18, vueltaMin: 21 } });
    expect(r.totalMin).toBe(55);
    expect(r.desglose.map((d) => d.concepto)).toEqual(["Ida", "Vuelta", "En el lugar"]);
  });

  it("juntas van por agenda: sin estándar", () => {
    expect(calcularEstandar(regla("tarea:Junta"), {})).toMatchObject({ totalMin: null, faltan: [] });
  });
});

describe("qué regla le toca a lo que se asigna", () => {
  it("tarea por su subtipo, servicio por su tipo, lo demás por el tipo Core", () => {
    expect(claveEstandar({ coreKind: "tarea", tipoTarea: "Instalación" })).toBe("tarea:Instalación");
    expect(claveEstandar({ coreKind: "tarea", tipoTarea: null })).toBeNull();
    expect(claveEstandar({ coreKind: "servicio", ticketType: "correctivo" })).toBe("servicio:CORRECTIVO");
    expect(claveEstandar({ coreKind: "servicio" })).toBe("servicio:PREVENTIVO");
    expect(claveEstandar({ coreKind: "Comercial" })).toBe("comercial");
    expect(claveEstandar({ coreKind: "" })).toBeNull();
  });

  it("encuentra la regla sin pelear con acentos ni mayúsculas; si no hay, null", () => {
    expect(reglaPara(TABLA, "tarea:instalacion")?.clave).toBe("tarea:Instalación");
    expect(reglaPara(TABLA, "obra")?.nombre).toBe("Obra");
    expect(reglaPara(TABLA, "proyecto")).toBeNull();
    expect(reglaPara(null, "obra")).toBeNull();
  });
});

describe("lo que se guarda y se lee", () => {
  const guardado = {
    unidades: { clave: "partidas", cantidad: 50 },
    destino: null,
    trasladoMin: null,
    trasladoModo: null,
    tiempoEstandarMin: 240,
    estandarDesglose: [
      { concepto: "Base de cotización", minutos: 40 },
      { concepto: "50 partidas × 4 min", minutos: 200 },
    ],
    estandarCambiadoMotivo: null,
  };

  it("el payload lleva los campos de la API; sin estándar no manda nada", () => {
    expect(payloadEstandar(guardado)).toMatchObject({ unidades: { clave: "partidas", cantidad: 50 }, tiempoEstandarMin: 240, estandarCambiadoMotivo: null });
    expect(payloadEstandar({ ...guardado, estandarCambiadoMotivo: "   " }).estandarCambiadoMotivo).toBeNull();
    expect(payloadEstandar(null)).toEqual({});
  });

  it("lee lo guardado en la actividad; sin estándar, null", () => {
    expect(estandarDeRegistro({ ...guardado, trasladoModo: "TRANSPORTE" })).toMatchObject({ tiempoEstandarMin: 240, trasladoModo: "TRANSPORTE" });
    expect(estandarDeRegistro({ titulo: "x" })).toBeNull();
  });

  it("el resumen del detalle trae el desglose, el destino y el motivo si se cambió", () => {
    const fmt = (m: number) => `${m} min`;
    expect(resumenEstandar(guardado, fmt)).toEqual({
      valor: "240 min",
      detalle: "Base de cotización 40 min · 50 partidas × 4 min 200 min",
    });
    const conTodo = resumenEstandar(
      { ...guardado, destino: { direccion: "Proveedor, Blvd. Norte", lat: 19, lng: -98 }, trasladoModo: "TRANSPORTE", estandarCambiadoMotivo: "Sitio en obra negra" },
      fmt,
    );
    expect(conTodo?.detalle).toContain("Destino: Proveedor, Blvd. Norte (en transporte)");
    expect(conTodo?.detalle).toContain("Se cambió el tiempo: Sitio en obra negra");
    expect(resumenEstandar(null, fmt)).toBeNull();
  });

  it("cambiar el tiempo pide un motivo de verdad", () => {
    expect(motivoValido("ok")).toBe(false);
    expect(motivoValido("   hola   ")).toBe(false);
    expect(motivoValido("Hay que abrir muro")).toBe(true);
  });
});
