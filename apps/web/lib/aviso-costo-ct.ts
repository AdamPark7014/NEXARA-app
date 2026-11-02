/**
 * El aviso «Hoy en CT» de lo ya cotizado, igual en la tarjeta de «Cotizar con IA» y en la tabla de
 * partidas (muestra aprobada por Adam el 02-11).
 *
 * Todo se deduce de las cifras que tiene la fila en ese momento: así el aviso nunca se contradice con
 * lo que se ve. Nada de aquí cambia un costo ni un precio: «Usar costo» solo mueve el costo y subir
 * el precio es otro clic. Bajarlo nunca se ofrece: 81 de 180 costos guardados son el precio de venta
 * (costo = precio), y con eso se regalaría la ganancia.
 */
import { formatoFecha, formatoMoneda, type CostoDeHoy } from "@/lib/cotizaciones-api";

export type AvisoCt = {
  hoy: CostoDeHoy;
  /** Con qué cifras entró la fila: a esto regresa «Deshacer». */
  costoGuardado: number;
  precioGuardado: number;
  /** Margen de la última vez. `null` si se guardó con el costo igual a su precio: ese margen no dice nada. */
  margenUltimaVez: number | null;
};

const iguales = (a: number, b: number) => Math.abs(a - b) < 0.005;
const redondo = (n: number) => Math.round(n * 100) / 100;

export function crearAviso(
  hoy: CostoDeHoy | null | undefined,
  costo: number | null | undefined,
  precio: number | null | undefined,
  precioDeLaUltimaVez: number | null | undefined = precio,
): AvisoCt | null {
  const costoGuardado = Number(costo);
  if (!hoy || !(costoGuardado > 0)) return null;
  const margen = redondo((Number(precioDeLaUltimaVez) / costoGuardado - 1) * 100);
  return { hoy, costoGuardado, precioGuardado: Number(precio) || 0, margenUltimaVez: margen > 0.01 ? margen : null };
}

export type TonoAviso = "rojo" | "ambar" | "azul" | "verde";
export type ParteAviso = { texto: string; cifra?: string };
export type SubirPrecio = { precio: number; margen: number; texto: string };

export type LecturaAviso = {
  tono: TonoAviso;
  renglones: ParteAviso[][];
  /** Texto del botón que pone el costo de CT; `null` si ya está puesto. */
  usar: string | null;
  subir: SubirPrecio | null;
  deshacer: boolean;
};

const porcentaje = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString("es-MX", { maximumFractionDigits: 1 })} %`;

/** `null` si ya no toca avisar: la persona escribió otro costo, así que ya lo resolvió. */
export function leerAviso({
  aviso,
  unitCost,
  unitPrice,
  moneda,
  margenBase,
  rotuloBase,
  descuento = 0,
  margenGeneral = null,
}: {
  aviso: AvisoCt;
  unitCost: number | null | undefined;
  unitPrice: number | null | undefined;
  moneda: string;
  /** Con qué margen subir el precio de lo que se guardó sin margen. */
  margenBase: number | null;
  rotuloBase: string;
  /** Descuento % de la fila y margen de la cotización: los dos cambian lo que de verdad se cobra. */
  descuento?: number;
  margenGeneral?: number | null;
}): LecturaAviso | null {
  const { hoy, costoGuardado, precioGuardado, margenUltimaVez } = aviso;
  const costo = Number(unitCost);
  const usaCt = iguales(costo, hoy.costo);
  if (!usaCt && !iguales(costo, costoGuardado)) return null;

  const dinero = (n: number) => formatoMoneda(n, moneda);
  const precio = Number(unitPrice) || 0;
  const cobrado = precio * (1 - (Number(descuento) || 0) / 100) * (1 + (Number(margenGeneral) || 0) / 100);
  const conPrecio = margenGeneral ? `Con el ${porcentaje(margenGeneral)} general` : "A este precio";
  const fuente = hoy.alDia ? "de hoy" : "de CT";

  const margenObjetivo = margenUltimaVez ?? margenBase;
  const precioObjetivo = margenObjetivo == null ? null : redondo(hoy.costo * (1 + margenObjetivo / 100));
  const yaAlcanza = precioObjetivo != null && cobrado >= precioObjetivo - 0.005;

  const lineaCosto: ParteAviso[] = [{ texto: `Costo ${fuente}`, cifra: dinero(hoy.costo) }, { texto: `antes ${dinero(costoGuardado)}` }];

  if (usaCt && yaAlcanza && !iguales(precio, precioGuardado)) {
    return {
      tono: "verde",
      renglones: [lineaCosto, [{ texto: "Precio", cifra: dinero(precio) }, { texto: `antes ${dinero(precioGuardado)}` }]],
      usar: null,
      subir: null,
      deshacer: true,
    };
  }

  const margenHoy = (cobrado / hoy.costo - 1) * 100;
  let ganancia: ParteAviso[];
  let tono: TonoAviso;
  if (cobrado <= 0) {
    ganancia = [{ texto: "Falta el precio" }];
    tono = "ambar";
  } else if (cobrado < hoy.costo - 0.005) {
    ganancia = [{ texto: `${conPrecio} pierdes ${dinero(hoy.costo - cobrado)} por pieza` }];
    tono = "rojo";
  } else if (margenUltimaVez == null) {
    ganancia = [{ texto: `${conPrecio} ganas ${porcentaje(margenHoy)}` }];
    tono = hoy.diferencia < 0 ? "azul" : "ambar";
  } else {
    ganancia = [{ texto: `${conPrecio} ganas ${porcentaje(margenHoy)}` }, { texto: `la última vez ${porcentaje(margenUltimaVez)}` }];
    tono = margenHoy < margenUltimaVez - 0.05 ? "ambar" : "azul";
  }

  if (usaCt) {
    const subir: SubirPrecio | null =
      precioObjetivo != null && margenObjetivo != null && !yaAlcanza
        ? {
            precio: precioObjetivo,
            margen: margenObjetivo,
            texto: `Subir precio a ${dinero(precioObjetivo)} · ${porcentaje(margenObjetivo)}${margenUltimaVez != null ? ", como la última vez" : rotuloBase}`,
          }
        : null;
    return { tono, renglones: [lineaCosto, ganancia], usar: null, subir, deshacer: true };
  }

  const cuanto = `${Math.round(Math.abs(hoy.diferencia) * 100)} % ${hoy.diferencia > 0 ? "más" : "menos"}`;
  const contra = `${dinero(costoGuardado)}${margenUltimaVez == null ? ", igual a su precio" : ""}`;
  return {
    tono,
    renglones: [
      [
        { texto: hoy.alDia ? "Hoy en CT" : `CT al ${formatoFecha(hoy.fecha)}`, cifra: dinero(hoy.costo) },
        { texto: `${cuanto} que el costo guardado (${contra})` },
        { texto: hoy.piezas > 0 ? `${hoy.piezas} en stock` : "sobre pedido" },
      ],
      ganancia,
    ],
    usar: `Usar costo ${fuente}`,
    subir: null,
    deshacer: false,
  };
}

/** La línea corta de la lista de «Nueva partida». */
export function avisoDeSugerencia(hoy: CostoDeHoy, precio: number, moneda: string): { partes: string[]; alerta: boolean } {
  return {
    partes: [
      `${hoy.alDia ? "Hoy en CT" : `CT al ${formatoFecha(hoy.fecha)}`} ${formatoMoneda(hoy.costo, moneda)}`,
      `${Math.round(Math.abs(hoy.diferencia) * 100)} % ${hoy.diferencia > 0 ? "más" : "menos"} que su costo`,
    ],
    alerta: Number(precio) < hoy.costo,
  };
}
