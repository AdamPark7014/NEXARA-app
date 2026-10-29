import { describe, expect, it } from "vitest";
import {
  alcancePisoM,
  alcancesDori,
  anchoSensorMm,
  bandasDori,
  distanciaInclinadaM,
  etiquetaCono,
  focalParaHfov,
  hfovDeg,
  inclinacionHacia,
  metros,
  nivelDori,
  ppm,
  pxPorMegapixeles,
  resumenOptico,
  tramoVisible,
  vfovDeg,
  zonaCiegaM,
  type Optica,
} from "./optica";

// Las tres cámaras de la propuesta «Proyecto CCTV Bodegas VDM» (SYSCOM, 28-10-2026), con
// los datos de óptica que guarda el diseñador en el proyecto.
const domo28: Optica = { pxHoriz: 2560, pxVert: 1440, focalMm: 2.8, sensorAnchoMm: 4.8, sensorFormato: "1/3" };
const domo29: Optica = { ...domo28, focalMm: 2.9 };
const bala180: Optica = { pxHoriz: 2560, pxVert: 1440, focalMm: 2.8, sensorAnchoMm: 6 }; // DS-2CFW06-P
const balaColorVu: Optica = { pxHoriz: 2560, pxVert: 1440, focalMm: 4, sensorAnchoMm: 8.6 }; // DS-2CD1T47G3

describe("ángulo de visión", () => {
  it("sale de focal y sensor como en la ficha de SYSCOM", () => {
    expect(Math.round(hfovDeg(domo28)!)).toBe(81);
    expect(Math.round(hfovDeg(domo29)!)).toBe(79);
    expect(Math.round(hfovDeg(bala180)!)).toBe(94);
    expect(Math.round(hfovDeg(balaColorVu)!)).toBe(94);
  });

  it("toma el ancho del formato cuando la ficha no trae milímetros", () => {
    expect(anchoSensorMm({ sensorFormato: '1/2.8"' })).toBe(5.1);
    expect(hfovDeg({ ...domo28, sensorAnchoMm: null, sensorFormato: "1/3 pulgadas" })).toBeCloseTo(hfovDeg(domo28)!, 6);
  });

  it("el declarado manda (ojo de pez) y sin datos no inventa", () => {
    expect(hfovDeg({ ...domo28, hfovDeclaradoDeg: 180 })).toBe(180);
    expect(hfovDeg({ pxHoriz: 2560, pxVert: 1440, focalMm: 2.8 })).toBeNull();
  });

  it("el vertical respeta la proporción 16:9", () => {
    expect(vfovDeg(domo28)!).toBeCloseTo(51.47, 1);
    expect(vfovDeg({ pxHoriz: 2560, pxVert: 1440, focalMm: 2.8, hfovDeclaradoDeg: 90 })!).toBeCloseTo(58.7, 1);
  });
});

describe("densidad de píxeles y DORI", () => {
  it("reproduce la PPM al final de cada cono de la propuesta", () => {
    const h = (o: Optica) => hfovDeg(o)!;
    expect(Math.round(ppm(2560, 13.757, h(domo28)))).toBe(109); // Domos 1-4, 8, 10, 14
    expect(Math.round(ppm(2560, 13.94, h(domo29)))).toBe(111); // Domo Pasillo
    expect(Math.round(ppm(2560, 11.71, h(bala180)))).toBe(102); // Bala 180 centro 1
    expect(Math.round(ppm(2560, 12.05, h(bala180)))).toBe(99); // Bala 180 centro 2
    expect(Math.round(ppm(2560, 11.46, h(balaColorVu)))).toBe(104); // Bala Exterior 1
  });

  it("los alcances por la visual son los «hasta» de la ficha", () => {
    const a = alcancesDori(2560, hfovDeg(domo28)!);
    expect(metros(a.identificacion)).toBe("6 m");
    expect(metros(a.reconocimiento)).toBe("11.9 m");
    const b = alcancesDori(2560, hfovDeg(domo29)!);
    expect(metros(b.identificacion)).toBe("6.2 m");
    expect(metros(b.reconocimiento)).toBe("12.4 m");
    const c = alcancesDori(2560, hfovDeg(balaColorVu)!);
    expect(metros(c.identificacion)).toBe("4.8 m");
    expect(metros(c.reconocimiento)).toBe("9.5 m");
  });

  it("clasifica con los umbrales de IEC 62676-4", () => {
    expect(nivelDori(250)).toBe("identificacion");
    expect(nivelDori(249.9)).toBe("reconocimiento");
    expect(nivelDori(62.5)).toBe("observacion");
    expect(nivelDori(62)).toBe("deteccion");
    expect(nivelDori(24)).toBe("general");
    expect(etiquetaCono(13.757, ppm(2560, 13.757, hfovDeg(domo28)!))).toBe("14 m · 109 PPM · Observación");
  });

  it("la persona se mide a su centro (0.85 m) desde la lente", () => {
    const h = hfovDeg(domo28)!;
    // «la persona está a 10.3 m con 134 PPM» (Domo 2 Z ALM, montada a 5 m)
    expect(Math.round(ppm(2560, distanciaInclinadaM(10.3, 5), h))).toBe(134);
    // «a 9 m con 151 PPM» (Domo 3 Z ALM)
    expect(Math.round(ppm(2560, distanciaInclinadaM(9, 5), h))).toBe(151);
    // «a 3.3 m con 434 PPM» (Domo Oficina Principal, 2.2 m, lente 2.9 mm)
    expect(Math.round(ppm(2560, distanciaInclinadaM(3.3, 2.2), hfovDeg(domo29)!))).toBe(434);
    expect(distanciaInclinadaM(7, null)).toBe(7);
  });
});

describe("montaje", () => {
  it("la zona ciega al pie coincide con la de la ficha", () => {
    expect(metros(zonaCiegaM(5, 39, vfovDeg(domo28)!))).toBe("2.4 m");
    expect(metros(zonaCiegaM(2.2, 32, vfovDeg(domo29)!))).toBe("1.4 m");
    expect(metros(zonaCiegaM(2.2, 34, vfovDeg(domo28)!))).toBe("1.3 m");
    expect(metros(zonaCiegaM(2.2, 11, vfovDeg(domo29)!))).toBe("3 m");
  });

  it("si el borde superior apunta sobre el horizonte, el piso no termina", () => {
    expect(tramoVisible(3, 10, 51.5).dMaxM).toBe(Number.POSITIVE_INFINITY);
    expect(tramoVisible(3, 90, 51.5).dMinM).toBe(0);
    expect(inclinacionHacia(5, 5)).toBeCloseTo(45, 6);
  });

  it("descuenta la altura para medir en el piso", () => {
    // a 5 m de altura, la identificación del 2.8 mm llega a 4.3 m del poste, no a 6
    expect(alcancePisoM(5.97, 5)).toBeCloseTo(4.29, 2);
    expect(alcancePisoM(3, 5)).toBe(0);
    expect(alcancePisoM(6, null)).toBe(6);
  });
});

describe("bandas y ficha", () => {
  it("arma los anillos de la zona ciega al final del cono", () => {
    const r = bandasDori({ optica: domo28, distanciaM: 13.757, alturaCamM: 5, inclinacionDeg: 39 })!;
    expect(r.zonaCiegaM).toBeCloseTo(2.36, 2);
    expect(r.bandas.map((b) => b.nivel)).toEqual(["identificacion", "reconocimiento", "observacion"]);
    expect(r.bandas[0].hastaM).toBeCloseTo(4.3, 2);
    expect(r.bandas[1].hastaM).toBeCloseTo(11.2, 1);
    expect(r.bandas[2].hastaM).toBeCloseTo(13.757, 3);
  });

  it("resume la ficha con las dos lecturas del alcance", () => {
    const f = resumenOptico({ optica: domo28, distanciaM: 13.757, alturaCamM: 5, inclinacionDeg: 39 })!;
    expect(metros(f.alcancesVisual.reconocimiento)).toBe("11.9 m");
    expect(metros(f.alcances.reconocimiento)).toBe("11.2 m");
    expect(metros(f.alcances.observacion)).toBe("13.8 m");
    expect(Math.round(f.ppmFinal)).toBe(104);
    expect(f.nivelFinal).toBe("observacion");
    expect(metros(f.zonaCiegaM!)).toBe("2.4 m");
  });

  it("varifocal: la focal que da un ángulo, dentro del rango de la lente", () => {
    const vari: Optica = { ...domo28, focalMinMm: 2.8, focalMaxMm: 12 };
    expect(focalParaHfov(vari, 60)!).toBeCloseTo(4.157, 3);
    expect(focalParaHfov(vari, 5)).toBe(12);
    expect(focalParaHfov(domo28, 60)).toBeNull();
    expect(pxPorMegapixeles(4)).toEqual({ pxHoriz: 2560, pxVert: 1440 });
  });
});
