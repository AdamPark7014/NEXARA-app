# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-03
- **Rama:** mejora/calidad-y-web

## Arranque

```
git fetch origin && git log --oneline HEAD..origin/mejora/calidad-y-web
```

Este turno empezó **7 commits detrás de origin** (MSE LivePlayer + stagger HLS +
CSP). Se hizo merge limpio antes de tocar nada. Los `.tmp-*.sh` del turno
anterior se salvaron con `relevo.ps1 salvar`.

## Puente — no cambiar

**NAS Synology `192.168.9.32`** / Tailscale `nas-nexara` (`100.71.203.3`)
anuncia `192.168.9.0/24`. **No volver a anunciar la misma ruta desde la
laptop.** Sitio `#1 Oficinas NEXARA`, empresa **2**, provider ISAPI,
`host http://192.168.9.34`.

## Qué se hizo en este turno (cursor)

### 1. Muro anti-trabado sobre MSE

Claude ya dejó `_LivePlayer.tsx` (MSE / `<video-stream>` de go2rtc). El stagger
`startDelayMs` se había perdido al cambiar de HLS → MSE. Ahora:

- `startDelayMs` + cupo **máx. 6 vivos** en muro (resto «En cola»; clic en
  mosaico lo prioriza al seleccionar).
- `IntersectionObserver`: fuera de viewport cierra el WebSocket.
- Muro y Foco **ambos montados**; al cambiar de vista solo se oculta (`hidden`),
  así no se reconstruyen 9 WS al volver.
- Home console también usa `IntegraLivePlayer` para live (playback histórico
  sigue en HLS empaquetado).

Archivos: `_LivePlayer.tsx`, `video/page.tsx`, `page.tsx`, `integra.module.css`.

### 2. Personas: más datos en API + UI profesional

`listPeople` (espejo y live ISAPI) ahora expone: `gender`, vigencia
(`validEnable/From/To`), `doorRight`, `rightPlan`, contadores face/FP/card,
`faceUrl`, `userType`, `sourceIp` — mapeados desde `UserInfo` / `raw` sin
inventar rutas ISAPI.

- `GET /api/integra/people/:id` en ISAPI lee el espejo (ficha completa).
- `GET /api/integra/people/:id/face` — proxy Digest de `faceURL` (bytes, sin
  guardar biométricos en DB). El front descarga con `X-Company-Id` vía blob.
- UI `/integra/people`: directorio con avatar, chips de credenciales, vigencia,
  filtros; ficha ISAPI con foto y hechos (no JSON crudo).

**Legal (sigue vigente):** mostrar foto por proxy sí; **no** copiar plantillas
biométricas (`modelData`) a nuestra base.

## Contexto previo que sigue valiendo

- Cliente ISAPI con pooling `maxSockets: 1` por túnel (`7270143`).
- go2rtc config en `/var/lib/nexara/go2rtc` (no en git) (`ef22944`).
- Sub-stream H.264 para el muro; principal H.265 no se tocó (`0a53899`).
- MSE reproduce solo; HLS no autoplayeaba bien en Chrome (`aed6c6c`).
- Personas/eventos sync ISAPI ya existía (`981f1e1`); lo que faltaba era el DTO
  rico y la UI.

## A medias

- **Desplegar** este turno a producción y verificar muro 4/9 + fotos de las ~21
  personas.
- Eventos ACS en consola: sync existe; pulir UI de eventos si hace falta.
- Quitar reglas TCPMSS sobrantes en el servidor (no persistentes).
- `init: true` en compose de biblioteca (zombis).
- Actualizar Tailscale del NAS (1.58.2).
- Renombrar empresas 1/2 en prod — falta confirmación de Adam.
- TwoWayAudio / FaceData Search / CardInfo Search: **no implementados**; no
  inventar rutas fuera de `docs/INTEGRA-LAN.md`.

## No tocar

- tickets layout, seed-demo-users, package-lock, xlsx
- Oficinas ACS, PortalShell rewrite, Meta/ESP, OFX
- `key.properties` / keystore
- `ModuleEntry.webPath`
- **No inventar rutas ISAPI** — verificadas en `docs/INTEGRA-LAN.md`
- **No meter credenciales de equipos en el repo**
- **No mover Traefik de puerto** (ADR-0020)
- **No cambiar el puente NAS** por la laptop u otro nodo
- Disco del servidor compartido con ~28 contenedores ajenos

## Siguiente paso

1. Deploy + smoke: muro 4 vivos fluidos; muro 9 con ≤6 vivos y cola; Personas
   con fotos tras «Sincronizar terminales».
2. TCPMSS / biblioteca `init: true` / Tailscale NAS.
3. Decidir empresas 1 vs 2 con Adam.

## Mobile / Play — ENVIADO A REVISIÓN (31-08-2026)

Sin cambios. Producción 5 (1.0.0) `c8bccea`. Cuidado con
`seed:play-reviewer` sin `PLAY_REVIEWER_PASSWORD` (rota la clave de Play).
