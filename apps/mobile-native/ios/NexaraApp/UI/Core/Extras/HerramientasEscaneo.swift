import SwiftUI

/// Escáner de la pantalla de Herramientas. Desde el 07-10 es el escáner único
/// (`EscanerDeCodigos`): lee la etiqueta de herramienta (Code 128 con la nomenclatura
/// interna, p. ej. `MUL-12345`) y enseña la herramienta, quién la tiene y, si hay un
/// préstamo aprobado o en uso, deja registrar la salida o la entrada. Quien también abre
/// Almacén puede leer aquí un artículo («Escanear herramienta o artículo»). Entregar y
/// recibir son de almacén (`tools.manage`): a los demás el API contesta 403 y se explica.
///
/// Espejo de `HerramientasEscaneo.kt` en Android.
struct EscanerDeHerramientas: View {
    var onMovimiento: () -> Void = {}

    var body: some View {
        EscanerDeCodigos(enAlmacen: false, onMovimiento: onMovimiento)
    }
}

/// La herramienta leída: nombre, código y serie, su estado, el del préstamo y quién la tiene.
struct HerramientaEscaneadaVista: View {
    let r: HerramientaPorCodigo

    private var tono: NxTone {
        switch r.item?.status {
        case "AVAILABLE": return .success
        case "IN_REPAIR": return .warning
        case "RETIRED": return .danger
        default: return .info
        }
    }

    var body: some View {
        let detalle = [r.codigo?.nilSiVacio, r.item?.serialNumber?.nilSiVacio.map { "Serie \($0)" }]
            .compactMap { $0 }
            .joined(separator: " · ")
        VStack(alignment: .leading, spacing: 8) {
            Text(EscaneoReglas.nombreHerramienta(r))
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(NxColors.fg)
            if !detalle.isEmpty {
                Text(detalle)
                    .font(NxType.labelMedium)
                    .foregroundStyle(NxColors.muted)
            }
            NxStatusChip(text: EscaneoReglas.estadoHerramienta(r.item?.status), tone: tono)
            Text(EscaneoReglas.estadoPrestamo(r.prestamo?.status))
                .font(NxType.bodyMedium)
                .foregroundStyle(NxColors.fg)
            if let quien = EscaneoReglas.quienLaTiene(r) {
                Text(quien)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
            }
            // La devolución es un día, no un instante: `T00:00:00Z` leído en la hora de
            // México caería la tarde del día anterior («lun 29 sept, 18:00» por el 30).
            if let fecha = HerramientasReglas.fechaCorta(r.prestamo?.expectedReturnDate).nilSiVacio {
                Text("Devolución esperada: \(fecha)")
                    .font(NxType.labelMedium)
                    .foregroundStyle(NxColors.muted)
            }
            if r.esMia == true {
                Text("Está a tu nombre.")
                    .font(NxType.labelMedium)
                    .foregroundStyle(NxColors.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Registrar la salida (préstamo aprobado, con el código de recolección) o la entrada
/// (préstamo en uso, con daño opcional) de la herramienta escaneada.
struct AccionDeHerramienta: View {
    let r: HerramientaPorCodigo
    let accion: EscaneoReglas.AccionHerramienta
    let prestamoId: Int
    let onHecho: (String) -> Void

    @State private var codigoRecogida = ""
    @State private var danio = ""
    @State private var guardando = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HerrDivisor()
            switch accion {
            case .entregar:
                Text("Para entregarla, teclea el código de recolección que enseña quien la recoge.")
                    .font(NxType.labelMedium)
                    .foregroundStyle(NxColors.muted)
                    .fixedSize(horizontal: false, vertical: true)
                if r.prestamo?.vencido == true {
                    // Mismo texto que Android (`HerramientasEscaneo.kt`): generar otro
                    // código es de quien aprueba, y eso no se hace desde el teléfono.
                    Text("El código de recolección ya venció: hay que generar otro en la web.")
                        .font(NxType.bodyMedium)
                        .foregroundStyle(NxColors.danger)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HerrCampoContorno(
                    etiqueta: "Código de recolección",
                    texto: $codigoRecogida,
                    mayusculas: true,
                    limite: 12
                )
            case .recibir:
                HerrCampoContorno(
                    etiqueta: "¿Llegó con daño? Descríbelo (opcional)",
                    texto: $danio,
                    soporte: "Con daño queda en reparación.",
                    multilinea: true,
                    limite: 500
                )
            }
            if let error {
                Text(error)
                    .font(NxType.bodyMedium)
                    .foregroundStyle(NxColors.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button(guardando ? "Registrando…" : accion.etiqueta) {
                Task { await registrar() }
            }
            .buttonStyle(HerrBotonLlenoStyle(alto: 52, anchoCompleto: true))
            .disabled(guardando)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @MainActor
    private func registrar() async {
        guardando = true
        error = nil
        defer { guardando = false }
        let nombre = EscaneoReglas.nombreHerramienta(r)
        do {
            let mensaje: String
            switch accion {
            case .entregar:
                try await EscaneoRepository.shared.entregarHerramienta(prestamoId: prestamoId, pickupCode: codigoRecogida)
                mensaje = "Salida registrada: \(nombre)."
            case .recibir:
                try await EscaneoRepository.shared.recibirHerramienta(prestamoId: prestamoId, damageDescription: danio)
                mensaje = danio.nilSiVacio == nil
                    ? "Entrada registrada: \(nombre)."
                    : "Entrada registrada con daño: queda en reparación."
            }
            onHecho(mensaje)
        } catch {
            self.error = EscaneoReglas.mensaje(
                error, accion: "entregar o recibir herramientas", fallback: "No se pudo registrar"
            )
        }
    }
}
