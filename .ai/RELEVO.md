# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-18
- **Rama:** mejora/calidad-y-web
- **HEAD:** 9ac41ade (+ este commit de relevo) — desplegado en Hetzner (prueba) hasta 9ac41ade

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno (claude-code, 18-09) — requisitos «Tareas/Dashboard» y cotizaciones

Requisitos de Adam: tabla «Tareas/Dashboard» (evidencia, aceptación, periodo, KPIs) +
`Downloads/Primera cotizacion  (1).pdf` (referencia del PDF) + `Downloads/gantt_seguimiento_proyectos (1).xlsx`
(hoja «Desarrollo») + `Downloads/V1_Nomenglaturas_Nexara.xlsx`. Entrega de avances: viernes 18-09.

### Integrado y desplegado

1. **PDF de propuesta** (`2235edec`): rehecho en vectores (Adam NO quiere la portada con captura del video
   público), con todos los campos de su referencia: portada (cliente/proyecto/folio/fecha/versión, índice 01–04),
   01 objetivo (intro + beneficios + cierre), 02 alcance (título + intro + subsecciones con viñetas), 03 planos a
   página completa, 04 cotización (datos empresa, cliente, N°, emisión, validez, tabla, subtotal/IVA/total,
   términos con etiqueta, firma). Sin filas de subtotal por grupo (como la referencia). «Página n de N».
   Correo: usa el perfil de empresa (en el servidor dice `contacto@`; la referencia `gerencia@`).
2. **Logo en todos los PDFs de producción** (`6a1ffeb0`): `loadPdfAsset` busca junto al build.
3. **Solo «Iniciar actividad»** (`ebf98b4d`): `POST me/activities/:id/iniciar` sella `inicioRealAt`;
   `aceptar` es alias; `rechazar` → 403 para el asignado. Web/Android/iOS sin «No puedo tomarla».
4. **Periodos** (`9ac41ade`, migración `20260918120000_actividades_periodo` APLICADA): `periodoInicio/Fin`,
   «Día N de M», SLA/semáforo contra fin de periodo, asistencia acepta la sucursal todo el periodo,
   `GET/POST /proyectos/:id/programacion|programar-actividades`, rango «Del/Al» en asignar.
5. Antes en el turno: `/api/proyectos` + `/erp/proyectos`, evidencia por campos (web + apps alineadas al
   contrato), fix `RefObject` del build web, fix tenencia al crear proyecto. Otra sesión dejó la web en verde
   (`62b3bb93`, 744/744 vitest) — detalle en su commit.

### En curso (agentes retomados tras límite de uso; ramas sin mergear)

- `feat/cotizaciones-ui-nueva` — editor tipo documento con las secciones del PDF, vista previa, enviar por
  correo, folio explicado, `scripts/refoliar-borradores.js` (NO correr sin revisar; los 12 borradores del
  servidor tienen folio viejo `NXR-2026-…`).
- `feat/kpis-dashboard` — retardos, uniforme (campo nuevo por checada que marca el jefe), horas laboradas vs
  productivas, inactividad, en `/erp`.

### Pendiente / conocido

- **Puestos sin Core** (pregunta para Adam): `dir_operaciones`, `coord_admin`, `coord_ventas`, `vendedor`,
  `disenador`, `rh`, `contabilidad` no abren `/erp/pizarra` ni `/erp/asistencias` con Core-only.
- **Google Maps**: sin cuenta de facturación activa; clave web sin restricción de aplicación; Android usa otra
  clave (`local.properties`); no borrar la vieja. Memoria `nexara-google-maps-claves`.
- `activities.controller.spec.ts` («scopes an ops manager…») falla desde antes: su prisma falso no trae `user`.
- Proyectos API: al cambiar responsable queda el anterior como RESPONSABLE; PLANNED→ACTIVE no pone
  `actualStartDate`; borrar documento no borra el archivo.
- El flujo de evidencia del navegador no sabe de campos (solo apps). iOS: cambios de hoy sin compilar.
- Revisión visual en web pendiente: Adam debe iniciar sesión él (no se escriben contraseñas).

### No tocar

Puente NAS.
