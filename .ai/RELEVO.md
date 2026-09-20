# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/hard-pdf
- **HEAD:** (este commit)
- **Worktree:** `C:\dev\apps\_worktrees\nexara-hard-pdf`

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno (hard-pdf)

1. **PDFViewer** reescrito con pdf.js directo (sin `@react-pdf-viewer` / sin `defaultScale = dpr*0.85`).
2. **HiDPI:** `devicePixelRatio` completo, tope **3**; CSS = px lógicos; backing store = zoom×dpr + `setTransform`.
3. **Zoom** − / % / + (0.5–3, paso 0.25, reset 100%). Download + abrir fuera se mantienen.
4. **Alturas:** VisorPdf default **700px** (+ tipo `800px`); EvidenceFlow ya 700; pizarra ficha **500px** (antes 400).

## Verificado

- Sin specs de PDFViewer en el repo.
- `tsc` del worktree sin `node_modules` locales (solo error de types `node`); código alineado a `VistaPrevia`.

## Siguiente

- QA visual retina/móvil en hoja de servicio (Equipo + flujo evidencias).
- Merge `feat/hard-pdf` → `mejora/calidad-y-web` cuando Adam pida.

## No tocar

Puente NAS. API/Prisma. Contratos VisorPdf (`url` + `alto`).
