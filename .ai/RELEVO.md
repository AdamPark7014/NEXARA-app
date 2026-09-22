# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-22
- **Rama:** cursor/asc-usage-descriptions-dcf0

## Hecho en este turno

### iOS TestFlight: evitar warning 90683 (NSLocationWhenInUseUsageDescription faltante)
- Ampliado el paso de PlistBuddy post-archive en `.github/workflows/ios-testflight.yml` para copiar desde `apps/mobile-native/ios/Resources/Info.plist` a la Info.plist embebida del `.app` las claves:
  - `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`
  - `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`, `NSMicrophoneUsageDescription`, `NSUserTrackingUsageDescription`
- Se mantiene el parche existente de `UILaunchScreen`, orientaciones y `CFBundleIconName`.
- Validación extra imprime estas claves en el dump de la Info.plist embebida.
- Bump opcional: si `CFBundleVersion` es `1` en el `.app`, se ajusta a `2` antes del export.
- No se tocan Starscream strip, flatten de iconos ni firma manual.

## A medias
- Esperar próxima corrida del workflow para confirmar ausencia del warning en ASC.

## No tocar
- Starscream strip, scripts de íconos, firma manual.

## Siguiente paso
1. Disparar `iOS TestFlight (Free GHA)` y verificar que `NSLocationWhenInUseUsageDescription` esté presente en la Info.plist embebida y que ASC no emita 90683.
2. Confirmar que el upload marca éxito con altool/iTMSTransporter.

## Estado
- Cambio listo en rama, pendiente de ejecución de pipeline.
