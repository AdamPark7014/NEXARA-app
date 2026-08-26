# Listo para subir a tiendas — NEXARA Mobile

Checklist final antes de publicar. **Android está listo para Play Console.** iOS requiere Mac + Xcode (ver `apps/mobile-native/ios/MAC_BUILD_PLAYBOOK.md`).

---

## Android — Google Play ✅

### Artefactos listos en el repo

| Asset | Ruta |
|-------|------|
| AAB release | `npm run mobile:android:play-aab` → `apps/mobile-native/android/app/build/outputs/bundle/release/app-release.aab` |
| Icono 512×512 | `apps/mobile-native/play-assets/icon-512.png` |
| Feature graphic | `apps/mobile-native/play-assets/feature-graphic-1024x500.png` |
| **8 capturas teléfono** | `apps/mobile-native/play-assets/screenshots/phone/*.png` |

### Versión actual

- `VERSION_NAME=1.0.0`
- `VERSION_CODE=2` (subir en cada release futuro)
- `targetSdk=36`, `minSdk=24`

### Comandos finales

```powershell
# 1. Build AAB firmado (sin clean, más rápido en Windows)
npm run mobile:android:play-aab

# 2. Cuenta demo para revisores Play
npm run seed:play-reviewer
# Guarda la contraseña que imprime — Play Console → Acceso a la app

# 3. Smoke opcional
npm run mobile:smoke
```

### En Play Console (manual)

1. Crear app `NEXARA` · package `mx.nexara.mobile.nativeapp`
2. **Prueba interna** → subir `app-release.aab`
3. **Ficha** → textos en `docs/PLAY-STORE-LISTING.md`
4. **Gráficos** → icono, feature graphic, 8 screenshots
5. **Contenido de la app** → Data safety (texto en listing)
6. **Acceso a la app** → credenciales `play.review@nexara.com.mx`
7. Tras Play App Signing: agregar **SHA-1 de distribución** a Firebase y Google Maps API

Detalle operativo: [`PLAY-STORE-CHECKLIST.md`](./PLAY-STORE-CHECKLIST.md)

---

## iOS — App Store (pendiente Mac)

La app iOS nativa existe en `apps/mobile-native/ios/` pero la subida a App Store Connect requiere:

- Mac con Xcode
- Cuenta Apple Developer ($99/año)
- Certificados + provisioning profiles
- Capturas en simulador iPhone

Ver: `apps/mobile-native/ios/MAC_BUILD_PLAYBOOK.md`

---

## Qué incluye la app (v1.0.0)

- Paneles: ERP, CRM, OPS, Portal, STUDIO, LAB, Contabilidad
- Smart Quote, Chat realtime, offline queue, push FCM
- Biometría, app lock, deep links, onboarding
- Paridad ~98% con paneles web

---

## Post-lanzamiento

- Monitorear crashes en Play Console / Firebase
- Responder reseñas en 48 h
- `VERSION_CODE++` en cada actualización
