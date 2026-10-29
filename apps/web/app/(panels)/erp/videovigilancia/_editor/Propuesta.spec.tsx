import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODELOS_CAMARA } from "@/lib/cctv/catalogo";
import { agregarCamara, agregarMuro, agregarPersona, resumenDelPlano } from "@/lib/cctv/editor";
import { agregarNivel, copiarMurosDeAbajo, listaNiveles, planoDeNivel, reemplazarNivel, siguienteNumeroGlobal, todasLasCamaras } from "@/lib/cctv/niveles";
import { planoVacio, type Plano } from "@/lib/cctv/plano";
import { calcularNivel } from "./calculo";
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

/** La bodega con un mezzanine de oficinas encima y una cámara (la 3). */
function conMezzanine(): { raiz: Plano; mezz: string } {
  const { raiz, id } = agregarNivel(bodega(), { nombre: "Mezzanine oficinas" });
  const conMuros = copiarMurosDeAbajo(raiz, id);
  const n = siguienteNumeroGlobal(conMuros);
  const arriba = agregarCamara(planoDeNivel(conMuros, id), { x: 400, y: 200 }, MODELOS_CAMARA[0], { numero: n, nombre: "Domo Mezzanine norte", alturaM: 2.7, distanciaM: 8 });
  return { raiz: reemplazarNivel(conMuros, id, arriba.plano), mezz: id };
}

describe("ficha y propuesta del diseñador", () => {
  it("la ficha muestra alcance en el piso, la vista y la referencia de detalle", () => {
    const plano = bodega();
    const { tapas, coberturas, esHoja } = calcularNivel(listaNiveles(plano)[0]);
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
    render(<Propuesta disenoId={7} nombre="Proyecto CCTV Bodegas VDM" cliente="Concretos Pronto" niveles={listaNiveles(plano).map(calcularNivel)} resumen={resumenDelPlano(plano)} grabacion={null} />);
    expect(screen.getAllByRole("article")).toHaveLength(5);
    expect(screen.getByText("Hoja 1 de 5")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Vista isométrica del sitio" })).toBeInTheDocument();
    expect(screen.getByText("NVR de 4 canales")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Descargar PDF/ })).toBeInTheDocument();
    expect(screen.getByText("Concretos Pronto")).toBeInTheDocument();
  });

  it("con varios niveles saca una hoja de distribución por nivel y la lista de equipo junta todo", () => {
    const { raiz } = conMezzanine();
    render(<Propuesta disenoId={7} nombre="Proyecto CCTV Bodegas VDM" cliente="Concretos Pronto" niveles={listaNiveles(raiz).map(calcularNivel)} resumen={resumenDelPlano(raiz)} grabacion={null} />);
    // 2 distribuciones + 3D + 3 cámaras + infraestructura
    expect(screen.getAllByRole("article")).toHaveLength(7);
    expect(screen.getByRole("article", { name: "Hoja 2: distribución de Mezzanine oficinas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Distribución · Mezzanine oficinas +3.50 m" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Vista isométrica del edificio con sus niveles apilados" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Hoja 6: cámara 3" })).toHaveTextContent("Mezzanine oficinas +3.50 m");
    expect(screen.getByText("canales de NVR (3 en uso)")).toBeInTheDocument();
  });

  it("la ficha de una cámara del mezzanine pasa a las de la planta baja", () => {
    const { raiz, mezz } = conMezzanine();
    const nivel = calcularNivel(listaNiveles(raiz).find((n) => n.nivel.id === mezz)!);
    const cam = nivel.plano.camaras[0];
    render(
      <FichaCamara
        disenoId={7}
        disenoNombre="Bodegas VDM"
        plano={nivel.plano}
        camaraId={cam.id}
        tapas={nivel.tapas}
        coberturas={nivel.coberturas}
        esHoja={nivel.esHoja}
        todas={todasLasCamaras(raiz)}
        nivel={nivel.nivel}
      />,
    );
    expect(screen.getByRole("heading", { name: "Domo Mezzanine norte" })).toBeInTheDocument();
    expect(screen.getByText("Mezzanine oficinas · +3.50 m")).toBeInTheDocument();
    expect(screen.getByText("3 de 3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cámara 2/ })).toHaveAttribute("href", expect.stringContaining("/camara/"));
  });
});
