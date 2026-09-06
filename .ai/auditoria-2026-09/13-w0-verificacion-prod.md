# W0 · Verificación P0 en producción (2026-09-06)

## Resultado de sonda (desde fuera)

| URL | Esperado | Obtenido | Estado |
|-----|----------|----------|--------|
| `https://integra.nexara.com.mx/go2rtc/api/streams` | 404 | **200** | NO DESPLEGADO |
| `https://integra.nexara.com.mx/go2rtc/api/config` | 404 | **200** | NO DESPLEGADO |
| `https://integra.nexara.com.mx/go2rtc/video-stream.js` | 200 | 200 | OK |
| `https://api.nexara.com.mx/api/health/live` | 200 | 200 | OK (API vive) |

El parche está en repo (`deploy/traefik/nexara.yml` allowlist de paths) pero **Traefik de producción aún no lo carga**.

## Checklist Adam (obligatorio antes de rotar passwords)

```bash
# En el servidor: recargar config dinámica de Traefik (ruta típica del compose)
# Asegurar que deploy/traefik/nexara.yml es el fichero que lee traefik-main.

curl -s -o /dev/null -w "%{http_code}\n" https://integra.nexara.com.mx/go2rtc/api/streams   # → 404
curl -s -o /dev/null -w "%{http_code}\n" https://integra.nexara.com.mx/go2rtc/api/config    # → 404
curl -s -o /dev/null -w "%{http_code}\n" https://integra.nexara.com.mx/go2rtc/video-stream.js
curl -s -o /dev/null -w "%{http_code}\n" "https://integra.nexara.com.mx/go2rtc/api/frame.jpeg?src=cam_..."

# Redeploy API/web con compose nuevo (healthchecks, MAX_FILE_SIZE, timeouts)
# ./deploy/nexara.sh update --with-migrate   # o el flujo habitual
```

1. Desplegar Traefik dinámico + API/web.
2. Confirmar streams/config → 404.
3. **Entonces** rotar passwords de cámaras.
4. Hard refresh dashboard David (móvil): sin 502 keep-alive.
5. Subir foto 6–8 MB desde app.

## Código listo en rama (sin prod)

- `deploy/traefik/nexara.yml` — filtro go2rtc + healthChecks + aliases
- `deploy/docker-compose.nexara.yml` — healthchecks, env
- `apps/api/src/main.ts` — timeouts 120s/95s
- `Dockerfile.api` — sin migrate en CMD
