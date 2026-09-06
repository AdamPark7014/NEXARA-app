# 09 · Deriva de contrato móvil ↔ API

**Auditoría 2026-09 · área: contrato Android/Nest**  
Completado en el turno de remediación.

## Paths OK, comportamiento roto (antes)

| Cliente | Servidor | Problema |
|---------|----------|----------|
| `GET activities` / `viatics` | Controllers matching | Sin `take` → payloads enormes / 502 |
| `POST attendance` | `CreateAttendanceDto` | Foto opcional en API; ausente en Android |
| `activity-evidence/*` | Matching | GPS `0,0` pasaba; approve con `reviewerId` cliente |
| Offline queue | Idempotency interceptor API | Android no mandaba `Idempotency-Key` |
| `DELETE devices/push-token` | No existe en API | Contract break (sigue abierto) |
| URL hardcode `consola.nexara.com.mx` | Host sin HTTPS router | Evidencias “abrir en web” roto |

## Parches aplicados (Wave 0–3)

- Tope `take: 200` en listados activities/viatics.
- Timeouts Node alineados (408 honesto, no 502 keep-alive).
- Foto asistencia obligatoria (DTO + UI con cámara).
- Lunch en `America/Mexico_City` vía `workday.ts`.
- GPS `0,0` rechazado en salida de evidencias.
- Offline: cache por hash de token, multipart binario, Idempotency-Key, clear cache on logout.
- Compresión JPEG en `ImageDataUrl`.
- URL evidencias → `WebPanelUrl` / `core.nexara.com.mx`.

## Sigue abierto

- `DELETE devices/push-token` declarado en Android, ausente en API.
- Android aún no envía `X-Company-Id` (multi-tenant frágil).
- MFA mapeada como password incorrecta; no hay `session/extend` en cliente.
- Paridad INTEGRA móvil = 0 % (informe 05).
