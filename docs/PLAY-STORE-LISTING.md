# Ficha de Play Store — NEXARA (móvil)

Documento de referencia para completar la ficha pública en [Google Play Console](https://play.google.com/console).
Complementa [`PLAY-STORE-CHECKLIST.md`](./PLAY-STORE-CHECKLIST.md) (cuenta, firma, AAB, credenciales demo).

| Campo | Valor |
|---|---|
| Package (inmutable) | `mx.nexara.mobile.nativeapp` |
| Nombre de la app | NEXARA |
| Idioma predeterminado | Español (Latinoamérica) |
| Categoría | Empresa (Business) |
| Sitio web | https://nexara.com.mx |
| Política de privacidad | https://nexara.com.mx/legal/privacidad |
| Eliminación de cuenta | https://nexara.com.mx/legal/eliminar-cuenta |

---

## Assets gráficos

Ubicación: `apps/mobile-native/play-assets/` — dimensiones y checklist: [`ASSETS-README.md`](../apps/mobile-native/play-assets/ASSETS-README.md).

| Archivo | Estado | Uso en Play Console |
|---|---|---|
| `icon-512.png` | ✅ Presente | Icono de la ficha (512×512 px, PNG opaco) |
| `feature-graphic-1024x500.png` | ✅ Presente | Gráfico destacado (1024×500 px, obligatorio) |
| `screenshots/` | ❌ Pendiente | Capturas de teléfono (ver checklist abajo y [`PLAY-SCREENSHOTS-GUIDE.md`](./PLAY-SCREENSHOTS-GUIDE.md)) |

---

## Textos de la ficha

### Nombre (≤ 30 caracteres)

```
NEXARA
```

### Descripción corta (≤ 80 caracteres)

```
ERP, CRM y operación en campo de NEXARA, en tu teléfono.
```

*(54 caracteres)*

### Descripción completa (≤ 4000 caracteres)

```
NEXARA es la app móvil de la plataforma de gestión empresarial del mismo nombre, diseñada para integradores, distribuidores tecnológicos y equipos de operación en México. Da acceso a los mismos paneles que la versión web, con la sesión y los permisos de tu organización.

Paneles disponibles según tu rol:

• ERP — finanzas, recursos humanos, almacén y control administrativo.
• CRM (Ventas) — pipeline comercial, cuentas, oportunidades y cotizaciones inteligentes con catálogo de productos (ideal para proyectos CCTV, redes y seguridad).
• OPS — trabajo en campo: asignaciones, ubicación GPS, captura de evidencias fotográficas y lectura de códigos de barras.
• STUDIO — gestión de contenido y materiales de marca.
• LAB — herramientas internas de laboratorio y diagnóstico.
• Portal de clientes — tickets, sucursales, inventarios y documentos para clientes de la organización.

Características:

• Cotizador inteligente con búsqueda de productos y generación de PDF — cotiza instalaciones y equipos en minutos.
• Chat en tiempo real entre equipos de ventas, operaciones y soporte.
• Notificaciones push de asignaciones y cambios de estado.
• Inicio de sesión con biometría del dispositivo.
• Mapa integrado para operación en campo y seguimiento de técnicos.
• Consulta de documentos PDF dentro de la app.
• Sesión cifrada y aislamiento de datos por organización.

NEXARA es una herramienta de uso profesional para empresas del ecosistema de integración tecnológica. Para entrar necesitas una cuenta creada por el administrador de tu organización; la app no permite registro abierto.

Aviso de privacidad: https://nexara.com.mx/legal/privacidad
```

### Otros campos de la ficha

| Campo | Valor sugerido |
|---|---|
| Etiquetas | ERP, CRM, productividad, trabajo en campo, ventas |
| Correo de contacto | Correo de soporte de la empresa *(queda público)* |
| Tipo de app | App · Gratuita |
| Anuncios | No contiene anuncios |

---

## ASO — palabras clave y optimización

Google Play **no tiene campo de keywords** como App Store. La indexación depende del **nombre**, la **descripción corta**, la **descripción completa** y el **texto promocional** (si lo activas). Usa estas palabras de forma natural — sin stuffing ni listas sueltas en la descripción.

### Palabras clave primarias *(alta intención B2B México)*

```
ERP empresarial, CRM ventas, cotizador, integradores CCTV, videovigilancia,
operación en campo, gestión de tickets, SYSCOM, distribución tecnológica,
instalaciones, soporte técnico, pipeline comercial, cotizaciones PDF
```

### Palabras clave secundarias *(long-tail y nicho)*

```
app para integradores, ERP México, CRM B2B, trabajo de campo GPS,
evidencias fotográficas, chat empresarial, portal de clientes,
control de inventario, asignación de técnicos, cotización inteligente,
NVR cámaras, proyectos de seguridad, SYSCOM México, New Engineering
```

### Dónde colocarlas

| Campo en Play Console | Estrategia |
|---|---|
| Nombre (`NEXARA`) | Mantener corto; la marca ya es el ancla principal |
| Descripción corta | Incluir **ERP**, **CRM** y **operación en campo** — ya cubiertos en el texto actual |
| Descripción completa | Integrar términos como *integradores*, *CCTV*, *cotizaciones* y *campo* en párrafos naturales (ver sección de textos) |
| Texto promocional *(opcional, ≤ 170 caracteres)* | Rotar por temporada; ejemplo abajo |

### Texto promocional sugerido *(≤ 170 caracteres)*

```
La plataforma de gestión para integradores y distribuidores tecnológicos en México. Cotiza, opera en campo y atiende clientes desde tu celular.
```

*(148 caracteres)*

### Variantes de descripción corta *(A/B manual, ≤ 80 caracteres)*

Elige una; no publiques varias a la vez sin prueba controlada.

| Variante | Texto | Caracteres |
|---|---|---|
| A *(actual)* | `ERP, CRM y operación en campo de NEXARA, en tu teléfono.` | 54 |
| B *(CCTV / integradores)* | `ERP y CRM para integradores CCTV. Cotiza, opera y da soporte en campo.` | 72 |
| C *(SYSCOM / distribución)* | `Gestión comercial y operativa para distribuidores tecnológicos en México.` | 74 |

---

## Novedades — v1.0.0

Ruta en Play Console: **Versión → Notas de la versión** (*¿Qué novedades incluye esta versión?*). Máximo **500 caracteres** por idioma en Play; debajo hay un bloque listo para pegar y un inventario completo para referencia interna.

### Español (Latinoamérica) — texto para Play Console (≤ 500 caracteres)

```
¡NEXARA 1.0.0 para Android!

• Paneles ERP, Ventas, OPS, Contabilidad, STUDIO, LAB y Portal según tu rol.
• Cotizador inteligente: catálogo IT/CCTV, líneas y PDF.
• Chat en tiempo real, notificaciones push y deep links.
• Campo: GPS, mapas, evidencias, viáticos, herramientas y vehículos.
• Biometría, onboarding, cola offline y sesión cifrada por organización.

Cuenta corporativa requerida.
```

*(~498 caracteres)*

### Inventario completo v1.0.0 *(referencia interna; no pegar íntegro en Play)*

**Plataforma y acceso**

- App 100 % nativa (Kotlin, Jetpack Compose): sin WebView ni Capacitor.
- Inicio de sesión corporativo con permisos y paneles según matriz de acceso web.
- Biometría del dispositivo, recordatorio de último panel y flujo de onboarding inicial.
- Sesión cifrada (Android Keystore), renovación y pantalla de sesión expirada.
- Deep links y navegación desde notificaciones push (FCM).

**Paneles y módulos**

- **ERP / Consola:** dashboard, clientes, usuarios, proyectos, RH, asistencia, contabilidad, banca, facturación, gastos, almacén, compras, aprobaciones, BI, auditoría, documentos, chat, notificaciones y decenas de módulos operativos nativos.
- **Ventas (CRM):** pipeline, leads, oportunidades, cotizaciones, catálogo IT/CCTV, clientes, agenda, metas, reportes y gestión de vendedores.
- **OPS:** actividades, evidencias fotográficas, GPS y mapas, viáticos, vehículos, herramientas e inventario de kits, tickets de clientes y soporte/NOC.
- **Contabilidad:** panel dedicado con finanzas, pagos, horas y proyectos.
- **STUDIO:** contenido web, casos, noticias, newsletter y contactos.
- **LAB:** health de API, feature flags y sandbox de IA.
- **Portal de clientes:** tickets, sucursales e inventarios para usuarios finales de la organización.

**Ventas y cotización**

- Cotizador inteligente con búsqueda de productos, detalle de cotización y generación o consulta de PDF.
- Paridad con flujos comerciales de la plataforma web para integradores y distribución tecnológica.

**Comunicación y tiempo real**

- Chat de equipo con favoritos y eventos en tiempo real (Socket.IO).
- Centro de notificaciones in-app y registro de token FCM.

**Operación en campo y offline**

- Mapa integrado (Google Maps) para GPS y operación.
- Cola offline con sincronización coordinada al recuperar conectividad.
- Captura y consulta de evidencias multimedia.

**Experiencia**

- UI empresarial NEXARA (componentes compartidos, navegación unificada).
- Visor de documentos PDF, imágenes asíncronas y mensajes de error de API localizados.
- Ajustes, perfil, preferencias y multi-empresa donde aplica el rol.

**Requisitos**

- Cuenta creada por el administrador de la organización; sin registro público.
- Conexión a `api.nexara.com.mx` (HTTPS).

### Inglés *(opcional, si activas traducción en Play)*

```
Welcome to NEXARA 1.0.0 for Android!

• ERP, Sales, OPS, Accounting, STUDIO, LAB and Client Portal — by role.
• Smart quotes: IT/CCTV catalog, line items and PDF.
• Real-time chat, push notifications and deep links.
• Field ops: GPS, maps, evidence, travel, tools and vehicles.
• Biometrics, onboarding, offline queue and encrypted org sessions.

Corporate account required.
```

---

## Resumen de privacidad — formulario de la ficha

Texto de apoyo para **Política de privacidad** y el cuestionario de **Seguridad de los datos** en Play Console. La URL oficial sigue siendo https://nexara.com.mx/legal/privacidad.

### Puntos para el formulario / ficha pública

- **Responsable del tratamiento:** New Engineering Expertise And Resource Advancement, S.A. de C.V. (NEXARA), con domicilio en San Pedro Cholula, Puebla, México.
- **Alcance:** app B2B de uso profesional; solo usuarios con cuenta creada por el administrador de su organización. No hay registro público ni perfil visible fuera de la empresa.
- **Datos que se recopilan:** nombre, correo electrónico, identificadores de usuario y sesión, token del dispositivo (notificaciones push), mensajes de chat interno, interacciones de uso agregadas (analítica) y —de forma opcional— ubicación GPS, fotos, videos y archivos adjuntos para operación en campo.
- **Finalidad:** autenticación, operación de la plataforma (ventas, ERP, campo, tickets, chat), notificaciones operativas y mejora del producto. No se usan datos con fines publicitarios.
- **Base legal / consentimiento:** relación contractual con la organización cliente; permisos del dispositivo (ubicación, cámara, archivos) son opcionales y solicitados en tiempo de ejecución.
- **Cifrado:** datos en tránsito vía HTTPS/TLS; tokens de sesión cifrados en el dispositivo (Android Keystore).
- **Terceros procesadores:** Google Firebase (notificaciones push y analítica agregada) y Google Maps (visualización de mapas en OPS). No se venden ni comparten datos con anunciantes.
- **Retención y eliminación:** el usuario puede solicitar eliminación de cuenta y datos en https://nexara.com.mx/legal/eliminar-cuenta.
- **Menores:** la app no está dirigida a menores de 18 años.
- **Contacto de privacidad:** correo de soporte publicado en la ficha de Play Store.

### Frase corta para campo “Resumen de privacidad” *(si Play lo pide)*

```
NEXARA recopila datos de cuenta y uso operativo de empleados autorizados por su organización. Ubicación y multimedia son opcionales para trabajo en campo. No vendemos datos. Política completa: nexara.com.mx/legal/privacidad
```

*(199 caracteres)*

---

## Checklist de capturas de pantalla

Play exige **mínimo 2** capturas de teléfono (hasta 8). Formato PNG o JPEG; lado corto ≥ 320 px, lado largo ≤ 3840 px. Resolución recomendada: **1080×1920** (portrait).

Guardar en: `apps/mobile-native/play-assets/screenshots/phone/`

Usar la **cuenta demo de revisor** (`play.review@nexara.com.mx`, ver checklist §6.1) con datos ficticios del tenant `nexara-demo`. Si alguna pantalla sale vacía, carga un registro de prueba antes de capturar.

| # | Archivo sugerido | Pantalla | Cómo llegar |
|---|---|---|---|
| 1 | `01-ventas-dashboard.png` | **Ventas — Dashboard CRM** | Login → selector de paneles → **Ventas** → pantalla principal con KPIs, pipeline y accesos rápidos |
| 2 | `02-smart-quote.png` | **Cotizador inteligente** | Ventas → **Nueva cotización** / ruta Smart Quote → pantalla con búsqueda de productos y líneas de cotización |
| 3 | `03-chat.png` | **Chat en tiempo real** | Desde Ventas u OPS → módulo **Chat** → conversación activa con mensajes visibles |
| 4 | `04-actividades.png` | **Actividades (OPS)** | Selector de paneles → **OPS / Consola** → **Actividades** (o **Mis actividades**) con lista de tareas |
| 5 | `05-tickets.png` | **Portal de tickets** | Selector de paneles → **Portal** → lista de tickets o detalle de un ticket abierto |
| 6 *(opcional)* | `06-notificaciones.png` | **Centro de notificaciones** | Icono de campana → lista de notificaciones push |
| 7 *(opcional)* | `07-mapa-gps.png` | **Mapa / GPS en campo** | OPS → módulo con mapa (asistencia, GPS o evidencias con ubicación) |
| 8 *(opcional)* | `08-selector-paneles.png` | **Selector de paneles** | Tras login, vista con los paneles ERP · Ventas · OPS · STUDIO · LAB · Portal |

### Leyendas para capturas (marketing)

Texto sugerido para superponer en las capturas o como pie en el diseño gráfico. Tono profesional orientado a integradores, CCTV y distribución SYSCOM. Máximo ~40 caracteres por línea si va en overlay.

| # | Archivo | Leyenda principal | Subtítulo *(opcional)* |
|---|---|---|---|
| 1 | `01-ventas-dashboard.png` | **Tu pipeline comercial, siempre contigo** | KPIs, oportunidades y seguimiento de ventas en un solo panel |
| 2 | `02-smart-quote.png` | **Cotiza proyectos CCTV en minutos** | Búsqueda de productos, líneas y PDF listo para enviar al cliente |
| 3 | `03-chat.png` | **Tu equipo, conectado al instante** | Chat interno seguro entre ventas, operaciones y soporte |
| 4 | `04-actividades.png` | **Operación en campo, bajo control** | Asignaciones, evidencias y seguimiento de instalaciones en tiempo real |
| 5 | `05-tickets.png` | **Soporte al cliente sin fricción** | Tickets, sucursales e inventarios desde el celular de tu técnico |

> **Tip de diseño:** usa la paleta NEXARA, tipografía sans-serif (Inter o similar) y evita bloques de texto largos. Una línea de titular + una de apoyo por captura es suficiente.

### Criterios de calidad

- Modo claro u oscuro: elige **uno** y úsalo en todas las capturas.
- Oculta barra de estado con hora/batería inconsistente o usa la del emulador en horario laboral.
- No muestres datos reales de clientes, empleados ni credenciales.
- Evita diálogos de permisos (ubicación/cámara) en la captura; concédelos antes o recházalos según la pantalla.
- Recorta barras del sistema si Play las recorta mal; el contenido de la app debe ocupar el centro del frame.

Comandos para generar las capturas: [`PLAY-SCREENSHOTS-GUIDE.md`](./PLAY-SCREENSHOTS-GUIDE.md).

---

## Clasificación de contenido (IARC)

Ruta en Play Console: **Contenido de la app → Clasificación de contenido** → cuestionario IARC.

### Configuración general

| Pregunta / campo | Respuesta |
|---|---|
| Categoría de la app | **Utilidad**, **Productividad** o **Comunicación** (cualquiera de estas encaja; Productividad es la más directa) |
| ¿La app es principalmente para niños? | **No** |
| ¿Contiene publicidad? | **No** |
| ¿Permite compras dentro de la app? | **No** (la app es gratuita y no vende contenido digital al usuario final) |

### Preguntas de contenido sensible — todas **No**

| Tema | Respuesta | Notas |
|---|---|---|
| Violencia | No | Herramienta empresarial; sin contenido violento generado por la app |
| Sexualidad / desnudez | No | Sin contenido sexual |
| Lenguaje ofensivo | No | La app no genera lenguaje ofensivo; el chat es entre usuarios profesionales de la organización |
| Drogas, alcohol, tabaco | No | |
| Apuestas / juegos de azar | No | |
| Contenido generado por usuarios visible públicamente | No | Todo el contenido está detrás de login y aislado por organización; no hay feed público |
| Compartir ubicación con otros usuarios | Sí *(solo si el cuestionario lo pregunta explícitamente)* | GPS de operación en campo se comparte dentro de la organización, no con el público general. Si la pregunta es ambigua, indica que la ubicación es **entre usuarios autenticados de la misma empresa** con fines operativos |
| Interacción entre usuarios | Sí *(si aplica)* | Chat interno y asignaciones entre miembros de la organización; no hay contacto con extraños |

### Resultado esperado

**3+ / Everyone** (o equivalente en tu región). La app es una herramienta B2B sin contenido restringido por edad.

### Público objetivo

Marcar **18 años o más** en **Público objetivo y contenido**. Evita inscribirte en el programa *Designed for Families* — no aplica y añade requisitos extra.

---

## Seguridad de los datos (Data safety)

Ruta en Play Console: **Contenido de la app → Seguridad de los datos**.

Basado en `AndroidManifest.xml`, dependencias (Firebase) y comportamiento real de la app.

### Resumen de recopilación

| Tipo de dato | ¿Se recopila o comparte? | ¿Obligatorio u opcional? | Finalidad |
|---|---|---|---|
| **Nombre** | Recopilado | Obligatorio | Cuenta y funcionalidad de la app |
| **Dirección de correo** | Recopilado | Obligatorio | Cuenta, inicio de sesión, notificaciones |
| **IDs de usuario** | Recopilado | Obligatorio | Autenticación y aislamiento por organización |
| **Tokens de autenticación / sesión** | Recopilado | Obligatorio | Mantener sesión segura (almacenados cifrados en el dispositivo; el servidor emite JWT) |
| **Ubicación precisa (GPS)** | Recopilado | **Opcional** | Operación en campo, asistencia, mapas OPS — solo si el usuario concede el permiso |
| **Ubicación aproximada** | Recopilado | **Opcional** | Misma finalidad que GPS cuando solo hay permiso coarse |
| **Fotos** | Recopilado | **Opcional** | Evidencias de trabajo en campo, adjuntos en tickets y actividades |
| **Videos** | Recopilado | **Opcional** | Evidencias multimedia en campo |
| **Archivos y documentos** | Recopilado | **Opcional** | PDFs, cotizaciones, adjuntos de la organización |
| **ID del dispositivo** | Recopilado | Obligatorio | Token FCM para notificaciones push |
| **Interacciones en la app** | Recopilado | Obligatorio | Firebase Analytics (uso agregado) |
| **Mensajes de chat** | Recopilado | Obligatorio *(para usuarios que usan chat)* | Comunicación interna entre miembros de la organización |
| **Historial de búsqueda en la app** | No / No aplica | — | No se vende ni se usa con fines publicitarios |
| **Información financiera personal del consumidor** | No | — | El módulo de finanzas es contabilidad interna B2B, no banca ni pagos al usuario |

### Preguntas transversales

| Pregunta | Respuesta |
|---|---|
| ¿Los datos se cifran en tránsito? | **Sí** — HTTPS/TLS hacia `api.nexara.com.mx` |
| ¿Los datos se cifran en reposo? | **Sí** — tokens de sesión cifrados en el dispositivo (`SessionStore` / Android Keystore) |
| ¿Se venden datos a terceros? | **No** |
| ¿Se comparten con terceros con fines publicitarios? | **No** |
| ¿Los usuarios pueden solicitar eliminación de datos? | **Sí** — https://nexara.com.mx/legal/eliminar-cuenta |
| ¿La recopilación es necesaria o los usuarios pueden optar por no participar? | Datos de cuenta: **necesarios**. Ubicación, cámara y archivos: **opcionales** (la app funciona si se rechazan, con funciones de campo limitadas) |

### Ubicación en segundo plano

**No aplica.** El manifiesto solo declara `ACCESS_FINE_LOCATION` y `ACCESS_COARSE_LOCATION` para uso en **primer plano**. No marques “ubicación en segundo plano” ni completes el formulario adicional de Background Location.

### Terceros / proveedores de procesamiento

| Proveedor | Datos que procesa | Finalidad |
|---|---|---|
| **Google Firebase (FCM)** | Token del dispositivo | Notificaciones push |
| **Google Firebase Analytics** | Eventos de uso agregados | Analítica de producto |
| **Google Maps** | Coordenadas cuando se muestra el mapa | Visualización de ubicación en OPS |

Indica que estos proveedores actúan como **encargados de procesamiento**, no que los datos se vendan o compartan con fines publicitarios.

### Permisos sensibles que **no** requieren declaración extra

La app **no** usa: `QUERY_ALL_PACKAGES`, `MANAGE_EXTERNAL_STORAGE`, SMS, registro de llamadas ni ubicación en segundo plano. No hace falta el formulario de permisos restringidos de Play.

---

## Acceso a la app (credenciales demo)

La app completa está detrás de login sin registro público. En **Acceso a la app** marca **“Todas o algunas funciones están restringidas”** y proporciona la cuenta demo.

```bash
cd apps/api && npm run seed:play-reviewer
```

Detalle completo (usuario, instrucciones para el revisor, aislamiento de tenant): [`PLAY-STORE-CHECKLIST.md` §6.1](./PLAY-STORE-CHECKLIST.md#61-acceso-a-la-app--causa-nº1-de-rechazo).

> **No pegues contraseñas en este documento ni en el repositorio.** La contraseña la imprime el script una sola vez al ejecutarlo.

---

## Orden sugerido al llenar la ficha

1. Subir `icon-512.png` y `feature-graphic-1024x500.png` (ver [`ASSETS-README.md`](../apps/mobile-native/play-assets/ASSETS-README.md)).
2. Generar y subir capturas (`screenshots/phone/`).
3. Pegar nombre, descripción corta y descripción completa.
4. Completar **Clasificación de contenido** (IARC).
5. Completar **Seguridad de los datos**.
6. Configurar **Acceso a la app** con credenciales demo.
7. Verificar URL de eliminación de cuenta (debe responder HTTP 200 en producción).
