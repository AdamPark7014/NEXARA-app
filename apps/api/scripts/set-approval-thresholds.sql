-- Fija desde qué monto hace falta la autorización de dirección en UNA empresa (política
-- `approvals.thresholds`). Sin fila no cambia nada.
--
--   psql -v company_id=<id de company_profiles> -f set-approval-thresholds.sql
--
-- Efecto: una cotización con total >= COTIZACION.desde no se puede enviar ni aprobar por quien no sea de
-- dirección: se le pide la autorización a dirección (aparece en su bandeja de Aprobaciones con el
-- importe y le llega un aviso) y quien la envió recibe el aviso cuando la resuelve. Igual con las OC
-- (>= PURCHASE_ORDER.desde) al aprobarlas. Dirección (quien puede decidir cualquier paso) no se ve
-- afectada. Los montos se comparan tal cual, en la moneda del documento.
-- Los de abajo son EJEMPLOS: los define Christian.
--
-- Para quitarlo:
--   DELETE FROM system_settings WHERE key = 'approvals.thresholds' AND "companyId" = <id>;
-- El API relee la política cada 30 s.
\set ON_ERROR_STOP on

INSERT INTO system_settings (key, value, category, label, "companyId", "createdAt", "updatedAt")
VALUES (
  'approvals.thresholds',
  '{"COTIZACION":{"desde":250000},"PURCHASE_ORDER":{"desde":25000}}',
  'approvals',
  'Topes de aprobación por monto',
  :company_id,
  now(),
  now()
)
ON CONFLICT (key, "companyId") DO UPDATE
  SET value = EXCLUDED.value, "updatedAt" = now();

SELECT id, key, value, "companyId" FROM system_settings
WHERE key = 'approvals.thresholds' AND "companyId" = :company_id;
