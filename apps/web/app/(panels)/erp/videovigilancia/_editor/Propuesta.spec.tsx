import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODELOS_CAMARA } from "@/lib/cctv/catalogo";
import { agregarCamara, agregarMuro, agregarPersona, resumenDelPlano } from "@/lib/cctv/editor";
import { planoVacio, tapasDelPlano, type Plano } from "@/lib/cctv/plano";
import { camaraEnMetros, coberturaCamara, type PoligonoCobertura } from "@/lib/cctv/visibilidad";
import FichaCamara from "./FichaCamara";
import Propuesta from "./Propuesta";

function bodega(): Plano {
  let p: Plano = { ...planoVacio(), escala: { metrosPorPx: 0.05, calibracion: { a: { x: 0, y: 0 }, b: { x: 860, y: 0 }, metros: 43 } } };
  for (const [a, b] of [
    [{ x: 0, y: 0 }, { x: 860, y: 0 }],
    [{ x: 860, y: 0 }, { x: 860, y: 400 }],
    [{ x: 860, y: 400 }, { x: 0, y: 400 }],
    [{ x: 0, y: 400 }, { x: 0, y: 0 }],
  ]) p = agregarMuro(p, a, b, { alturaM: 5 }).plano;
  p = agregarCamara(p, { x: 7, y: 7 }, MODELOS_CAMARA[0], { nombre: "Domo 2 Z ALM", rumboDeg: 132, alturaM: 5, inclinacionDeg: 39, distanciaM: 13.8 }).plano;
  p = agregarCamara(p, { x: 850, y: 390 }, MODELOS_CAMARA[2], { nombre: "Bala Exterior 1", rumboDeg: 315, alturaM: 3, distanciaM: 11.5 }).plano;
  return agregarPersona(p, { x: 160, y: 145 });
}

function calculo(plano: Plano) {
  const tapas = tapasDelPlano(plano);
  const coberturas = new Map<string, PoligonoCobertura[]>();
  for (const c of plano.camaras) {
    const cm = camaraEnMetros(c, plano.escala);
    coberturas.set(c.id, cm ? coberturaCamara(cm, tapas) : []);
  }
  return { tapas, coberturas, esHoja: () => false };
}

describe("ficha y propuesta del diseñador", () => {
  it("la ficha muestra alcance en el piso, la vista y la referencia de detalle", () => {
    const plano = bodega();
    const { tapas, coberturas, esHoja } = calculo(plano);
    render(<FichaCamara disenoId={7} disenoNombre="Bodegas VDM" plano={plano} camaraId={plano.camaras[0].id} tapas={tapas} coberturas={coberturas} esHoja={esHoja} />);
    expect(screen.getByRole("heading", { name: "Domo 2 Z ALM" })).toBeInTheDocument();
    expect(screen.getByText("Alcance por nivel de detalle")).toBeInTheDocument();
    expect(screen.getByText("4.3 m")).toBeInTheDocument();
    expect(screen.getByLabelText("Vista desde la cámara 1")).toBeInTheDocument();
    expect(screen.getByLabelText(/Lámina de referencia a 250/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cámara 2/ })).toHaveAttribute("href", expect.stringContaining("/erp/videovigilancia/7/camara/"));
  });

  it("la propuesta arma una hoja por cámara más portada, 3D e infraestructura", () => {
    const plano = bodega();
    const { tapas, coberturas, esHoja } = calculo(plano);
    render(
      <Propuesta
        disenoId={7}
        nombre="Proyecto CCTV Bodegas VDM"
        cliente="Concretos Pronto"
        plano={plano}
        tapas={tapas}
        coberturas={coberturas}
        esHoja={esHoja}
        resumen={resumenDelPlano(plano)}
        grabacion={null}
      />,
    );
    expect(screen.getAllByRole("article")).toHaveLength(5);
    expect(screen.getByText("Hoja 1 de 5")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Vista isométrica del sitio" })).toBeInTheDocument();
    expect(screen.getByText("NVR de 4 canales")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Descargar PDF/ })).toBeInTheDocument();
    expect(screen.getByText("Concretos Pronto")).toBeInTheDocument();
  });
});
