# 07 · Permisos de la API (guards, matrices, agujeros)

**Auditoría 2026-09 · área: API RBAC**  
Completado en el turno de remediación (hallazgos verificados + parches Wave 1–2).

## Cómo se aplica el acceso

| Capa | Mecanismo | Archivo |
|------|-----------|---------|
| JWT | `AuthGuard('jwt')` / `RbacGuard` | `apps/api/src/common/rbac.guard.ts` |
| Matriz URL | `URL_MATRIX` + `checkUrlAccess` | `apps/api/src/common/rbac/url-matrix.ts` |
| Permisos | `@RBAC({ permissions })` | mismo guard |
| Tenant | `X-Company-Id` → `TenantInterceptor` | `tenant.interceptor.ts` |

Las tres “fuentes de verdad” (web `access-matrix`, web `page-matrix`, API `url-matrix`) **no se importan entre sí**.

## Hallazgos P0 (parcheados en Wave 1)

1. **Approve/reject de evidencias** aceptaba `reviewerId` del body sin comprobar `EVIDENCES_REVIEW`. Field roles con POST a `/api/activity-evidence/**` podían auto-aprobar.
   - Fix: reviewer = JWT; `@RBAC({ permissions: [EVIDENCES_REVIEW] })`.
2. **`GET /api/metrics`** sin auth (Prometheus/JSON públicos vía Traefik).
   - Fix: token de scrape o red privada; `/metrics/json` → JWT + StaffOnly.

## Hallazgos P1 (parcheados)

- Chat y `mobile/crm` eran JWT-only → ahora `StaffOnlyGuard` + `RbacGuard`.
- Create/update usuario no sincronizaba `roleKey` (comentario a PATCH inexistente) → sync desde `Role.orgRoleKey`.
- Rate-limit usaba `X-Forwarded-For[0]` spoofable → ahora `req.ip` con `trust proxy = 1`.
- CORS omitía `X-Company-Id` / `Idempotency-Key` → añadidos.

## Pendiente estructural

Unificar matrices (API `url-matrix` + `GET /me/navigation` para web/móvil) en ola futura.
