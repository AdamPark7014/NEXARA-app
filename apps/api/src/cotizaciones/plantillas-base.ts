/**
 * Plantillas de cotización base del negocio: los arquetipos con los que se cotiza, cada uno como un
 * `ContenidoPlantilla` completo (objetivo, alcance en bloques, términos, anticipo, moneda, secciones,
 * columnas, condiciones y partidas de referencia).
 *
 * Es DATO, no lógica: el seed (`prisma/seed-nexara-plantillas.ts`) las carga en `cotizacion_plantillas`
 * de una empresa y el editor las ofrece en «Nueva cotización». Módulo puro (sin Nest ni Prisma).
 *
 * Reglas con las que se escribieron:
 *  - Nada de clientes, folios ni contactos de las cotizaciones de muestra.
 *  - Nada de precios inventados: `unitPrice` va en 0 (quien cotiza lo llena), salvo el precio genérico
 *    de la mano de obra de instalación de cámara que ya existe en `PAQUETES`.
 *  - Marcas y modelos reales del catálogo del negocio (Hikvision, Cisco, Panduit, APC, Fortinet, ESET…).
 *  - Cantidad 1 en cada partida: la cantidad la define el levantamiento de cada proyecto (una plantilla
 *    que dice «14 cámaras» acaba impresa en una propuesta de 9). Lo que no aplica se quita al cotizar.
 *  - El objetivo de las plantillas técnicas (red, CCTV, acceso, proyecto integral) va sin beneficios
 *    escritos: salen de las partidas reales al imprimir (ver `objetivoDePropuesta`), así que nunca
 *    discrepan de la tabla. Donde esos beneficios derivados no aplican (licencias, seguridad
 *    perimetral, póliza, licitación, suministro) se escriben aquí, sin ninguna cifra.
 *  - Los términos solo reescriben lo que el texto por omisión del segmento no cubre; el pago por
 *    anticipo se deja al texto por omisión para que siga al porcentaje que se capture.
 *  - Los textos de alcance de exclusiones y entrega salen de `plantillasDeAlcance` (no se duplican).
 *
 * Cada `contenido` ya está en forma canónica: `normalizarContenidoPlantilla(contenido)` devuelve lo mismo.
 */
import { plantillasDeAlcance } from './alcance-bloques.js';
import { CATALOGO_PARTIDAS_V2 } from './catalogo-partidas-base.js';
import { escribirObjetivo } from './objetivo-plantilla.js';
import { buscarPaquete } from './paquetes.js';
import type { GrupoPartida } from './partidas-grupos.js';
import {
  condicionesPorOmision,
  normalizarOpciones,
  type ContenidoPlantilla,
  type OpcionesCotizacion,
  type PartidaDePlantilla,
} from './personalizacion.js';
import { escribirTerminosPersonalizados, type ClaveTermino, type Segmento } from './terminos-segmento.js';

export type PlantillaBase = {
  /** Identificador estable (no cambia aunque se renombre): lo usa el marcador del seed. */
  clave: string;
  /** Lo que ve quien cotiza al elegirla. Con la empresa, es la llave del seed. */
  nombre: string;
  segmento: Segmento;
  conPartidas: boolean;
  /** Para qué tipo de trabajo se elige (uso interno; no se guarda en la base de datos). */
  paraQue: string;
  contenido: ContenidoPlantilla;
};

// ─── Ayudas de armado ────────────────────────────────────────────────────────────────────────────

type BloqueCanonico = { clave: string; titulo: string; texto: string | null; vinetas: string[] };

const bloque = (clave: string, titulo: string, texto: string | null, vinetas: string[] = []): BloqueCanonico => ({
  clave,
  titulo,
  texto,
  vinetas,
});

/** Un bloque ya existente del editor (exclusiones, entrega, integración…): se reutiliza, no se copia. */
function bloqueDeEditor(segmento: Segmento, clave: string): BloqueCanonico {
  const encontrado = plantillasDeAlcance(segmento).find((b) => b.clave === clave);
  if (!encontrado) throw new Error(`No existe el bloque de alcance «${clave}» para el segmento ${segmento}.`);
  return bloque(encontrado.clave, encontrado.titulo, encontrado.texto, [...encontrado.vinetas]);
}

type SemillaPartida = {
  name: string;
  grupo: GrupoPartida;
  unit: string;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  unitPrice?: number;
};

const partida = (s: SemillaPartida): PartidaDePlantilla => ({
  name: s.name,
  description: s.description ?? null,
  unit: s.unit,
  qty: 1,
  unitPrice: s.unitPrice ?? 0,
  discount: 0,
  tax: 16,
  grupo: s.grupo,
  brand: s.brand ?? null,
  model: s.model ?? null,
  imagenUrl: null,
});

/**
 * La mano de obra de un paquete existente, con su precio genérico. Es el único precio que traen las
 * plantillas y sale de `PAQUETES`, no se escribe aquí.
 */
function manoDeObraDePaquete(clave: string): PartidaDePlantilla {
  const mano = buscarPaquete(clave)?.partidas.find((p) => p.grupo === 'MANO_DE_OBRA');
  if (!mano) throw new Error(`El paquete «${clave}» no tiene partida de mano de obra.`);
  return partida({ name: mano.name, grupo: 'MANO_DE_OBRA', unit: mano.unit, description: mano.description ?? null, unitPrice: mano.unitPrice });
}

type ConfigOpciones = {
  objetivo: boolean;
  alcance: boolean;
  planos: boolean;
  marcaModelo: boolean;
  garantia: string;
  tiempoEntrega?: string;
  /** `''` = no imprimir «pago mediante…» (licitación: el pago lo fijan las bases). */
  formaPago?: string;
};

function opciones(segmento: Segmento, cfg: ConfigOpciones): OpcionesCotizacion {
  const base = condicionesPorOmision(segmento);
  return normalizarOpciones({
    secciones: { objetivo: cfg.objetivo, alcance: cfg.alcance, planos: cfg.planos, terminos: true, firma: true },
    columnas: { marcaModelo: cfg.marcaModelo, imagen: false, descuento: false, precioUnitario: true },
    carta: null,
    tipoCambioNota: '',
    condiciones: {
      formaPago: cfg.formaPago ?? base.formaPago,
      tiempoEntrega: cfg.tiempoEntrega ?? base.tiempoEntrega,
      garantia: cfg.garantia,
    },
    elaboro: null,
    autorizo: null,
  });
}

const nota = (partes: Partial<Record<ClaveTermino, string>>) => escribirTerminosPersonalizados(partes);

// ─── Textos comunes ──────────────────────────────────────────────────────────────────────────────

/** Garantía del fabricante en equipos (mínimo 12 meses salvo indicación por partida). */
const GARANTIA_EQUIPO = 'Garantía del fabricante en los equipos (mínimo 12 meses, salvo indicación distinta por partida).';
/** Garantía con instalación: 90 días sobre la mano de obra. */
const GARANTIA_INSTALACION =
  'Garantía del fabricante en los equipos (mínimo 12 meses, salvo indicación distinta por partida) y 90 días en la mano de obra de instalación ejecutada por nuestro personal.';

const OTRAS_GENERAL =
  'Los precios se expresan en pesos mexicanos (MXN) y el IVA se desglosa en el total de la propuesta. La garantía no aplica por mal uso, por daños causados por terceros ni por falta de mantenimiento. La aceptación de esta propuesta implica conformidad con el alcance, los precios, la vigencia y las exclusiones descritos.';

/**
 * Objetivo de la plantilla. Sin `beneficios` salen de las partidas reales al imprimir; solo se escriben
 * (sin cifras) donde los derivados de las partidas no aplican: licencias, póliza, licitación…
 */
const objetivo = (intro: string, cierre: string, beneficios: string[] = []) => escribirObjetivo({ intro, beneficios, cierre });

// ─── 1. Suministro de equipo ─────────────────────────────────────────────────────────────────────

const SUMINISTRO: PlantillaBase = {
  clave: 'suministro-equipo',
  nombre: 'Suministro de equipo',
  segmento: 'COMERCIAL',
  conPartidas: true,
  paraQue: 'Venta de equipo (cómputo, red, periféricos, respaldo de energía) sin instalación: entrega y factura.',
  contenido: {
    segmento: 'COMERCIAL',
    projectName: 'Suministro de equipo de cómputo y red',
    scope: 'El alcance de esta propuesta es el suministro de los equipos descritos en el presupuesto, entregados en el lugar acordado con el cliente.',
    objetivo: objetivo(
      'Esta propuesta cubre el suministro del equipo descrito, con la garantía del fabricante y la entrega coordinada con el cliente, para que su operación cuente con la tecnología que requiere.',
      'Como resultado, el cliente recibe el equipo correcto, con su garantía respaldada por el fabricante y un presupuesto claro, partida por partida.',
      [
        'Equipo nuevo con la garantía del fabricante.',
        'Entrega coordinada con el área responsable del cliente.',
        'Presupuesto detallado partida por partida: cada equipo con su cantidad y su precio.',
      ],
    ),
    alcanceBloques: [
      bloque(
        'base:suministro:entrega',
        'Entrega del equipo',
        'El equipo se entrega nuevo y con la garantía del fabricante, en el lugar acordado con el cliente. La entrega incluye:',
        [
          'Coordinación de la entrega con el área responsable del cliente.',
          'Verificación de cantidades, modelos y números de serie al recibir.',
          'Recepción de conformidad por parte del cliente.',
        ],
      ),
      bloque(
        'base:suministro:garantia',
        'Garantía y soporte',
        'Los equipos cuentan con la garantía del fabricante indicada en cada partida. El trámite de garantía se gestiona con el apoyo de nuestro equipo.',
      ),
    ],
    note: nota({ otras: OTRAS_GENERAL }),
    depositPercent: condicionesPorOmision('COMERCIAL').anticipoPct,
    currency: 'MXN',
    opciones: opciones('COMERCIAL', { objetivo: true, alcance: false, planos: false, marcaModelo: true, garantia: GARANTIA_EQUIPO }),
    items: [
      partida({ name: 'Computadora de escritorio', grupo: 'EQUIPOS', unit: 'Pieza', brand: 'Lenovo', description: 'Procesador, memoria y almacenamiento según el requerimiento del cliente.' }),
      partida({ name: 'Computadora portátil', grupo: 'EQUIPOS', unit: 'Pieza', brand: 'Lenovo', description: 'Procesador, memoria y almacenamiento según el requerimiento del cliente.' }),
      partida({ name: 'Pantalla', grupo: 'EQUIPOS', unit: 'Pieza', brand: 'Samsung' }),
      partida({ name: 'Impresora multifuncional', grupo: 'EQUIPOS', unit: 'Pieza', brand: 'Brother' }),
      partida({ name: 'Switch Gigabit de 24 puertos', grupo: 'EQUIPOS', unit: 'Pieza', brand: 'Cisco' }),
      partida({ name: 'Unidad de respaldo de energía (UPS)', grupo: 'EQUIPOS', unit: 'Pieza', brand: 'APC' }),
    ],
  },
};

// ─── 2. Licenciamiento ───────────────────────────────────────────────────────────────────────────

const LICENCIAMIENTO: PlantillaBase = {
  clave: 'licenciamiento',
  nombre: 'Licenciamiento',
  segmento: 'COMERCIAL',
  conPartidas: true,
  paraQue: 'Venta de licencias y suscripciones de software (Microsoft 365, Office, ESET): por licencia y vigencia.',
  contenido: {
    segmento: 'COMERCIAL',
    projectName: 'Licenciamiento de software',
    scope: 'El alcance de esta propuesta es el suministro de las licencias descritas en el presupuesto, con la vigencia y el esquema indicados en cada partida.',
    objetivo: objetivo(
      'Esta propuesta cubre el licenciamiento de software para la operación y la protección de los equipos del cliente, con las vigencias y los esquemas descritos en el presupuesto.',
      'Como resultado, el cliente opera con licencias vigentes y con el respaldo del fabricante, y administra sus equipos de forma centralizada cuando el esquema contratado lo incluye.',
      [
        'Licencias vigentes con el respaldo del fabricante.',
        'Esquema por usuario o por equipo, con la vigencia indicada en cada partida.',
        'Presupuesto detallado partida por partida: cada licencia con su cantidad y su precio.',
      ],
    ),
    alcanceBloques: [
      bloque(
        'base:licenciamiento:esquemas',
        'Esquemas de licenciamiento',
        'Cada partida indica el esquema, la vigencia y el número de usuarios o de equipos que cubre:',
        [
          'Suscripción anual por usuario: Microsoft 365 incluye las aplicaciones de Office, correo, Teams y OneDrive según la edición; Business Basic incluye correo y aplicaciones web.',
          'Licencia perpetua: Office Hogar y Empresas 2024 se paga una sola vez y se vincula a un equipo; no incluye el correo en la nube de Microsoft 365 ni actualizaciones mayores futuras.',
          'Protección de equipos: ESET Protect Entry Cloud es una solución corporativa de ciberseguridad con consola de administración en la nube; el paquete base cubre un mínimo de 5 equipos.',
        ],
      ),
      bloque(
        'base:licenciamiento:entrega',
        'Entrega y activación',
        'Las licencias se entregan a nombre del cliente por medios electrónicos. La activación y el alta de usuarios o de equipos en la consola del fabricante se realizan con el cliente, salvo que se coticen como servicio en esta propuesta.',
      ),
      bloque(
        'base:licenciamiento:vigencia',
        'Vigencia y renovación',
        'La vigencia corre a partir de la activación. La renovación se cotiza con las condiciones vigentes del fabricante.',
      ),
    ],
    note: nota({
      pago: 'Pago de contado por transferencia electrónica o depósito bancario, antes de la entrega de las licencias.',
      alcance:
        'El precio cubre el suministro de las licencias descritas, con la vigencia y el esquema indicados en cada partida, y su entrega por medios electrónicos.',
      noIncluye:
        'Instalación, configuración, migración de datos y capacitación, salvo que se coticen como servicio en esta propuesta, ni licencias o suscripciones distintas a las descritas.',
      disponibilidad: 'La entrega electrónica se realiza al confirmar el pago, sujeta a la disponibilidad del fabricante o del distribuidor.',
      otras:
        'Los precios se expresan en pesos mexicanos (MXN) y el IVA se desglosa en el total de la propuesta. Las condiciones de uso, vigencia y renovación son las del fabricante.',
    }),
    depositPercent: 100,
    currency: 'MXN',
    opciones: opciones('COMERCIAL', {
      objetivo: false,
      alcance: true,
      planos: false,
      marcaModelo: true,
      garantia: 'Las licencias cuentan con el soporte del fabricante durante su vigencia.',
      tiempoEntrega: 'Entrega electrónica de las licencias después de confirmar el pago, sujeta a la disponibilidad del fabricante o del distribuidor.',
    }),
    items: [
      partida({
        name: 'Microsoft 365 Business Standard',
        grupo: 'EQUIPOS',
        unit: 'Licencia',
        brand: 'Microsoft',
        description: 'Suscripción anual por usuario. Incluye Word, Excel, PowerPoint, Outlook, Teams y OneDrive con instalación completa en PC y Mac (hasta 5 dispositivos por usuario).',
      }),
      partida({
        name: 'Microsoft 365 Business Basic',
        grupo: 'EQUIPOS',
        unit: 'Licencia',
        brand: 'Microsoft',
        description: 'Suscripción anual por usuario. Incluye correo y aplicaciones web.',
      }),
      partida({
        name: 'Office Hogar y Empresas 2024',
        grupo: 'EQUIPOS',
        unit: 'Licencia',
        brand: 'Microsoft',
        description: 'Licencia perpetua para 1 PC o Mac. No incluye el correo en la nube de Microsoft 365 ni actualizaciones mayores futuras.',
      }),
      partida({
        name: 'ESET Protect Entry Cloud, suscripción de 1 año',
        grupo: 'EQUIPOS',
        unit: 'Licencia',
        brand: 'ESET',
        description: 'Paquete base de 5 equipos con consola de administración en la nube.',
      }),
      partida({
        name: 'ESET Protect Entry Cloud, suscripción de 2 años',
        grupo: 'EQUIPOS',
        unit: 'Licencia',
        brand: 'ESET',
        description: 'Paquete base de 5 equipos con consola de administración en la nube.',
      }),
    ],
  },
};

// ─── 3. Seguridad perimetral (Fortinet) ──────────────────────────────────────────────────────────

const SEGURIDAD_PERIMETRAL: PlantillaBase = {
  clave: 'seguridad-perimetral-fortinet',
  nombre: 'Seguridad perimetral (Fortinet)',
  segmento: 'COMERCIAL',
  conPartidas: true,
  paraQue: 'Firewall FortiGate con su licenciamiento y soporte del fabricante, con configuración inicial.',
  contenido: {
    segmento: 'COMERCIAL',
    projectName: 'Seguridad perimetral de red',
    scope: 'El alcance comprende el suministro del dispositivo de seguridad y su licenciamiento, y la configuración inicial para dejarlo operando en la red del cliente.',
    objetivo: objetivo(
      'Esta propuesta protege la red del cliente con seguridad perimetral de nivel empresarial: firewall, VPN y los servicios de protección que incluya el licenciamiento contratado, respaldados por el soporte directo del fabricante.',
      'Como resultado, la red del cliente queda protegida, configurada según sus políticas de uso y respaldada por el fabricante durante la vigencia del licenciamiento.',
      [
        'Firewall y VPN respaldados por el soporte directo del fabricante.',
        'Licenciamiento de protección con la vigencia indicada en cada partida.',
        'Configuración inicial según las políticas de uso del cliente.',
        'Presupuesto detallado partida por partida: cada equipo y cada licencia con su cantidad y su precio.',
      ],
    ),
    alcanceBloques: [
      bloque(
        'base:seguridad:equipo',
        'Dispositivo de seguridad',
        'Suministro de gateway de seguridad con funciones de firewall, router y VPN, con capacidad para filtrado de contenido, antivirus, antispam, prevención de intrusiones (IPS) y filtrado web mediante el licenciamiento del fabricante.',
      ),
      bloque(
        'base:seguridad:licenciamiento',
        'Licenciamiento y soporte del fabricante',
        'El licenciamiento FortiGuard y el soporte FortiCare se contratan directamente con el fabricante por el periodo indicado en cada partida:',
        [
          'Actualizaciones de seguridad y servicios de protección durante la vigencia.',
          'Garantía extendida y soporte directo del fabricante, en la modalidad indicada en la partida.',
        ],
      ),
      bloque(
        'base:seguridad:configuracion',
        'Configuración inicial y puesta en marcha',
        'Al instalar el equipo se realizarán las siguientes actividades:',
        [
          'Alta del equipo y de las licencias en el portal del fabricante.',
          'Configuración de interfaces, direccionamiento y salida a Internet.',
          'Políticas de acceso y de filtrado definidas con el cliente.',
          'VPN entre sitios o de acceso remoto, cuando se incluya en el alcance.',
          'Respaldo de la configuración y pruebas de operación.',
        ],
      ),
      bloque(
        'base:seguridad:exclusiones',
        'Exclusiones',
        'El presente alcance no considera, salvo indicación expresa en el presupuesto:',
        [
          'Equipos de red de terceros (switches, puntos de acceso, enlaces) distintos a los descritos.',
          'Migración de reglas o políticas de equipos anteriores que no se hayan levantado previamente.',
          'Servicios de Internet o incremento del ancho de banda contratado por el cliente.',
          'Licencias o dispositivos adicionales no listados en el presupuesto.',
        ],
      ),
    ],
    note: nota({
      noIncluye:
        'Equipos de red de terceros distintos a los descritos, migración de reglas o políticas de equipos anteriores que no se hayan levantado previamente, ni el servicio de Internet del cliente o el incremento de su ancho de banda.',
      disponibilidad:
        'La entrega está sujeta a la disponibilidad del fabricante al confirmar el pedido y recibir el anticipo, y se realiza en el lugar que indique el cliente.',
      otras: `Los equipos y el licenciamiento de seguridad dependen del fabricante y del tipo de cambio: sus precios solo se garantizan durante la vigencia de esta propuesta. ${OTRAS_GENERAL}`,
    }),
    depositPercent: condicionesPorOmision('COMERCIAL').anticipoPct,
    currency: 'MXN',
    opciones: opciones('COMERCIAL', {
      objetivo: true,
      alcance: true,
      planos: false,
      marcaModelo: true,
      garantia: GARANTIA_INSTALACION,
      tiempoEntrega: 'El plazo depende del inventario del fabricante y se confirma por escrito al recibir el anticipo.',
    }),
    items: [
      partida({
        name: 'Dispositivo de seguridad de red FortiGate-90G Plus con 1 año de protección empresarial FortiGuard y FortiCare Premium',
        grupo: 'EQUIPOS',
        unit: 'Pieza',
        brand: 'Fortinet',
        model: 'FG-90G-BDL-809-12',
      }),
      partida({
        name: 'Licenciamiento FortiGuard y FortiCare Premium, 1 año de protección empresarial',
        grupo: 'EQUIPOS',
        unit: 'Licencia',
        brand: 'Fortinet',
      }),
      partida({ name: 'Renovación de licencia, 1 año', grupo: 'EQUIPOS', unit: 'Licencia', brand: 'Fortinet' }),
      partida({
        name: 'Gateway de seguridad FortiGate 400F',
        grupo: 'EQUIPOS',
        unit: 'Pieza',
        brand: 'Fortinet',
        model: 'FG-400F',
        description:
          'Firewall, router y VPN. Filtrado de contenido, antivirus, antispam, IPS y filtrado web mediante el licenciamiento FortiGuard (no incluido). 16 puertos RJ45 GE, 8 ranuras SFP GE, 4 ranuras SFP+ 10 GE y 4 ranuras SFP+ 10 GE de latencia ultrabaja; 1 puerto RJ45 para HA y 1 puerto RJ45 para administración.',
      }),
      partida({
        name: 'Licenciamiento Advanced Threat Protection para FG-400F con garantía extendida FortiCare 24x7',
        grupo: 'EQUIPOS',
        unit: 'Licencia',
        brand: 'Fortinet',
        description:
          'Funciones de seguridad IPS, Advanced Malware Protection Service y Application Control. Incluye garantía extendida FortiCare 24x7 directamente con el fabricante por 36 meses.',
      }),
      partida({
        name: 'Configuración y puesta en marcha de seguridad perimetral',
        grupo: 'MANO_DE_OBRA',
        unit: 'Servicio',
        description: 'Alta del equipo y de las licencias, configuración de interfaces, políticas de acceso, filtrado y VPN, y pruebas de operación.',
      }),
    ],
  },
};

// ─── 4. Red estructurada (cableado) ──────────────────────────────────────────────────────────────

const RED_ESTRUCTURADA: PlantillaBase = {
  clave: 'red-estructurada',
  nombre: 'Red estructurada (cableado)',
  segmento: 'OBRA',
  conPartidas: true,
  paraQue: 'Cableado estructurado por niveles o áreas: nodos Cat6, certificación, paneles y rack del cuarto de comunicaciones.',
  contenido: {
    segmento: 'OBRA',
    projectName: 'Red de cableado estructurado',
    scope: 'El alcance comprende el suministro, la instalación, la certificación y el etiquetado del cableado estructurado y de los elementos del cuarto de comunicaciones descritos en el presupuesto.',
    objetivo: objetivo(
      'Esta obra deja instalada una red de cableado estructurado ordenada, certificada y documentada, con los nodos, el cuarto de comunicaciones y los elementos pasivos necesarios para la operación del cliente.',
      'Como resultado, el cliente dispone de una red certificada, identificada nodo por nodo y lista para crecer, con la evidencia de las pruebas realizadas.',
    ),
    alcanceBloques: [
      bloque(
        'base:red:cableado',
        'Cableado horizontal',
        'Suministro e instalación del cable UTP categoría 6 desde el cuarto de comunicaciones hasta cada nodo, con su placa de pared y su conector jack:',
        [
          'Cable UTP Cat6 de 4 pares, tendido sin empalmes.',
          'Placa de pared con salida Mini-Com y conector jack Cat6 en cada nodo.',
          'Identificación de voz y datos en ambos extremos de cada nodo.',
        ],
      ),
      bloque(
        'base:red:rack',
        'Cuarto de comunicaciones',
        'Armado e integración del rack de comunicaciones con los elementos pasivos requeridos:',
        [
          'Rack de 19 in con organizadores de cable verticales y horizontales.',
          'Paneles de parcheo modulares.',
          'Cables de parcheo entre los paneles y el equipo activo.',
          'Distribución de energía (PDU) y charolas para equipos, cuando estén incluidos en el presupuesto.',
        ],
      ),
      bloque(
        'base:red:certificacion',
        'Certificación y pruebas',
        'Cada nodo se certifica con equipo de medición y se entrega el reporte de resultados:',
        ['Certificación de todos los nodos instalados.', 'Reporte de resultados por nodo.', 'Corrección de los nodos que no aprueben la certificación.'],
      ),
      bloqueDeEditor('OBRA', 'plantilla:exclusiones'),
      bloqueDeEditor('OBRA', 'plantilla:entrega'),
    ],
    note: nota({
      noIncluye:
        'Obra civil, canalizaciones o ductos no descritos en el alcance, permisos de terceros, adecuaciones eléctricas distintas a las descritas, ni equipo activo de red que no esté listado en el presupuesto.',
      otras: `El cableado se entrega certificado y etiquetado, y los resultados de la certificación forman parte de la documentación de entrega. ${OTRAS_GENERAL}`,
    }),
    depositPercent: condicionesPorOmision('OBRA').anticipoPct,
    currency: 'MXN',
    opciones: opciones('OBRA', { objetivo: true, alcance: true, planos: true, marcaModelo: true, garantia: GARANTIA_INSTALACION }),
    items: [
      partida({
        name: 'Cable UTP de cobre categoría 6 (24 AWG, 1000 Mbps, Riser CMR), de 4 pares',
        grupo: 'MATERIALES',
        unit: 'Metro',
        brand: 'Panduit',
        model: 'NetKey',
      }),
      partida({
        name: 'Placa de pared vertical ejecutiva, salida para 1 puerto Mini-Com, con espacio para etiqueta',
        grupo: 'MATERIALES',
        unit: 'Pieza',
        brand: 'Panduit',
        model: 'Mini-Com',
      }),
      partida({
        name: 'Conector jack estilo 110 (de impacto) tipo keystone, categoría 6, de 8 posiciones',
        grupo: 'MATERIALES',
        unit: 'Pieza',
      }),
      partida({
        name: 'Cable de parcheo UTP categoría 6 con plug modular en cada extremo, 1 m',
        grupo: 'MATERIALES',
        unit: 'Pieza',
        brand: 'Panduit',
      }),
      partida({
        name: 'Cable de parcheo UTP categoría 6A, 24 AWG, 1.52 m',
        grupo: 'MATERIALES',
        unit: 'Pieza',
        brand: 'Panduit',
      }),
      partida({
        name: 'Canalización para cableado',
        grupo: 'MATERIALES',
        unit: 'Metro',
        description: 'Con etiquetado de voz y datos. El metraje de canalización se determina durante la visita técnica al sitio.',
      }),
      partida({
        name: 'Panel de parcheo modular keystone (sin conectores) de 48 puertos, 2 UR',
        grupo: 'EQUIPOS',
        unit: 'Pieza',
        brand: 'Panduit',
        description: 'Con identificación mediante etiqueta adhesiva.',
      }),
      partida({
        name: 'Panel de parcheo modular keystone de 24 puertos, 1 UR',
        grupo: 'EQUIPOS',
        unit: 'Pieza',
        brand: 'Panduit',
        description: 'Numerado y con espacio para etiquetas.',
      }),
      partida({
        name: 'Rack de dos postes estándar de 19 in, 45 UR',
        grupo: 'EQUIPOS',
        unit: 'Pieza',
        description: 'Rieles numerados y roscados #12-24; fabricado en aluminio, color negro.',
      }),
      partida({
        name: 'Organizador vertical doble (frontal y posterior) para rack abierto de 45 UR',
        grupo: 'EQUIPOS',
        unit: 'Pieza',
        brand: 'Panduit',
        model: 'NetRunner',
      }),
      partida({
        name: 'Organizador de cables horizontal sencillo (solo frontal) con tapa extendida, para rack de 19 in, 2 UR',
        grupo: 'EQUIPOS',
        unit: 'Pieza',
        brand: 'Panduit',
        model: 'PatchLink',
      }),
      partida({
        name: 'PDU básico para distribución de energía, 1 UR, 20 A, 120 Vca',
        grupo: 'EQUIPOS',
        unit: 'Pieza',
        brand: 'Panduit',
        description: 'Enchufe de entrada NEMA 5-20P y 12 contactos NEMA 5-20R; instalación horizontal en rack de 19 in.',
      }),
      partida({
        name: 'Charola para soportar equipos en rack de 19 in, 2 UR',
        grupo: 'EQUIPOS',
        unit: 'Pieza',
        description: 'Con capacidad de carga de 30 kg.',
      }),
      partida({
        name: 'Instalación de nodos de red (tendido, conexión y etiquetado)',
        grupo: 'MANO_DE_OBRA',
        unit: 'Nodo',
      }),
      partida({ name: 'Certificación de nodos', grupo: 'MANO_DE_OBRA', unit: 'Nodo' }),
      partida({ name: 'Armado e integración de rack de comunicaciones', grupo: 'MANO_DE_OBRA', unit: 'Servicio' }),
    ],
  },
};

// ─── 5. CCTV ─────────────────────────────────────────────────────────────────────────────────────

const CCTV: PlantillaBase = {
  clave: 'cctv',
  nombre: 'CCTV (videovigilancia)',
  segmento: 'OBRA',
  conPartidas: true,
  paraQue: 'Sistema de videovigilancia IP nuevo o ampliación: cámaras, NVR, almacenamiento y switch PoE, con instalación.',
  contenido: {
    segmento: 'OBRA',
    projectName: 'Sistema de videovigilancia (CCTV)',
    scope: 'El alcance comprende el suministro, la instalación, la configuración y la puesta en marcha del sistema de videovigilancia descrito en el presupuesto.',
    objetivo: objetivo(
      'Este proyecto permite al cliente contar con un sistema de videovigilancia moderno y confiable, con la cobertura definida en el levantamiento técnico, grabación centralizada y acceso remoto.',
      'Como resultado, el cliente dispondrá de mayor cobertura, imágenes útiles para la toma de decisiones y un sistema preparado para crecer, reduciendo riesgos operativos.',
    ),
    alcanceBloques: [
      bloque(
        'base:cctv:sistema',
        'Sistema de videovigilancia',
        'Suministro e instalación de cámaras IP, grabador de video en red (NVR) y switch PoE, con la ubicación de cada equipo definida en el levantamiento técnico:',
        [
          'Cámaras tipo domo y tipo bala, según las áreas por cubrir.',
          'Grabador de video en red con almacenamiento para el tiempo de retención requerido.',
          'Alimentación por Ethernet (PoE) a las cámaras.',
          'Montaje, conexión y ajuste de cada cámara.',
        ],
      ),
      bloqueDeEditor('OBRA', 'plantilla:almacenamiento'),
      bloqueDeEditor('OBRA', 'plantilla:integracion'),
      bloqueDeEditor('OBRA', 'plantilla:consideraciones'),
      bloqueDeEditor('OBRA', 'plantilla:exclusiones'),
      bloqueDeEditor('OBRA', 'plantilla:entrega'),
    ],
    note: nota({
      otras: `La operación remota del sistema depende del servicio de Internet del cliente. ${OTRAS_GENERAL}`,
    }),
    depositPercent: condicionesPorOmision('OBRA').anticipoPct,
    currency: 'MXN',
    opciones: opciones('OBRA', { objetivo: true, alcance: true, planos: true, marcaModelo: true, garantia: GARANTIA_INSTALACION }),
    items: [
      partida({
        name: 'NVR IP con puertos PoE+ y análisis de video',
        grupo: 'EQUIPOS',
        unit: 'Pieza',
        brand: 'Hikvision',
        description: 'Grabador de video en red con salida HDMI y análisis AcuSense. Canales y bahías de disco según el número de cámaras y el tiempo de retención.',
      }),
      partida({
        name: 'Disco duro para videovigilancia',
        grupo: 'EQUIPOS',
        unit: 'Pieza',
        brand: 'Western Digital',
        description: 'Unidad de 7200 RPM optimizada para soluciones de video inteligente; capacidad según el tiempo de retención requerido.',
      }),
      partida({
        name: 'Switch Gigabit PoE+ administrable',
        grupo: 'EQUIPOS',
        unit: 'Pieza',
        brand: 'Hikvision',
        description: 'Con puertos SFP, configuración en la nube Hik-Partner Pro y modo extendido de hasta 300 m.',
      }),
      partida({
        name: 'Cámara domo IP para exterior',
        grupo: 'EQUIPOS',
        unit: 'Pieza',
        brand: 'Hikvision',
        description: 'Resolución y lente según el punto de instalación. IR y luz blanca, micrófono integrado, AcuSense Lite, protección IP67 / IK08, dWDR, alimentación PoE y ranura para Micro SD.',
      }),
      partida({
        name: 'Cámara bala IP para exterior',
        grupo: 'EQUIPOS',
        unit: 'Pieza',
        brand: 'Hikvision',
        description: 'Resolución y lente según el punto de instalación. IR, protección IP67, alimentación PoE y ranura para Micro SD.',
      }),
      partida({ name: 'Montaje de pared para cámara domo', grupo: 'MATERIALES', unit: 'Pieza' }),
      manoDeObraDePaquete('camara-bala-instalada'),
      partida({
        name: 'Configuración y puesta en marcha del sistema de videovigilancia',
        grupo: 'MANO_DE_OBRA',
        unit: 'Servicio',
      }),
    ],
  },
};

// ─── 6. Control de acceso ────────────────────────────────────────────────────────────────────────

const CONTROL_ACCESO: PlantillaBase = {
  clave: 'control-acceso',
  nombre: 'Control de acceso',
  segmento: 'OBRA',
  conPartidas: true,
  paraQue: 'Control de acceso biométrico o por tarjeta: terminales, cerraduras o torniquetes, controlador y alta de usuarios.',
  contenido: {
    segmento: 'OBRA',
    projectName: 'Sistema de control de acceso',
    scope: 'El alcance comprende el suministro, la instalación, la configuración y la puesta en marcha del sistema de control de acceso descrito en el presupuesto.',
    objetivo: objetivo(
      'Este proyecto permite al cliente controlar y registrar quién entra y sale de sus instalaciones, con identificación en cada punto de acceso y administración centralizada de usuarios y horarios.',
      'Como resultado, el cliente dispone de un control de acceso operando, con el registro de eventos de cada punto y los usuarios dados de alta y verificados en sitio.',
    ),
    alcanceBloques: [
      bloque(
        'base:acceso:puntos',
        'Puntos de control',
        'Suministro e instalación de los equipos de control de acceso en los puntos definidos durante el levantamiento técnico:',
        [
          'Terminales de identificación (biométrica, facial o de tarjeta) según cada punto.',
          'Cerraduras electromagnéticas o torniquetes, según el tipo de acceso.',
          'Botones de salida y fuentes de alimentación con respaldo.',
          'Cableado y canalización interna hasta el controlador.',
        ],
      ),
      bloque(
        'base:acceso:configuracion',
        'Configuración y alta de usuarios',
        'Se configuran los equipos y la plataforma de administración, y se da de alta a los usuarios con los horarios y niveles de acceso que defina el cliente:',
        [
          'Alta de usuarios y de las credenciales proporcionadas por el cliente.',
          'Horarios y niveles de acceso por área.',
          'Reglas de apertura y alertas por puerta forzada o abierta.',
          'Pruebas de cada punto y capacitación básica al administrador.',
        ],
      ),
      bloqueDeEditor('OBRA', 'plantilla:exclusiones'),
      bloqueDeEditor('OBRA', 'plantilla:entrega'),
    ],
    note: nota({
      noIncluye:
        'Obra civil, adecuaciones en puertas, herrería o cancelería, adecuaciones eléctricas distintas a las descritas, ni credenciales o tarjetas que no estén listadas en el presupuesto.',
      otras: OTRAS_GENERAL,
    }),
    depositPercent: condicionesPorOmision('OBRA').anticipoPct,
    currency: 'MXN',
    opciones: opciones('OBRA', { objetivo: true, alcance: true, planos: false, marcaModelo: true, garantia: GARANTIA_INSTALACION }),
    items: [
      partida({ name: 'Controlador de acceso', grupo: 'EQUIPOS', unit: 'Pieza', brand: 'Hikvision' }),
      partida({
        name: 'Terminal de identificación por rostro, huella o tarjeta',
        grupo: 'EQUIPOS',
        unit: 'Pieza',
        brand: 'Hikvision',
        description: 'Terminal para cada punto de acceso; el tipo de identificación se define en el levantamiento.',
      }),
      partida({ name: 'Torniquete', grupo: 'EQUIPOS', unit: 'Pieza' }),
      partida({ name: 'Cerradura electromagnética con botón de salida', grupo: 'EQUIPOS', unit: 'Pieza' }),
      partida({ name: 'Fuente de alimentación con respaldo de batería', grupo: 'EQUIPOS', unit: 'Pieza' }),
      partida({ name: 'Tarjetas o llaveros de proximidad', grupo: 'MATERIALES', unit: 'Pieza' }),
      partida({ name: 'Cable y canalización para puntos de acceso', grupo: 'MATERIALES', unit: 'Lote' }),
      partida({ name: 'Instalación de puntos de control de acceso', grupo: 'MANO_DE_OBRA', unit: 'Servicio' }),
      partida({ name: 'Configuración de la plataforma y alta de usuarios', grupo: 'MANO_DE_OBRA', unit: 'Servicio' }),
    ],
  },
};

// ─── 7. Póliza de servicio / mantenimiento ───────────────────────────────────────────────────────

const POLIZA_SERVICIO: PlantillaBase = {
  clave: 'poliza-servicio',
  nombre: 'Póliza de servicio (mantenimiento)',
  segmento: 'SERVICIO',
  conPartidas: true,
  paraQue: 'Mantenimiento preventivo y correctivo recurrente (por ejemplo, de CCTV): visitas programadas, atención de fallas y reporte, cobrado por periodo.',
  contenido: {
    segmento: 'SERVICIO',
    projectName: 'Póliza de mantenimiento y soporte',
    scope: 'La póliza cubre el mantenimiento preventivo y correctivo de los equipos y sistemas listados en el presupuesto, durante el periodo contratado.',
    objetivo: objetivo(
      'Esta póliza mantiene los sistemas del cliente en condiciones confiables de operación, con visitas preventivas programadas, atención de fallas y un reporte de lo revisado en cada intervención.',
      'Al cierre de cada periodo el cliente cuenta con el reporte de lo atendido y con las recomendaciones para conservar sus sistemas estables.',
      [
        'Visitas de mantenimiento preventivo programadas de común acuerdo con el cliente.',
        'Atención de fallas con seguimiento hasta su cierre.',
        'Reporte de cada intervención con lo revisado, lo corregido y las recomendaciones.',
        'Costo por periodo definido, con el alcance de la cobertura descrito en la propuesta.',
      ],
    ),
    alcanceBloques: [
      bloque(
        'base:poliza:cobertura',
        'Cobertura de la póliza',
        'La póliza cubre los equipos y sistemas listados en el presupuesto durante el periodo contratado (mensual o trimestral, según se acuerde) e incluye:',
        [
          'Visitas programadas de mantenimiento preventivo.',
          'Atención de fallas (mantenimiento correctivo) por reporte del cliente.',
          'Soporte telefónico y remoto.',
          'Reporte de cada visita con lo revisado, lo corregido y las recomendaciones.',
        ],
      ),
      bloque(
        'base:poliza:preventivo',
        'Mantenimiento preventivo',
        'En cada visita se realiza, según el sistema instalado:',
        [
          'Limpieza física de los equipos y verificación de su estado.',
          'Revisión de la alimentación eléctrica y de las conexiones.',
          'Verificación de la grabación, el almacenamiento y el acceso remoto en sistemas de videovigilancia.',
          'Revisión de la red, de los enlaces y respaldo de las configuraciones.',
        ],
      ),
      bloque(
        'base:poliza:atencion',
        'Atención de incidentes y tiempos de respuesta',
        'Los incidentes se reportan por los canales de soporte acordados y se atienden por orden de criticidad. Los tiempos de respuesta y de solución son los del nivel de servicio contratado y se establecen en la propuesta.',
        [
          'Registro de cada incidente con folio y seguimiento hasta su cierre.',
          'Atención remota en primera instancia; visita al sitio cuando el diagnóstico lo requiera.',
        ],
      ),
      bloqueDeEditor('SERVICIO', 'plantilla:exclusiones'),
      bloqueDeEditor('SERVICIO', 'plantilla:entrega'),
    ],
    note: nota({
      pago: 'El servicio se factura por periodo (mensual o trimestral, según se acuerde) y se paga por adelantado; el primer periodo se cubre al confirmar la contratación.',
      alcance: 'La póliza cubre el mantenimiento preventivo y correctivo de los equipos y sistemas listados en el presupuesto durante el periodo contratado.',
      noIncluye:
        'Refacciones o equipos nuevos no listados, fallas ocasionadas por variaciones eléctricas, manipulación de terceros o condiciones ambientales, obra civil y servicios de Internet del cliente. Los trabajos fuera de la póliza se cotizan por separado.',
      disponibilidad:
        'Las visitas programadas se acuerdan con el cliente y se realizan en horarios laborales; los tiempos de respuesta son los del nivel de servicio contratado.',
      otras: 'Los precios se expresan en pesos mexicanos (MXN) por periodo y el IVA se desglosa en el total de la propuesta.',
    }),
    depositPercent: 0,
    currency: 'MXN',
    opciones: opciones('SERVICIO', {
      objetivo: true,
      alcance: true,
      planos: false,
      marcaModelo: false,
      garantia: '90 días en la mano de obra de cada intervención.',
      tiempoEntrega: 'El servicio inicia al confirmar la contratación; las visitas se programan de común acuerdo con el cliente.',
    }),
    items: [
      partida({
        name: 'Póliza de mantenimiento preventivo y correctivo (por periodo)',
        grupo: 'MANO_DE_OBRA',
        unit: 'Periodo',
        description: 'Incluye las visitas de mantenimiento preventivo programadas, la atención de fallas y el reporte de cada intervención.',
      }),
      partida({ name: 'Visita adicional de mantenimiento correctivo (fuera de la póliza)', grupo: 'MANO_DE_OBRA', unit: 'Visita' }),
    ],
  },
};

// ─── 8. Proyecto integral (Formato V2) ───────────────────────────────────────────────────────────

const PROYECTO_INTEGRAL: PlantillaBase = {
  clave: 'proyecto-integral-v2',
  nombre: 'Proyecto integral (Formato V2)',
  segmento: 'OBRA',
  conPartidas: true,
  paraQue: 'Proyecto multi-sistema con el catálogo maestro completo (telecomunicaciones, energía, CCTV y cómputo, infraestructura). Se conservan solo los conceptos que aplican.',
  contenido: {
    segmento: 'OBRA',
    projectName: 'Proyecto integral de infraestructura tecnológica',
    scope: 'El alcance comprende el suministro, la instalación, la configuración y la puesta en marcha de los sistemas descritos a continuación, agrupados por familia.',
    objetivo: objetivo(
      'Este proyecto integra en una sola propuesta la infraestructura de telecomunicaciones, el respaldo de energía, los sistemas de videovigilancia y cómputo, y la infraestructura pasiva que los soporta, con un presupuesto detallado por concepto.',
      'Como resultado, el cliente recibe la solución completa instalada, configurada, probada y documentada, con un solo responsable de su ejecución.',
    ),
    alcanceBloques: [
      bloque(
        'base:integral:telecom',
        'Equipo de telecomunicaciones',
        'Suministro, instalación y configuración del equipo activo de red:',
        [
          'Router, switches de acceso y switch industrial.',
          'Puntos de acceso inalámbricos para oficinas, almacenes y áreas de producción.',
          'Módulos SFP y jumpers de fibra óptica.',
        ],
      ),
      bloque(
        'base:integral:energia',
        'Respaldo de energía',
        'Suministro e instalación de los equipos de respaldo de energía:',
        [
          'UPS de distintas capacidades, incluido el de gabinete IDF.',
          'Tarjetas de red para el monitoreo de los UPS.',
          'Unidades de distribución de energía (PDU).',
        ],
      ),
      bloque(
        'base:integral:cctv-computo',
        'CCTV, cómputo, pantallas y proyección',
        'Suministro, instalación y configuración de:',
        [
          'Grabadores de video, cámaras (bala, domo y fisheye) y almacenamiento.',
          'Licenciamiento del sistema de video.',
          'Computadoras de escritorio.',
          'Pantallas para salas de juntas, proyector y proyección inalámbrica.',
        ],
      ),
      bloque(
        'base:integral:infraestructura',
        'Infraestructura',
        'Suministro e instalación de la infraestructura pasiva y de soporte:',
        [
          'Canalización, charolas y escalerilla con etiquetado de voz y datos.',
          'Nodos de red categoría 6, cables de parcheo y fibra óptica.',
          'Paneles de parcheo, racks, gabinete IDF y organizadores de cable.',
          'Sistema de tierra física, alarma contra incendio y adecuaciones de piso falso, cuando apliquen.',
          'El metraje de canalización se determina durante la visita técnica al sitio.',
        ],
      ),
      bloqueDeEditor('OBRA', 'plantilla:exclusiones'),
      bloqueDeEditor('OBRA', 'plantilla:entrega'),
    ],
    note: nota({
      otras: `Solo forman parte de esta propuesta los conceptos que tienen cantidad y precio en el presupuesto. ${OTRAS_GENERAL}`,
    }),
    depositPercent: condicionesPorOmision('OBRA').anticipoPct,
    currency: 'MXN',
    opciones: opciones('OBRA', { objetivo: true, alcance: true, planos: true, marcaModelo: true, garantia: GARANTIA_INSTALACION }),
    items: CATALOGO_PARTIDAS_V2.map((c) =>
      partida({ name: c.equipo, grupo: c.grupo, unit: c.unidad, brand: c.marca, model: c.modelo, description: c.descripcion ?? null }),
    ),
  },
};

// ─── 9. Licitación / Gobierno ────────────────────────────────────────────────────────────────────

const LICITACION: PlantillaBase = {
  clave: 'licitacion-gobierno',
  nombre: 'Licitación / Gobierno',
  segmento: 'LICITACION',
  conPartidas: true,
  paraQue: 'Propuesta para un procedimiento de contratación: anexos técnico y económico, catálogo de conceptos y condiciones de las bases.',
  contenido: {
    segmento: 'LICITACION',
    projectName: 'Propuesta técnica y económica para procedimiento de contratación',
    scope: 'El alcance se ajusta al catálogo de conceptos y a los anexos solicitados en las bases del procedimiento.',
    objetivo: objetivo(
      'La presente propuesta responde a los requisitos técnicos y económicos del procedimiento de contratación, y detalla el alcance, los anexos y las condiciones con las que se atendería el suministro o el servicio.',
      'El alcance, las condiciones y los tiempos aquí descritos se ajustan a lo señalado en las bases del procedimiento.',
      [
        'Propuesta alineada al catálogo de conceptos y a las condiciones de las bases.',
        'Anexos técnico y económico integrados conforme a lo solicitado.',
        'Precios unitarios sin IVA y con el redondeo que fijan las bases.',
        'Plazos de entrega ajustados al calendario de las bases y del contrato.',
      ],
    ),
    alcanceBloques: [
      bloque(
        'base:licitacion:bases',
        'Conformidad con las bases',
        'Esta propuesta se elabora conforme a las bases del procedimiento, a sus anexos y, en su caso, a los acuerdos de las juntas de aclaraciones. Cualquier discrepancia se resuelve a favor de lo que establezcan las bases.',
      ),
      bloque(
        'base:licitacion:anexos',
        'Anexos técnicos y económicos',
        'Se integran a la propuesta los anexos solicitados en las bases:',
        [
          'Anexo técnico: descripción del bien o servicio y cumplimiento de cada especificación solicitada.',
          'Anexo económico: catálogo de conceptos con precios unitarios en pesos mexicanos (MXN), sin IVA y redondeados a un máximo de 2 decimales.',
          'Rangos de cantidad: cuando las bases lo pidan, el precio unitario se presenta por rango de cantidad mínima y máxima y por centro de entrega.',
          'Documentación legal, garantías y fianzas: las que exijan las bases.',
        ],
      ),
      bloque(
        'base:licitacion:calendario',
        'Calendario de entregables',
        'Los plazos de entrega, instalación y puesta en marcha se ajustan al calendario que fijen las bases y el contrato.',
      ),
      bloqueDeEditor('LICITACION', 'plantilla:exclusiones'),
      bloqueDeEditor('LICITACION', 'plantilla:entrega'),
    ],
    note: nota({
      otras:
        'Los precios unitarios se presentan en pesos mexicanos (MXN), sin IVA y redondeados a un máximo de 2 decimales, conforme a lo que soliciten las bases. Esta propuesta se rige por lo dispuesto en las bases del procedimiento y en el contrato que de ellas derive.',
    }),
    depositPercent: condicionesPorOmision('LICITACION').anticipoPct,
    currency: 'MXN',
    opciones: opciones('LICITACION', {
      objetivo: true,
      alcance: true,
      planos: true,
      marcaModelo: false,
      garantia: condicionesPorOmision('LICITACION').garantia,
      formaPago: '',
    }),
    items: [
      partida({ name: 'Suministro de bienes conforme al catálogo de conceptos de las bases', grupo: 'EQUIPOS', unit: 'Pieza' }),
      partida({
        name: 'Servicios de instalación y puesta en marcha conforme al catálogo de conceptos de las bases',
        grupo: 'MANO_DE_OBRA',
        unit: 'Servicio',
      }),
    ],
  },
};

/** Las plantillas base, en el orden en que se ofrecen. */
export const PLANTILLAS_BASE: readonly PlantillaBase[] = [
  SUMINISTRO,
  LICENCIAMIENTO,
  SEGURIDAD_PERIMETRAL,
  RED_ESTRUCTURADA,
  CCTV,
  CONTROL_ACCESO,
  POLIZA_SERVICIO,
  PROYECTO_INTEGRAL,
  LICITACION,
];

export function buscarPlantillaBase(claveONombre: unknown): PlantillaBase | null {
  const buscada = String(claveONombre ?? '').trim().toLowerCase();
  return PLANTILLAS_BASE.find((p) => p.clave === buscada || p.nombre.toLowerCase() === buscada) ?? null;
}
