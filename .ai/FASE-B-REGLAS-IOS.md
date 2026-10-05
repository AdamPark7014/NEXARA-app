# Fase B — paridad TOTAL iOS ← Android (reglas comunes para cada agente)

El dueño (Adam) pidió que la app iOS de NEXARA tenga PARIDAD TOTAL con la app Android en funciones y en UI/UX:
«hoy no se parece en nada» y «tiene muchos errores». Android es la referencia aprobada. También pidió: «cada duda
que tengas consulta la web o la Android y ahí tienes esa info» — NO inventes reglas: léelas en Android, en la web
(`apps/web`) o en el API (`apps/api`).

## Repo y reglas duras
- Repo `C:\dev\apps\NEXARA-app`, rama `main`. **No ejecutes `git add/commit/stash/checkout/reset/restore` ni nada que
  cambie el índice o el árbol de git.** Solo edita archivos. El coordinador commitea.
- Varios agentes trabajan a la vez en el mismo checkout, cada uno en SUS archivos (te los indica tu encargo).
  Si necesitas tocar un archivo compartido (p. ej. `Demo/DemoBackend.swift`, `UI/Core/Extras/CoreExtraDestination.swift`,
  `Access/DeepLinkParser.swift`, `Access/CoreNavigation.swift`), hazlo con ediciones QUIRÚRGICAS (Edit de pocas líneas,
  vuelve a leer justo antes), nunca reescribas el archivo entero.
- iOS: SwiftUI, deployment target **iOS 17.0**, se compila con Xcode (SDK de iOS 26) en GitHub; aquí NO hay Mac ni
  compilador. Escribe Swift correcto y conservador: revisa la firma real de cada tipo/función que uses leyendo su
  definición; nada de APIs de iOS 18+ sin `if #available`. Al terminar ejecuta desde la raíz del repo
  `python scripts/ios-static-check.py` y deja 0 problemas.
- Código iOS: `apps/mobile-native/ios/NexaraApp/` (abreviado `I/`). Android: `apps/mobile-native/android/app/src/main/java/mx/nexara/mobile/nativeapp/` (abreviado `A/`).
- XcodeGen incluye solos los `.swift` nuevos bajo `NexaraApp/` (no hay .pbxproj versionado).
- Español de México en textos y comentarios, con el MISMO texto visible que Android (títulos, botones, vacíos, errores).
- Tema siempre claro (Info.plist `UIUserInterfaceStyle = Light`).

## Qué significa «paridad»
1. **Funciones**: todo lo que la pantalla Android permite hacer, iOS también (mismas acciones, mismos endpoints y
   parámetros, mismas reglas de quién ve qué, mismos filtros, mismos estados vacíos/errores, mismos refrescos
   automáticos). Compara las reglas (`*Rules.kt`, ViewModels) con las de iOS y corrige las diferencias. Si iOS
   tiene algo que Android NO tiene y no está en la web, quítalo; si está en la web y Android no lo tiene, déjalo.
2. **UI/UX**: misma estructura de arriba abajo, mismos componentes, tamaños, pesos, colores, radios, espaciados,
   textos e iconos equivalentes (SF Symbols que se parezcan al icono Material). Pestañas internas, chips de filtro,
   tiras de cifras, FAB, hojas inferiores y diálogos como en Android.
3. **Errores de lógica**: Adam encontró, por ejemplo, que el horario salía a las 8:00 cuando la jornada es 10:00–18:00
   (comida 15:00–16:00). Busca activamente errores así en tu área: horas/fechas/husos (todo en America/Mexico_City),
   conteos, estados que no cuadran con el API, textos que contradicen la regla, filtros que esconden datos, botones
   que no hacen nada, decodificación que pierde campos. Contrasta con Android y con el API.
4. **Nada abre la web**: ningún módulo ni botón saca al navegador salvo enlaces legítimos (privacidad, soporte,
   eliminar cuenta, mapas, Ajustes del sistema). No añadas «Abrir en la web».
5. **Modo demo** (`I/Demo/`): la app arranca en demo con `-NEXARA_DEMO 1` (lo usa Apple y las capturas de CI). Cada
   pantalla tuya debe verse llena y creíble en demo: si falta un fixture para un endpoint que usas, añádelo (archivo
   nuevo `Demo/DemoFixtures+<Area>.swift` y una línea de enrutado en `DemoBackend.swift`). Horarios del demo: entrada
   ~10:00, salida ~18:00, comida 15:00–16:00, zona America/Mexico_City.

## Base visual ya hecha (fase A) — ÚSALA, no dupliques
Archivos: `I/UI/Enterprise/NxParityComponents.swift`, `NxNavigationChrome.swift`, `NxBrand.swift`, `NxDesignSystem.swift`,
`EnterpriseComponents.swift`, `I/UI/Core/CoreComponents.swift`, `I/UI/Core/Extras/CoreExtrasCommon.swift`. Léelos antes de empezar.
- Colores: `NxColors.*` = valores exactos de Android (brand, brandText, brandDeep, brandSoft, brandSoft2, brandTint, accent,
  fg, fg2, muted, fg4, surface, card, sunken, border, borderSubtle, borderStrong, success/Soft, warning/Soft/Text,
  danger/Soft/Text, info/Soft, categorySky/Magenta/Orange/Cctv, verde, naranja, rojo, azul, morado, gris, cian,
  `NxColors.rgb(_:alpha:)`). `NxBrand`, `NxSurface`, `NxTone`, `CorePalette`, `CoreExtrasSemaforo` ya apuntan a esos.
- Tipografía: `NxType.headlineSmall/titleLarge/titleMedium/titleSmall/bodyLarge/bodyMedium/bodySmall/labelLarge/labelMedium/labelSmall`
  y `.nxTextStyle(NxTextStyle)` (interlineado de Android). Usa tamaños fijos como Android, no Dynamic Type en tarjetas.
- Superficies: `.nxElevation(_ dp:)`, `.nxCardSurface(radius: 16, elevation: 2, fill: NxColors.card)`, `.nxScreenBackground()`
  (#F8FAFC), `.nxListBackground()` (en `List`/`Form`), `NxPressableStyle()`, `.nxCard(padding:highlight:)`.
- Componentes: `NxPanelShell(padding: 14, spacing: 0, onClick: nil) { … }`; `NxListRow(title:subtitle:meta:chipText:chipTone:onClick:trailing:)`
  (pasa `onClick:` y `trailing:` con etiqueta); `NxSectionHeader(title:subtitle:trailing:)`; `NxDenseSectionHeader(title:hint:trailing:)`;
  `NxRowDivider()`; `NxEmptyState(title:subtitle:systemImage:actionLabel:onAction:)`; `NxErrorState(title:message:systemImage:retry:)`;
  `NxErrorBlock(message:onRetry:)`; `NxRefreshErrorBanner(message:onRetry:onDismiss:)`; `NxFriendlyError.text(_:)`; `NxLoadingState(text:)`;
  `NxSkeletonList(itemCount: 5, itemHeight: 72)`; `NxSkeletonBlock(height:cornerRadius:)`; `NxStatusChip(text:tone:systemImage:)`;
  `NxChip(text:color:systemImage:dot:)`; `NxStatusDot(text:color:fontSize:fontWeight:maxLines:)`; `NxMetric(clave:etiqueta:valor:pista:color:)`
  + `NxMetricStrip(items:seleccion:onSelect:)`; `NxFilterBar(horizontalPadding:) { … }` + `NxFilterPill(label:count:selected:color:onClick:)`;
  `NxSegmented(options:selectedIndex:onSelect:)` / `NxSegmented(options:selection:)`; `NxSearchField(text:placeholder:enabled:)`;
  `NxPrimaryButton(_:systemImage:loading:enabled:fullWidth: true, tint:action:)`; `NxSecondaryButton(…, fullWidth: false …)`;
  `NxPrimaryButtonStyle(tint:fullWidth:)`, `NxSecondaryButtonStyle`; `NxPillButtonStyle(fill:foreground:border:)`;
  `NxDecisionButtons(approveLabel:rejectLabel:acting:onApprove:onReject:)`; `NxUnderlineTab(id:title:systemImage:)` + `NxUnderlineTabs(tabs:selection:scrollable:)`;
  `NxFab(_:systemImage:action:)` / `.nxFab(_:systemImage:visible:action:)`; `NxAvatar(nombre:url:size:estilo: .suave/.marca, borde:)`;
  piezas de «Más»: `MoreTarjeta(onClick:) { … }`, `MoreCabecera(titulo:subtitulo:trailing:)`, `MoreNotaDeAlcance(texto:)`,
  `MoreDato(etiqueta:valor:pie:tono:)`, `MoreDatoCard(dato:)`, `MoreRejillaDeDatos(datos:columnas:)`, `MoreBarra(progreso:etiqueta:tono:)`,
  `MoreAvisoDesactualizado(mensaje:onCerrar:)`, `MoreChipSemaforo(semaforo:etiqueta:)`.
  Si te falta un componente que Android tiene, créalo en TU archivo (privado) o pídelo en tu informe; no edites
  los archivos de la fase A salvo un arreglo de una línea imprescindible (dilo en el informe).
- Navegación: `.nxBrandNavBar(title: String? = nil, showsBell: Bool = true)` = barra superior teal de Android (título
  16 SemiBold blanco, campana). La pone quien abre la pantalla; el shell ya la aplica a las raíces de pestaña y a las
  cubiertas, y el hub «Más» a sus módulos, Mi perfil y Clientes. TÚ se la aplicas a lo que tu pantalla apila
  (NavigationLink/navigationDestination). `.nxOcultaBarraInferior()` oculta la barra inferior (detalle de actividad).
  No pongas `.tint` de marca en la raíz de una pantalla (los botones de la barra salen blancos porque AccentColor
  oscuro = blanco). Los títulos de barra son los de Android (`ConsoleNavHost.kt:457-487`).
- Identificadores ya usados por pruebas de UI: `tab-inicio`, `tab-actividades`, `tab-chat`, `tab-asistencias`, `tab-mas`,
  `bell-button`, `more-profile`, `more-clientes`, `more-<clave>`. No los rompas. Las pestañas internas deben ser
  botones con el texto visible exacto (p. ej. «Mi equipo», «Comidas», «Trayectoria», «Evidencias», «Historial»):
  la prueba de capturas las toca por su texto.

## Entrega (tu respuesta final)
Lista de archivos tocados/creados; por pantalla, qué cambió en funciones y en UI respecto a antes; errores de
lógica encontrados y corregidos (con archivo:línea); lo que no pudiste igualar y por qué; edits en archivos
compartidos; resultado de `python scripts/ios-static-check.py`. Sin pegar archivos completos.
