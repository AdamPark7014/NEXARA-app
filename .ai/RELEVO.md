# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — UI general Integra (ops chrome)

Polish de consola SOC. **No** reescritura pesada de Personas CRUD (sibling).
Tokens compartidos: CSS + `inputStyle`/`selectStyle`.

### Qué cambió

1. **`integra.module.css`**: densidad ops (radios 6/4), toolbar/paneles
   compactos, botones flat, `--ig-focus` en inputs/botones (vale para Personas).
2. **`_Console`**: `IgNotice`, `IgEmptyState`; empties en tabla/tree/feed.
3. **`error.tsx` / `loading.tsx`**: clases del módulo (sin inline genérico).
4. **`_IntegraChrome`**: KPI en español; barra de contexto más densa.
5. **Access**: ES, checklist, empty puertas, tones en equipos.
6. **AppShell Integra**: nav SOC (active inset, menos glow).
7. **Video**: solo chrome compartido; **PTZ/`ptzChrome` intacto**.

### Concurrente en la rama (siblings — no pisar)

- Playback NVR XML+go2rtc verificado (`599330d` / docs).
- Personas delete/alta/UI control personal (`b71eed5` + rescates).
- PTZ pad arriba + continuous (`6137c32` / `fb65c10`).

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app`

Verificar: barra sitio + nav; Access empty/notice; Video PTZ arriba + playback
24h; Personas focus ring compartido.

## A medias

1. Portal empleado · httpHost NVR · ANPR ITC · micros · TCPMSS.
2. Re-aplicar FieldDetection en equipos tras sync/push install.

## No tocar

Puente NAS, Traefik, credenciales en repo, rutas ISAPI no verificadas.
Face ID óptico inventado sobre AcuSense.
No pelear pad PTZ ni reescribir Personas CRUD del sibling.
