# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-30
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### Integra = mismo AppShell que CRM/ERP
- Quitado `data-console` / full-bleed: vuelve **sidebar + topbar** NEXARA (breadcrumbs, company, rol, paneles, ⌘K, notifs).
- `IntegraChrome` reducido a **barra de contexto** (health + SiteSwitcher + Sync); sin HUD paralelo.
- Sidebar: grupos Consola / Administración; home label "Ops".
- **Cliente** (`role=cliente`): empty state distinto (sin CTA Sitios/admin); sin botón Sync.

## A medias
- Deploy `--force-all` tras cierre.

## No tocar
- tickets layout, seed-demo-users, package-lock, xlsx
- Oficinas ACS

## Siguiente paso
1. Deploy + hard-refresh.
2. Comparar visual Integra vs CRM/ERP lado a lado.

## Estado
- Shell homologado listo para cerrar + deploy.
