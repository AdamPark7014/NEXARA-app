import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  try {
    const hashedPassword = await bcrypt.hash('Nexara@2026', 10);

    const admin = await prisma.user.upsert({
      where: { email: 'admin@nexara.com.mx' },
      update: {
        password: hashedPassword,
        isActive: true,
      },
      create: {
        email: 'admin@nexara.com.mx',
        nombre: 'Admin',
        apellido: 'Nexara',
        password: hashedPassword,
        emailVerified: new Date(),
        isActive: true,
        roles: {
          connect: { id: 1 }, // Asumiendo que role con id=1 existe
        },
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
