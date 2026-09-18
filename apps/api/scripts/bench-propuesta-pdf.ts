/**
 * Banco de pruebas del PDF «Propuesta técnica».
 *
 * Mide lo que Adam reclama: cuánto pesa y cuánto tarda el documento que ve el cliente.
 * La muestra es la propuesta modelo (`Primera cotizacion .pdf`): el objetivo con sus ocho
 * beneficios, el alcance con su introducción y sus doce apartados, y 25 partidas. Se genera con y
 * sin plano anexo y se reportan bytes y milisegundos.
 *
 *   cd apps/api
 *   node -r ./scripts/ts-node-js-ext.js -r ts-node/register/transpile-only ./scripts/bench-propuesta-pdf.ts
 *
 * Opcional: `BENCH_OUT=C:\ruta\salida` escribe los PDFs para revisarlos a ojo.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { generarPropuestaTecnicaPdf, type PropuestaPayload } from '../src/cotizaciones/propuesta-tecnica-pdf';
import { agruparPartidas } from '../src/cotizaciones/partidas-grupos';
import { terminosDeCotizacion } from '../src/cotizaciones/terminos-segmento';

/** Las partidas de la hoja de cotización del modelo, con sus cantidades y precios. */
const CONCEPTOS: Array<[string, string, number, number]> = [
  ['[Audio Bidireccional + Dual Light + ColorVu] Bala TURBOHD 2 Megapixel (1080p) / Lente 3.6 mm / 40 mts IR EXIR + 40 mts Luz Blanca / Micrófono y Bocina Integrado / Exterior IP67 / Dwdr', 'Pieza', 8, 592.42],
  ['[Audio Bidireccional] DVR 32 Canales TurboHD + 8 Canales IP / 5 Megapixel Lite - 3K Lite / Acusense / Reconocimiento Facial / Audio por Coaxitron / 2 Bahías de Disco Duro / H.265+ / Salida de Video en Full HD', 'Pieza', 1, 7532.55],
  ['Instalación de cámara de seguridad puesta a punto bajo normas estándares', 'Servicio', 15, 1000],
  ['Reinstalación de cable y habilitación de cámara de seguridad bajo normas estándares', 'Servicio', 14, 500],
  ['Instalación de rack puesta a punto', 'Servicio', 1, 3000],
  ['Insumos materiales para puesta a punto de CCTV bajo normas estándares', 'Insumo', 1, 5000],
  ['Domo TURBOHD 2 Megapixel (1080p) / Lente 2.8 mm / 30 mts IR EXIR / TVI-AHD-CVI-CVBS / IK10 / IP67 / WDR 120 dB / Ultra Baja Iluminación / Metal', 'Pieza', 7, 606.91],
  ['Fuente de Poder Regulada 12 Vcc / 13.5 Vcc / 15 Vcc para 16 Cámaras / 16 Amp (1 Amp por Salida) / Voltaje de Entrada 90 - 130 VCA / Soporta 4K / Modo para Largas Distancias', 'Pieza', 2, 875.85],
  ['Kit de Transceptores (Baluns) con Terminal PUSH SUPERIOR, Resolución 4K, Cable flexible COAXIAL Blindado / COAXITRON / AUDIO POR COAXITRON / Menu OSD / Conector 100% COBRE / protección TVS, Calidad PREMIUM', 'Pieza', 29, 47],
  ['Caja de Conexiones de Metal / Compatible con DS-2CD20XX, B8-TURBOGXX, THC-B120-XX, THC-BXX, THC-TXX', 'Pieza', 8, 215.73],
  ['Caja de Conexiones de Exterior para Cámaras Tipo Mini Domo / IP66', 'Pieza', 7, 172.5],
  ['Caja Derivación-Conexión de Plástico (100 X 100 X 54 mm) con 7 Glándulas de Goma. Para Instalaciones Comerciales, Residenciales e Industriales. Incluye Tornillería para su Tapa.', 'Pieza', 14, 67.53],
  ['Adaptador Macho Tipo Jack de 3.5 mm (0.14 Pulgadas) Polarizado de 12 Vcc / Terminales Tipo Tornillo / Polarizado (+/-) / Ideal para Cámaras de Video Vigilancia', 'Pieza', 29, 6.07],
  ['Bobina de Cable de 305 Metros (1000 Pies) Cat5e, Aleación de Cobre y Aluminio (CCA), Color Gris, Uso Interior', 'Pieza', 3, 753.92],
  ['Bobina de Cable de 152 Metros (499 Pies), Cat5e, FTP, Blindado, para Intemperie, Color Negro, UL, para Aplicaciones en Video Vigilancia, Redes de Datos', 'Pieza', 2, 1554.53],
  ['Kit de 20 grapas, 20 taquetes y 20 tornillos para sujetar conductores redondos o tubo en muro (2102-07240)', 'Pieza', 10, 19.55],
  ['Gabinete para Montaje en Pared - Piso / Puerta de Cristal Templado / Cuerpo Fijo / 6 Unidades de Rack / 19" / Fabricado en Acero', 'Pieza', 1, 2046.61],
  ['Grapa reforzada para cable redondo de 7mm color negro (100pzs) (3103-00300)', 'Pieza', 5, 43.62],
  ['Taquete de 1/4 plástico paquete de 100 piezas para fijar objetos con tornillo en muros y techos de concreto o superficies sólidas, compatible con tornillo TH10X de 10 x 1 1/2" (1103-03100)', 'Pieza', 2, 22.01],
  ['Multicontacto Horizontal (PDU) de 10 Contactos (NEMA 5-15R) Rack 19" 1UR. Voltaje Entrada/Salida: 120Vca/15A', 'Pieza', 1, 884.8],
  ['Tornillo para taquete TP2X 10 mm x 1 1/2', 'Pieza', 200, 0.7],
  ['Disco duro de 12 teras', 'Pieza', 1, 10594.51],
  ['Montaje para Poste / Compatible con PTZ HIKVISION / Acero Inoxidable', 'Pieza', 2, 517.1],
  ['Poste Seccionado de 3 Metros / Especializado para la Instalación de Videovigilancia', 'Pieza', 1, 2661.58],
  ['Configuración de analíticos de video y puesta en marcha con Hik-Connect', 'Servicio', 1, 4500],
];

function partidasDePrueba() {
  return CONCEPTOS.map(([name, unit, qty, unitPrice]) => ({
    name,
    description: null,
    unit,
    qty,
    unitPrice,
    lineTotal: Math.round(qty * unitPrice * 100) / 100,
  }));
}

/** Objetivo del modelo, tal cual. */
const OBJETIVO = {
  intro:
    'Este proyecto permitirá contar con un sistema de videovigilancia más confiable, moderno y preparado para las necesidades actuales y futuras de la operación.',
  beneficios: [
    'Mayor cobertura de vigilancia mediante la incorporación de 15 nuevas cámaras y la reubicación estratégica de equipos existentes para eliminar puntos ciegos.',
    'Recuperación y modernización del sistema actual, corrigiendo fallas en cámaras, cableado y alimentación eléctrica para mejorar la estabilidad y disponibilidad del servicio.',
    'Plataforma preparada para crecer, gracias a un nuevo sistema de grabación con capacidad suficiente para futuras ampliaciones sin necesidad de reemplazar el equipo principal.',
    'Mejor desempeño y confiabilidad, mediante la renovación de componentes críticos y la optimización de la infraestructura existente.',
    'Mayor capacidad de almacenamiento, con una retención aproximada de 30 días de grabaciones, facilitando la consulta de eventos cuando sea necesario.',
    'Monitoreo remoto, permitiendo acceder al sistema desde dispositivos autorizados a través de la plataforma Hik-Connect.',
    'Funciones inteligentes de videovigilancia, incorporando analíticos de detección por cruce de línea en zonas estratégicas para fortalecer la seguridad perimetral.',
    'Entrega de un sistema completamente probado y operativo, verificando el correcto funcionamiento de todos los equipos antes de su puesta en servicio.',
  ],
  cierre:
    'Como resultado, el cliente dispondrá de una solución de videovigilancia con mayor cobertura, mejor desempeño, acceso remoto y capacidad de crecimiento, reduciendo riesgos operativos y aumentando la eficiencia en las labores de supervisión y seguridad.',
};

/** Alcance del modelo: introducción (bloque sin título) y los doce apartados. */
const ALCANCE: PropuestaPayload['alcance'] = [
  {
    titulo: '',
    texto:
      'El presente proyecto tiene como objetivo la renovación, mantenimiento correctivo y ampliación del sistema de circuito cerrado de televisión (CCTV) existente, con el propósito de mejorar la confiabilidad del sistema, incrementar la cobertura de videovigilancia y proporcionar una plataforma escalable que permita futuras ampliaciones sin requerir el reemplazo del equipo principal de grabación.',
  },
  {
    titulo: 'Modernización del sistema de grabación',
    texto:
      'Se realizará la reubicación del área de monitoreo al sitio definido por el cliente, incluyendo el desmontaje del equipo existente y la instalación de un nuevo grabador Hikvision con capacidad para 32 canales analógicos y 8 canales IP.\nLa capacidad del nuevo equipo permitirá integrar la totalidad de las cámaras existentes, las nuevas cámaras consideradas en el proyecto y disponer de canales disponibles para futuras ampliaciones, evitando inversiones adicionales en un nuevo equipo de grabación.',
  },
  {
    titulo: 'Mantenimiento de la infraestructura existente',
    texto: 'Como parte del mantenimiento integral del sistema se realizarán las siguientes actividades:',
    vinetas: [
      'Recableado de las 14 cámaras analógicas existentes.',
      'Sustitución de balunes de video.',
      'Reemplazo de conectores de video y alimentación.',
      'Revisión y adecuación del sistema de alimentación eléctrica de las cámaras.',
      'Retiro de la fuente de alimentación existente, debido a que no cumple con las características técnicas requeridas para una operación confiable.',
      'Suministro e instalación de dos fuentes de alimentación reguladas, cada una con capacidad para alimentar hasta 16 cámaras, garantizando una distribución adecuada de energía y una mayor estabilidad del sistema.',
    ],
  },
  {
    titulo: 'Diagnóstico y recuperación de cámaras existentes',
    texto:
      'Actualmente el sistema cuenta con 14 cámaras analógicas instaladas, de las cuales únicamente 8 presentan visualización.\nComo parte del alcance se realizará un diagnóstico completo de las cámaras que no presentan imagen, verificando:',
    vinetas: ['Estado físico del equipo.', 'Alimentación eléctrica.', 'Cableado.', 'Transmisión de video.'],
  },
  {
    titulo: 'Reubicación de cámaras existentes',
    texto:
      'Se contempla la reubicación de cuatro cámaras existentes con la finalidad de optimizar la cobertura del sistema y atender los puntos definidos durante el levantamiento técnico realizado en sitio.',
  },
  {
    titulo: 'Ampliación del sistema de videovigilancia',
    texto: 'Se suministrarán e instalarán un total de 15 cámaras nuevas, distribuidas de la siguiente manera:',
    vinetas: ['8 cámaras tipo bala.', '7 cámaras tipo domo.'],
  },
  {
    titulo: 'Instalación de poste para vigilancia',
    texto:
      'Como parte del proyecto se contempla el suministro e instalación de un poste metálico de 3 metros de altura, destinado a soportar las dos cámaras correspondientes al área del patio de maniobras.\nEl poste será instalado mediante anclaje sobre una base de concreto existente.\nEste alcance no contempla trabajos de obra civil para la construcción de la cimentación o base de concreto.',
  },
  {
    titulo: 'Configuración de analíticos de video',
    texto: 'Se realizará la configuración del analítico inteligente de Cruce de Línea en las siguientes zonas:',
    vinetas: ['Fachada principal.', 'Patio de maniobras.'],
  },
  {
    titulo: 'Integración y puesta en marcha',
    texto: 'Al concluir la instalación se realizarán las siguientes actividades:',
    vinetas: [
      'Configuración del grabador.',
      'Integración de todas las cámaras existentes y nuevas.',
      'Configuración de grabación.',
      'Verificación del funcionamiento de cada dispositivo.',
      'Pruebas generales de operación.',
      'Integración del sistema a la plataforma de monitoreo remoto del cliente mediante Hik-Connect.',
    ],
  },
  {
    titulo: 'Parámetros de almacenamiento',
    texto:
      'El sistema será configurado para proporcionar un tiempo de retención de grabaciones de aproximadamente 30 días, considerando la capacidad de almacenamiento instalada y los parámetros de configuración definidos durante la puesta en marcha.\nEl tiempo de almacenamiento podrá variar en función de factores como:',
    vinetas: [
      'Resolución de grabación.',
      'Cantidad de cámaras en operación.',
      'Velocidad de cuadros por segundo (FPS).',
      'Tipo de compresión utilizada.',
      'Grabación continua o por eventos.',
      'Cambios posteriores en la configuración del sistema.',
    ],
  },
  {
    titulo: 'Consideraciones de operación',
    texto:
      'La correcta visualización remota de las cámaras mediante la plataforma Hik-Connect dependerá directamente de la disponibilidad, estabilidad y ancho de banda del servicio de Internet proporcionado por el cliente.\nEl proveedor dejará configurado y en operación el acceso remoto; sin embargo, no será responsable por fallas derivadas de:',
    vinetas: [
      'Interrupciones del servicio de Internet.',
      'Bajo ancho de banda de subida (Upload).',
      'Restricciones impuestas por el proveedor de servicios de Internet (ISP).',
      'Cambios en la infraestructura de red del cliente.',
      'Fallas en equipos de comunicación ajenos al alcance del presente proyecto.',
    ],
  },
  {
    titulo: 'Exclusiones del proyecto',
    texto: 'El presente alcance no considera, salvo indicación expresa en el presupuesto:',
    vinetas: [
      'Trabajos de obra civil.',
      'Construcción de bases de concreto para el poste.',
      'Canalizaciones adicionales no identificadas durante el levantamiento técnico.',
      'Adecuaciones eléctricas distintas a las descritas en este documento.',
      'Reparación o sustitución de equipos no contemplados en la presente propuesta.',
      'Ampliaciones posteriores al sistema.',
      'Servicios de Internet o incremento del ancho de banda contratado por el cliente.',
      'Configuración de dispositivos móviles adicionales distintos a los definidos por el cliente durante la entrega del proyecto.',
    ],
  },
  {
    titulo: 'Entrega del sistema',
    texto:
      'El proyecto se considerará concluido una vez realizadas las pruebas funcionales y verificado el correcto funcionamiento de:',
    vinetas: [
      'Todas las cámaras existentes y de nueva instalación.',
      'El sistema de grabación.',
      'Las fuentes de alimentación.',
      'Los analíticos de video configurados.',
      'El acceso local al sistema.',
      'La integración remota mediante la plataforma Hik-Connect, siempre que las condiciones de conectividad proporcionadas por el cliente lo permitan.',
    ],
  },
];

function payload(planos: PropuestaPayload['planos']): PropuestaPayload {
  const partidas = partidasDePrueba();
  const subtotal = Math.round(partidas.reduce((acc, p) => acc + p.lineTotal, 0) * 100) / 100;
  const iva = Math.round(subtotal * 0.16 * 100) / 100;

  return {
    folio: 'NEX-LJ75100126-0007-JA.CE',
    revision: 1,
    issueDate: '2026-09-17',
    validUntil: '2026-10-02',
    segmentoEtiqueta: 'Comercial',
    cliente: {
      nombre: 'Ing. Carlos Mendoza',
      empresa: 'Grupo Industrial del Norte S.A. de C.V.',
      telefono: '(222) 123 4567',
      correo: 'compras@ginorte.mx',
      direccion: 'Av. Constitución 1200, Col. Centro, Puebla, Pue.',
    },
    proyecto: 'Renovación, mantenimiento y ampliación del sistema de CCTV',
    objetivo: OBJETIVO,
    alcance: ALCANCE,
    planos,
    grupos: agruparPartidas(partidas).map((g) => ({
      grupo: g.grupo,
      etiqueta: g.etiqueta,
      subtotal: g.subtotal,
      partidas: g.partidas.map((p) => ({
        name: p.name,
        description: p.description ?? null,
        unit: p.unit ?? null,
        qty: Number(p.qty),
        unitPrice: Number(p.unitPrice),
        lineTotal: Number(p.lineTotal ?? 0),
      })),
    })),
    subtotal,
    iva,
    total: Math.round((subtotal + iva) * 100) / 100,
    currency: 'MXN',
    terminos: terminosDeCotizacion({ segmento: 'COMERCIAL', incluyeInstalacion: true, anticipoPct: 50, vigenciaDias: 15 }),
    participantes: [{ nombre: 'Luis Joel Aguilar', rolEtiqueta: 'Elaboró', siglas: 'LJ' }],
    empresa: null,
  };
}

/** Copia un PNG grande a `UPLOADS_ROOT` para medir el costo real de un plano anexo. */
function prepararPlano(): { url: string; bytes: number } | null {
  const origen = [
    path.resolve(process.cwd(), '../web/public/mapa-operaciones.png'),
    path.resolve(process.cwd(), '../../apps/web/public/mapa-operaciones.png'),
  ].find((p) => fs.existsSync(p));
  if (!origen) return null;

  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'nexara-bench-'));
  process.env['UPLOADS_ROOT'] = raiz;
  const destino = path.join(raiz, 'plano-demo.png');
  fs.copyFileSync(origen, destino);
  return { url: '/uploads/plano-demo.png', bytes: fs.statSync(destino).size };
}

async function medir(nombre: string, datos: PropuestaPayload, vueltas = 5) {
  // Vuelta en frío aparte: la primera paga la lectura del logo desde disco.
  const frio = process.hrtime.bigint();
  const primero = await generarPropuestaTecnicaPdf(datos);
  const msFrio = Number(process.hrtime.bigint() - frio) / 1e6;

  const tiempos: number[] = [];
  let pdf = primero;
  for (let i = 0; i < vueltas; i += 1) {
    const t0 = process.hrtime.bigint();
    pdf = await generarPropuestaTecnicaPdf(datos);
    tiempos.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  tiempos.sort((a, b) => a - b);
  const mediana = tiempos[Math.floor(tiempos.length / 2)]!;

  const salida = process.env['BENCH_OUT'];
  if (salida) {
    fs.mkdirSync(salida, { recursive: true });
    fs.writeFileSync(path.join(salida, `${nombre.replace(/\W+/g, '-')}.pdf`), pdf);
  }

  console.log(
    `${nombre.padEnd(34)} ${String(pdf.length).padStart(9)} bytes  ` +
      `${(pdf.length / 1024).toFixed(1).padStart(8)} KB  ` +
      `frío ${msFrio.toFixed(1).padStart(7)} ms  mediana ${mediana.toFixed(1).padStart(7)} ms`,
  );
  return { bytes: pdf.length, msFrio, mediana };
}

async function main() {
  const plano = prepararPlano();
  console.log(`Propuesta de ${CONCEPTOS.length} partidas — node ${process.version}`);
  if (plano) console.log(`Plano anexo de prueba: ${(plano.bytes / 1024).toFixed(0)} KB en disco`);
  console.log('');

  await medir('25 partidas, sin planos', payload([]));
  if (plano) {
    await medir('25 partidas + plano grande', payload([{ url: plano.url, nombre: 'Plano CCTV-01', tipo: 'imagen' }]));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
