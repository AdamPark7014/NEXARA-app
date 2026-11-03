/**
 * Convierte en imagen un plano que ya está dibujado en SVG, para adjuntarlo a la cotización. No usa el
 * lienzo de la maqueta: el plano se ve igual en cualquier computadora y pesa poco.
 */

/**
 * Fuera de la página un SVG no ve las variables de color. Van fijas y en claro: el plano es un documento
 * para el cliente, aunque quien lo genere tenga el modo oscuro puesto.
 */
const COLORES_DOCUMENTO: Readonly<Record<string, string>> = {
  "--ui-neutral-bg": "#e8eaed",
  "--ui-neutral": "#8a9099",
  "--ui-info": "#2f6fde",
  "--ui-fg": "#14181f",
  "--ui-fg-2": "#3d444f",
  "--ui-fg-3": "#6a7280",
  "--ui-fg-4": "#9aa1ab",
  "--ui-border": "#d9dce1",
  "--ui-border-strong": "#c2c7ce",
  "--ui-surface": "#ffffff",
  "--ui-brand": "#0f7f6c",
  "--ui-brand-text": "#0f7f6c",
  "--ui-danger": "#c93c3c",
  "--ui-warning": "#c88a12",
  "--ui-success": "#14924f",
};

export function sinVariables(texto: string): string {
  return texto.replace(/var\((--[\w-]+)(?:,[^)]*)?\)/g, (_, nombre: string) => COLORES_DOCUMENTO[nombre] ?? "#6a7280");
}

/** El SVG listo para volverse imagen: con su tamaño y fondo blanco. */
export function svgParaImagen(svg: SVGSVGElement, ancho: number): { texto: string; ancho: number; alto: number } {
  const caja = svg.viewBox.baseVal;
  const proporcion = caja && caja.width > 0 ? caja.height / caja.width : 0.66;
  const alto = Math.max(Math.round(ancho * proporcion), 1);
  const copia = svg.cloneNode(true) as SVGSVGElement;
  copia.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copia.setAttribute("width", String(ancho));
  copia.setAttribute("height", String(alto));
  const fondo = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  fondo.setAttribute("x", String(caja?.x ?? 0));
  fondo.setAttribute("y", String(caja?.y ?? 0));
  fondo.setAttribute("width", String(caja?.width ?? ancho));
  fondo.setAttribute("height", String(caja?.height ?? alto));
  fondo.setAttribute("fill", "#ffffff");
  copia.insertBefore(fondo, copia.firstChild);
  return { texto: sinVariables(new XMLSerializer().serializeToString(copia)), ancho, alto };
}

export function svgAPng(svg: SVGSVGElement, ancho: number): Promise<Blob> {
  const { texto, alto } = svgParaImagen(svg, ancho);
  const url = URL.createObjectURL(new Blob([texto], { type: "image/svg+xml;charset=utf-8" }));
  return new Promise<Blob>((listo, mal) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const lienzo = document.createElement("canvas");
      lienzo.width = ancho;
      lienzo.height = alto;
      const c = lienzo.getContext("2d");
      if (!c) {
        mal(new Error("El navegador no dejó dibujar el plano."));
        return;
      }
      c.drawImage(img, 0, 0, ancho, alto);
      lienzo.toBlob((b) => (b ? listo(b) : mal(new Error("No se pudo convertir el plano en imagen."))), "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      mal(new Error("No se pudo convertir el plano en imagen."));
    };
    img.src = url;
  });
}
