import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const projects = [
    {
      slug: 'retail-wifi6',
      title: 'Refresh de red y WiFi 6 para 120 tiendas retail',
      sector: 'Retail omnicanal',
      summary:
        'Modernizamos la conectividad de una cadena nacional, habilitando experiencias sin friccion en piso de venta y cajas autonomas.',
      impact: '99.95% de disponibilidad y 35% menos tickets de red',
      services: ['Diseno LAN/WAN', 'SD-WAN', 'Soporte NOC'],
      tags: ['WiFi 6', 'SD-WAN', 'Zero Trust', 'Observabilidad'],
      highlights: [
        'Cobertura WiFi 6 optimizada para inventarios en tiempo real',
        'Backbone SD-WAN con priorizacion de apps criticas',
        'Visibilidad unificada con alertamiento proactivo 24/7',
        'Plan de cambio nocturno sin afectar operacion',
      ],
      mainImage: '/soluciones/rect-a.jpg',
      gallery: [
        '/servicios/rect-1.jpg',
        '/servicios/rect-2.jpg',
        '/servicios/square-1.jpg',
        '/servicios/square-2.jpg',
        '/soluciones/rect-a.jpg',
        '/soluciones/rect-b.jpg',
        '/soluciones/square-a.jpg',
        '/soluciones/square-b.jpg',
      ],
    },
    {
      slug: 'nube-hibrida',
      title: 'Migracion a nube hibrida para aseguradora',
      sector: 'Servicios financieros',
      summary:
        'Extendimos el datacenter a la nube con landing zones seguras y automatizadas, acelerando el time-to-market de nuevos productos.',
      impact: 'Lanzamientos 3x mas rapidos y 28% menos costo operativo',
      services: ['Cloud landing zone', 'Infra as Code', 'Monitoreo'],
      tags: ['Azure', 'Kubernetes', 'GitOps', 'FinOps'],
      highlights: [
        'Plantillas IaC repetibles con controles de seguridad',
        'Plataforma de microservicios con CI/CD y observabilidad',
        'Canal seguro sitio-nube con alta disponibilidad',
        'Gobernanza de costos y alertas preventivas',
      ],
      mainImage: '/soluciones/rect-b.jpg',
      gallery: [
        '/servicios/square-1.jpg',
        '/servicios/square-2.jpg',
        '/soluciones/rect-a.jpg',
        '/soluciones/rect-b.jpg',
        '/soluciones/square-a.jpg',
        '/soluciones/square-b.jpg',
        '/servicios/rect-1.jpg',
        '/servicios/rect-2.jpg',
      ],
    },
    {
      slug: 'datacenter-modular',
      title: 'Centro de datos modular para fintech',
      sector: 'Fintech & pagos',
      summary:
        'Disenamos e implementamos un core de mision critica con redundancia completa y monitoreo continuo orientado a SLA.',
      impact: 'SLA 99.98% y soporte con respuesta <4h',
      services: ['Computo y energia', 'Virtualizacion', 'Soporte 24/7'],
      tags: ['VMware', 'DRP', 'Alta disponibilidad', 'SLA'],
      highlights: [
        'Arquitectura modular con crecimiento por demanda',
        'Segmentacion y hardening para zonas de pago',
        'Plan de recuperacion probado con simulacros trimestrales',
        'Mesa de ayuda con metricas y reportes ejecutivos',
      ],
      mainImage: '/servicios/rect-1.jpg',
      gallery: [
        '/soluciones/rect-b.jpg',
        '/soluciones/rect-a.jpg',
        '/soluciones/square-a.jpg',
        '/soluciones/square-b.jpg',
        '/servicios/rect-1.jpg',
        '/servicios/rect-2.jpg',
        '/servicios/square-1.jpg',
        '/servicios/square-2.jpg',
      ],
    },
  ];

  for (const project of projects) {
    await prisma.project.upsert({
      where: { slug: project.slug },
      update: {
        title: project.title,
        sector: project.sector,
        summary: project.summary,
        impact: project.impact,
        services: project.services,
        tags: project.tags,
        highlights: project.highlights,
        mainImage: project.mainImage,
        gallery: project.gallery,
      },
      create: project,
    });
  }

  console.log('Seed de proyectos aplicado (3 registros).');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
