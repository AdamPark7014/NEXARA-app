-- ============================================================================
-- NEXARA · Seed Equipo Completo v1
-- ============================================================================
-- Upserta a los 16 miembros del organigrama oficial:
--   1. Christian Eduardo Del Pozo Sánchez  — Dirección General
--   2. Adam Del Pozo                        — Developer / Super Admin
--   3. Josué Teodulo Cervantes Arellano    — Arquitecto / Dir. Técnico
--   4. Karen Elizalde Sarmiento             — Administración (coord)
--   5. Mónica García Guzmán                 — Administración (staff)
--   6. Daniela Galindo Almazán              — Área Creativa / Studio
--   7. Luis Joel Aguilar Castillo           — Coordinador Operaciones A
--   8. David Morales Zenón                  — Coordinador Operaciones B
--   9. José Iván Tapia Reyes               — Ingeniero de Campo
--  10. Iván Camargo Cañete                  — Ingeniero de Campo
--  11. Isaías García Bustamante             — Ingeniero de Campo
--  12. Joan Sebastián Sánchez Espinoza      — Ingeniero de Campo
--  13. Carolina Juárez Álvarez              — Ingeniero de Campo
--  14. Ariadna Sierra Gallardo              — Ingeniero de Campo
--  15. Alejandro González Bustamante        — Ingeniero de Campo
--  16. Israel Ramos Lima                    — Ingeniero de Campo
--
-- Seguridad:
--   · Usuarios existentes (por email): solo actualiza campos no críticos.
--   · Nuevos usuarios: passwordHash es placeholder inválido.
--     ➜ OBLIGATORIO: resetear contraseñas de usuarios nuevos desde
--       /erp/users antes de entregar credenciales.
--   · NO se modifica el passwordHash de usuarios ya existentes.
-- ============================================================================

-- Placeholder hash para cuentas nuevas (no permite login hasta reset)
-- Se recomienda usar la función de reset de password en /erp/users/[id]
DO $$
DECLARE
  v_placeholder_hash TEXT := '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p6ez6kxOEfRkNpDlHlOYIi';

  -- Roles IDs (se resuelven por nombre para ser portables)
  r_ceo           INT;
  r_coord_admin   INT;
  r_admin_staff   INT;
  r_lider_diseno  INT;
  r_coord_ops     INT;
  r_ing_campo     INT;

  -- Departments IDs
  d_direccion     INT;
  d_admin         INT;
  d_creativo      INT;
  d_operaciones   INT;
  d_ingenieria    INT;

  -- User IDs (para asignar managerId)
  u_christian     INT;
  u_josue         INT;
  u_luis          INT;
  u_david         INT;
  u_karen         INT;

BEGIN
  -- ── Crear roles básicos si no existen ──────────────────────────────────────
  -- Esto asegura que las migraciones sean idempotentes incluso en shadow database
  INSERT INTO "Role" (nombre, "orgRoleKey")
  VALUES 
    ('Dueño / CEO', 'ceo'),
    ('Coordinador Administrativo', 'coord_admin'),
    ('Administrativo', 'administrativo'),
    ('Líder de Diseño', 'lider_diseno'),
    ('Coordinador de Operaciones', 'coord_operaciones'),
    ('Ingeniero de Campo', 'ing_campo'),
    ('Arquitecto', 'arquitecto')
  ON CONFLICT (nombre) DO NOTHING;

  -- ── Resolver roles por nombre ──────────────────────────────────────────────
  SELECT id INTO r_ceo          FROM "Role" WHERE nombre ILIKE '%ceo%' OR nombre ILIKE '%director general%' LIMIT 1;
  SELECT id INTO r_coord_admin  FROM "Role" WHERE nombre ILIKE '%coord%admin%' OR nombre ILIKE '%coordinador admin%' LIMIT 1;
  SELECT id INTO r_admin_staff  FROM "Role" WHERE nombre ILIKE '%admin%staff%' OR nombre ILIKE '%administrativ%' LIMIT 1;
  SELECT id INTO r_lider_diseno FROM "Role" WHERE nombre ILIKE '%diseño%' OR nombre ILIKE '%diseno%' OR nombre ILIKE '%creativ%' LIMIT 1;
  SELECT id INTO r_coord_ops    FROM "Role" WHERE nombre ILIKE '%coord%oper%' OR nombre ILIKE '%coordinador oper%' LIMIT 1;
  SELECT id INTO r_ing_campo    FROM "Role" WHERE nombre ILIKE '%ing%campo%' OR nombre ILIKE '%field%' LIMIT 1;

  -- Fallback: usar rol CEO si no se encuentra un rol específico
  IF r_ceo        IS NULL THEN SELECT id INTO r_ceo        FROM "Role" LIMIT 1; END IF;
  IF r_coord_admin IS NULL THEN r_coord_admin := r_ceo; END IF;
  IF r_admin_staff IS NULL THEN r_admin_staff := r_ceo; END IF;
  IF r_lider_diseno IS NULL THEN r_lider_diseno := r_ceo; END IF;
  IF r_coord_ops  IS NULL THEN r_coord_ops  := r_ceo; END IF;
  IF r_ing_campo  IS NULL THEN r_ing_campo  := r_ceo; END IF;

  -- ── Asegurar departamentos ─────────────────────────────────────────────────
  INSERT INTO "Department" (nombre) VALUES ('Dirección General')
    ON CONFLICT (nombre) DO NOTHING;
  INSERT INTO "Department" (nombre) VALUES ('Administración')
    ON CONFLICT (nombre) DO NOTHING;
  INSERT INTO "Department" (nombre) VALUES ('Área Creativa')
    ON CONFLICT (nombre) DO NOTHING;
  INSERT INTO "Department" (nombre) VALUES ('Operaciones')
    ON CONFLICT (nombre) DO NOTHING;
  INSERT INTO "Department" (nombre) VALUES ('Ingeniería')
    ON CONFLICT (nombre) DO NOTHING;

  SELECT id INTO d_direccion   FROM "Department" WHERE nombre = 'Dirección General';
  SELECT id INTO d_admin       FROM "Department" WHERE nombre = 'Administración';
  SELECT id INTO d_creativo    FROM "Department" WHERE nombre = 'Área Creativa';
  SELECT id INTO d_operaciones FROM "Department" WHERE nombre = 'Operaciones';
  SELECT id INTO d_ingenieria  FROM "Department" WHERE nombre = 'Ingeniería';

  -- ── TIER 1: Dirección General ──────────────────────────────────────────────

  -- 1. Christian Eduardo Del Pozo Sánchez — CEO
  INSERT INTO "User" (nombre, email, "passwordHash", "roleId", "roleKey", "departmentId",
                      puesto, "tipoContrato", "estadoRRHH", "isActive", "fechaIngreso")
  VALUES ('Christian Eduardo Del Pozo Sánchez', 'gerencia@nexara.com.mx', v_placeholder_hash,
          r_ceo, 'ceo', d_direccion,
          'Director General', 'Planta', 'Activo', TRUE, '2022-01-01')
  ON CONFLICT (email) DO UPDATE SET
    nombre          = EXCLUDED.nombre,
    "roleId"        = EXCLUDED."roleId",
    "roleKey"       = EXCLUDED."roleKey",
    "departmentId"  = EXCLUDED."departmentId",
    puesto          = EXCLUDED.puesto,
    "tipoContrato"  = EXCLUDED."tipoContrato",
    "estadoRRHH"    = EXCLUDED."estadoRRHH",
    "isActive"      = EXCLUDED."isActive",
    "fechaIngreso"  = COALESCE("User"."fechaIngreso", EXCLUDED."fechaIngreso");
  SELECT id INTO u_christian FROM "User" WHERE email = 'gerencia@nexara.com.mx';

  -- 2. Adam Del Pozo — Developer / Super Admin
  INSERT INTO "User" (nombre, email, "passwordHash", "roleId", "roleKey", "departmentId",
                      puesto, "tipoContrato", "estadoRRHH", "isActive", "fechaIngreso")
  VALUES ('Adam Del Pozo', 'developer@nexara.com.mx', v_placeholder_hash,
          r_ceo, 'super_admin', d_direccion,
          'Developer / Super Admin', 'Planta', 'Activo', TRUE, '2022-01-01')
  ON CONFLICT (email) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    "roleKey" = EXCLUDED."roleKey",
    puesto = EXCLUDED.puesto;

  -- ── TIER 2: Arquitecto / Director Técnico ─────────────────────────────────

  -- 3. Josué Teodulo Cervantes Arellano — Arquitecto
  INSERT INTO "User" (nombre, email, "passwordHash", "roleId", "roleKey", "departmentId",
                      puesto, "tipoContrato", "estadoRRHH", "isActive", "fechaIngreso")
  VALUES ('Josué Teodulo Cervantes Arellano', 'infraestructura@nexara.com.mx', v_placeholder_hash,
          r_coord_ops, 'arquitecto', d_ingenieria,
          'Arquitecto / Director Técnico', 'Planta', 'Activo', TRUE, '2022-06-01')
  ON CONFLICT (email) DO UPDATE SET
    nombre         = EXCLUDED.nombre,
    "roleId"       = EXCLUDED."roleId",
    "roleKey"      = EXCLUDED."roleKey",
    "departmentId" = EXCLUDED."departmentId",
    puesto         = EXCLUDED.puesto,
    "tipoContrato" = EXCLUDED."tipoContrato",
    "estadoRRHH"   = EXCLUDED."estadoRRHH",
    "isActive"     = EXCLUDED."isActive";
  SELECT id INTO u_josue FROM "User" WHERE email = 'infraestructura@nexara.com.mx';

  -- Josué reporta a Christian
  UPDATE "User" SET "managerId" = u_christian WHERE email = 'infraestructura@nexara.com.mx';

  -- ── TIER 2: Administración ─────────────────────────────────────────────────

  -- 4. Karen Elizalde Sarmiento — Coord. Administración
  INSERT INTO "User" (nombre, email, "passwordHash", "roleId", "roleKey", "departmentId",
                      puesto, "tipoContrato", "estadoRRHH", "isActive", "fechaIngreso")
  VALUES ('Karen Elizalde Sarmiento', 'ventas@nexara.com.mx', v_placeholder_hash,
          r_coord_admin, 'coord_admin', d_admin,
          'Coordinadora Administrativa', 'Planta', 'Activo', TRUE, '2023-01-15')
  ON CONFLICT (email) DO UPDATE SET
    nombre         = EXCLUDED.nombre,
    "roleId"       = EXCLUDED."roleId",
    "roleKey"      = EXCLUDED."roleKey",
    "departmentId" = EXCLUDED."departmentId",
    puesto         = EXCLUDED.puesto,
    "tipoContrato" = EXCLUDED."tipoContrato",
    "estadoRRHH"   = EXCLUDED."estadoRRHH",
    "isActive"     = EXCLUDED."isActive";
  SELECT id INTO u_karen FROM "User" WHERE email = 'ventas@nexara.com.mx';
  UPDATE "User" SET "managerId" = u_christian WHERE email = 'ventas@nexara.com.mx';

  -- 5. Mónica García Guzmán — Staff Administrativo
  INSERT INTO "User" (nombre, email, "passwordHash", "roleId", "roleKey", "departmentId",
                      puesto, "tipoContrato", "estadoRRHH", "isActive", "fechaIngreso")
  VALUES ('Mónica García Guzmán', 'soluciones@nexara.com.mx', v_placeholder_hash,
          r_admin_staff, 'administrativo', d_admin,
          'Ejecutiva Administrativa', 'Planta', 'Activo', TRUE, '2023-03-01')
  ON CONFLICT (email) DO UPDATE SET
    nombre = EXCLUDED.nombre, "roleId" = EXCLUDED."roleId",
    "roleKey" = EXCLUDED."roleKey", puesto = EXCLUDED.puesto;
  UPDATE "User" SET "managerId" = u_karen WHERE email = 'soluciones@nexara.com.mx';

  -- 6. Daniela Galindo Almazán — Área Creativa / Studio
  INSERT INTO "User" (nombre, email, "passwordHash", "roleId", "roleKey", "departmentId",
                      puesto, "tipoContrato", "estadoRRHH", "isActive", "fechaIngreso")
  VALUES ('Daniela Galindo Almazán', 'redes@nexara.com.mx', v_placeholder_hash,
          r_lider_diseno, 'lider_diseno', d_creativo,
          'Líder de Área Creativa', 'Honorarios', 'Activo', TRUE, '2023-06-01')
  ON CONFLICT (email) DO UPDATE SET
    nombre = EXCLUDED.nombre, "roleId" = EXCLUDED."roleId",
    "roleKey" = EXCLUDED."roleKey", puesto = EXCLUDED.puesto,
    "tipoContrato" = EXCLUDED."tipoContrato";
  UPDATE "User" SET "managerId" = u_christian WHERE email = 'redes@nexara.com.mx';

  -- ── TIER 3: Coordinadores Operaciones ─────────────────────────────────────

  -- 7. Luis Joel Aguilar Castillo — Coordinador Operaciones A
  INSERT INTO "User" (nombre, email, "passwordHash", "roleId", "roleKey", "departmentId",
                      puesto, "tipoContrato", "estadoRRHH", "isActive", "fechaIngreso")
  VALUES ('Luis Joel Aguilar Castillo', 'direccion.operaciones@nexara.com.mx', v_placeholder_hash,
          r_coord_ops, 'coord_operaciones', d_operaciones,
          'Coordinador de Operaciones', 'Planta', 'Activo', TRUE, '2023-02-01')
  ON CONFLICT (email) DO UPDATE SET
    nombre = EXCLUDED.nombre, "roleId" = EXCLUDED."roleId",
    "roleKey" = EXCLUDED."roleKey", puesto = EXCLUDED.puesto;
  SELECT id INTO u_luis FROM "User" WHERE email = 'direccion.operaciones@nexara.com.mx';
  UPDATE "User" SET "managerId" = u_josue WHERE email = 'direccion.operaciones@nexara.com.mx';

  -- 8. David Morales Zenón — Coordinador Operaciones B
  INSERT INTO "User" (nombre, email, "passwordHash", "roleId", "roleKey", "departmentId",
                      puesto, "tipoContrato", "estadoRRHH", "isActive", "fechaIngreso")
  VALUES ('David Morales Zenón', 'operaciones@nexara.com.mx', v_placeholder_hash,
          r_coord_ops, 'coord_operaciones', d_operaciones,
          'Coordinador de Operaciones', 'Planta', 'Activo', TRUE, '2023-04-01')
  ON CONFLICT (email) DO UPDATE SET
    nombre = EXCLUDED.nombre, "roleId" = EXCLUDED."roleId",
    "roleKey" = EXCLUDED."roleKey", puesto = EXCLUDED.puesto;
  SELECT id INTO u_david FROM "User" WHERE email = 'operaciones@nexara.com.mx';
  UPDATE "User" SET "managerId" = u_josue WHERE email = 'operaciones@nexara.com.mx';

  -- ── TIER 4: Ingenieros de Campo ───────────────────────────────────────────
  -- Los primeros 4 reportan a Luis, los siguientes 4 a David

  -- 9. José Iván Tapia Reyes
  INSERT INTO "User" (nombre, email, "passwordHash", "roleId", "roleKey", "departmentId",
                      puesto, "tipoContrato", "estadoRRHH", "isActive", "fechaIngreso")
  VALUES ('José Iván Tapia Reyes', 'ivan.tapia@nexara.com.mx', v_placeholder_hash,
          r_ing_campo, 'ing_campo', d_ingenieria,
          'Ingeniero de Campo', 'Planta', 'Activo', TRUE, '2024-01-15')
  ON CONFLICT (email) DO UPDATE SET
    nombre = EXCLUDED.nombre, "roleId" = EXCLUDED."roleId",
    "roleKey" = EXCLUDED."roleKey", puesto = EXCLUDED.puesto;
  UPDATE "User" SET "managerId" = u_luis WHERE email = 'ivan.tapia@nexara.com.mx';

  -- 10. Iván Camargo Cañete
  INSERT INTO "User" (nombre, email, "passwordHash", "roleId", "roleKey", "departmentId",
                      puesto, "tipoContrato", "estadoRRHH", "isActive", "fechaIngreso")
  VALUES ('Iván Camargo Cañete', 'administracion.ventas@nexara.com.mx', v_placeholder_hash,
          r_ing_campo, 'ing_campo', d_ingenieria,
          'Ingeniero de Campo', 'Planta', 'Activo', TRUE, '2024-02-01')
  ON CONFLICT (email) DO UPDATE SET
    nombre = EXCLUDED.nombre, "roleId" = EXCLUDED."roleId",
    "roleKey" = EXCLUDED."roleKey", puesto = EXCLUDED.puesto;
  UPDATE "User" SET "managerId" = u_luis WHERE email = 'administracion.ventas@nexara.com.mx';

  -- 11. Isaías García Bustamante
  INSERT INTO "User" (nombre, email, "passwordHash", "roleId", "roleKey", "departmentId",
                      puesto, "tipoContrato", "estadoRRHH", "isActive", "fechaIngreso")
  VALUES ('Isaías García Bustamante', 'isaias.garcia@nexara.com.mx', v_placeholder_hash,
          r_ing_campo, 'ing_campo', d_ingenieria,
          'Ingeniero de Campo', 'Planta', 'Activo', TRUE, '2024-02-15')
  ON CONFLICT (email) DO UPDATE SET
    nombre = EXCLUDED.nombre, "roleId" = EXCLUDED."roleId",
    "roleKey" = EXCLUDED."roleKey", puesto = EXCLUDED.puesto;
  UPDATE "User" SET "managerId" = u_luis WHERE email = 'isaias.garcia@nexara.com.mx';

  -- 12. Joan Sebastián Sánchez Espinoza
  INSERT INTO "User" (nombre, email, "passwordHash", "roleId", "roleKey", "departmentId",
                      puesto, "tipoContrato", "estadoRRHH", "isActive", "fechaIngreso")
  VALUES ('Joan Sebastián Sánchez Espinoza', 'joan.sanchez@nexara.com.mx', v_placeholder_hash,
          r_ing_campo, 'ing_campo', d_ingenieria,
          'Ingeniero de Campo', 'Planta', 'Activo', TRUE, '2024-03-01')
  ON CONFLICT (email) DO UPDATE SET
    nombre = EXCLUDED.nombre, "roleId" = EXCLUDED."roleId",
    "roleKey" = EXCLUDED."roleKey", puesto = EXCLUDED.puesto;
  UPDATE "User" SET "managerId" = u_luis WHERE email = 'joan.sanchez@nexara.com.mx';

  -- 13. Carolina Juárez Álvarez
  INSERT INTO "User" (nombre, email, "passwordHash", "roleId", "roleKey", "departmentId",
                      puesto, "tipoContrato", "estadoRRHH", "isActive", "fechaIngreso")
  VALUES ('Carolina Juárez Álvarez', 'soporte@nexara.com.mx', v_placeholder_hash,
          r_ing_campo, 'ing_campo', d_ingenieria,
          'Ingeniero de Campo', 'Planta', 'Activo', TRUE, '2024-03-15')
  ON CONFLICT (email) DO UPDATE SET
    nombre = EXCLUDED.nombre, "roleId" = EXCLUDED."roleId",
    "roleKey" = EXCLUDED."roleKey", puesto = EXCLUDED.puesto;
  UPDATE "User" SET "managerId" = u_david WHERE email = 'soporte@nexara.com.mx';

  -- 14. Ariadna Sierra Gallardo
  INSERT INTO "User" (nombre, email, "passwordHash", "roleId", "roleKey", "departmentId",
                      puesto, "tipoContrato", "estadoRRHH", "isActive", "fechaIngreso")
  VALUES ('Ariadna Sierra Gallardo', 'ariadna.sierra@nexara.com.mx', v_placeholder_hash,
          r_ing_campo, 'ing_campo', d_ingenieria,
          'Ingeniero de Campo', 'Planta', 'Activo', TRUE, '2024-04-01')
  ON CONFLICT (email) DO UPDATE SET
    nombre = EXCLUDED.nombre, "roleId" = EXCLUDED."roleId",
    "roleKey" = EXCLUDED."roleKey", puesto = EXCLUDED.puesto;
  UPDATE "User" SET "managerId" = u_david WHERE email = 'ariadna.sierra@nexara.com.mx';

  -- 15. Alejandro González Bustamante
  INSERT INTO "User" (nombre, email, "passwordHash", "roleId", "roleKey", "departmentId",
                      puesto, "tipoContrato", "estadoRRHH", "isActive", "fechaIngreso")
  VALUES ('Alejandro González Bustamante', 'alejandro.gonzalez@nexara.com.mx', v_placeholder_hash,
          r_ing_campo, 'ing_campo', d_ingenieria,
          'Ingeniero de Campo', 'Planta', 'Activo', TRUE, '2024-04-15')
  ON CONFLICT (email) DO UPDATE SET
    nombre = EXCLUDED.nombre, "roleId" = EXCLUDED."roleId",
    "roleKey" = EXCLUDED."roleKey", puesto = EXCLUDED.puesto;
  UPDATE "User" SET "managerId" = u_david WHERE email = 'alejandro.gonzalez@nexara.com.mx';

  -- 16. Israel Ramos Lima
  INSERT INTO "User" (nombre, email, "passwordHash", "roleId", "roleKey", "departmentId",
                      puesto, "tipoContrato", "estadoRRHH", "isActive", "fechaIngreso")
  VALUES ('Israel Ramos Lima', 'israel.ramos@nexara.com.mx', v_placeholder_hash,
          r_ing_campo, 'ing_campo', d_ingenieria,
          'Ingeniero de Campo', 'Planta', 'Activo', TRUE, '2024-05-01')
  ON CONFLICT (email) DO UPDATE SET
    nombre = EXCLUDED.nombre, "roleId" = EXCLUDED."roleId",
    "roleKey" = EXCLUDED."roleKey", puesto = EXCLUDED.puesto;
  UPDATE "User" SET "managerId" = u_david WHERE email = 'israel.ramos@nexara.com.mx';

  -- ── Orgchart: managerId para Josué (valida trabajo de Luis y David) ────────
  -- (Josué ya fue asignado managerId = christian arriba)
  -- Luis y David ya tienen managerId = josue (arriba)

  RAISE NOTICE 'NEXARA Team seed completado. 16 usuarios upsertados.';
  RAISE NOTICE 'IMPORTANTE: Resetear contraseñas de cuentas nuevas en /erp/users/[id]';
END $$;

-- ── Índice para búsqueda rápida por managerId ─────────────────────────────────
CREATE INDEX IF NOT EXISTS "User_managerId_idx" ON "User"("managerId");
