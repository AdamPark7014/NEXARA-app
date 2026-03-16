import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const roles = [
    { nombre: 'PanelWeb', nivelAutoridad: 20 },
    { nombre: 'PanelTienda', nivelAutoridad: 30 },
    { nombre: 'PanelInterno', nivelAutoridad: 40 },
    // ERP Industrial roles
    {
      nombre: 'OperadorConsola',
      nivelAutoridad: 50,
      accesoConsole: true,
    },
    {
      nombre: 'AdminConsola',
      nivelAutoridad: 80,
      accesoConsole: true,
      accesoConsoleAdmin: true,
      accesoGestionUsuarios: true,
    },
    {
      nombre: 'GerenteOperaciones',
      nivelAutoridad: 70,
      accesoConsole: true,
      accesoInventario: true,
      accesoCompras: true,
      accesoManufactura: true,
      accesoCalidad: true,
      accesoMantenimiento: true,
    },
    {
      nombre: 'GerenteFinanzas',
      nivelAutoridad: 70,
      accesoConsole: true,
      accesoContabilidad: true,
      accesoBanca: true,
      accesoBI: true,
    },
    {
      nombre: 'Almacenista',
      nivelAutoridad: 40,
      accesoConsole: true,
      accesoInventario: true,
    },
    {
      nombre: 'Comprador',
      nivelAutoridad: 45,
      accesoConsole: true,
      accesoCompras: true,
      accesoInventario: true,
    },
    {
      nombre: 'JefeProduccion',
      nivelAutoridad: 60,
      accesoConsole: true,
      accesoManufactura: true,
      accesoCalidad: true,
    },
    {
      nombre: 'TecnicoMantenimiento',
      nivelAutoridad: 45,
      accesoConsole: true,
      accesoMantenimiento: true,
    },
    {
      nombre: 'InspectorCalidad',
      nivelAutoridad: 50,
      accesoConsole: true,
      accesoCalidad: true,
    },
    {
      nombre: 'CoordinadorSeguridad',
      nivelAutoridad: 55,
      accesoConsole: true,
      accesoSeguridad: true,
      accesoDocumentos: true,
    },
    {
      nombre: 'AuditorInterno',
      nivelAutoridad: 65,
      accesoConsole: true,
      accesoAuditoria: true,
      accesoBI: true,
      accesoDocumentos: true,
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
