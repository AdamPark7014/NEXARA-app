# Native parity matrix (apps/mobile → apps/mobile-native)

Esta matriz es el checklist de **paridad** para poder eliminar `apps/mobile` (Next/Capacitor) y quedarnos con:

- `apps/api` (backend)
- `apps/web` (panel web)
- `apps/mobile-native` (apps nativas Android+iOS)

## Reglas / definiciones
- **Parity**: misma capacidad funcional (aunque el UI sea diferente), con las mismas reglas de acceso (RBAC/jerarquía).
- **Portal**: cuentas cliente/sucursal (tickets/inventarios/solicitudes) como en `apps/mobile/lib/panel-routing.ts`.
- **Realtime**: Socket.IO (`apps/api/src/realtime/realtime.gateway.ts`) para invalidar/refrescar.
- **Offline**: cache GET + cola de mutaciones con replay (equivalente a `apps/mobile/lib/install-offline-fetch.ts` + `offline-queue.ts`).

## Panel hub / Auth (core)
| Feature | Mobile web (`apps/mobile`) | Android native | iOS native |
|---|---|---|---|
| Login | `app/(auth)/login` | ✅ `ui/screens/LoginScreen.kt` | ⬜ |
| Panel hub (/paneles) + access rules | `lib/panel-routing.ts` | ✅ `ui/screens/PanelHubScreen.kt` (reglas similares) | ⬜ |
| Session store (token, perms) | `UserContext` (session/localStorage) | ✅ `EncryptedSharedPreferences` (`data/SessionStore.kt`) | ⬜ |
| Saved accounts | `lib/saved-accounts.ts` | ⬜ | ⬜ |
| Deep links to screens | (URL routing) | ⬜ | ⬜ |

## Panel: Console
| Screen / capability | Mobile route | Android native | iOS native |
|---|---|---|---|
| Dashboard | `/console/dashboard` | ✅ `ConsoleDashboardScreen` | ⬜ |
| Activities (admin) | `/console/activities` | ✅ | ⬜ |
| My activities | `/console/my-activities` | ✅ | ⬜ |
| Evidences (admin/user) | `/console/evidences`, `/console/my-evidences` | ✅ | ⬜ |
| Viatics | `/console/viatics` | ✅ | ⬜ |
| Vehicles | `/console/vehicles` | ✅ | ⬜ |
| GPS | `/console/gps` | ✅ | ⬜ |
| Tools hub + inventory + my-kit + renewals + kits-users | `/console/tools/*` | ✅ | ⬜ |
| Clients | `/console/clients` | ✅ | ⬜ |
| Projects | `/console/projects` | ✅ | ⬜ |
| Users | `/console/users` | ✅ | ⬜ |
| Attendance | `/console/attendance` | ✅ | ⬜ |
| Settings (console.admin) | `/console/settings` | ✅ | ⬜ |
| Notifications topbar | (varios) | ⬜ | ⬜ |
| Offline + realtime parity | (global) | ⬜ | ⬜ |

## Panel: Tickets (Portal cliente/sucursal)
| Capability | Mobile route | Android native | iOS native |
|---|---|---|---|
| Portal home | `/tickets` | ✅ | ⬜ |
| Profile view/update | tab Perfil | ✅ | ⬜ |
| Branches list/create/edit + logo upload | tab Sucursales | ✅ | ⬜ |
| Requests list/create | tab Nuevo/Solicitudes | ✅ | ⬜ |
| Tickets list/detail | tab Tickets | ✅ | ⬜ |
| Ticket report PDF | ticket modal/descarga | ✅ | ⬜ |
| Close request | (acción) | ⬜ | ⬜ |
| Feedback pending + submit | (feedback modal) | ⬜ | ⬜ |
| Inventories (list/detail/sync/upload/report) | tab Inventarios | ⬜ | ⬜ |
| Portal report PDF | `/client-portal/report` | ⬜ | ⬜ |
| Realtime refresh (`entity:updated`) | Socket.IO | ⬜ | ⬜ |
| Offline queue/cache | Offline layer | ⬜ | ⬜ |

## Panel: Ventas
| Screen / capability | Mobile route | Android native | iOS native |
|---|---|---|---|
| Dashboard | `/ventas/dashboard` | ⬜ | ⬜ |
| Leads | `/ventas/leads` | ⬜ | ⬜ |
| Oportunidades | `/ventas/oportunidades` | ⬜ | ⬜ |
| Clientes | `/ventas/clientes` | ⬜ | ⬜ |
| Cotizaciones (view/pdf) | `/ventas/cotizaciones` | ⬜ | ⬜ |
| Reportes + notificaciones | `/ventas/reportes`, `/ventas/notificaciones` | ⬜ | ⬜ |

## Panel: Contabilidad
| Screen / capability | Mobile route | Android native | iOS native |
|---|---|---|---|
| Dashboard | `/contabilidad/dashboard` | ⬜ | ⬜ |
| Pagos | `/contabilidad/pagos` | ⬜ | ⬜ |
| Viáticos | `/contabilidad/viaticos` | ⬜ | ⬜ |
| Multas | `/contabilidad/multas` | ⬜ | ⬜ |
| Banking / invoicing / reports | varios | ⬜ | ⬜ |

## Panel: Web
| Screen / capability | Mobile route | Android native | iOS native |
|---|---|---|---|
| Dashboard | `/web/dashboard` | ⬜ | ⬜ |
| Clientes | `/web/clientes` | ⬜ | ⬜ |
| Proyectos | `/web/proyectos` | ⬜ | ⬜ |
| Contactos | `/web/contactos` | ⬜ | ⬜ |
| Noticias | `/web/noticias` | ⬜ | ⬜ |

## Cross-cutting
| Feature | Mobile web | Android native | iOS native |
|---|---|---|---|
| Notifications inbox + badge | `apps/api/src/notifications` | ⬜ | ⬜ |
| Socket.IO realtime | `apps/api/src/realtime` | ⬜ | ⬜ |
| Offline GET cache | `install-offline-fetch.ts` | ⬜ | ⬜ |
| Offline mutation queue + replay | `offline-queue.ts` | ⬜ | ⬜ |
| Camera/gallery uploads | evidences/ventas opp | ⬜ | ⬜ |
