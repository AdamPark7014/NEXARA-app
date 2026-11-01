/**
 * Casos del eval de clientes repetidos. El repo es público: solo empresas ficticias e instituciones
 * conocidas, sin decir quién es cliente de quién. Los pares reales se corren aparte con `--real`.
 */
import type { FichaPadron } from '../duplicados/duplicados-ia.js';

export const PADRON_EVAL: FichaPadron[] = [
  { id: 1, name: 'BUAP' },
  { id: 2, name: 'UDLAP', legalName: 'Fundación Universidad de las Américas Puebla' },
  { id: 3, name: 'Tecnológico de Monterrey' },
  { id: 4, name: 'IMSS' },
  { id: 5, name: 'CFE', legalName: 'Comisión Federal de Electricidad' },
  { id: 6, name: 'Petróleos Mexicanos' },
  { id: 7, name: 'Grupo Bimbo', legalName: 'Grupo Bimbo, S.A.B. de C.V.' },
  { id: 8, name: 'Universidad Iberoamericana Puebla' },
  { id: 9, name: 'El Puerto de Liverpool', legalName: 'El Puerto de Liverpool, S.A.B. de C.V.' },
  { id: 10, name: 'Banco Mercantil del Norte' },
  { id: 11, name: 'Comisión Nacional del Agua' },
  { id: 12, name: 'Hospital Ángeles Puebla' },
  { id: 13, name: 'Volkswagen de México' },
  { id: 14, name: 'Cinépolis' },
  { id: 15, name: 'Walmart de México' },
  { id: 16, name: 'Constructora Arcadia Angelópolis', legalName: 'Constructora Arcadia Angelópolis, S.A. de C.V.' },
  { id: 17, name: 'Hotel Portal de Analco', legalName: 'Operadora Hotelera Portal de Analco, S.A. de C.V.' },
  { id: 18, name: 'Farmacias del Portal', legalName: 'Farmacéutica del Portal Poblano, S.A. de C.V.' },
  { id: 19, name: 'Colegio Bosques de Zavaleta', legalName: 'Colegio Bosques de Zavaleta, A.C.' },
  { id: 20, name: 'Creppes and Waffles' },
  { id: 21, name: 'Lácteos San Andrés' },
  { id: 22, name: 'Coatzacoalcos' },
  { id: 23, name: 'Benemer' },
  { id: 24, name: 'ANFORA' },
  { id: 25, name: 'Secretaría de la Defensa Nacional' },
  { id: 26, name: 'IPADE' },
  { id: 27, name: 'Grupo Modelo' },
  { id: 28, name: 'Colegio Humboldt' },
];

export type CasoDuplicado = {
  id: string;
  nombre: string;
  /** Ids que cuentan como acierto; vacío = no hay repetido. */
  esperados: number[];
  /** Qué tiene de difícil (para leer el reporte). */
  clase: 'dedo' | 'siglas' | 'forma' | 'conocer' | 'trampa' | 'nuevo';
};

export const CASOS_DUPLICADOS: CasoDuplicado[] = [
  // Formas de escribir el mismo nombre.
  { id: 'f01', nombre: 'buap', esperados: [1], clase: 'forma' },
  { id: 'f02', nombre: 'B.U.A.P.', esperados: [1], clase: 'forma' },
  { id: 'f03', nombre: 'GRUPO BIMBO SAB DE CV', esperados: [7], clase: 'forma' },
  { id: 'f04', nombre: 'Lacteos San Andres, S.A. de C.V.', esperados: [21], clase: 'forma' },
  { id: 'f05', nombre: 'Crepes & Waffles', esperados: [20], clase: 'forma' },
  { id: 'f06', nombre: 'colegio bosques de zavaleta a.c.', esperados: [19], clase: 'forma' },
  { id: 'f07', nombre: 'Volks Wagen de Mexico', esperados: [13], clase: 'forma' },
  { id: 'f08', nombre: 'Wal-Mart de México', esperados: [15], clase: 'forma' },
  { id: 'f09', nombre: 'Operadora Hotelera Portal de Analco', esperados: [17], clase: 'forma' },
  { id: 'f10', nombre: 'Liverpool', esperados: [9], clase: 'forma' },
  { id: 'f11', nombre: 'Bimbo', esperados: [7], clase: 'forma' },
  { id: 'f12', nombre: 'Hospital Angeles', esperados: [12], clase: 'forma' },

  // Errores de dedo y de oído.
  { id: 'd01', nombre: 'Cuatzacualcos', esperados: [22], clase: 'dedo' },
  { id: 'd02', nombre: 'Costructora Arcadia Angelopolis', esperados: [16], clase: 'dedo' },
  { id: 'd03', nombre: 'Cinepollis', esperados: [14], clase: 'dedo' },
  { id: 'd04', nombre: 'Tecnologico de Monterey', esperados: [3], clase: 'dedo' },
  { id: 'd05', nombre: 'Anfora', esperados: [24], clase: 'dedo' },
  { id: 'd06', nombre: 'Ánfo', esperados: [24], clase: 'dedo' },
  { id: 'd07', nombre: 'Bemer', esperados: [], clase: 'trampa' },

  // Siglas, en las dos direcciones.
  { id: 's01', nombre: 'Benemérita Universidad Autónoma de Puebla', esperados: [1, 23], clase: 'siglas' },
  { id: 's02', nombre: 'Universidad de las Américas Puebla', esperados: [2], clase: 'siglas' },
  { id: 's03', nombre: 'Instituto Mexicano del Seguro Social', esperados: [4], clase: 'siglas' },
  { id: 's04', nombre: 'Comisión Federal de Electricidad', esperados: [5], clase: 'siglas' },
  { id: 's05', nombre: 'Pemex', esperados: [6], clase: 'siglas' },
  { id: 's06', nombre: 'Instituto Panamericano de Alta Dirección de Empresa', esperados: [26], clase: 'siglas' },
  { id: 's07', nombre: 'Universidad Autónoma de Puebla', esperados: [1], clase: 'siglas' },

  // Hay que conocer el nombre: el código no puede saberlo.
  { id: 'c01', nombre: 'ITESM', esperados: [3], clase: 'conocer' },
  { id: 'c02', nombre: 'Banorte', esperados: [10], clase: 'conocer' },
  { id: 'c03', nombre: 'Conagua', esperados: [11], clase: 'conocer' },
  { id: 'c04', nombre: 'Seguro Social', esperados: [4], clase: 'conocer' },
  { id: 'c05', nombre: 'Sedena', esperados: [25], clase: 'conocer' },
  { id: 'c06', nombre: 'Benemérita', esperados: [1, 23], clase: 'conocer' },
  { id: 'c07', nombre: 'La Autónoma de Puebla', esperados: [1], clase: 'conocer' },
  { id: 'c08', nombre: 'Tec de Monterrey', esperados: [3], clase: 'conocer' },
  { id: 'c09', nombre: 'Ibero Puebla', esperados: [8], clase: 'conocer' },
  { id: 'c10', nombre: 'VW', esperados: [13], clase: 'conocer' },
  { id: 'c11', nombre: 'Luz y fuerza CFE', esperados: [5], clase: 'conocer' },
  { id: 'c12', nombre: 'Grupo Volkswagen Puebla', esperados: [13], clase: 'conocer' },

  // Parecidos que NO son el mismo.
  { id: 't01', nombre: 'UPAEP', esperados: [], clase: 'trampa' },
  { id: 't02', nombre: 'Universidad Popular Autónoma del Estado de Puebla', esperados: [], clase: 'trampa' },
  { id: 't03', nombre: 'ISSSTE', esperados: [], clase: 'trampa' },
  { id: 't04', nombre: 'Cinemex', esperados: [], clase: 'trampa' },
  { id: 't05', nombre: 'Bodega Aurrerá', esperados: [], clase: 'trampa' },
  { id: 't06', nombre: 'Suburbia', esperados: [], clase: 'trampa' },
  { id: 't07', nombre: 'Colegio Americano', esperados: [], clase: 'trampa' },
  { id: 't08', nombre: 'Hotel Presidente Puebla', esperados: [], clase: 'trampa' },
  { id: 't09', nombre: 'Banco Azteca', esperados: [], clase: 'trampa' },
  { id: 't10', nombre: 'Farmacias Guadalajara', esperados: [], clase: 'trampa' },
  { id: 't11', nombre: 'Tecnológico de Puebla', esperados: [], clase: 'trampa' },
  { id: 't12', nombre: 'Hospital Puebla', esperados: [], clase: 'trampa' },
  { id: 't13', nombre: 'Grupo Lala', esperados: [], clase: 'trampa' },
  { id: 't14', nombre: 'CFA Consultores', esperados: [], clase: 'trampa' },

  // Clientes nuevos de verdad.
  { id: 'n01', nombre: 'Toks', esperados: [], clase: 'nuevo' },
  { id: 'n02', nombre: 'Sephora', esperados: [], clase: 'nuevo' },
  { id: 'n03', nombre: 'Kiosko', esperados: [], clase: 'nuevo' },
  { id: 'n04', nombre: 'Materiales Hernández', esperados: [], clase: 'nuevo' },
  { id: 'n05', nombre: 'Taquería El Fogón', esperados: [], clase: 'nuevo' },
  { id: 'n06', nombre: 'Refaccionaria López', esperados: [], clase: 'nuevo' },
];
