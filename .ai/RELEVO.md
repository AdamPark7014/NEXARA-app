# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-21
- **Rama:** mejora/calidad-y-web

## Hecho

### Alta de vehículos en Flotilla (`/erp/vehiculos`)
- Botón **Agregar** (gated por `vehicles.inventory` / superadmin) → formulario → `POST vehicles/inventory`.
- Helper `crearVehiculoInventario` en `vehiculos-api.ts`; permiso `puedeGestionarInventarioVehiculos` en `recursos-core.ts`.
- Tests verdes: `page.spec.tsx` (5) + `recursos-core.spec.ts` (4).
- **Pendiente deploy** a `core.nexara.com.mx` para que Adam lo vea en prod. CEO con `accesoVehiculos` ya trae el permiso en API.

### Excel de credenciales corregido (con Google Play)
- **Ruta canónica:** `C:\Users\adpoz\Downloads\NEXARA-usuarios-v6.xlsx`
- Copia en repo: `C:\dev\apps\NEXARA-app\NEXARA-usuarios-v6.xlsx`
- Incluye `play.review@nexara.com.mx` / `NexaraPlayReview2026!`.

### Login API — claves verificadas
Contra `https://api.nexara.com.mx/api/auth/login`: cuentas del padrón OK (salvo 429 por rate limit en barridos masivos).

## A medias
- Play Console: Adam sube AAB + capturas + FGS location.
- Documentos nativos / tope cotizaciones / tools.manage.
- Deploy web de la alta de flotilla.

## No tocar
Puente NAS · keystore Play · `NO TOCAR LIBREMENTE`.
