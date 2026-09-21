# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-21
- **Rama:** mejora/calidad-y-web

## Hecho

### Excel de credenciales corregido (con Google Play)
- **Ruta canónica:** `C:\Users\adpoz\Downloads\NEXARA-usuarios-v6.xlsx`
- Copia en repo: `C:\dev\apps\NEXARA-app\NEXARA-usuarios-v6.xlsx`
- Incluye `play.review@nexara.com.mx` / `NexaraPlayReview2026!` (Play Review Demo Account).
- El v4 que Adam tenía abierto (18/09) tenía esa celda vacía; también se le rellenó en Downloads.

### Login API — claves verificadas
Contra `https://api.nexara.com.mx/api/auth/login`:
- En la pasada completa previa al rate limit: 18 cuentas OK (todas las del padrón salvo variantes mal de Daniela).
- Tras cooldown: `play.review`, `daniela.hernandez` (`Pemijo-Sopogi-4354%`), gerencia, finanzas, jose.ramirez → OK.
- Un barrido final a 19 reventó el rate limit (429) a mitad; no es contraseña mala.
- El correo correcto es `joan.sanchez@` (no `juan.sanchez@`).

### Generador
`scripts/generate-credentials-xlsx.js` regenera `NEXARA-usuarios-v6.xlsx` (repo + Downloads).

## A medias
- Play Console: Adam sube AAB + capturas + FGS location.
- Documentos nativos / tope cotizaciones / tools.manage.

## No tocar
Puente NAS · keystore Play · `NO TOCAR LIBREMENTE`.
