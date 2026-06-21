-- ============================================================================
-- Migración: Usuarios reales del organigrama NEXARA (v2 corregido)
-- Datos tomados directamente del organigrama oficial con correos verificados.
-- Correos inventados siguen el patrón: nombre.apellido@nexara.com.mx
-- ============================================================================

-- ── 0. Rol ARQUITECTO (idempotente) ──────────────────────────────────────────
INSERT INTO "Role" (nombre, "nivelAutoridad", "accesoConsole", "accesoActividades",
  "accesoEvidencias", "accesoVehiculos", "accesoAsistencia", "accesoGps",
  "accesoMantenimiento", "accesoDocumentos", "orgRoleKey")
VALUES ('Arquitecto / Dir. Técnico', 85, true, true, true, true, false, true, true, true, 'arquitecto')
ON CONFLICT (nombre) DO UPDATE SET "nivelAutoridad" = 85, "orgRoleKey" = 'arquitecto',
  "accesoActividades" = true, "accesoEvidencias" = true, "accesoMantenimiento" = true;

-- ── 1. Departamentos ──────────────────────────────────────────────────────────
INSERT INTO "Department" (nombre) VALUES
  ('Dirección General'), ('Operaciones'), ('Ingeniería'),
  ('Administración'), ('Área Creativa'), ('Finanzas')
ON CONFLICT (nombre) DO NOTHING;

-- ── 2. CEO — Christian Eduardo Del Pozo Sánchez ───────────────────────────────
-- (ya existe, solo actualizar nombre completo si hace falta)
UPDATE "User"
SET nombre = 'Christian Eduardo Del Pozo Sánchez',
    "departmentId" = (SELECT id FROM "Department" WHERE nombre = 'Dirección General')
WHERE email = 'gerencia@nexara.com.mx';

-- ── 3. Karen Elizalde Sarmiento — Coord. Ventas / Administración ──────────────
INSERT INTO "User" (nombre, email, "passwordHash", "roleId", "roleKey", "departmentId", puesto, "estadoRRHH", "isActive")
SELECT 'Karen Elizalde Sarmiento', 'ventas@nexara.com.mx',
  '$2b$10$NEXARA.placeholder.hash.replace.on.first.login.AAAAAAA',
  r.id, 'coord_ventas', d.id, 'Coordinadora de Ventas y Administración', 'Activo', true
FROM "Role" r CROSS JOIN "Department" d
WHERE r."orgRoleKey" = 'coord_ventas' AND d.nombre = 'Administración'
ON CONFLICT (email) DO UPDATE SET
  nombre = 'Karen Elizalde Sarmiento',
  "roleKey" = 'coord_ventas',
  puesto = 'Coordinadora de Ventas y Administración';

-- ── 4. Mónica García Guzmán — Administrativa ──────────────────────────────────
INSERT INTO "User" (nombre, email, "passwordHash", "roleId", "roleKey", "departmentId", puesto, "estadoRRHH", "isActive")
SELECT 'Mónica García Guzmán', 'soluciones@nexara.com.mx',
  '$2b$10$NEXARA.placeholder.hash.replace.on.first.login.AAAAAAA',
  r.id, 'administrativo', d.id, 'Coordinadora Administrativa', 'Activo', true
FROM "Role" r CROSS JOIN "Department" d
WHERE r."orgRoleKey" = 'administrativo' AND d.nombre = 'Administración'
ON CONFLICT (email) DO UPDATE SET
  nombre = 'Mónica García Guzmán',
  "roleKey" = 'administrativo',
  puesto = 'Coordinadora Administrativa';

-- ── 5. Daniela Galindo Almazán — Área Creativa ────────────────────────────────
INSERT INTO "User" (nombre, email, "passwordHash", "roleId", "roleKey", "departmentId", puesto, "estadoRRHH", "isActive")
SELECT 'Daniela Galindo Almazán', 'redes@nexara.com.mx',
  '$2b$10$NEXARA.placeholder.hash.replace.on.first.login.AAAAAAA',
  r.id, 'lider_diseno', d.id, 'Líder de Área Creativa', 'Activo', true
FROM "Role" r CROSS JOIN "Department" d
WHERE r."orgRoleKey" = 'lider_diseno' AND d.nombre = 'Área Creativa'
ON CONFLICT (email) DO UPDATE SET
  nombre = 'Daniela Galindo Almazán',
  "roleKey" = 'lider_diseno',
  puesto = 'Líder de Área Creativa';

-- ── 6. Josué Teodulo Cervantes Arellano — Arquitecto ─────────────────────────
INSERT INTO "User" (nombre, email, "passwordHash", "roleId", "roleKey", "departmentId", puesto, "estadoRRHH", "isActive")
SELECT 'Josué Teodulo Cervantes Arellano', 'infraestructura@nexara.com.mx',
  '$2b$10$NEXARA.placeholder.hash.replace.on.first.login.AAAAAAA',
  r.id, 'arquitecto', d.id, 'Arquitecto / Director Técnico', 'Activo', true
FROM "Role" r CROSS JOIN "Department" d
WHERE r."orgRoleKey" = 'arquitecto' AND d.nombre = 'Operaciones'
ON CONFLICT (email) DO UPDATE SET
  nombre = 'Josué Teodulo Cervantes Arellano',
  "roleKey" = 'arquitecto',
  puesto = 'Arquitecto / Director Técnico';

-- ── 7. Luis Joel Aguilar Castillo — Coord. Operaciones ───────────────────────
INSERT INTO "User" (nombre, email, "passwordHash", "roleId", "roleKey", "departmentId", puesto, "estadoRRHH", "isActive")
SELECT 'Luis Joel Aguilar Castillo', 'direccion.operaciones@nexara.com.mx',
  '$2b$10$NEXARA.placeholder.hash.replace.on.first.login.AAAAAAA',
  r.id, 'coord_operaciones', d.id, 'Coordinador de Operaciones', 'Activo', true
FROM "Role" r CROSS JOIN "Department" d
WHERE r."orgRoleKey" = 'coord_operaciones' AND d.nombre = 'Operaciones'
LIMIT 1
ON CONFLICT (email) DO UPDATE SET
  nombre = 'Luis Joel Aguilar Castillo',
  "roleKey" = 'coord_operaciones',
  puesto = 'Coordinador de Operaciones';

-- ── 8. David Morales Zenón — Coord. Operaciones ──────────────────────────────
INSERT INTO "User" (nombre, email, "passwordHash", "roleId", "roleKey", "departmentId", puesto, "estadoRRHH", "isActive")
SELECT 'David Morales Zenón', 'operaciones@nexara.com.mx',
  '$2b$10$NEXARA.placeholder.hash.replace.on.first.login.AAAAAAA',
  r.id, 'coord_operaciones', d.id, 'Coordinador de Operaciones', 'Activo', true
FROM "Role" r CROSS JOIN "Department" d
WHERE r."orgRoleKey" = 'coord_operaciones' AND d.nombre = 'Operaciones'
LIMIT 1
ON CONFLICT (email) DO UPDATE SET
  nombre = 'David Morales Zenón',
  "roleKey" = 'coord_operaciones',
  puesto = 'Coordinador de Operaciones';

-- ── 9. Ingenieros de campo (8 personas) ──────────────────────────────────────
DO $$
DECLARE
  role_id INTEGER;
  dept_id INTEGER;
  pw      TEXT := '$2b$10$NEXARA.placeholder.hash.replace.on.first.login.AAAAAAA';
BEGIN
  SELECT id INTO role_id FROM "Role" WHERE "orgRoleKey" = 'ing_campo' LIMIT 1;
  SELECT id INTO dept_id FROM "Department" WHERE nombre = 'Ingeniería';

  INSERT INTO "User" (nombre, email, "passwordHash", "roleId", "roleKey", "departmentId", puesto, "estadoRRHH", "isActive")
  VALUES
    -- Emails tomados del organigrama
    ('José Iván Tapia Reyes',          'ivan.tapia@nexara.com.mx',           pw, role_id, 'ing_campo', dept_id, 'Ingeniero de Campo', 'Activo', true),
    ('Iván Camargo Cañete',            'administracion.ventas@nexara.com.mx', pw, role_id, 'ing_campo', dept_id, 'Ingeniero de Campo', 'Activo', true),
    ('Isaías García Bustamante',       'isaias.garcia@nexara.com.mx',         pw, role_id, 'ing_campo', dept_id, 'Ingeniero de Campo', 'Activo', true),
    ('Joan Sebastián Sánchez Espinoza','joan.sanchez@nexara.com.mx',          pw, role_id, 'ing_campo', dept_id, 'Ingeniero de Campo', 'Activo', true),
    ('Carolina Juárez Álvarez',        'soporte@nexara.com.mx',               pw, role_id, 'ing_campo', dept_id, 'Ingeniero de Campo', 'Activo', true),
    ('Ariadna Sierra Gallardo',        'ariadna.sierra@nexara.com.mx',        pw, role_id, 'ing_campo', dept_id, 'Ingeniero de Campo', 'Activo', true),
    ('Alejandro González Bustamante',  'alejandro.gonzalez@nexara.com.mx',    pw, role_id, 'ing_campo', dept_id, 'Ingeniero de Campo', 'Activo', true),
    ('Israel Ramos Lima',              'israel.ramos@nexara.com.mx',          pw, role_id, 'ing_campo', dept_id, 'Ingeniero de Campo', 'Activo', true)
  ON CONFLICT (email) DO UPDATE SET
    nombre     = EXCLUDED.nombre,
    "roleKey"  = 'ing_campo',
    puesto     = 'Ingeniero de Campo';
END $$;

-- ── 10. managerId tree (jerarquía exacta del organigrama) ─────────────────────
-- Josué → Christian
UPDATE "User" SET "managerId" = (SELECT id FROM "User" WHERE email = 'gerencia@nexara.com.mx')
WHERE email = 'infraestructura@nexara.com.mx';

-- Karen, Mónica, Daniela → Christian
UPDATE "User" SET "managerId" = (SELECT id FROM "User" WHERE email = 'gerencia@nexara.com.mx')
WHERE email IN ('ventas@nexara.com.mx', 'soluciones@nexara.com.mx', 'redes@nexara.com.mx');

-- Luis y David → Josué (coordinan y validan a través de él)
UPDATE "User" SET "managerId" = (SELECT id FROM "User" WHERE email = 'infraestructura@nexara.com.mx')
WHERE email IN ('direccion.operaciones@nexara.com.mx', 'operaciones@nexara.com.mx');

-- 8 ingenieros → Josué
UPDATE "User" SET "managerId" = (SELECT id FROM "User" WHERE email = 'infraestructura@nexara.com.mx')
WHERE email IN (
  'ivan.tapia@nexara.com.mx',
  'administracion.ventas@nexara.com.mx',
  'isaias.garcia@nexara.com.mx',
  'joan.sanchez@nexara.com.mx',
  'soporte@nexara.com.mx',
  'ariadna.sierra@nexara.com.mx',
  'alejandro.gonzalez@nexara.com.mx',
  'israel.ramos@nexara.com.mx'
);

-- ── 11. Limpiar usuarios placeholder de migración anterior (si existen) ────────
-- (emails inventados que ya no aplican)
UPDATE "User" SET "isActive" = false
WHERE email IN (
  'josue@nexara.com.mx', 'david@nexara.com.mx', 'daniela@nexara.com.mx',
  'monica@nexara.com.mx', 'ivan.camargo@nexara.com.mx',
  'isaias@nexara.com.mx', 'joan@nexara.com.mx',
  'carolina@nexara.com.mx', 'ariadna@nexara.com.mx'
)
AND email NOT IN (
  'infraestructura@nexara.com.mx', 'operaciones@nexara.com.mx',
  'redes@nexara.com.mx', 'soluciones@nexara.com.mx',
  'administracion.ventas@nexara.com.mx', 'isaias.garcia@nexara.com.mx',
  'joan.sanchez@nexara.com.mx', 'soporte@nexara.com.mx',
  'ariadna.sierra@nexara.com.mx'
);
