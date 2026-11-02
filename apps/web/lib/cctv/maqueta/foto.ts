/**
 * Foto de la maqueta para la propuesta: se arma fuera de pantalla con el mismo motor, con las claves
 * de las cámaras pintadas encima. El piso más alto va en color y los de abajo, en gris.
 */
import type { NivelConPlano } from "../niveles";
import type { PoligonoCobertura } from "../visibilidad";
import { MotorMaqueta } from "./motor";

export type NivelParaFoto = NivelConPlano & { coberturas: ReadonlyMap<string, PoligonoCobertura[]> };

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((listo, mal) => {
    const img = new Image();
    img.onload = () => listo(img);
    img.onerror = () => mal(new Error("No se pudo leer la foto de la maqueta."));
    img.src = src;
  });
}

export async function fotoDeMaqueta(niveles: readonly NivelParaFoto[], ancho = 1440, alto = 760): Promise<string | null> {
  const arriba = niveles[niveles.length - 1];
  if (!arriba) return null;
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const motor = new MotorMaqueta(lienzo);
  try {
    motor.medir(ancho, alto);
    motor.actualizar({
      plano: arriba.plano,
      nivelId: arriba.nivel.id,
      conexiones: [],
      coberturas: arriba.coberturas,
      elevacionM: arriba.nivel.elevacionM,
      debajo: niveles.slice(0, -1),
      seleccion: null,
      verDesde: null,
      capas: { cobertura: true, personas: true, noche: false, tamanoReal: false, translucidos: false, croquis: false, cableado: false },
    });
    motor.vistaGeneral(false, 1.01);
    const base = motor.captura(ancho, alto);
    const img = await cargarImagen(base);
    const final = document.createElement("canvas");
    final.width = ancho;
    final.height = alto;
    const c = final.getContext("2d");
    if (!c) return base;
    c.drawImage(img, 0, 0);
    c.font = "600 15px Inter, 'Segoe UI', Arial, sans-serif";
    c.textBaseline = "middle";
    for (const e of motor.etiquetas) {
      const p = motor.aPantalla(e.pos);
      if (!p.visible) continue;
      const w = c.measureText(e.clave).width + 30;
      const x = p.x - w / 2;
      const y = p.y - 28;
      c.fillStyle = "rgba(15,18,23,.9)";
      c.beginPath();
      c.roundRect(x, y, w, 26, 13);
      c.fill();
      c.fillStyle = e.punto;
      c.beginPath();
      c.arc(x + 12, y + 13, 4.5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#fff";
      c.fillText(e.clave, x + 21, y + 13.5);
    }
    return final.toDataURL("image/jpeg", 0.9);
  } finally {
    motor.destruir();
  }
}
