import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const news = [
    {
      slug: 'nexara-cloud-transformacion-empresarial-2026',
      title: 'Cómo la nube híbrida está redefiniendo la operación empresarial en 2026',
      summary:
        'Las organizaciones que adoptaron arquitecturas de nube híbrida reportan hasta un 40% de reducción en costos operativos y tiempos de respuesta tres veces más rápidos. Exploramos los patrones que están marcando diferencia.',
      content: `La transformación hacia infraestructuras de nube híbrida dejó de ser una tendencia para convertirse en un estándar operativo para empresas de todos los tamaños. En Nexara, hemos acompañado a más de 30 organizaciones en este proceso durante el último año, y los resultados son contundentes.

El patrón más efectivo que hemos identificado no es tecnológico: es estratégico. Las empresas que logran el mayor retorno son aquellas que comienzan con un diagnóstico exhaustivo de su inventario de aplicaciones, clasificando cargas según criticidad, latencia requerida y costo de migración.

Una aseguradora regional con la que trabajamos redujo su tiempo de lanzamiento de nuevos productos de seis meses a seis semanas, simplemente reubicando las capas de presentación en la nube pública mientras mantenía el core transaccional en infraestructura propia con conectividad garantizada.

La seguridad sigue siendo la principal objeción. Sin embargo, con controles de Zero Trust bien implementados y una gestión de identidades centralizada, los entornos híbridos pueden ser significativamente más seguros que los datacenters tradicionales mal gestionados.

El siguiente paso para las organizaciones que ya están en la nube es la madurez operativa: observabilidad unificada, automatización de remediación y FinOps para controlar el gasto. Ahí es donde se consolida el valor a largo plazo.`,
      coverImageUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1600&q=80',
      galleryUrls: [
        'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1400&q=80',
        'https://images.unsplash.com/photo-1551281044-8b0c2f8f7f8e?auto=format&fit=crop&w=1400&q=80',
        'https://images.unsplash.com/photo-1526378722484-bd91ca387e72?auto=format&fit=crop&w=1400&q=80',
      ],
      status: 'PUBLISHED' as const,
      tags: ['Nube híbrida', 'Transformación digital', 'FinOps', 'Infraestructura'],
      publishedAt: new Date('2026-03-05T09:00:00Z'),
    },
    {
      slug: 'ciberseguridad-pymes-guia-practica',
      title: 'Ciberseguridad para PYMEs: proteger lo esencial sin presupuesto de gran empresa',
      summary:
        'El 60% de las pequeñas y medianas empresas que sufren un ciberataque significativo cierran en los siguientes 6 meses. Esta guía práctica resume los controles de mayor impacto con inversión accesible.',
      content: `La ciberseguridad no es solo un problema de las grandes corporaciones. De hecho, las PYMEs son el objetivo preferido de los atacantes precisamente porque cuentan con menor protección y aun así gestionan datos valiosos de clientes, proveedores y operaciones financieras.

El primer error más común es confundir el antivirus con una estrategia de seguridad. Un buen antivirus es necesario pero insuficiente. La mayoría de los ataques exitosos contra empresas medianas no explotan vulnerabilidades técnicas sofisticadas, sino comportamientos humanos predecibles: contraseñas débiles, clics en phishing y accesos sin revisar.

Los tres controles que más reducen el riesgo con menor inversión son: la autenticación multifactor en todos los accesos críticos, la segmentación mínima de red para aislar sistemas de gestión, y los respaldos automáticos verificados con pruebas de restauración periódicas.

En Nexara hemos desarrollado un modelo de seguridad escalonado para empresas de 20 a 200 usuarios que cubre estos tres pilares en un plazo de 8 semanas, con seguimiento continuo de alertas y reportes ejecutivos mensuales.

El concepto más importante que transmitimos a nuestros clientes es simple: no se trata de ser invulnerables, se trata de ser suficientemente difíciles de atacar para que los actores maliciosos prefieran un objetivo más fácil.`,
      coverImageUrl: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1600&q=80',
      galleryUrls: [
        'https://images.unsplash.com/photo-1563013544-824ae1b704d3?auto=format&fit=crop&w=1400&q=80',
        'https://images.unsplash.com/photo-1614064641938-3bbee52942c7?auto=format&fit=crop&w=1400&q=80',
        'https://images.unsplash.com/photo-1510511459019-5dda7724fd87?auto=format&fit=crop&w=1400&q=80',
      ],
      status: 'PUBLISHED' as const,
      tags: ['Ciberseguridad', 'PYMEs', 'Zero Trust', 'Buenas prácticas'],
      publishedAt: new Date('2026-02-20T10:30:00Z'),
    },
    {
      slug: 'wifi-6e-redes-empresariales-nueva-era',
      title: 'WiFi 6E en entornos empresariales: conectividad que acompaña la operación real',
      summary:
        'La banda de 6 GHz cambia las reglas del juego para redes de alta densidad. Analizamos casos de implementación en retail, manufactura y oficinas corporativas donde WiFi 6E eliminó cuellos de botella críticos.',
      content: `Durante años, la conectividad inalámbrica fue el eslabón débil de las redes empresariales. Caídas en horario pico, interferencias en pisos de manufactura y cobertura inconsistente en oficinas de planta abierta eran problemas aceptados como normales. WiFi 6E cambia esa ecuación.

La incorporación de la banda de 6 GHz agrega hasta 1.2 GHz de espectro libre de interferencias, lo que se traduce en canales más anchos y menor congestión. En un despliegue que realizamos para una cadena de tiendas con 120 puntos de venta, la latencia promedio en cajas autónomas bajó de 38 ms a 4 ms, eliminando por completo los falsos rechazos de transacciones.

La planificación es la clave. WiFi 6E no resuelve problemas de diseño de red deficiente: los amplifica si no se realiza un site survey correcto, especialmente en entornos con obstáculos físicos complejos o alta densidad de dispositivos IoT.

Las empresas manufactureras encuentran en WiFi 6E una solución más robusta para AGVs (vehículos de guiado automático) y sistemas de control de calidad en tiempo real, donde la conectividad es tan crítica como cualquier maquinaria de producción.

La recomendación práctica: no migrar toda la red de golpe. Identificar las zonas de mayor criticidad operativa, desplegar ahí en paralelo con la infraestructura existente y medir resultados antes de extender. El ROI se hace evidente en las primeras semanas.`,
      coverImageUrl: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=1600&q=80',
      galleryUrls: [
        'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1400&q=80',
        'https://images.unsplash.com/photo-1561154464-82e9adf32764?auto=format&fit=crop&w=1400&q=80',
        'https://images.unsplash.com/photo-1563770660941-20978e870e26?auto=format&fit=crop&w=1400&q=80',
      ],
      status: 'PUBLISHED' as const,
      tags: ['WiFi 6E', 'Redes empresariales', 'Retail tech', 'Conectividad'],
      publishedAt: new Date('2026-02-10T08:00:00Z'),
    },
    {
      slug: 'ia-operaciones-ti-automatizacion-inteligente',
      title: 'IA aplicada a operaciones TI: del monitoreo reactivo a la remediación autónoma',
      summary:
        'Los equipos de operaciones que integran IA en sus flujos de trabajo reducen hasta un 70% el tiempo medio de resolución de incidentes. Exploramos los casos de uso más maduros y cómo implementarlos sin reemplazar al equipo humano.',
      content: `La inteligencia artificial llegó a las operaciones TI no para reemplazar a los ingenieros, sino para liberarlos de las tareas más repetitivas y darles visibilidad que antes era imposible con equipos humanos solos.

El caso de uso más maduro y de mayor impacto inmediato es la detección de anomalías basada en series temporales. Los sistemas de monitoreo tradicionales trabajan con umbrales estáticos que generan miles de alertas irrelevantes. Los modelos de ML aprenden el comportamiento normal de cada sistema y alertan solo cuando algo genuinamente inusual ocurre, reduciendo el ruido hasta en un 80%.

Un paso más allá es la correlación automática de incidentes. Cuando un problema afecta múltiples componentes, la IA puede identificar el evento raíz en segundos en lugar de minutos u horas, acelerando dramáticamente el tiempo de respuesta.

La remediación autónoma es el siguiente nivel: scripts de corrección que se ejecutan automáticamente ante incidentes conocidos, con aprobación humana para los casos de mayor impacto. En uno de nuestros clientes del sector financiero, el 42% de los incidentes de nivel 1 se resuelven ahora sin intervención manual.

La barrera de entrada es más baja de lo que parece. Las plataformas de observabilidad modernas (Datadog, Dynatrace, New Relic) incluyen capacidades de IA accesibles sin necesidad de construir modelos desde cero. El valor está en la estrategia de integración y en definir correctamente qué decisiones puede tomar el sistema autónomamente y cuáles requieren validación humana.`,
      coverImageUrl: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=1600&q=80',
      galleryUrls: [
        'https://images.unsplash.com/photo-1518773553398-650c184e0bb3?auto=format&fit=crop&w=1400&q=80',
        'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1400&q=80',
        'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1400&q=80',
      ],
      status: 'PUBLISHED' as const,
      tags: ['Inteligencia Artificial', 'AIOps', 'Automatización', 'Observabilidad'],
      publishedAt: new Date('2026-01-28T11:00:00Z'),
    },
  ];

  for (const post of news) {
    await prisma.newsPost.upsert({
      where: { slug: post.slug },
      update: {
        title: post.title,
        summary: post.summary,
        content: post.content,
        coverImageUrl: post.coverImageUrl,
        galleryUrls: post.galleryUrls,
        status: post.status,
        tags: post.tags,
        publishedAt: post.publishedAt,
      },
      create: post,
    });
    console.log(`✅ Noticia: ${post.title}`);
  }

  console.log('\n🎉 Seed de noticias completado (4 registros PUBLISHED).');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
