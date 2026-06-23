import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  try {
    const hashedPassword = await bcrypt.hash('Nexara@2026', 10);
    const department = await prisma.department.upsert({
      where: { nombre: 'Dirección General' },
      update: {},
      create: { nombre: 'Dirección General' },
    });

    const role = await prisma.role.findFirst({
      where: {
        OR: [
          { orgRoleKey: 'ceo' },
          { nombre: 'CEO / Dirección General' },
        ],
      },
      orderBy: { id: 'asc' },
    });

    if (!role) {
      throw new Error('No se encontró un rol admin/ceo. Corre primero seed-roles.ts o seed-demo-users.ts.');
    }

    const admin = await prisma.user.upsert({
      where: { email: 'admin@nexara.com.mx' },
      update: {
        nombre: 'Admin Nexara',
        passwordHash: hashedPassword,
        roleId: role.id,
        departmentId: department.id,
      },
      create: {
        email: 'admin@nexara.com.mx',
        nombre: 'Admin Nexara',
        passwordHash: hashedPassword,
        roleId: role.id,
        departmentId: department.id,
      },
    });

    console.log('✅ Usuario admin creado:', admin.email);
    console.log('📧 Email: admin@nexara.com.mx');
    console.log('🔑 Contraseña: Nexara@2026');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
