# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-03
- **Rama:** mejora/calidad-y-web

## Arranque

```
git fetch origin && git log --oneline HEAD..origin/mejora/calidad-y-web
```

## Puente — no cambiar

**NAS Synology `192.168.9.32`** / Tailscale `nas-nexara` (`100.71.203.3`)
anuncia `192.168.9.0/24`. No anunciar la misma ruta desde la laptop.

Sitio `#1 Oficinas NEXARA`, empresa **2**, ISAPI `http://192.168.9.34`.

## Qué pasó con el muro (captura 23:20)

Producción en el servidor estaba en `dd25400` (stagger HLS) — **sin** MSE ni
los fixes de cupo/cola. Por eso la captura seguía con badges «MURO» y 4/9
mosaicos con el play azul nativo.

Causa del play azul (además del deploy atrasado): go2rtc `video-rtc` crea el
`<video>` con `controls=true` y `media=video,audio`. Con audio, Chrome bloquea
autoplay; el control nativo aparece. Con 9 MSE a la vez el decodificador se
satura.

### Arreglo (este turno, por desplegar)

- `media="video"` + `muted` forzado + `controls=false` + reintentos de `play()`
- Tope de vivos en muro bajado a **4** (stagger 900 ms); el resto «En cola»
- CSS oculta controles nativos de go2rtc
- Personas: DTO rico + proxy face + UI ficha (commits previos en la rama)

SSH deploy: `ssh -i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109`
ruta `/var/www/nexara-app`.

## A medias

- **Desplegar** esta rama a producción (web + api) y verificar muro 4 vivos
  sin play button; Personas con fotos.
- TCPMSS sobrantes / biblioteca `init: true` / Tailscale NAS 1.58.2
- Renombrar empresas 1/2 — confirmación Adam
- No inventar FaceData/CardInfo/TwoWayAudio fuera de `docs/INTEGRA-LAN.md`

## No tocar

- tickets layout, seed-demo-users, package-lock, xlsx
- Oficinas ACS, PortalShell, Meta/ESP, OFX, keystore
- `ModuleEntry.webPath`
- Credenciales de equipos en el repo; Traefik ports; puente NAS

## Siguiente paso

1. Push + `deploy/update.sh` (o build web+api) en Hetzner.
2. Soft refresh en `/integra/video` con layout 2×2; luego probar 3×3 (4 vivos + cola).
3. Sync personas y abrir ficha con foto.

## Mobile / Play

Sin cambios. Producción 5 `c8bccea`.
