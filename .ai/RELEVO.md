# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-21
- **Rama:** mejora/calidad-y-web

## Hecho

### Pasada UX formularios (tramo 1)
- Nuevo `FormField` / `FormGrid` en `components/ui/FormField` — mismo contrato que Finanzas (hint bajo el control, opcional en etiqueta, error que reemplaza hint).
- Finanzas reexporta `FinanceField`/`FinanceFormGrid` desde ahí (`.ai/DISENO-FINANZAS.md` actualizado).
- Inputs globales (`utilities.scss`): `font-size: 16px` + `min-height` 44px en puntero grueso (anti-zoom iOS).
- Migrados a FormField: viático, vehículo, herramienta, multas (sin emojis/asteriscos).
- Tests verdes: viatics lote, ClientCreation, VehicleCheckout, viatics-reparto (27).

### Alta flotilla + Excel credenciales
(ver turnos previos; flotilla pendiente deploy).

## A medias
- **Más formularios** aún con labels sueltos: `ClientCreationForm`, `MyProfileForm`, `BranchesForm`, `OpsActivityForm`, `VehicleCheckoutForm`, proyectos/clientes/procurement, etc. Misma pieza `FormField`.
- Play Console / deploy web (flotilla + Asignar viático + FormField).
- Documentos nativos / tope cotizaciones / tools.manage.

## No tocar
Puente NAS · keystore Play · `NO TOCAR LIBREMENTE`.
