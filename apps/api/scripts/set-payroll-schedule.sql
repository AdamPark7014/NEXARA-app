-- Define cuándo cierra la nómina de UNA empresa (política `payroll.schedule`).
-- Con esto el resumen matutino del CEO («Tu día») avisa el día siguiente al corte que la pre-nómina
-- está lista, y dos días antes del corte que se acerca. Sin fila no se avisa nada de nómina.
--
--   psql -v company_id=<id de company_profile> -f set-payroll-schedule.sql
--
-- Frecuencias:  quincenal (cortes el 15 y el último día) · mensual · semanal (por omisión viernes;
-- agrega "diaSemanaCorte": 0=domingo … 6=sábado). Para quitarla:
--   DELETE FROM system_settings WHERE key = 'payroll.schedule' AND "companyId" = <id>;
\set ON_ERROR_STOP on

INSERT INTO system_settings (key, value, category, label, "companyId", "createdAt", "updatedAt")
VALUES (
  'payroll.schedule',
  '{"frecuencia":"quincenal"}',
  'payroll',
  'Calendario de nómina',
  :company_id,
  now(),
  now()
)
ON CONFLICT (key, "companyId") DO UPDATE
  SET value = EXCLUDED.value, "updatedAt" = now();

SELECT id, key, value, "companyId" FROM system_settings
WHERE key = 'payroll.schedule' AND "companyId" = :company_id;
