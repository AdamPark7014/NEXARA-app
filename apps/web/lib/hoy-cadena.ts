/**
 * La pantalla Hoy de dirección: en qué va el negocio, de la cotización al cobro, y qué sigue.
 * Módulo puro (Mapa de Core, Bloque B). Los números vienen de `GET executive/c-level`.
 */

export type CadenaNegocio = {
  cotizaciones: {
    total: number;
    borradores: number;
    vigentesPorEnviar: number;
    enviadas: number;
    porDecidir: number;
    ganadas: number;
    ganadasSinProyecto: number;
  };
  proyectos: number;
  facturas: number;
  cobrado: number;
  actividades: {
    total: number;
    conProyecto: number;
    porValidar: number;
    enProceso: number;
    finalizadas: number;
  };
};

export type PasoCadena = {
  id: string;
  etiqueta: string;
  valor: string;
  nota: string;
  /** `aqui`: el primer eslabón en cero después de uno con datos. Es donde se detiene el negocio. */
  estado: "lleno" | "aqui" | "vacio";
};

export type SiguientePaso = {
  titulo: string;
  texto: string;
  accion: { etiqueta: string; href: string };
};

const entero = new Intl.NumberFormat("es-MX");
const pesos = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

function cuantas(n: number, una: string, varias: string): string {
  return `${entero.format(n)} ${n === 1 ? una : varias}`;
}

export function pasosDeLaCadena(c: CadenaNegocio): PasoCadena[] {
  const { cotizaciones: q, actividades: a } = c;
  const ligadas = `Y ${entero.format(a.conProyecto)} de ${entero.format(a.total)} actividades ${a.conProyecto === 1 ? "ligada" : "ligadas"}`;
  const crudos = [
    {
      id: "cotizaciones",
      etiqueta: "Cotizaciones",
      n: q.total,
      valor: entero.format(q.total),
      nota: q.total ? `${entero.format(q.borradores)} en borrador` : "Todavía ninguna",
    },
    {
      id: "enviadas",
      etiqueta: "Enviadas",
      n: q.enviadas,
      valor: entero.format(q.enviadas),
      nota: q.porDecidir ? `${entero.format(q.porDecidir)} por decidir` : q.enviadas ? "Ya tienen respuesta" : "Pendiente",
    },
    {
      id: "ganadas",
      etiqueta: "Ganadas",
      n: q.ganadas,
      valor: entero.format(q.ganadas),
      nota: !q.ganadas ? "Sin respuesta aún" : q.ganadasSinProyecto ? `${entero.format(q.ganadasSinProyecto)} sin proyecto` : "Con su proyecto",
    },
    { id: "proyectos", etiqueta: "Proyectos", n: c.proyectos, valor: entero.format(c.proyectos), nota: ligadas },
    {
      id: "facturas",
      etiqueta: "Facturas",
      n: c.facturas,
      valor: entero.format(c.facturas),
      nota: c.facturas ? "Emitidas" : "Pendiente",
    },
    {
      id: "cobrado",
      etiqueta: "Cobrado",
      n: c.cobrado,
      valor: pesos.format(c.cobrado),
      nota: c.cobrado ? "Entró al banco" : "Pendiente",
    },
  ];
  // Se detiene en el primer cero: los proyectos que no vienen de una cotización no lo mueven.
  const aqui = crudos.findIndex((p) => p.n === 0);
  return crudos.map(({ n, ...p }, i) => ({
    ...p,
    estado: i === aqui ? "aqui" : n > 0 ? "lleno" : "vacio",
    nota: i === aqui && i > 0 ? "Aquí se detiene" : p.nota,
  }));
}

/** Lo más cercano al dinero va primero: un proyecto que falta pesa más que un borrador. */
export function siguientePasoDelNegocio(c: CadenaNegocio): SiguientePaso | null {
  const q = c.cotizaciones;
  if (q.ganadasSinProyecto > 0) {
    return {
      titulo: "Siguiente paso: crear el proyecto",
      texto: `${cuantas(q.ganadasSinProyecto, "cotización ganada todavía no tiene", "cotizaciones ganadas todavía no tienen")} proyecto.`,
      accion: { etiqueta: "Crear proyecto", href: "/erp/cotizaciones?estado=APROBADA&sinProyecto=1" },
    };
  }
  if (q.porDecidir > 0) {
    return {
      titulo: "Siguiente paso: decir cómo terminaron",
      texto: `${cuantas(q.porDecidir, "cotización enviada espera", "cotizaciones enviadas esperan")} saber si se ganó o se perdió.`,
      accion: { etiqueta: "Revisar", href: "/erp/cotizaciones?estado=ENVIADA" },
    };
  }
  if (q.vigentesPorEnviar > 0 && c.cobrado === 0 && c.facturas === 0) {
    return {
      titulo: "Siguiente paso: marcar las que ya salieron",
      texto: `${cuantas(q.vigentesPorEnviar, "cotización vigente sigue", "cotizaciones vigentes siguen")} en borrador. Cuando se envíen y se ganen, aquí empieza a verse el dinero.`,
      accion: { etiqueta: "Ver cotizaciones", href: "/erp/cotizaciones?estado=BORRADOR" },
    };
  }
  return null;
}
