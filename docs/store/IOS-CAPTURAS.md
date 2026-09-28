# Capturas de App Store (iOS) con el simulador

Apple rechazó 1.0 por la regla 2.3.10 (capturas de Android). Estas salen del simulador de iPhone, en modo demo (`-NEXARA_DEMO 1`: sin login ni red, datos ficticios), sin marcos ni titulares (evita 2.3.3).

**Lanzar:** pestaña *Actions* > "iOS capturas de App Store (simulador)" > *Run workflow* (input `dispositivos`: `6.9,6.5`, o solo `6.9`), o empujar un tag `ios-screenshots-N`. Tarda del orden de 30-45 min (estimado, sin ejecución real todavía: compila Firebase y arranca simuladores). No necesita secretos.

**Dónde quedan:** artefactos `ios-capturas-iphone-69` / `ios-capturas-iphone-65` del run (más `ios-capturas-logs`: `.xcresult`, logs y `debug/` con la jerarquía de accesibilidad), y commit del bot `chore(ios): capturas de tienda [skip ci]` en `docs/store/ios-screenshots/<iphone-69|iphone-65>/NN-nombre.png` (más `LEEME.txt` con dispositivo, runtime y medidas). Solo se commitea un dispositivo si todas sus medidas y el alfa son válidos.

**Orden (9 capturas):** 01 actividades, 02 detalle-actividad, 03 asistencias, 04 chat-canales, 05 chat-canal, 06 clientes, 07 mas-modulos, 08 notificaciones, 09 mi-perfil. Un hueco en la numeración = paso omitido (mira `resumen` en el `.xcresult`).

**Medidas que acepta App Store Connect hoy (vertical, PNG/JPEG, sin alfa, 1-10 por tamaño):**
- iPhone 6.9": 1320x2868, 1290x2796 o 1260x2736. Obligatorio; con él Apple escala el resto de iPhone.
- iPhone 6.5": 1284x2778 o 1242x2688. Solo si no subes 6.9".

**Trampas conocidas:**
- El nombre del simulador NO está fijado: `simctl list devicetypes` decide en cada ejecución (el "Pro Max" más nuevo para 6.9"; 14 Plus / 13-12-11 Pro Max para 6.5"). Si la imagen no trae ninguno, esa clase se omite con aviso.
- `simctl privacy` concede ubicación, fotos y micrófono, pero NO cámara ni notificaciones: el test cierra esas alertas con `addUIInterruptionMonitor` y una revisión explícita de SpringBoard.
- Barra de estado fijada a 9:41, batería 100 %, WiFi y cobertura completas (`simctl status_bar override`); apariencia clara.
- ASC rechaza PNG con transparencia: el flujo los aplana sobre blanco (`scripts/flatten_app_icons.swift`) y comprueba `hasAlpha=no` con `sips`.
- El test depende de los identificadores `tab-*`, `bell-button` y `more-button` de la app (con plan B por etiqueta). Si faltan capturas, abre `debug/dbg-*.txt` del artefacto: es el árbol de accesibilidad real.
- El target `NexaraAppUITests` y su esquema salen de `apps/mobile-native/ios/project.yml`; el flujo falla pronto y con mensaje claro si no están.
