/**
 * Genera Excel de credenciales NEXARA (nombre, correo, contraseña única).
 * Uso: node scripts/generate-credentials-xlsx.js
 */
const ExcelJS = require('exceljs');
const path = require('path');

/** Misma lista / passwords que apps/api/prisma/seed-demo-users.ts */
const USERS = [
  ['Claudia Bernal', 'claudia.bernal@nexara.com.mx', 'Nexara!NX010', 'Director General', 'Dirección General'],
  ['Christian Eduardo Del Pozo Sánchez', 'gerencia@nexara.com.mx', 'Nexara!NX001', 'Director General', 'Dirección General'],
  ['Adam Del Pozo', 'developer@nexara.com.mx', 'Nexara!NX002', 'Developer / Super Admin', 'Dirección General'],
  ['Josué Teodulo Cervantes Arellano', 'infraestructura@nexara.com.mx', 'Nexara!NX003', 'Arquitecto / Director Técnico', 'Arquitectura'],
  ['Karen Elizalde Sarmiento', 'ventas@nexara.com.mx', 'Nexara!NX101', 'Coordinadora Administrativa', 'Administración'],
  ['Mónica García Guzmán', 'soluciones@nexara.com.mx', 'Nexara!NX102', 'Ejecutiva Administrativa', 'Administración'],
  ['Daniela Galindo Almazán', 'redes@nexara.com.mx', 'Nexara!NX201', 'Líder de Área Creativa', 'Área Creativa'],
  ['Luis Joel Aguilar Castillo', 'direccion.operaciones@nexara.com.mx', 'Nexara!NX301', 'Coordinador de Operaciones', 'Operaciones'],
  ['David Morales Zenón', 'operaciones@nexara.com.mx', 'Nexara!NX302', 'Coordinador de Operaciones', 'Operaciones'],
  ['José Iván Tapia Reyes', 'ivan.tapia@nexara.com.mx', 'Nexara!NX401', 'Ingeniero de Campo', 'Ingeniería'],
  ['Iván Camargo Cañete', 'administracion.ventas@nexara.com.mx', 'Nexara!NX402', 'Ingeniero de Campo', 'Ingeniería'],
  ['Isaías García Bustamante', 'isaias.garcia@nexara.com.mx', 'Nexara!NX403', 'Ingeniero de Campo', 'Ingeniería'],
  ['Joan Sebastián Sánchez Espinoza', 'joan.sanchez@nexara.com.mx', 'Nexara!NX404', 'Ingeniero de Campo', 'Ingeniería'],
  ['Carolina Juárez Álvarez', 'soporte@nexara.com.mx', 'Nexara!NX405', 'Ingeniera de Soporte', 'Ingeniería'],
  ['Ariadna Sierra Gallardo', 'ariadna.sierra@nexara.com.mx', 'Nexara!NX406', 'Ingeniera de Campo', 'Ingeniería'],
  ['Alejandro González Bustamante', 'alejandro.gonzalez@nexara.com.mx', 'Nexara!NX407', 'Ingeniero de Campo', 'Ingeniería'],
  ['Israel Ramos Lima', 'israel.ramos@nexara.com.mx', 'Nexara!NX408', 'Ingeniero de Campo', 'Ingeniería'],
];

const GREEN = '1F5F4E';
const TEAL = '15A99D';
const TEAL_LIGHT = 'E6F7F5';
const WHITE = 'FFFFFF';
const DARK = '1A2B28';
const MUTED = '5A6F6A';

(async () => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NEXARA';
  wb.created = new Date();
  const ws = wb.addWorksheet('Credenciales', {
    views: [{ state: 'frozen', ySplit: 3 }],
    properties: { defaultRowHeight: 22 },
  });

  ws.mergeCells('A1:F1');
  const title = ws.getCell('A1');
  title.value = 'NEXARA · Credenciales de acceso';
  title.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF' + WHITE } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GREEN } };
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 36;

  ws.mergeCells('A2:F2');
  const sub = ws.getCell('A2');
  sub.value =
    'Panel · core.nexara.com.mx  ·  Contraseña única por usuario (Nexara! + # empleado)  ·  Generado ' +
    new Date().toLocaleDateString('es-MX');
  sub.font = { name: 'Calibri', size: 10, color: { argb: 'FF' + MUTED } };
  sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + TEAL_LIGHT } };
  sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(2).height = 22;

  const headers = ['#', 'Nombre completo', 'Correo', 'Contraseña', 'Puesto', 'Departamento'];
  const headerRow = ws.getRow(3);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF' + WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + TEAL } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF' + GREEN } } };
  });
  headerRow.height = 24;

  USERS.forEach((u, idx) => {
    const row = ws.getRow(4 + idx);
    const vals = [idx + 1, u[0], u[1], u[2], u[3], u[4]];
    const bg = idx % 2 === 0 ? WHITE : TEAL_LIGHT;
    vals.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF' + DARK }, bold: i === 3 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } };
      cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'center' : 'left' };
      cell.border = {
        top: { style: 'hair', color: { argb: 'FFD0E8E4' } },
        bottom: { style: 'hair', color: { argb: 'FFD0E8E4' } },
      };
    });
    row.height = 22;
  });

  const noteRow = 4 + USERS.length + 1;
  ws.mergeCells(noteRow, 1, noteRow, 6);
  const note = ws.getCell(noteRow, 1);
  note.value = 'Confidencial · Solo uso interno NEXARA · No compartir fuera del equipo';
  note.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF' + MUTED } };
  note.alignment = { horizontal: 'left', indent: 1 };

  ws.columns = [
    { width: 5 },
    { width: 38 },
    { width: 36 },
    { width: 16 },
    { width: 30 },
    { width: 20 },
  ];

  const out = path.join(__dirname, '..', 'NEXARA-credenciales-usuarios-v2.xlsx');
  await wb.xlsx.writeFile(out);
  console.log(out);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
