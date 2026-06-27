-- NEXARA · Auditoría usuarios vs organigrama (16 cuentas oficiales)
-- Ejecutar en servidor:
--   docker exec -i nexara-db psql -U nexara -d nexara -f /path/audit-org-users.sql
--   — o pegar bloques en psql interactivo

\echo '=== Total usuarios ==='
SELECT COUNT(*) AS total FROM "User";

\echo '=== Emails duplicados ==='
SELECT LOWER(email) AS email, COUNT(*) AS n
FROM "User"
GROUP BY LOWER(email)
HAVING COUNT(*) > 1;

\echo '=== employeeNumber duplicados ==='
SELECT "employeeNumber", COUNT(*) AS n
FROM "User"
WHERE "employeeNumber" IS NOT NULL AND TRIM("employeeNumber") <> ''
GROUP BY "employeeNumber"
HAVING COUNT(*) > 1;

\echo '=== Fuera del organigrama ==='
SELECT u.id, u.email, u.nombre, u."roleKey", u."employeeNumber", u."isActive", r.nombre AS role_nombre
FROM "User" u
LEFT JOIN "Role" r ON r.id = u."roleId"
WHERE LOWER(u.email) NOT IN (
  'gerencia@nexara.com.mx',
  'developer@nexara.com.mx',
  'infraestructura@nexara.com.mx',
  'ventas@nexara.com.mx',
  'soluciones@nexara.com.mx',
  'redes@nexara.com.mx',
  'direccion.operaciones@nexara.com.mx',
  'operaciones@nexara.com.mx',
  'ivan.tapia@nexara.com.mx',
  'administracion.ventas@nexara.com.mx',
  'isaias.garcia@nexara.com.mx',
  'joan.sanchez@nexara.com.mx',
  'soporte@nexara.com.mx',
  'ariadna.sierra@nexara.com.mx',
  'alejandro.gonzalez@nexara.com.mx',
  'israel.ramos@nexara.com.mx'
)
ORDER BY u.email;

\echo '=== Organigrama faltante ==='
WITH official(email) AS (
  VALUES
    ('gerencia@nexara.com.mx'),
    ('developer@nexara.com.mx'),
    ('infraestructura@nexara.com.mx'),
    ('ventas@nexara.com.mx'),
    ('soluciones@nexara.com.mx'),
    ('redes@nexara.com.mx'),
    ('direccion.operaciones@nexara.com.mx'),
    ('operaciones@nexara.com.mx'),
    ('ivan.tapia@nexara.com.mx'),
    ('administracion.ventas@nexara.com.mx'),
    ('isaias.garcia@nexara.com.mx'),
    ('joan.sanchez@nexara.com.mx'),
    ('soporte@nexara.com.mx'),
    ('ariadna.sierra@nexara.com.mx'),
    ('alejandro.gonzalez@nexara.com.mx'),
    ('israel.ramos@nexara.com.mx')
)
SELECT o.email AS falta_en_db
FROM official o
LEFT JOIN "User" u ON LOWER(u.email) = LOWER(o.email)
WHERE u.id IS NULL;

\echo '=== Conteo por roleKey (organigrama) ==='
SELECT u."roleKey", COUNT(*) AS n
FROM "User" u
WHERE LOWER(u.email) IN (
  'gerencia@nexara.com.mx','developer@nexara.com.mx','infraestructura@nexara.com.mx',
  'ventas@nexara.com.mx','soluciones@nexara.com.mx','redes@nexara.com.mx',
  'direccion.operaciones@nexara.com.mx','operaciones@nexara.com.mx',
  'ivan.tapia@nexara.com.mx','administracion.ventas@nexara.com.mx',
  'isaias.garcia@nexara.com.mx','joan.sanchez@nexara.com.mx','soporte@nexara.com.mx',
  'ariadna.sierra@nexara.com.mx','alejandro.gonzalez@nexara.com.mx','israel.ramos@nexara.com.mx'
)
GROUP BY u."roleKey"
ORDER BY u."roleKey";
