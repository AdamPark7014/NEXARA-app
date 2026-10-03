# Plan — Dirección A «Slack clásico»

Construir A y sumarle después las tarjetas de actividad de B. Tamaños: S = 1 día, M = 2-3 días, L = una semana.

## Etapa 1 · Solo front

| # | Cambio | Tamaño |
|---|--------|--------|
| 0 | Partir `WorkspaceChat.tsx` (3,502 líneas) en lista, cabecera, mensajes, redactor e hilo, sin cambiar comportamiento | M |
| 1 | Barra lateral por secciones plegables, «+» visible, no leídos claros; menú del panel colapsado a iconos dentro del chat | M |
| 2 | Cabecera: tema editable en línea, miembros apilados, buscador, menú «⋯»; pestañas Mensajes y Fijados | M |
| 3 | Mensajes: acciones con iconos y tooltip, «Fijado por», fotos de perfil | S |
| 4 | Redactor con barra de formato; listas, citas y bloque de código | M |
| 5 | Diálogo «Crear canal» con tema, descripción e invitados | S |
| 6 | Búsqueda en todos los canales, con resaltado y salto al mensaje | S |

## Etapa 2 · Requiere API

| # | Cambio | Tamaño |
|---|--------|--------|
| 7 | Hilos completos: no leídos, vista «Hilos», «enviar también al canal» | M |
| 8 | Vista «Menciones» y `@canal` | S |
| 9 | Administrar canal: renombrar, descripción, archivar, quitar miembros | M |
| 10 | Varios adjuntos por mensaje y pestaña «Archivos» (migración) | L |
| 11 | Tarjetas de actividad y cotización; pestaña «Actividades» | M |
| 12 | Presencia con estado inicial; favoritos, borradores y «Guardados» en servidor | M |

## Notas

- En la maqueta, «Hilos», «Menciones», «Guardados», «Siguiendo», «Archivos» y «Actividades» son de la etapa 2: hoy no existen.
- La etapa 1 no toca la API ni la app móvil y puede salir sola.
- Cada punto se entrega y se revisa por separado.
