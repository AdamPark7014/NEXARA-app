const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    // Usar un hash bcrypt precompilado de "Nexara@2026"
    // Hash: $2b$10$dxRXAhS0hjdm8MFPxVLHJ.kBXKV0zLjlY8K0I0sZ8k0mhH8K2G7x6
    const hashedPassword = '$2b$10$dxRXAhS0hjdm8MFPxVLHJ.kBXKV0zLjlY8K0I0sZ8k0mhH8K2G7x6';

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
      },
    });

    console.log('✅ Usuario admin creado:', admin.email);
    console.log('📧 Email: admin@nexara.com.mx');
    console.log('🔑 Contraseña: Nexara@2026');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
