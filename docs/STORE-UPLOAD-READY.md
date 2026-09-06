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

### Versión actual (06-09-2026)

- `VERSION_NAME=1.0.1`
- `VERSION_CODE=7` — **confirma en Play Console cuál es el mayor ya SUBIDO** (incluidos
  bundles descartados: Play no reutiliza ninguno) y usa ese número + 1.
- `targetSdk=36`, `minSdk=24`

> El AAB que hay en `app/build/outputs/bundle/release/` puede estar obsoleto. Comprueba
> siempre su fecha contra la del código antes de subirlo — `npm run mobile:smoke` lo hace
> por ti y falla si el bundle es más viejo que la fuente.

### Comandos finales

```powershell
# 1. Build AAB firmado, subiendo el versionCode en el mismo paso
pwsh -File scripts/build-play-aab.ps1 -BumpVersionCode -Clean

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
