# Auditoría del chat de NEXARA Core

Leído en código el 02-10-2026. **WC** = `apps/web/components/WorkspaceChat.tsx`, **svc** = `apps/api/src/chat/chat.service.ts`, **ctl** = `chat.controller.ts`, **gw** = `realtime/realtime.gateway.ts`.

## Lo que ya hace (verificado)

- Canales públicos y privados; `#general` y `#anuncios` automáticos (svc:92-105, 495-534).
- Mensajes directos 1 a 1 (svc:540).
- Hilos en panel lateral (WC:2864-2886; svc:732-738).
- Reacciones y «quién reaccionó» (WC:56, 1964-2007, 3422).
- Menciones `@persona` con aviso y push (svc:909-945); menciones de actividad y evidencia (svc:1100-1224).
- Acuses enviado/entregado/visto y «Visto por» (ctl:176-203; WC:3367).
- Fijados (ctl:114, 233; WC:2392-2472).
- Adjuntos de 20 MB, pegar y arrastrar (ctl:272; WC:2570, 2662).
- No leídos con contador y divisor «Mensajes nuevos» (svc:379-390; WC:1849).
- Presencia y «está escribiendo» (gw:172-210; WC:1141-1146).
- Silenciar, favoritos y borradores (svc:1352; WC:149-150).
- Selector Ctrl+K (WC:3308) y enlace directo `?channel=&msg=` (WC:542-548).
- Edición durante 1 hora; borrado solo del CEO (svc:1246, 1429).
- Notificación de navegador, sonido y push al teléfono (WC:681-715; svc:824).
- Supervisión jerárquica en solo lectura (svc:309-326).
- Formato en línea: negrita, cursiva, código, enlaces (WC:381-432).

## Huecos funcionales (piden API)

1. **Administrar canal**: no existe renombrar, archivar, editar descripción ni quitar miembros; solo tema, invitar y salir (ctl:75-102).
2. **Hilos a medias**: las respuestas no cuentan como no leídas (svc:385); sin vista «Hilos» ni «enviar también al canal».
3. **Sin `@canal`**: solo se avisa a `user:ID` (svc:898-906).
4. **Un adjunto por mensaje** (`schema.prisma`:6335); sin pestaña de archivos.
5. **Presencia frágil**: el servidor solo retransmite (gw:195-210); quien entra no sabe quién ya estaba en línea.
6. **Sin tarjetas**: la actividad mencionada es un enlace sin estado (WC:400-405); las cotizaciones no se pueden mencionar (svc:1103).
7. **Favoritos y borradores viven en el navegador** (WC:149-150): no pasan al teléfono.
8. Silencio sin duración (svc:1362), sin DM de grupo (svc:536), sin guardados.

## Huecos visuales y de uso (solo front)

1. **Cabecera sin jerarquía**: nueve controles que mezclan texto e iconos, «Sonido», «Silenciar», «Buscar», «Miembros», «Salir» (WC:2356-2446).
2. **Acciones del mensaje como texto**: «Responder», «Editar», «Info», «Eliminar» (WC:2049-2100).
3. **Diálogos del navegador**: tema con `window.prompt`, salir con `window.confirm` (WC:1643, 1673).
4. **Crear canal incompleto**: la API acepta tema y descripción (ctl:46), el diálogo no los pide ni deja invitar (WC:1549-1555).
5. **Barra lateral**: «Buscar» y «Mensaje» son botones de texto, el «+» mide 15 px, sin secciones plegables (WC:2232-2304).
6. **Búsqueda corta**: solo el canal abierto (WC:1632) aunque la API busca en todos (svc:1522); sin resaltado; no salta a mensajes no cargados (WC:2494-2500) pese a existir `aroundId` (ctl:129).
7. **Historial manual**: botón «Cargar anteriores» (WC:2516-2525).
8. **Redactor sin barra de formato**, sin listas, citas ni bloques de código (WC:381).
9. **Avatares con iniciales** aunque la API entrega `avatarUrl` (svc:33-38; WC:1869).
10. **Fijados** sin autor (WC:2450-2472); miembros sin buscador y con «Owner» en inglés (WC:2843).
11. **Un archivo de 3,502 líneas**: conviene partirlo antes de rediseñar.

## Lectura

La base funcional es sólida para 17 personas. Lo que se siente poco profesional es casi todo presentación, y eso no requiere tocar la API.
