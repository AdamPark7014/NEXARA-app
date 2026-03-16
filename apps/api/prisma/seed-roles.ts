import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const roles = [
    // SUPERADMIN: acceso total, único, no combinable
    {
      nombre: 'Superadmin',
      nivelAutoridad: 100,
      superadmin: true,
      accesoConsole: true,
      accesoConsoleAdmin: true,
      accesoGestionUsuarios: true,
      accesoGestionWeb: true,
      accesoPanelVentas: true,
      accesoContabilidad: true,
      accesoCotizaciones: true,
      accesoGestionCvs: true,
      accesoInventario: true,
      accesoCompras: true,
      accesoManufactura: true,
      accesoCalidad: true,
      accesoMantenimiento: true,
      accesoSeguridad: true,
      accesoDocumentos: true,
      accesoWorkflow: true,
      accesoAuditoria: true,
      accesoBI: true,
      accesoBanca: true,
      accesoMultas: true,
      accesoClientes: true,
      accesoLunchBreaks: true,
    },
    // ADMINISTRADOR: solo gestión, puede tener cotizaciones o cvs
    {
      nombre: 'Administrador',
      nivelAutoridad: 80,
      admin: true,
      accesoConsole: true,
      accesoConsoleAdmin: true,
      accesoGestionUsuarios: true,
      accesoCotizaciones: true,
      accesoGestionCvs: false,
    },
    {
      nombre: 'Administrador + Cotizaciones + CVS',
      nivelAutoridad: 81,
      admin: true,
      accesoConsole: true,
      accesoConsoleAdmin: true,
      accesoGestionUsuarios: true,
      accesoCotizaciones: true,
      accesoGestionCvs: true,
    },
    // INGENIERO: solo vistas personales, puede tener vendedor, cotizaciones o cvs
    {
      nombre: 'Ingeniero',
      nivelAutoridad: 60,
      ingeniero: true,
      accesoConsole: true,
      accesoCotizaciones: false,
      accesoGestionCvs: false,
      vendedor: false,
    },
    {
      nombre: 'Ingeniero + Cotizaciones',
      nivelAutoridad: 61,
      ingeniero: true,
      accesoConsole: true,
      accesoCotizaciones: true,
      accesoGestionCvs: false,
      vendedor: false,
    },
    {
      nombre: 'Ingeniero + CVS',
      nivelAutoridad: 62,
      ingeniero: true,
      accesoConsole: true,
      accesoCotizaciones: false,
      accesoGestionCvs: true,
      vendedor: false,
    },
    {
      nombre: 'Ingeniero + Vendedor',
      nivelAutoridad: 63,
      ingeniero: true,
      accesoConsole: true,
      accesoCotizaciones: false,
      accesoGestionCvs: false,
      vendedor: true,
    },
    // VENDEDOR: solo ventas, puede tener cotizaciones o cvs
    {
      nombre: 'Vendedor',
      nivelAutoridad: 40,
      vendedor: true,
      accesoPanelVentas: true,
      accesoCotizaciones: false,
      accesoGestionCvs: false,
    },
    {
      nombre: 'Vendedor + Cotizaciones',
      nivelAutoridad: 41,
      vendedor: true,
      accesoPanelVentas: true,
      accesoCotizaciones: true,
      accesoGestionCvs: false,
    },
    {
      nombre: 'Vendedor + CVS',
      nivelAutoridad: 42,
      vendedor: true,
      accesoPanelVentas: true,
      accesoCotizaciones: false,
      accesoGestionCvs: true,
    },
  ];
  for (const role of roles) {
    const { nombre, ...rest } = role;
    await prisma.role.upsert({
      where: { nombre },
      update: rest,
      create: role,
    });
  }
  console.log(`${roles.length} roles ERP upserted.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
