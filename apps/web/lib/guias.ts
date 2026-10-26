/**
 * Guías permanentes del blog: criterio técnico que no caduca, escrito por el equipo. Conviven con las notas que se
 * publican desde Studio (`lib/public-news.ts`); si una nota de Studio usa el mismo slug, gana la nota.
 */

export type SeccionGuia = {
  titulo: string;
  parrafos: string[];
  puntos?: string[];
};

export type Guia = {
  slug: string;
  titulo: string;
  resumen: string;
  tema: string;
  /** Minutos de lectura aproximados. */
  lectura: number;
  /** Foto de public/fotos (nombre sin extensión). */
  foto: string;
  publicada: string;
  /** Solución a la que lleva el cierre de la guía. */
  solucion: { href: string; label: string };
  /** Demo interactiva al terminar de leer (hoy solo el simulador de cobertura de cámaras). */
  interactivo?: "cctv";
  secciones: SeccionGuia[];
};

export const GUIAS: Guia[] = [
  {
    slug: "como-elegir-videovigilancia-empresa",
    titulo: "Cómo elegir un sistema de videovigilancia para tu empresa",
    resumen:
      "Antes de hablar de marcas o megapíxeles: qué debe ver cada cámara, cuántos días guardar y quién tiene acceso. Cinco decisiones que definen si el sistema sirve el día del incidente.",
    tema: "Videovigilancia",
    lectura: 6,
    foto: "monitoreo-pantallas-cctv",
    publicada: "2026-10-26",
    solucion: { href: "/servicios#cctv", label: "Ver videovigilancia" },
    interactivo: "cctv",
    secciones: [
      {
        titulo: "Empieza por el riesgo, no por la cámara",
        parrafos: [
          "Un sistema de CCTV se diseña recorriendo el sitio con una pregunta por zona: ¿qué necesito poder demostrar aquí? En un acceso basta con reconocer a la persona; en una caja o un almacén hace falta ver manos y producto.",
          "Esa respuesta define la posición, la lente y la resolución de cada cámara. Comprar primero el equipo y luego buscarle lugar es la causa más común de grabaciones que no sirven.",
        ],
        puntos: [
          "Detección: saber que alguien pasó.",
          "Reconocimiento: distinguir si es alguien conocido.",
          "Identificación: poder mostrar su rostro o una placa como evidencia.",
        ],
      },
      {
        titulo: "Cuántos días de grabación necesitas",
        parrafos: [
          "La pregunta correcta es cuánto tarda tu empresa en enterarse de un incidente. Si una merma aparece en el inventario del fin de mes, siete días de grabación no alcanzan.",
          "Los días dependen del número de cámaras, la resolución, las imágenes por segundo y si se graba continuo o por movimiento. Con esos datos se calcula el disco del grabador (NVR) antes de comprarlo, no después.",
        ],
      },
      {
        titulo: "Acceso remoto sin abrir la puerta a otros",
        parrafos: [
          "Ver las cámaras desde el celular es cómodo, pero el grabador expuesto a internet con la contraseña de fábrica es una de las fallas de seguridad más frecuentes.",
        ],
        puntos: [
          "Contraseñas únicas por equipo y usuarios con permisos distintos.",
          "Firmware actualizado y acceso por la plataforma del fabricante o por VPN.",
          "Cámaras en una red separada del resto de la oficina.",
        ],
      },
      {
        titulo: "Lo que pasa después de instalar",
        parrafos: [
          "Una cámara sucia, desenfocada o con el disco lleno no avisa. El mantenimiento preventivo revisa imagen, grabación y respaldos, y deja constancia de que el sistema sigue funcionando.",
          "Pide que la entrega incluya el plano con la ubicación de cada cámara, las configuraciones y una prueba de recuperación de video: es lo que te permite exigir que funcione.",
        ],
      },
    ],
  },
  {
    slug: "wifi-empresarial-horas-pico",
    titulo: "Por qué el Wi‑Fi de tu empresa falla en horas pico",
    resumen:
      "Más potencia no es más red. La caída en horas pico casi siempre viene del diseño: cuántos dispositivos entran por punto de acceso, qué canales usan y si todo comparte la misma red.",
    tema: "Redes y Wi‑Fi",
    lectura: 5,
    foto: "campo-enlace-antena-ciudad",
    publicada: "2026-10-26",
    solucion: { href: "/servicios#redes", label: "Ver redes y Wi‑Fi" },
    secciones: [
      {
        titulo: "El problema casi nunca es la velocidad del internet",
        parrafos: [
          "Cuando la red falla solo a ciertas horas, el enlace de internet suele estar bien: lo que se satura son los puntos de acceso. Cada uno atiende a un número limitado de dispositivos con buena calidad, y en una sala llena o un piso de ventas ese límite se rebasa rápido.",
        ],
      },
      {
        titulo: "Diseñar por capacidad, no por cobertura",
        parrafos: [
          "Que la señal llegue a toda la oficina no significa que alcance para todos. Un buen diseño parte de cuántas personas y equipos habrá en cada zona y coloca más puntos de acceso, con menos potencia, donde se concentra la gente.",
          "Un estudio de sitio (site survey) mide paredes, interferencias y redes vecinas antes de instalar, para elegir ubicaciones y canales que no se pisen entre sí.",
        ],
      },
      {
        titulo: "Separar lo que no debe convivir",
        parrafos: ["Mezclar en la misma red a empleados, visitantes, cámaras y terminales de cobro hace que un problema en uno afecte a todos."],
        puntos: [
          "Red de invitados aislada de los equipos de la empresa.",
          "VLAN separadas para cámaras, telefonía y punto de venta.",
          "Switches administrables para ver y limitar el tráfico por red.",
        ],
      },
      {
        titulo: "El cableado también cuenta",
        parrafos: [
          "Cada punto de acceso necesita un cable bien instalado y probado. Un cableado certificado y etiquetado evita fallas intermitentes y hace que cualquier cambio futuro sea rápido, porque se sabe qué va a dónde.",
        ],
      },
    ],
  },
  {
    slug: "que-debe-incluir-memoria-tecnica",
    titulo: "Qué debe incluir la memoria técnica de una instalación",
    resumen:
      "La memoria técnica es lo que convierte una instalación en algo que se puede operar, mantener y auditar. Esto es lo mínimo que debería entregarte cualquier proveedor.",
    tema: "Entrega y documentación",
    lectura: 4,
    foto: "campo-instalacion-rack",
    publicada: "2026-10-26",
    solucion: { href: "/servicios#computo", label: "Ver infraestructura" },
    secciones: [
      {
        titulo: "Para qué sirve",
        parrafos: [
          "Sin documentación, cada falla empieza con alguien abriendo el rack para adivinar qué cable va a dónde. Con ella, cualquier técnico, propio o externo, entiende la instalación en minutos y la empresa no depende de una sola persona.",
        ],
      },
      {
        titulo: "Lo mínimo que debe traer",
        parrafos: ["Pídela por escrito en la cotización, como un entregable más del proyecto."],
        puntos: [
          "Planos con la ubicación de cámaras, puntos de red y puntos de acceso.",
          "Diagrama de la red: equipos, direcciones IP y redes separadas (VLAN).",
          "Etiquetado de cables y puertos que coincida con los planos.",
          "Configuraciones respaldadas de switches, grabadores y equipos de red.",
          "Resultados de pruebas: certificación del cableado y verificación de grabación.",
          "Evidencia fotográfica del antes y el después.",
          "Garantías, números de serie y contacto para soporte.",
        ],
      },
      {
        titulo: "Las contraseñas, en resguardo",
        parrafos: [
          "Las credenciales de administración se entregan a la persona responsable de la empresa, por un medio seguro y separado del documento. Así el control queda del lado del cliente aunque cambie de proveedor.",
        ],
      },
      {
        titulo: "Un documento vivo",
        parrafos: [
          "Cada cambio, mantenimiento o ampliación debe actualizar la memoria. Si el documento se queda en la versión del primer día, deja de ser confiable justo cuando más se necesita.",
        ],
      },
    ],
  },
  {
    slug: "soporte-ti-con-sla-que-pedir",
    titulo: "Soporte TI con SLA: qué pedir antes de firmar",
    resumen:
      "Un buen contrato de soporte no promete «atención inmediata»: define tiempos por prioridad, qué cubre, cómo se mide y qué reportes recibes cada mes.",
    tema: "Soporte TI",
    lectura: 5,
    foto: "tecnico-nexara-entrega-equipo-sitio",
    publicada: "2026-10-26",
    solucion: { href: "/servicios#soporte", label: "Ver soporte TI" },
    secciones: [
      {
        titulo: "Tiempos por prioridad, por escrito",
        parrafos: [
          "No todas las fallas pesan igual. Que la caja o el servidor no funcionen detiene la operación; una impresora lenta, no. El acuerdo de nivel de servicio (SLA) debe separar prioridades y decir para cada una cuánto tarda la primera respuesta y cuánto la solución o el plan de trabajo.",
        ],
        puntos: [
          "Crítica: la operación está detenida.",
          "Alta: un área trabaja con limitaciones.",
          "Normal: una persona o un equipo afectado.",
          "Programada: cambios, altas y mejoras.",
        ],
      },
      {
        titulo: "Remoto primero, en sitio cuando hace falta",
        parrafos: [
          "Buena parte de los incidentes se resuelve en minutos por acceso remoto. Pregunta cuándo procede la visita, en qué horario y si tiene costo adicional según la ciudad.",
        ],
      },
      {
        titulo: "Cada incidencia, registrada",
        parrafos: [
          "Una mesa de ayuda que registra cada reporte permite ver qué falla se repite y atacar la causa, no solo el síntoma. Sin historial, la misma falla vuelve cada mes y nadie lo nota.",
        ],
      },
      {
        titulo: "Qué reportes recibir",
        parrafos: ["Al cierre de cada mes deberías saber:"],
        puntos: [
          "Cuántos reportes hubo y de qué tipo.",
          "Si se cumplieron los tiempos comprometidos.",
          "Qué mantenimiento preventivo se hizo.",
          "Qué equipos conviene renovar y por qué.",
        ],
      },
    ],
  },
];

export const findGuia = (slug: string) => GUIAS.find((g) => g.slug === slug);
