# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** mejora/calidad-y-web
- **HEAD:** Contabilidad UX llana (no-contador)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

Adam: Contabilidad se veía ineficiente, sucia, poco intuitiva; debía usarla cualquiera sin ser contador.

### Menú
- Etiquetas en tareas humanas: Me deben, Debo pagar, Cuadrar banco, Entradas y salidas…
- Primario siempre visible; el resto en **Más opciones** (pólizas, auditoria, cierres…).

### Hub `/erp/contabilidad`
- Título: «¿Qué hay que hacer hoy?»
- Solo 3 cifras: En el banco / Me deben / Debo pagar
- Tabla de vencimientos → 3 atajos (Cobrar / Pagar / Cuadrar banco)
- Copy de arranque y pasos en español llano
- CTA: «Resolver lo pendiente» / «Ver a quién cobrar»

Sin cambiar rutas ni permisos.

## A medias

- Deploy de este UX a Hetzner.
- Pantallas hijas (facturas, CxC…) aún pueden tener jerga interna — siguiente ola si Adam lo pide.

## Siguiente

1. Deploy + smoke hub Contabilidad.
2. Si sigue «sucio»: limpiar CxC/CxP/facturas con el mismo criterio.

## No tocar

Puente NAS · cotizaciones de prueba.
