/**
 * Repuebla SOLO las contraseñas de los usuarios que YA existen, a partir de una
 * lista externa. No crea a nadie, no toca nombre, puesto, rol, departamento ni
 * número de empleado — a diferencia de `seed-demo-users.ts`, que además daría
 * de alta a cuatro personas que no están en producción y sobrescribiría datos
 * de RH auditados.
 *
 * La lista NO vive aquí a propósito: cuatro de las claves reales no están en el
 * repositorio y no deben acabar en git. Se pasa por ruta, desde un archivo que
 * se borra al terminar.
 *
 * Uso:
 *   ts-node -P ./prisma/tsconfig.seed.json ./prisma/fix-passwords.ts <lista.tsv>
 *   ts-node -P ./prisma/tsconfig.seed.json ./prisma/fix-passwords.ts <lista.tsv> --apply
 *
 * Formato de <lista.tsv>: una línea por cuenta, `correo<TAB>contraseña`.
 * Se ignoran líneas vacías y las que empiezan por `#`.
 */
import * as fs from 'fs';

import bcryptjs from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const APLICAR = args.includes('--apply');
const RUTA = args.find((a) => !a.startsWith('--'));

type Par = { email: string; password: string };

function leerLista(ruta: string): Par[] {
  const pares: Par[] = [];
  const lineas = fs.readFileSync(ruta, 'utf8').split(/\r?\n/);
  for (const [i, linea] of lineas.entries()) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    // La contraseña puede contener casi cualquier cosa, así que se parte por el
    // PRIMER tabulador y el resto se toma tal cual.
    const corte = linea.indexOf('\t');
    if (corte < 0) {
      throw new Error(`Línea ${i + 1} sin tabulador: "${limpia}"`);
    }
    const email = linea.slice(0, corte).trim();
    const password = linea.slice(corte + 1).trim();
    if (!email || !password) {
      throw new Error(`Línea ${i + 1} incompleta.`);
    }
    pares.push({ email, password });
  }
  return pares;
}

async function main() {
  if (!RUTA) {
    throw new Error('Falta la ruta de la lista. Ver el encabezado de este archivo.');
  }

  const pares = leerLista(RUTA);
  console.log(`Leídas ${pares.length} cuentas de ${RUTA}.`);
  console.log(APLICAR ? '>>> MODO APLICAR <<<' : '>>> SECO: no se escribe nada <<<');
  console.log('');

  let cambiadas = 0;
  let yaCorrectas = 0;
  let inexistentes = 0;

  for (const { email, password } of pares) {
    // El tenant demo tiene su propio sembrador (`seed:play-reviewer`). Aquí no.
    if (email.endsWith('@demo.invalid') || email.startsWith('play.review@')) {
      console.log(`  --  ${email}  omitida: vive en el tenant demo`);
      continue;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      console.log(`  ??  ${email}  NO EXISTE en producción — no se crea`);
      inexistentes += 1;
      continue;
    }

    if (await bcryptjs.compare(password, user.passwordHash)) {
      console.log(`  ok  ${email}  ya coincide`);
      yaCorrectas += 1;
      continue;
    }

    if (APLICAR) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: bcryptjs.hashSync(password, 10),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      console.log(`  ->  ${email}  CAMBIADA`);
    } else {
      console.log(`  ->  ${email}  cambiaría (hoy no coincide)`);
    }
    cambiadas += 1;
  }

  console.log('');
  console.log(
    `Resumen: ${cambiadas} ${APLICAR ? 'cambiadas' : 'por cambiar'} · ` +
      `${yaCorrectas} ya correctas · ${inexistentes} no existen (omitidas)`,
  );
  if (!APLICAR) console.log('Nada escrito. Repite con --apply para aplicar.');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
