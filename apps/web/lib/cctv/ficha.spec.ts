import { describe, expect, it } from "vitest";
import { leerFilasCatalogo, modeloPorId, registrarCatalogo, type FilaCatalogo } from "./catalogo";
import { camposDeTipo, equipoDesdeForma, faltaParaGuardar, familiaDe, formaDesdeFicha, medidasParaVer, paramsDeForma, type FichaLeida } from "./ficha";

const ficha = (extra: Partial<FichaLeida> = {}): FichaLeida => ({
  familia: "camaras",
  tipo: "domo",
  marca: "HIKVISION",
  modelo: "DS-2CD1143G2-LIU",
  descripcion: "Domo de 4 MP",
  color: "negro",
  cajaTrasera: false,
  lucesVisibles: 6,
  datos: [
    { campo: "pxHoriz", valor: "2560", hoja: 2 },
    { campo: "pxVert", valor: "1440", hoja: 2 },
    { campo: "sensor", valor: '1/3"', hoja: 2 },
    { campo: "focalesMm", valor: "2.8, 4", hoja: 2 },
    { campo: "hfovDeg", valor: "98", hoja: 2 },
    { campo: "irM", valor: "30", hoja: 2 },
    { campo: "poeW", valor: "7.5", hoja: 3 },
    { campo: "diametroMm", valor: "121.4", hoja: 3 },
    { campo: "altoMm", valor: "97.7", hoja: 3 },
    { campo: "radioCupulaMm", valor: "42.4", hoja: 5 },
  ],
  caracteristicas: ["Luz inteligente"],
  archivo: "ficha.pdf",
  hojas: 7,
  escaneado: false,
  ms: 3100,
  ...extra,
});

describe("De la ficha leída al catálogo", () => {
  it("cada dato conserva la hoja de donde salió", () => {
    const f = formaDesdeFicha(ficha());
    expect(f.valores.poeW).toBe("7.5");
    expect(f.hojas.radioCupulaMm).toBe(5);
    expect(f.luces).toBe("6");
  });

  it("una cámara se guarda con la óptica que usa el cálculo de cobertura", () => {
    const e = equipoDesdeForma(formaDesdeFicha(ficha()), { archivo: "ficha.pdf", hojas: 7 }, null);
    expect(e).toMatchObject({ familia: "camaras", tipo: "domo", fuente: "ficha", marca: "HIKVISION" });
    expect(e.datos).toMatchObject({
      wattsPoe: 7.5,
      optica: { pxHoriz: 2560, pxVert: 1440, focalMm: 2.8, focalMinMm: 2.8, focalMaxMm: 4, sensorFormato: "1/3", hfovDeclaradoDeg: 98, irM: 30 },
      apariencia: { color: "negro", luces: 6 },
      ficha: { archivo: "ficha.pdf", hojas: 7, fuentes: { poeW: 3 } },
    });
    expect(e.medidas).toEqual({ diametroMm: 121.4, altoMm: 97.7, radioCupulaMm: 42.4 });
  });

  it("un equipo guarda lo que da su comportamiento", () => {
    const e = equipoDesdeForma(
      formaDesdeFicha(ficha({ tipo: "switch", modelo: "DS-3E0526P-E", datos: [{ campo: "puertos", valor: "24", hoja: 2 }, { campo: "poeTotalW", valor: "370", hoja: 2 }, { campo: "anchoMm", valor: "440", hoja: 2 }] })),
      { archivo: "x.pdf", hojas: 5 },
      "data:image/webp;base64,AAAA",
    );
    expect(e.familia).toBe("red");
    expect(e.datos).toMatchObject({ puertos: 24, poeTotalW: 370, foto: "data:image/webp;base64,AAAA" });
    expect(e.datos).not.toHaveProperty("optica");
  });

  it("sin resolución o sin lente una cámara no se guarda, y lo dice", () => {
    const sinLente = ficha({ datos: [{ campo: "pxHoriz", valor: "2560", hoja: 1 }, { campo: "pxVert", valor: "1440", hoja: 1 }] });
    expect(faltaParaGuardar(formaDesdeFicha(sinLente))).toContain("lente");
    expect(faltaParaGuardar(formaDesdeFicha(ficha({ datos: [] })))).toContain("resolución");
    expect(faltaParaGuardar(formaDesdeFicha(ficha({ modelo: " " })))).toContain("clave");
    expect(faltaParaGuardar(formaDesdeFicha(ficha()))).toBeNull();
  });

  it("un equipo que no es cámara no necesita óptica", () => {
    expect(faltaParaGuardar(formaDesdeFicha(ficha({ tipo: "sirena", datos: [] })))).toBeNull();
  });

  it("el modelo 3D recibe las medidas y lo que falta se queda sin mandar", () => {
    const p = paramsDeForma(formaDesdeFicha(ficha()));
    expect(p).toMatchObject({ diametroMm: 121.4, altoMm: 97.7, radioCupulaMm: 42.4, color: "negro", ledsVisibles: 6 });
    expect(p.anchoMm).toBeUndefined();
  });

  it("la pluma de la barrera pasa de metros a milímetros", () => {
    expect(paramsDeForma(formaDesdeFicha(ficha({ tipo: "barrera", datos: [{ campo: "plumaM", valor: "3", hoja: 1 }] }))).largoMm).toBe(3000);
  });

  it("enseña las medidas según la forma del equipo y dice cuando no vienen", () => {
    expect(medidasParaVer(formaDesdeFicha(ficha())).map((m) => m.valor)).toEqual(["121.4 mm", "97.7 mm", "R 42.4 mm"]);
    expect(medidasParaVer(formaDesdeFicha(ficha({ tipo: "nvr", datos: [] }))).map((m) => m.valor)).toEqual(["No viene", "No viene", "No viene"]);
  });

  it("cada tipo pregunta solo lo que le aplica", () => {
    expect(camposDeTipo("nvr")).toContain("canales");
    expect(camposDeTipo("nvr")).not.toContain("pxHoriz");
    expect(camposDeTipo("domo")).toContain("radioCupulaMm");
    expect(camposDeTipo("bala")).not.toContain("diametroMm");
    expect(familiaDe("sismica")).toBe("alarmas");
  });
});

describe("Lo guardado, de regreso en el diseñador", () => {
  const fila = (datos: Record<string, unknown>, extra: Partial<FilaCatalogo> = {}): FilaCatalogo => ({ id: 7, familia: "red", tipo: "switch", marca: "H", modelo: "X", descripcion: "", datos, medidas: { anchoMm: 440 }, caracteristicas: [], fuente: "ficha", verificado: false, productId: null, ...extra });

  it("la foto, la apariencia y el origen no viajan a los equipos que se colocan", () => {
    const { equipos } = leerFilasCatalogo([fila({ puertos: 24, foto: "data:image/webp;base64,AAAA", apariencia: { color: "negro" }, ficha: { archivo: "x.pdf" } })]);
    expect(equipos[0].datos).toEqual({ puertos: 24 });
    expect(equipos[0].foto).toBe("data:image/webp;base64,AAAA");
    expect(equipos[0].apariencia).toEqual({ color: "negro" });
  });

  it("una cámara guardada se encuentra con su foto y su color", () => {
    const { camaras, equipos } = leerFilasCatalogo([
      fila({ optica: { pxHoriz: 2560, pxVert: 1440, focalMm: 2.8 }, foto: "data:image/webp;base64,BBBB", apariencia: { color: "negro", luces: 6 } }, { familia: "camaras", tipo: "domo" }),
    ]);
    registrarCatalogo(camaras, equipos);
    expect(modeloPorId("db-7")).toMatchObject({ foto: "data:image/webp;base64,BBBB", apariencia: { color: "negro", luces: 6 } });
    registrarCatalogo([], []);
  });
});
