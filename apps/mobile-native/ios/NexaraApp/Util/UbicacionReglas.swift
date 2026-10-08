import Foundation

// Reglas de «sin ubicación», sin CoreLocation: reciben lo que se midió y deciden el
// código que entiende el API. Espejo de las reglas de Android, con los mismos códigos
// y los mismos textos (Adam, 08-10: «que diga por qué sin ubicación»).
//
// En iPhone la ubicación apagada se revisa ANTES que el permiso, al revés que en
// Android: con la ubicación apagada en Ajustes, iOS reporta el permiso de la app como
// `.denied`, y se leería «NEXARA no tiene permiso» cuando lo que hay que hacer es
// encender la ubicación del teléfono.

/// Por qué una checada salió sin coordenadas (`ubicacionFalla` de `POST attendance`).
///
/// Antes la checada llegaba sin coordenadas y sin motivo, y el jefe veía «Sin ubicación»
/// sin saber si el teléfono tenía la ubicación apagada, si negaron el permiso o si no
/// hubo señal. El servidor convierte el código en el motivo que ven los jefes.
enum UbicacionFalla {
    static let permisoNegado = "PERMISO_NEGADO"
    static let ubicacionApagada = "UBICACION_APAGADA"
    static let sinSenal = "SIN_SENAL"
    static let errorDeLectura = "ERROR"

    /// El diagnóstico cuando no hubo coordenadas.
    /// - Parameters:
    ///   - tienePermiso: la app tiene permiso de ubicación (`authorizedWhenInUse` / `authorizedAlways`).
    ///   - ubicacionEncendida: `CLLocationManager.locationServicesEnabled()`.
    ///   - huboError: Core Location contestó con un error que no es «todavía no hay lectura».
    static func de(tienePermiso: Bool, ubicacionEncendida: Bool, huboError: Bool) -> String {
        if !ubicacionEncendida { return ubicacionApagada }
        if !tienePermiso { return permisoNegado }
        if huboError { return errorDeLectura }
        return sinSenal
    }

    /// Sufijo de la confirmación de la checada en lugar del viejo « (sin GPS)». Un código
    /// que la app no conoce (o ninguno) dice solo «sin ubicación»: no se inventa la causa.
    static func nota(_ falla: String?) -> String {
        switch falla ?? "" {
        case permisoNegado: return " · sin ubicación: NEXARA no tiene permiso de ubicación"
        case ubicacionApagada: return " · sin ubicación: la ubicación del teléfono está apagada"
        case sinSenal: return " · sin ubicación: el teléfono no consiguió señal a tiempo"
        default: return " · sin ubicación"
        }
    }
}

/// Estado de la ubicación del teléfono durante la jornada (`POST attendance/estado-ubicacion`).
///
/// Adam (08-10): «que nos registre si hay algún dispositivo con la ubicación apagada», no
/// solo al checar. El servidor pone la hora y el equipo; los jefes lo ven en Asistencias
/// («Ubicación apagada desde 10:15»). El servidor ignora un estado repetido, pero aquí
/// tampoco se manda dos veces lo mismo.
enum EstadoUbicacion {
    static let apagada = "APAGADA"
    static let sinPermiso = "SIN_PERMISO"
    static let encendida = "ENCENDIDA"

    /// Estado actual del teléfono (misma precedencia que `UbicacionFalla.de`).
    static func de(tienePermiso: Bool, ubicacionEncendida: Bool) -> String {
        if !ubicacionEncendida { return apagada }
        if !tienePermiso { return sinPermiso }
        return encendida
    }

    /// Qué mandar, o `nil` si no hay nada nuevo que decir.
    ///
    /// Un estado malo se manda si no es el último que se mandó. `ENCENDIDA` solo se manda
    /// para cerrar un `APAGADA` / `SIN_PERMISO` que se mandó antes: un teléfono que
    /// siempre estuvo bien no tiene nada que reportar.
    static func aEnviar(actual: String, ultimoEnviado: String?) -> String? {
        if actual == encendida {
            return esMalo(ultimoEnviado) ? encendida : nil
        }
        return actual == ultimoEnviado ? nil : actual
    }

    /// El estado que el servidor registra solo a partir de una checada sin coordenadas
    /// (`UBICACION_APAGADA` → `APAGADA`, `PERMISO_NEGADO` → `SIN_PERMISO`). Las demás
    /// fallas no dicen nada de la ubicación del teléfono.
    static func deFalla(_ falla: String?) -> String? {
        switch falla ?? "" {
        case UbicacionFalla.ubicacionApagada: return apagada
        case UbicacionFalla.permisoNegado: return sinPermiso
        default: return nil
        }
    }

    private static func esMalo(_ estado: String?) -> Bool {
        estado == apagada || estado == sinPermiso
    }
}
