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

/** Una imagen de la misma página como `data:`: dentro de un SVG hecho imagen no se puede pedir nada de fuera. */
async function aDatos(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const b = await r.blob();
    return await new Promise((listo) => {
      const lector = new FileReader();
      lector.onload = () => listo(typeof lector.result === "string" ? lector.result : null);
      lector.onerror = () => listo(null);
      lector.readAsDataURL(b);
    });
  } catch {
    return null;
  }
}

/** Las reglas de las hojas de estilo que le tocan a este elemento o a algo adentro, y sus fuentes. */
async function estilosDe(el: Element): Promise<string> {
  const reglas: string[] = [];
  const fuentes: CSSFontFaceRule[] = [];
  const visitar = (lista: CSSRuleList) => {
    for (const r of Array.from(lista)) {
      if (r instanceof CSSStyleRule) {
        try {
          if (el.matches(r.selectorText) || el.querySelector(r.selectorText)) reglas.push(r.cssText);
        } catch {
          /* un selector que este navegador no entiende */
        }
      } else if (r instanceof CSSMediaRule) {
        if (!/print/.test(r.media.mediaText) && window.matchMedia(r.media.mediaText).matches) visitar(r.cssRules);
      } else if (r instanceof CSSSupportsRule) visitar(r.cssRules);
      else if (r instanceof CSSFontFaceRule) fuentes.push(r);
    }
  };
  for (const hoja of Array.from(document.styleSheets)) {
    let lista: CSSRuleList | null = null;
    try {
      lista = hoja.cssRules;
    } catch {
      /* hoja de otro dominio */
    }
    if (lista) visitar(lista);
  }
  // Solo las fuentes que de verdad usa, ya incrustadas.
  const usadas = getComputedStyle(el).fontFamily.toLowerCase();
  const caras: string[] = [];
  for (const f of fuentes.slice(0, 40)) {
    const familia = f.style.getPropertyValue("font-family").replace(/["']/g, "").trim().toLowerCase();
    const url = /url\(["']?([^"')]+)["']?\)/.exec(f.style.getPropertyValue("src"))?.[1];
    if (!familia || !url || !usadas.includes(familia) || caras.length >= 6) continue;
    const datos = await aDatos(url);
    if (datos) caras.push(f.cssText.replace(url, datos));
  }
  return [...caras, ...reglas].join("\n");
}

/**
 * Convierte en imagen una parte de la página tal como se ve, con sus estilos y fuentes. Sirve para la
 * hoja técnica, que no es solo un SVG. Lanza si el navegador no puede: quien llama tiene un plan B.
 */
export async function elementoAPng(el: HTMLElement, ancho: number, alto: number, escala: number): Promise<Blob> {
  const copia = el.cloneNode(true) as HTMLElement;
  for (const img of Array.from(copia.querySelectorAll("img"))) {
    const datos = await aDatos(img.src);
    if (datos) img.setAttribute("src", datos);
    else img.remove();
  }
  const css = await estilosDe(el);
  const html = new XMLSerializer().serializeToString(copia);
  // Lo que hereda de la página y los colores del documento: una variable que no esté aquí queda sin efecto, como debe.
  const heredado = getComputedStyle(el);
  const raiz = [
    `width:${ancho}px`,
    `height:${alto}px`,
    "background:#fff",
    "overflow:hidden",
    `font-size:${heredado.fontSize}`,
    // En proporción: en píxeles se heredaría igual a todo, sin importar su tamaño de letra.
    `line-height:${parseFloat(heredado.lineHeight) / parseFloat(heredado.fontSize) || "normal"}`,
    ...Object.entries(COLORES_DOCUMENTO).map(([nombre, valor]) => `${nombre}:${valor}`),
  ].join(";");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho * escala}" height="${alto * escala}" viewBox="0 0 ${ancho} ${alto}"><foreignObject x="0" y="0" width="${ancho}" height="${alto}"><div xmlns="http://www.w3.org/1999/xhtml" style="${raiz}"><style><![CDATA[${css}]]></style>${html}</div></foreignObject></svg>`;
  const img = new Image();
  await new Promise<void>((listo, mal) => {
    img.onload = () => listo();
    img.onerror = () => mal(new Error("No se pudo convertir la hoja en imagen."));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho * escala;
  lienzo.height = alto * escala;
  const c = lienzo.getContext("2d");
  if (!c) throw new Error("El navegador no dejó dibujar la hoja.");
  c.drawImage(img, 0, 0, lienzo.width, lienzo.height);
  return await new Promise((listo, mal) => lienzo.toBlob((b) => (b ? listo(b) : mal(new Error("No se pudo convertir la hoja en imagen."))), "image/png"));
}

/** La foto de un modelo 3D, recortada a lo que ocupa y en PNG: el PDF no lee WebP. `null` si no se puede. */
export async function fotoDeModeloAPng(foto: string, lado = 320): Promise<string | null> {
  if (!foto.startsWith("data:image/")) return null;
  try {
    const img = new Image();
    await new Promise<void>((listo, mal) => {
      img.onload = () => listo();
      img.onerror = () => mal(new Error("foto"));
      img.src = foto;
    });
    const base = document.createElement("canvas");
    base.width = img.naturalWidth;
    base.height = img.naturalHeight;
    const c = base.getContext("2d", { willReadFrequently: true });
    if (!c) return null;
    c.drawImage(img, 0, 0);
    const { data, width, height } = c.getImageData(0, 0, base.width, base.height);
    let [x0, y0, x1, y1] = [width, height, 0, 0];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 <= x0 || y1 <= y0) return null;
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const k = Math.min(1, lado / Math.max(w, h));
    const final = document.createElement("canvas");
    final.width = Math.round(w * k);
    final.height = Math.round(h * k);
    final.getContext("2d")?.drawImage(base, x0, y0, w, h, 0, 0, final.width, final.height);
    return final.toDataURL("image/png");
  } catch {
    return null;
  }
}

/** Lo que entrega el lienzo (`data:`) como archivo para subir. */
export async function datosABlob(datos: string): Promise<Blob> {
  return (await fetch(datos)).blob();
}
