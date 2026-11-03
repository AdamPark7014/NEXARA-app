/**
 * Foto de la maqueta para la propuesta: se arma fuera de pantalla con el mismo motor, con las claves
 * de las cámaras pintadas encima. El piso más alto va en color y los de abajo, en gris.
 */
import type { NivelConPlano } from "../niveles";
import type { PoligonoCobertura } from "../visibilidad";
import { MotorMaqueta } from "./motor";
import { texturasListas } from "./texturas";
import { Vector3 } from "three";

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

/** Los nombres de las áreas sobre la foto, como en la maqueta: texto con halo y sin caja. */
function conNombresDeAreas(motor: MotorMaqueta, nivel: NivelParaFoto, base: string, ancho: number, alto: number): Promise<string> {
  const k = nivel.plano.escala.metrosPorPx;
  return cargarImagen(base).then((img) => {
    const final = document.createElement("canvas");
    final.width = ancho;
    final.height = alto;
    const c = final.getContext("2d");
    if (!c) return base;
    c.drawImage(img, 0, 0);
    c.font = "650 22px Inter, 'Segoe UI', Arial, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "bottom";
    for (const a of nivel.plano.areas ?? []) {
      if (!a.nombre || !a.puntos.length) continue;
      const cx = a.puntos.reduce((s, p) => s + p.x, 0) / a.puntos.length;
      const cy = a.puntos.reduce((s, p) => s + p.y, 0) / a.puntos.length;
      const p = motor.aPantalla(new Vector3(cx * k, 0.2, cy * k));
      if (!p.visible) continue;
      c.shadowColor = "rgba(8,12,18,.9)";
      c.shadowBlur = 8;
      c.fillStyle = "#fff";
      c.fillText(a.nombre, p.x, p.y);
    }
    return final.toDataURL("image/jpeg", 0.88);
  });
}

/** Las dos vistas que lleva la cotización: el sitio limpio y con la cobertura en el piso, desde el mismo punto. */
export async function vistasParaCotizacion(niveles: readonly NivelParaFoto[], ancho = 1600, alto = 950): Promise<{ general: string; cobertura: string } | null> {
  const arriba = niveles[niveles.length - 1];
  if (!arriba) return null;
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const motor = new MotorMaqueta(lienzo);
  try {
    motor.medir(ancho, alto);
    const datos = (cobertura: boolean) => ({
      plano: arriba.plano,
      nivelId: arriba.nivel.id,
      conexiones: [],
      coberturas: arriba.coberturas,
      elevacionM: arriba.nivel.elevacionM,
      debajo: niveles.slice(0, -1),
      seleccion: null,
      verDesde: null,
      capas: { cobertura, personas: true, noche: false, tamanoReal: false, translucidos: false, croquis: false, cableado: false },
    });
    motor.actualizar(datos(false));
    // Sin esperar las texturas, el piso saldría negro; si tardan, mejor sin textura que nada.
    await Promise.race([texturasListas(), new Promise((r) => setTimeout(r, 4000))]);
    motor.vistaGeneral(false, 1.01);
    const general = await conNombresDeAreas(motor, arriba, motor.captura(ancho, alto), ancho, alto);
    motor.actualizar(datos(true));
    const cobertura = await conNombresDeAreas(motor, arriba, motor.captura(ancho, alto), ancho, alto);
    return { general, cobertura };
  } finally {
    motor.destruir();
  }
}
