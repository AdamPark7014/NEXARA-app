/**
 * Paquetes de cotización (contrato del viernes, D).
 *
 * «Cámara bala instalada» no es una partida: es una cámara, su balún, su adaptador, su caja de
 * conexiones y la instalación. Cotizarlo a mano es de donde salen las propuestas con 15 cámaras y
 * 14 instalaciones, o con cámaras sin caja. Al agregar N paquetes se generan las N×partidas **y**
 * el bloque de alcance que las describe, de modo que el texto y la tabla cuadran solos.
 *
 * Los precios son el punto de partida (los de la propuesta modelo); quien cotiza los ajusta.
 *
 * Módulo puro (sin Nest ni Prisma) para poder probarlo con jest.
 */
import type { GrupoPartida } from './partidas-grupos.js';

export type PartidaDePaquete = {
  grupo: GrupoPartida;
  name: string;
  description?: string | null;
  unit: string;
  /** Cuántas unidades de esta partida lleva **un** paquete. */
  qtyPorPaquete: number;
  unitPrice: number;
};

export type Paquete = {
  clave: string;
  titulo: string;
  descripcion: string;
  /** Texto del bloque de alcance que escribe el paquete, con `{n}` para la cantidad. */
  bloqueAlcance?: string;
  partidas: PartidaDePaquete[];
};

export const PAQUETES: Paquete[] = [
  {
    clave: 'camara-bala-instalada',
    titulo: 'Cámara bala instalada',
    descripcion: 'Cámara bala, balún, adaptador de corriente, caja de conexiones e instalación puesta a punto.',
    bloqueAlcance:
      'Suministro e instalación de {n} cámaras tipo bala, incluyendo balún, adaptador de alimentación y caja de conexiones por cámara, instaladas y puestas a punto.',
    partidas: [
      {
        grupo: 'EQUIPOS',
        name: 'Cámara bala TurboHD 2 MP (1080p) / lente 3.6 mm / IR 40 m / exterior IP67',
        unit: 'Pieza',
        qtyPorPaquete: 1,
        unitPrice: 592.42,
      },
      {
        grupo: 'MATERIALES',
        name: 'Kit de transceptores (baluns) con terminal push, cable coaxial blindado',
        unit: 'Pieza',
        qtyPorPaquete: 1,
        unitPrice: 47,
      },
      {
        grupo: 'MATERIALES',
        name: 'Adaptador macho tipo jack de 3.5 mm polarizado 12 Vcc',
        unit: 'Pieza',
        qtyPorPaquete: 1,
        unitPrice: 6.07,
      },
      {
        grupo: 'MATERIALES',
        name: 'Caja de conexiones de metal para cámara bala',
        unit: 'Pieza',
        qtyPorPaquete: 1,
        unitPrice: 215.73,
      },
      {
        grupo: 'MANO_DE_OBRA',
        name: 'Instalación de cámara de seguridad puesta a punto bajo normas estándares',
        unit: 'Servicio',
        qtyPorPaquete: 1,
        unitPrice: 1000,
      },
    ],
  },
  {
    clave: 'camara-domo-instalada',
    titulo: 'Cámara domo instalada',
    descripcion: 'Cámara domo, balún, adaptador de corriente, caja de exterior e instalación puesta a punto.',
    bloqueAlcance:
      'Suministro e instalación de {n} cámaras tipo domo, incluyendo balún, adaptador de alimentación y caja de exterior por cámara, instaladas y puestas a punto.',
    partidas: [
      {
        grupo: 'EQUIPOS',
        name: 'Cámara domo TurboHD 2 MP (1080p) / lente 2.8 mm / IR 30 m / IP67',
        unit: 'Pieza',
        qtyPorPaquete: 1,
        unitPrice: 606.91,
      },
      {
        grupo: 'MATERIALES',
        name: 'Kit de transceptores (baluns) con terminal push, cable coaxial blindado',
        unit: 'Pieza',
        qtyPorPaquete: 1,
        unitPrice: 47,
      },
      {
        grupo: 'MATERIALES',
        name: 'Adaptador macho tipo jack de 3.5 mm polarizado 12 Vcc',
        unit: 'Pieza',
        qtyPorPaquete: 1,
        unitPrice: 6.07,
      },
      {
        grupo: 'MATERIALES',
        name: 'Caja de conexiones de exterior para cámara mini domo IP66',
        unit: 'Pieza',
        qtyPorPaquete: 1,
        unitPrice: 172.5,
      },
      {
        grupo: 'MANO_DE_OBRA',
        name: 'Instalación de cámara de seguridad puesta a punto bajo normas estándares',
        unit: 'Servicio',
        qtyPorPaquete: 1,
        unitPrice: 1000,
      },
    ],
  },
  {
    clave: 'poste-3m-instalado',
    titulo: 'Poste de 3 m instalado',
    descripcion: 'Poste seccionado de 3 m, dos montajes y la instalación con anclaje sobre base existente.',
    bloqueAlcance:
      'Suministro e instalación de {n} postes metálicos de 3 m de altura, anclados sobre base de concreto existente. No incluye obra civil para la cimentación.',
    partidas: [
      {
        grupo: 'EQUIPOS',
        name: 'Poste seccionado de 3 metros para instalación de videovigilancia',
        unit: 'Pieza',
        qtyPorPaquete: 1,
        unitPrice: 2661.58,
      },
      {
        grupo: 'MATERIALES',
        name: 'Montaje para poste, acero inoxidable',
        unit: 'Pieza',
        qtyPorPaquete: 2,
        unitPrice: 517.1,
      },
      {
        grupo: 'MANO_DE_OBRA',
        name: 'Instalación de poste con anclaje sobre base de concreto existente',
        unit: 'Servicio',
        qtyPorPaquete: 1,
        unitPrice: 1500,
      },
    ],
  },
];

export function buscarPaquete(clave: unknown): Paquete | null {
  const buscada = String(clave ?? '').trim().toLowerCase();
  return PAQUETES.find((p) => p.clave === buscada) ?? null;
}

export type PartidaGenerada = {
  grupo: GrupoPartida;
  name: string;
  description: string | null;
  unit: string;
  qty: number;
  unitPrice: number;
  discount: number;
  tax: number;
  paqueteClave: string;
  paqueteCantidad: number;
};

/** Partidas que genera agregar `cantidad` paquetes (IVA 16 %, sin descuento). */
export function partidasDePaquete(paquete: Paquete, cantidad: number): PartidaGenerada[] {
  const n = Math.max(1, Math.trunc(Number(cantidad) || 0));
  return paquete.partidas.map((partida) => ({
    grupo: partida.grupo,
    name: partida.name,
    description: partida.description ?? null,
    unit: partida.unit,
    qty: partida.qtyPorPaquete * n,
    unitPrice: partida.unitPrice,
    discount: 0,
    tax: 16,
    paqueteClave: paquete.clave,
    paqueteCantidad: n,
  }));
}

/** Bloque de alcance que escribe el paquete, con la cantidad ya sustituida. */
export function bloqueAlcanceDePaquete(paquete: Paquete, cantidad: number) {
  const n = Math.max(1, Math.trunc(Number(cantidad) || 0));
  return {
    clave: `paquete:${paquete.clave}`,
    titulo: paquete.titulo,
    texto: (paquete.bloqueAlcance ?? paquete.descripcion).replace(/\{n\}/g, String(n)),
    parametros: { cantidad: n },
  };
}

/**
 * Suma un bloque de alcance a los que ya tiene la cotización, sustituyendo el del mismo paquete.
 *
 * Agregar dos veces el mismo paquete no debe dejar dos párrafos que se contradigan: gana el último,
 * que ya trae la cantidad acumulada.
 */
export function mezclarBloqueAlcance<T extends { clave: string }>(bloques: T[] | null | undefined, nuevo: T): T[] {
  const previos = (bloques ?? []).filter((b) => b?.clave !== nuevo.clave);
  return [...previos, nuevo];
}
