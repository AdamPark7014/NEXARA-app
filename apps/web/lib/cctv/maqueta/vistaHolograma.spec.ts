import { describe, expect, it } from "vitest";
import {
  acercar,
  desplazar,
  encuadrar,
  girar,
  inclinar,
  vistaArriba,
  vistaDesdeCara,
  vistaFrente,
  vistaIsometrica,
  type VistaHolograma,
} from "./vistaHolograma";

const base = (): VistaHolograma => ({
  azimutDeg: 0,
  elevacionDeg: 35,
  distancia: 20,
  target: { x: 0, y: 0, z: 0 },
});

describe("vistaHolograma", () => {
  it("girar suma azimut y lo normaliza a 0..360", () => {
    expect(girar(base(), 15).azimutDeg).toBe(15);
    expect(girar({ ...base(), azimutDeg: 350 }, 20).azimutDeg).toBe(10);
    expect(girar(base(), -30).azimutDeg).toBe(330);
  });

  it("inclinar clamp 1..89", () => {
    expect(inclinar(base(), 10).elevacionDeg).toBe(45);
    expect(inclinar({ ...base(), elevacionDeg: 85 }, 20).elevacionDeg).toBe(89);
    expect(inclinar({ ...base(), elevacionDeg: 5 }, -20).elevacionDeg).toBe(1);
  });

  it("desplazar mueve el target según el azimut", () => {
    const este = desplazar({ ...base(), azimutDeg: 0 }, 2, 0);
    expect(este.target.x).toBeCloseTo(2);
    expect(este.target.z).toBeCloseTo(0);
    const norte = desplazar({ ...base(), azimutDeg: 0 }, 0, 3);
    expect(norte.target.x).toBeCloseTo(0);
    expect(norte.target.z).toBeCloseTo(-3);
  });

  it("acercar divide la distancia y la acota", () => {
    expect(acercar(base(), 2).distancia).toBe(10);
    expect(acercar({ ...base(), distancia: 1 }, 10).distancia).toBe(0.6);
    expect(acercar({ ...base(), distancia: 300 }, 0.5).distancia).toBe(400);
  });

  it("encuadrar centra y calcula distancia", () => {
    const v = encuadrar(base(), { min: { x: 0, z: 0 }, max: { x: 10, z: 10 } });
    expect(v.target.x).toBe(5);
    expect(v.target.z).toBe(5);
    expect(v.distancia).toBeGreaterThan(10);
    expect(v.azimutDeg).toBe(0);
  });

  it("presets y caras del cubo", () => {
    expect(vistaIsometrica(base()).azimutDeg).toBe(45);
    expect(vistaIsometrica(base()).elevacionDeg).toBe(35);
    expect(vistaArriba(base()).elevacionDeg).toBe(89);
    expect(vistaFrente(base()).elevacionDeg).toBe(20);
    expect(vistaDesdeCara(base(), "este").azimutDeg).toBe(90);
    expect(vistaDesdeCara(base(), "arriba").elevacionDeg).toBe(89);
    expect(vistaDesdeCara(base(), "abajo").elevacionDeg).toBe(1);
  });
});