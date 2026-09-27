# Política de módulos por empresa

La matriz de roles (`apps/api/src/common/rbac/url-matrix.ts`, `apps/web/lib/access-matrix.ts`) es
**global**: cambiarla afecta a todas las empresas del ERP. Cuando una sola empresa necesita cerrar un
módulo más que las demás se usa esta política, que vive en la base como un `SystemSetting` con
`companyId` y **no toca a nadie más**.

- Clave: `rbac.module_roles` · categoría `rbac`.
- Valor: JSON `{ "<módulo>": ["<rol>", …] }`. Sin fila = comportamiento de siempre.
- Solo **restringe**: un rol que la matriz global no deja entrar sigue sin entrar. El super admin
  (equipo de desarrollo) nunca queda fuera.
- Módulos que se pueden reservar hoy (`RESTRICTABLE_MODULES` en `common/tenant/module-policy.ts`):
  `employee-payments` («Pagos a personal»).

## Qué corta cuando un módulo está reservado

| Capa | Comportamiento |
|---|---|
| API `employee-payments/*` | 403 en español («…está restringido en esta empresa») en listado, alta, edición, borrado, marcar pagado, analítica, PDF y `calculate-from-attendance`. |
| API `pre-nomina` (+ Excel) | Las horas siguen para RH y contabilidad; los montos capturados no se consultan (`montosOcultos: true`) y el Excel quita la columna «Pagos capturados». |
| `GET /api/me/navigation` | Quita el módulo de `webModuleIds` y `moduleKeys` (menú de Android/iOS) y lo declara en `hiddenModuleIds`, que en la web gana sobre comodines como `/erp/finance/**`. |
| Web | Menú, paleta de comandos, riel de Finanzas, atajo del inicio de RH y la propia pantalla (aviso claro). |

La facturación (`invoicing`) **no** cambia.

## Activar / quitar en una empresa

```bash
docker exec -i <contenedor-db> psql -U <usuario> -d <base> -v company_id=<id> -f - < apps/api/scripts/set-module-policy.sql
```

Ajusta los roles editando el JSON del script. Para quitar la restricción:
`DELETE FROM system_settings WHERE key='rbac.module_roles' AND "companyId"=<id>;`

## Agregar otro módulo

1. Añádelo a `RESTRICTABLE_MODULES` (ids web y de apps).
2. Llama `policy.exigir('<módulo>', user, companyId)` al inicio de sus endpoints (dentro del
   endpoint, no en un guard: la empresa la resuelve el `TenantInterceptor`, que corre después de los guards).
3. Si la web lo muestra en atajos sueltos, filtra con `useHiddenModuleIds()`.
