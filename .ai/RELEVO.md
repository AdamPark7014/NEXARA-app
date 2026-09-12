# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — PhoneField profesional (+52 / bandera)

### Hecho

1. Componente `apps/web/components/PhoneField.tsx` + CSS: bandera, prefijo país, default **MX (+52)**, máscara/dígitos por país (`react-phone-number-input`), valor E.164.
2. Helpers `isValidNexaraPhone` / `toE164Phone`.
3. Cableado en creación/edición de teléfonos:
   - ERP: clientes/nuevo, my-profile, ClientCreationForm, MyProfileForm
   - CRM: leads, clients datos/legacy, quotes edit, CtOrderPanel, templates
   - OPS: service-clients
   - INTEGRA: visitors
   - Público: contacto, FloatingContactForm, ContactFormToggle
   - Tickets portal, ActivityEvidenceFlow, OrderTemplatesManager
4. Dep: `react-phone-number-input` en `apps/web`.

### Verificar

1. Hard refresh → `/erp/clientes/nuevo?sector=proyecto`
2. Campo Teléfono: bandera MX, `+52`, solo dígitos válidos para el país.
3. Cambiar a US/otro → cambia prefijo y longitud.
4. Crear cliente / lead / perfil con teléfono → se guarda E.164.

### A medias

Nada.

### Siguiente

Lo que Adam diga.

### No tocar

Puente NAS. Plan files.
