import { describe, expect, it } from "vitest";
import {
  borradoresDesdeCampos,
  campoVacio,
  camposQueSeBorran,
  claveDeNombre,
  esErrorDePermiso,
  faltanFotosDeCampos,
  hayErrores,
  MAX_CAMPOS,
  nombreDeContentDisposition,
  nombreLibre,
  nombreZipPorOmision,
  payloadDeCampos,
  progresoDeCampos,
  validarCampos,
  type CampoBorrador,
  type CampoEvidencia,
} from "./evidencia-campos";

function fila(parcial: Partial<CampoBorrador> & { key: string }): CampoBorrador {
  return { id: null, nombre: "", momentos: ["ANTES"], notas: "", ...parcial };
}

function campo(parcial: Partial<CampoEvidencia> & { id: number; nombre: string }): CampoEvidencia {
  return {
    momentos: ["ANTES", "DESPUES"],
    notas: null,
    orden: 0,
    fotos: { ANTES: null, EN_PROGRESO: null, DESPUES: null },
    pendientes: ["ANTES", "DESPUES"],
    completo: false,
    ...parcial,
  };
}

const foto = (id: number, momento: "ANTES" | "EN_PROGRESO" | "DESPUES") => ({
  id,
  momento,
  photoUrl: `/activities/${id}.jpg`,
  latitude: null,
  longitude: null,
  capturedAt: "2026-09-17T10:00:00.000Z",
  por: { id: 7, nombre: "Carolina" },
});

describe("claveDeNombre", () => {
  it("ignora acentos, mayúsculas y espacios de más", () => {
    expect(claveDeNombre("  Cámara   1 ")).toBe(claveDeNombre("camara 1"));
    expect(claveDeNombre("Canalización")).toBe("canalizacion");
  });
});

describe("nombreLibre", () => {
  it("numera los presets que se repiten mucho", () => {
    expect(nombreLibre("Cámara", [], true)).toBe("Cámara 1");
    expect(nombreLibre("Cámara", ["Cámara 1", "camara 2"], true)).toBe("Cámara 3");
  });

  it("usa el nombre tal cual la primera vez y numera desde 2 después", () => {
    expect(nombreLibre("Rack", [], false)).toBe("Rack");
    expect(nombreLibre("Rack", ["rack"], false)).toBe("Rack 2");
    expect(nombreLibre("Rack", ["Rack", "Rack 2"], false)).toBe("Rack 3");
  });
});

describe("validarCampos", () => {
  it("una lista vacía no tiene errores", () => {
    expect(hayErrores(validarCampos([]))).toBe(false);
  });

  it("pide nombre y al menos un momento", () => {
    const errores = validarCampos([
      fila({ key: "a", nombre: "   " }),
      fila({ key: "b", nombre: "Rack", momentos: [] }),
      fila({ key: "c", nombre: "NVR", momentos: ["DESPUES"] }),
    ]);
    expect(errores.porFila.a).toMatch(/Escribe qué hay que fotografiar/);
    expect(errores.porFila.b).toMatch(/al menos un momento/);
    expect(errores.porFila.c).toBeUndefined();
    expect(hayErrores(errores)).toBe(true);
  });

  it("no deja dos puntos con el mismo nombre (serían la misma carpeta del ZIP)", () => {
    const errores = validarCampos([
      fila({ key: "a", nombre: "Cámara 1" }),
      fila({ key: "b", nombre: "camara 1" }),
    ]);
    expect(errores.porFila.a).toBeUndefined();
    expect(errores.porFila.b).toMatch(/Ya hay otro punto llamado «Cámara 1»/);
  });

  it("avisa cuando se pasa del máximo de la API", () => {
    const filas = Array.from({ length: MAX_CAMPOS + 1 }, (_, i) => fila({ key: `k${i}`, nombre: `Punto ${i}` }));
    expect(validarCampos(filas).general).toMatch(/hasta 40/);
  });
});

describe("payloadDeCampos", () => {
  it("manda la lista completa con id cuando existe, momentos en orden y sin notas vacías", () => {
    const payload = payloadDeCampos([
      fila({ key: "a", id: 12, nombre: "  Cámara 1 ", momentos: ["DESPUES", "ANTES"], notas: "  " }),
      fila({ key: "b", nombre: "Canalización", momentos: ["EN_PROGRESO"], notas: " Antes de cerrar la tapa " }),
    ]);
    expect(payload).toEqual({
      campos: [
        { id: 12, nombre: "Cámara 1", momentos: ["ANTES", "DESPUES"] },
        { nombre: "Canalización", momentos: ["EN_PROGRESO"], notas: "Antes de cerrar la tapa" },
      ],
    });
  });

  it("una lista vacía quita todos los campos", () => {
    expect(payloadDeCampos([])).toEqual({ campos: [] });
  });
});

describe("borradoresDesdeCampos", () => {
  it("respeta el orden de la API y conserva el id", () => {
    const filas = borradoresDesdeCampos([
      campo({ id: 2, nombre: "Rack", orden: 1, notas: "Frontal" }),
      campo({ id: 1, nombre: "Cámara 1", orden: 0, momentos: ["DESPUES", "ANTES"] }),
    ]);
    expect(filas.map((f) => [f.id, f.nombre, f.momentos, f.notas])).toEqual([
      [1, "Cámara 1", ["ANTES", "DESPUES"], ""],
      [2, "Rack", ["ANTES", "DESPUES"], "Frontal"],
    ]);
  });
});

describe("campoVacio", () => {
  it("genera llaves distintas", () => {
    expect(campoVacio().key).not.toBe(campoVacio().key);
  });
});

describe("progresoDeCampos", () => {
  it("cuenta huecos pedidos y los ya documentados", () => {
    const campos = [
      campo({ id: 1, nombre: "Cámara 1", fotos: { ANTES: foto(1, "ANTES"), DESPUES: null } }),
      campo({ id: 2, nombre: "NVR", momentos: ["DESPUES"], fotos: { DESPUES: foto(2, "DESPUES") } }),
    ];
    expect(progresoDeCampos(campos)).toEqual({ requeridas: 3, cumplidas: 2 });
  });
});

describe("camposQueSeBorran", () => {
  const originales = [
    campo({ id: 1, nombre: "Cámara 1", fotos: { ANTES: foto(1, "ANTES") } }),
    campo({ id: 2, nombre: "Rack" }),
    campo({ id: 3, nombre: "NVR" }),
  ];

  it("el que se renombra conserva sus fotos (va por id)", () => {
    const quedan = [fila({ key: "a", id: 1, nombre: "Cámara acceso" }), fila({ key: "b", id: 2, nombre: "Rack" }), fila({ key: "c", id: 3, nombre: "NVR" })];
    expect(camposQueSeBorran(originales, quedan)).toEqual([]);
  });

  it("uno nuevo con el mismo nombre también conserva el campo (la API empata por nombre)", () => {
    const quedan = [fila({ key: "a", nombre: "cámara 1" }), fila({ key: "b", id: 2, nombre: "Rack" })];
    expect(camposQueSeBorran(originales, quedan).map((c) => c.id)).toEqual([3]);
  });

  it("lo que ya no viene se borra", () => {
    expect(camposQueSeBorran(originales, []).map((c) => c.id)).toEqual([1, 2, 3]);
  });
});

describe("nombreDeContentDisposition", () => {
  it("prefiere filename* (UTF-8) y conserva los acentos", () => {
    const header =
      "attachment; filename=\"AN-0001 C_mara 1.zip\"; filename*=UTF-8''AN-0001%20C%C3%A1mara%201.zip";
    expect(nombreDeContentDisposition(header, "x.zip")).toBe("AN-0001 Cámara 1.zip");
  });

  it("usa filename cuando no hay filename*", () => {
    expect(nombreDeContentDisposition('attachment; filename="reporte.pdf"', "x")).toBe("reporte.pdf");
    expect(nombreDeContentDisposition("attachment; filename=reporte-ticket-4.pdf", "x")).toBe("reporte-ticket-4.pdf");
    expect(nombreDeContentDisposition('attachment; filename="dice \\"hola\\".zip"', "x")).toBe('dice "hola".zip');
  });

  it("si filename* viene roto, cae a filename", () => {
    const header = "attachment; filename=\"respaldo.zip\"; filename*=UTF-8''%E0%A4%A";
    expect(nombreDeContentDisposition(header, "x.zip")).toBe("respaldo.zip");
  });

  it("sin cabecera o sin nombre usa el de respaldo, y nunca deja rutas", () => {
    expect(nombreDeContentDisposition(null, "evidencia.zip")).toBe("evidencia.zip");
    expect(nombreDeContentDisposition("attachment", "evidencia.zip")).toBe("evidencia.zip");
    expect(nombreDeContentDisposition("attachment; filename*=UTF-8''..%2F..%2Fetc.zip", "x")).toBe(".._.._etc.zip");
  });
});

describe("nombreZipPorOmision", () => {
  it("arma «AN título.zip» sin caracteres que Windows no acepta", () => {
    expect(nombreZipPorOmision("AN-0007", "Instalar: cámaras / NVR", 7)).toBe("AN-0007 Instalar cámaras NVR.zip");
    expect(nombreZipPorOmision(null, null, 7)).toBe("evidencia-actividad-7.zip");
  });
});

describe("esErrorDePermiso", () => {
  it("reconoce el 403 de Nest", () => {
    expect(esErrorDePermiso(new Error('{"statusCode":403,"message":"Forbidden resource"}'))).toBe(true);
    expect(esErrorDePermiso(new Error('{"statusCode":404,"message":"No existe"}'))).toBe(false);
    expect(esErrorDePermiso(new Error("texto"))).toBe(false);
  });
});

describe("faltanFotosDeCampos", () => {
  it("cuenta huecos pendientes campo × momento", () => {
    expect(
      faltanFotosDeCampos([
        campo({ id: 1, nombre: "Cámara 1", fotos: { ANTES: foto(1, "ANTES") } }),
        campo({ id: 2, nombre: "NVR", momentos: ["DESPUES"], fotos: { DESPUES: null }, pendientes: ["DESPUES"] }),
      ]),
    ).toBe(2);
  });

  it("sin campos no falta nada", () => {
    expect(faltanFotosDeCampos([])).toBe(0);
  });
});
