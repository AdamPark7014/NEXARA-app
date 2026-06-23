import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const emailArg = process.argv[2];
  const passwordArg = process.argv[3];

  if (!emailArg || !passwordArg) {
    console.error('Uso: ts-node src/users/reset-user-password.ts <email> <newPassword>');
    process.exit(1);
  }

  const email = emailArg.trim();
  const newPassword = passwordArg;

  const user = await prisma.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: 'insensitive',
      },
    },
    select: { id: true, email: true, nombre: true },
  });

  if (!user) {
    console.error(`No se encontró usuario con email: ${email}`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  console.log(`✅ Contraseña actualizada para ${user.email} (${user.nombre})`);
}

main()
  .catch((error) => {
    console.error('❌ Error al actualizar contraseña:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
