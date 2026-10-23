/**
 * Genera credenciales NUEVAS para el personal de NEXARA (contraseña aleatoria por persona) y las deja FUERA del repo.
 *
 * Por qué así: el 23-10-2026 se rotaron todas las cuentas porque este script y dos Excel con las contraseñas
 * estaban versionados en el repo público. Aquí ya no vive ningún dato: ni nombres, ni correos, ni contraseñas.
 *
 * Entrada:  C:\dev\secrets\nexara\personal.json  ([{ nombre, email, puesto, departamento }], fuera del repo)
 *           (o la ruta en NEXARA_PERSONAL)
 * Salida:   C:\dev\secrets\nexara\credenciales-<fecha>\ (o NEXARA_SALIDA):
 *           - NEXARA-credenciales-<fecha>.xlsx   tabla para el dueño
 *           - hoja-nueva.json                     [{ email, password }] para prisma/cargar-credenciales-boveda.ts
 *           - por-persona/<Nombre>.txt            mensaje listo para mandar a cada quien solo lo suyo
 * Nunca imprime contraseñas. Después hay que aplicarlas (simular primero, luego --apply):
 *   docker exec -i nexara-api sh -c 'cd /app/apps/api && npx ts-node --transpile-only -P ./prisma/tsconfig.seed.json \
 *     ./prisma/cargar-credenciales-boveda.ts --company-id=1 --file=- [--apply]' < hoja-nueva.json
 * (esa herramienta omite al dueño y a la cuenta de desarrollo: esas dos se cambian aparte).
 *
 * Uso: node scripts/generate-credentials-xlsx.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');

const PERSONAL = process.env.NEXARA_PERSONAL || 'C:\\dev\\secrets\\nexara\\personal.json';
const FECHA = new Date().toISOString().slice(0, 10);
const SALIDA = process.env.NEXARA_SALIDA || path.join('C:\\dev\\secrets\\nexara', `credenciales-${FECHA}`);

if (path.resolve(SALIDA).startsWith(path.resolve(__dirname, '..'))) {
  throw new Error('La salida no puede quedar dentro del repo: usa una carpeta de C:\\dev\\secrets.');
}

const personal = JSON.parse(fs.readFileSync(PERSONAL, 'utf8'));

// Fáciles de recordar y al azar (pedido de Adam, 23-10-2026): «Palabra-Palabra-NN», p. ej. «Mango-Nube-47».
// Nada que salga del nombre ni del número de empleado (el patrón «Nexara! + número» era adivinable). El login
// bloquea la cuenta tras varios intentos fallidos, así que ~1.2 millones de combinaciones por persona bastan.
const PALABRAS = [
  'Mango', 'Pera', 'Lima', 'Coco', 'Fresa', 'Uva', 'Kiwi', 'Cereza', 'Durazno', 'Papaya', 'Melon', 'Ciruela',
  'Nube', 'Luna', 'Sol', 'Estrella', 'Cometa', 'Rayo', 'Brisa', 'Lluvia', 'Nieve', 'Trueno', 'Aurora', 'Marea',
  'Rio', 'Lago', 'Mar', 'Playa', 'Bosque', 'Selva', 'Monte', 'Valle', 'Isla', 'Cascada', 'Pradera', 'Volcan',
  'Leon', 'Tigre', 'Lobo', 'Oso', 'Zorro', 'Aguila', 'Halcon', 'Delfin', 'Ballena', 'Tortuga', 'Panda', 'Koala',
  'Jaguar', 'Puma', 'Colibri', 'Buho', 'Ardilla', 'Conejo', 'Venado', 'Pinguino', 'Nutria', 'Caballo', 'Gato', 'Perro',
  'Rojo', 'Azul', 'Verde', 'Dorado', 'Plata', 'Coral', 'Turquesa', 'Violeta', 'Ambar', 'Marfil', 'Jade', 'Rubi',
  'Piano', 'Guitarra', 'Tambor', 'Violin', 'Flauta', 'Trompeta', 'Arpa', 'Bongo',
  'Cafe', 'Cacao', 'Vainilla', 'Canela', 'Miel', 'Pan', 'Taco', 'Elote', 'Tamal', 'Mole', 'Churro', 'Nopal',
  'Faro', 'Puente', 'Torre', 'Castillo', 'Molino', 'Barco', 'Velero', 'Cohete', 'Globo', 'Tren', 'Bici', 'Kayak',
  'Roble', 'Pino', 'Cedro', 'Olivo', 'Bambu', 'Cactus', 'Girasol', 'Rosa', 'Tulipan', 'Orquidea', 'Lirio', 'Helecho',
];
const al = (lista) => lista[crypto.randomInt(lista.length)];
const usadas = new Set();
function clave() {
  for (;;) {
    const a = al(PALABRAS);
    const b = al(PALABRAS);
    const c = `${a}-${b}-${crypto.randomInt(10, 100)}`;
    if (a !== b && !usadas.has(c)) {
      usadas.add(c);
      return c;
    }
  }
}

(async () => {
  fs.mkdirSync(path.join(SALIDA, 'por-persona'), { recursive: true });
  const cuentas = personal.map((p) => ({ ...p, password: clave() }));

  fs.writeFileSync(
    path.join(SALIDA, 'hoja-nueva.json'),
    JSON.stringify(cuentas.map((c) => ({ email: c.email, password: c.password })), null, 2),
  );

  for (const c of cuentas) {
    const archivo = c.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
    fs.writeFileSync(
      path.join(SALIDA, 'por-persona', `${archivo}.txt`),
      [
        `Hola, ${c.nombre.split(' ')[0]}.`,
        '',
        'Tus datos para entrar al panel de NEXARA:',
        '',
        '  Panel:      https://core.nexara.com.mx (y la app NEXARA del teléfono)',
        `  Correo:     ${c.email}`,
        `  Contraseña: ${c.password}`,
        '',
        'No la compartas con nadie.',
        '',
      ].join('\r\n'),
      'utf8',
    );
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'NEXARA';
  const ws = wb.addWorksheet('Credenciales');
  ws.columns = [
    { header: '#', width: 5 },
    { header: 'Nombre', width: 38 },
    { header: 'Correo', width: 38 },
    { header: 'Contraseña', width: 20 },
    { header: 'Puesto', width: 34 },
    { header: 'Departamento', width: 22 },
  ];
  ws.getRow(1).font = { bold: true };
  cuentas.forEach((c, i) => {
    const r = ws.addRow([i + 1, c.nombre, c.email, c.password, c.puesto, c.departamento]);
    r.getCell(4).numFmt = '@';
  });
  ws.addRow([]);
  ws.addRow(['', 'Confidencial. No subir a git ni compartir el archivo completo: manda a cada quien solo lo suyo.']);
  await wb.xlsx.writeFile(path.join(SALIDA, `NEXARA-credenciales-${FECHA}.xlsx`));
  console.log(`${cuentas.length} credenciales nuevas en ${SALIDA} (no se imprimen).`);
})();
