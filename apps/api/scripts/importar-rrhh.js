/**
 * Importa los datos de RH y el número de empleado oficial (nomenclatura) de cada persona.
 *
 * El archivo de datos NO vive en el repositorio (trae RFC, CURP, NSS y sueldos). Formato:
 *   { reglas: { noDarDeAlta: [nombre…] }, funcionesComunes: { CLAVE: [..] },
 *     personas: [{ nombre, nomenclatura|null, documentosPendientes, imss, fechaIngreso (AAAA-MM-DD),
 *                  sueldoSemanal|null, rfc, curp, nss, correo, telefono, puesto,
 *                  funciones: [..] | "CLAVE", soloServicios? }] }
 *
 * Qué hace (decisiones de Adam, 16-09-2026):
 *  - La nomenclatura que mandó RH es el número de empleado oficial: reemplaza el de prueba (NX-…)
 *    en `User.employeeNumber` y en la membresía de la empresa, TAL CUAL aunque traiga fechas
 *    imposibles; la auditoría (`GET /api/hr/nomenclaturas/auditoria`) las marca por corregir.
 *    Quien no trae clave recibe una generada con la regla y queda como `generada`.
 *  - Quien no existe se da de alta INACTIVO y sin contraseña usable hasta que RH complete su acceso.
 *    Excepto los nombres en `reglas.noDarDeAlta`.
 *  - No cambia el correo de inicio de sesión de nadie; el correo de RH va a `correoContacto`.
 *  - Rol, departamento, jefe y módulos de las altas se copian de un compañero con el mismo puesto
 *    en la base donde corre (el servidor de prueba y la base local no tienen el mismo organigrama).
 *
 * Uso dentro del contenedor de la API (la imagen no copia scripts/, entra por stdin):
 *   docker exec -i nexara-api sh -c 'cat > /tmp/rrhh.json' < rrhh.json
 *   docker exec -i -w /app/apps/api nexara-api node - --archivo=/tmp/rrhh.json < apps/api/scripts/importar-rrhh.js
 *   docker exec -i -w /app/apps/api nexara-api node - --archivo=/tmp/rrhh.json --apply < apps/api/scripts/importar-rrhh.js
 *   docker exec nexara-api rm -f /tmp/rrhh.json
 * Sin --apply solo simula. --company=1 (defecto) · --json imprime el reporte completo.
 * Necesita la API compilada con `dist/rrhh/nomenclatura.js` (desplegada).
 */
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function arg(nombre) {
  const pref = `--${nombre}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : null;
}
const APLICAR = process.argv.includes('--apply');
const COMO_JSON = process.argv.includes('--json');
const ARCHIVO = arg('archivo');
const COMPANY_ID = Number(arg('company') || 1);
if (!ARCHIVO) {
  console.error('Uso: node importar-rrhh.js --archivo=<ruta.json> [--apply] [--company=1] [--json]');
  process.exit(2);
}

const { PrismaClient, Prisma } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const nom = require(path.resolve(process.cwd(), 'dist/rrhh/nomenclatura.js'));

const prisma = new PrismaClient();

/** Correo de acceso y compañero modelo para quien se da de alta (las reglas del sistema los buscan por correo). */
const ALTAS = {
  'jose antonio ramirez salazar': {
    email: 'jose.ramirez@nexara.com.mx',
    modelo: 'soporte@nexara.com.mx',
    jefe: 'gerencia@nexara.com.mx',
    // Antonio: puente de servicios, recibe tarea, proyecto y servicio.
    moduleAccess: { pizarra: 'on', asistencias: 'on', chat: 'on', 'activities-daily': 'on', 'activities-projects': 'on', 'activities-services': 'on' },
  },
  'daniela hernandez cruz': { email: 'daniela.hernandez@nexara.com.mx', modelo: 'soluciones@nexara.com.mx' },
  'juan jose gonzalez rojas': { email: 'juan.gonzalez@nexara.com.mx', modelo: 'israel.ramos@nexara.com.mx', jefe: 'operaciones@nexara.com.mx' },
  'roberto paul vivanco lopez': {
    email: 'roberto.vivanco@nexara.com.mx',
    modelo: 'soporte@nexara.com.mx',
    // Solo atiende servicios.
    moduleAccess: { pizarra: 'on', asistencias: 'on', chat: 'on', 'activities-daily': 'off', 'activities-projects': 'off', 'activities-services': 'on' },
  },
};

function norm(t) {
  return String(t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-zñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Mismo primer nombre y todas las palabras del nombre más corto dentro del más largo. */
function mismaPersona(a, b) {
  const ta = norm(a).split(' ');
  const tb = norm(b).split(' ');
  if (!ta[0] || ta[0] !== tb[0]) return false;
  const [corto, largo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return corto.length >= 2 && corto.every((t) => largo.includes(t));
}

function fecha(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function corregirCorreo(correo) {
  const limpio = String(correo || '').trim();
  if (!limpio) return { correo: null, nota: 'Sin correo de contacto' };
  const arreglado = limpio.replace(/,(com|mx|net|org)$/i, '.$1');
  return arreglado === limpio ? { correo: limpio, nota: null } : { correo: arreglado, nota: `Correo corregido (${limpio} → ${arreglado})` };
}

async function main() {
  const datos = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
  const noAlta = new Set((datos.reglas?.noDarDeAlta || []).map(norm));
  const comunes = datos.funcionesComunes || {};
  const usuarios = await prisma.user.findMany({
    select: {
      id: true, nombre: true, email: true, employeeNumber: true, puesto: true, fechaIngreso: true, isActive: true,
      roleId: true, roleKey: true, departmentId: true, managerId: true, moduleAccess: true,
    },
  });
  const porCorreo = new Map(usuarios.map((u) => [u.email.toLowerCase(), u]));
  const reporte = [];

  for (const p of datos.personas) {
    const clave = norm(p.nombre);
    const alta = ALTAS[clave];
    const notas = [];
    let usuario = alta ? porCorreo.get(alta.email) : null;
    if (!usuario) {
      const candidatos = usuarios.filter((u) => mismaPersona(u.nombre, p.nombre));
      if (candidatos.length > 1) {
        reporte.push({ nombre: p.nombre, accion: 'omitido', notas: [`Ambiguo: ${candidatos.map((c) => c.nombre).join(' / ')}`] });
        continue;
      }
      usuario = candidatos[0] || null;
    }

    const ingreso = fecha(p.fechaIngreso);
    const nacimiento = nom.fechaNacimientoDeCurp(p.curp);
    let numero = (p.nomenclatura || '').trim().toUpperCase() || null;
    let origen = 'rh';
    if (!numero) {
      numero = nom.generarNomenclatura({ nombre: p.nombre, curp: p.curp, fechaIngreso: ingreso });
      origen = 'generada';
      notas.push(numero ? `Clave generada por el sistema: ${numero}` : 'Sin clave y sin datos para generarla');
    }
    const auditoria = nom.auditarNomenclatura({ codigo: numero, nombre: p.nombre, curp: p.curp, fechaIngreso: ingreso });
    const correo = corregirCorreo(p.correo);
    if (correo.nota) notas.push(correo.nota);
    const funciones = Array.isArray(p.funciones) ? p.funciones : comunes[p.funciones] || null;

    const perfil = {
      ...(p.telefono ? { telefono: String(p.telefono) } : {}),
      ...(p.curp ? { curp: p.curp.trim().toUpperCase() } : {}),
      ...(p.rfc ? { rfc: p.rfc.trim().toUpperCase() } : {}),
      ...(p.nss ? { nss: String(p.nss).trim() } : {}),
      ...(nacimiento ? { fechaNacimiento: nacimiento } : {}),
      ...(correo.correo ? { correoContacto: correo.correo } : {}),
      imssAlta: Boolean(p.imss),
      documentosPendientes: Boolean(p.documentosPendientes),
      ...(p.sueldoSemanal != null ? { sueldoSemanal: new Prisma.Decimal(p.sueldoSemanal) } : {}),
      ...(funciones ? { funciones } : {}),
      nomenclaturaOrigen: origen,
    };

    if (!usuario) {
      if (noAlta.has(clave)) {
        reporte.push({ nombre: p.nombre, accion: 'pendiente', numeroAntes: null, numeroDespues: numero, auditoria, notas: ['No se da de alta todavía (indicación de Adam)'] });
        continue;
      }
      if (!alta) {
        reporte.push({ nombre: p.nombre, accion: 'omitido', numeroAntes: null, numeroDespues: numero, auditoria, notas: ['No existe y no hay correo/modelo definido para darlo de alta'] });
        continue;
      }
      const modelo = porCorreo.get(alta.modelo);
      if (!modelo) {
        reporte.push({ nombre: p.nombre, accion: 'omitido', notas: [`No existe el compañero modelo ${alta.modelo}`] });
        continue;
      }
      const jefe = alta.jefe ? porCorreo.get(alta.jefe) : null;
      notas.push(`Alta sin acceso (inactivo) como ${alta.email}; rol y departamento de ${modelo.nombre}`);
      if (APLICAR) {
        await prisma.$transaction(async (tx) => {
          const creado = await tx.user.create({
            data: {
              nombre: p.nombre,
              email: alta.email,
              passwordHash: bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 10),
              roleId: modelo.roleId,
              roleKey: modelo.roleKey,
              departmentId: modelo.departmentId,
              managerId: jefe ? jefe.id : modelo.managerId,
              moduleAccess: alta.moduleAccess || modelo.moduleAccess || undefined,
              employeeNumber: numero,
              puesto: p.puesto,
              fechaIngreso: ingreso,
              isActive: false,
            },
          });
          await tx.userCompany.create({ data: { userId: creado.id, companyId: COMPANY_ID, isDefault: true, employeeNumber: numero } });
          await tx.userProfile.create({ data: { userId: creado.id, ...perfil } });
          await tx.auditLog.create({
            data: {
              entityType: 'User', entityId: creado.id, action: 'RRHH_ALTA', source: 'script', companyId: COMPANY_ID,
              changes: { numeroEmpleado: { antes: null, despues: numero }, origen, activo: false, modelo: modelo.email },
            },
          });
        });
      }
      reporte.push({ nombre: p.nombre, accion: 'creado', numeroAntes: null, numeroDespues: numero, auditoria, notas });
      continue;
    }

    // Persona existente: número oficial, puesto, ingreso y perfil de RH. El correo de acceso no se toca.
    const nombreCompleto = norm(p.nombre).split(' ').length > norm(usuario.nombre).split(' ').length ? p.nombre : usuario.nombre;
    if (nombreCompleto !== usuario.nombre) notas.push(`Nombre completado: ${usuario.nombre} → ${nombreCompleto}`);
    const choque = numero ? usuarios.find((u) => u.id !== usuario.id && (u.employeeNumber || '').toUpperCase() === numero) : null;
    if (choque) {
      reporte.push({ nombre: p.nombre, accion: 'omitido', numeroAntes: usuario.employeeNumber, numeroDespues: numero, auditoria, notas: [`La clave ya la tiene ${choque.nombre}`] });
      continue;
    }
    if (APLICAR) {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: usuario.id },
          data: { nombre: nombreCompleto, employeeNumber: numero, puesto: p.puesto, ...(ingreso ? { fechaIngreso: ingreso } : {}) },
        });
        await tx.userCompany.upsert({
          where: { userId_companyId: { userId: usuario.id, companyId: COMPANY_ID } },
          create: { userId: usuario.id, companyId: COMPANY_ID, isDefault: true, employeeNumber: numero },
          update: { employeeNumber: numero },
        });
        await tx.userProfile.upsert({ where: { userId: usuario.id }, create: { userId: usuario.id, ...perfil }, update: perfil });
        await tx.auditLog.create({
          data: {
            entityType: 'User', entityId: usuario.id, action: 'RRHH_IMPORT', source: 'script', companyId: COMPANY_ID,
            changes: {
              numeroEmpleado: { antes: usuario.employeeNumber, despues: numero },
              origen,
              puesto: { antes: usuario.puesto, despues: p.puesto },
              campos: Object.keys(perfil),
            },
          },
        });
      });
    }
    reporte.push({ nombre: nombreCompleto, accion: 'actualizado', numeroAntes: usuario.employeeNumber, numeroDespues: numero, auditoria, notas });
  }

  if (COMO_JSON) {
    console.log(JSON.stringify(reporte, null, 2));
  } else {
    console.log(`${APLICAR ? 'APLICADO' : 'SIMULACIÓN (sin cambios; usa --apply)'} · empresa ${COMPANY_ID}\n`);
    for (const r of reporte) {
      const a = r.auditoria;
      console.log(`${r.accion.padEnd(11)} ${r.nombre}`);
      if (r.numeroDespues || r.numeroAntes) console.log(`            número: ${r.numeroAntes || '—'} → ${r.numeroDespues || '—'}`);
      if (a) console.log(`            auditoría: ${a.estado}${a.esperado && a.esperado !== r.numeroDespues ? ` (según datos: ${a.esperado})` : ''}${a.observaciones.length ? ` · ${a.observaciones.join('; ')}` : ''}`);
      for (const n of r.notas || []) console.log(`            · ${n}`);
    }
    const cuenta = reporte.reduce((acc, r) => ((acc[r.accion] = (acc[r.accion] || 0) + 1), acc), {});
    console.log(`\nResumen: ${Object.entries(cuenta).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  }
}

main()
  .catch((e) => {
    console.error('Falló la importación:', e && e.message ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
