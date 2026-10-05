import SwiftUI

/// Escáner de etiquetas de herramienta (Code 128 con la nomenclatura interna, p. ej.
/// `MUL-12345`): enseña la herramienta, quién la tiene y, si hay un préstamo aprobado
/// o en uso, deja registrar la salida o la entrada. Entregar y recibir son de almacén
/// (`tools.manage`): a los demás el API contesta 403 y aquí se explica.
///
/// Espejo de `HerramientasEscaneo.kt` en Android: una tarjeta blanca (`MoreTarjeta`)
/// con el botón de cámara, el campo para teclear el código y el resultado debajo.
struct EscanerDeHerramientas: View {
    var onMovimiento: () -> Void = {}

    @State private var buscando = false
    @State private var error: String?
    @State private var aviso: String?
    @State private var resultado: HerramientaPorCodigo?
    @State private var manual = ""
    @State private var escaneando = false

    var body: some View {
        MoreTarjeta {
            Text("Escanear herramienta")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(NxColors.fg)
                .accessibilityAddTraits(.isHeader)
            Text("Lee la etiqueta NEXARA de la herramienta (o escribe su código) para ver quién la tiene.")
                .font(NxType.labelMedium)
                .foregroundStyle(NxColors.muted)
                .fixedSize(horizontal: false, vertical: true)

            escanearOEscribir

            if let error {
                Text(error)
                    .font(NxType.bodyMedium)
                    .foregroundStyle(NxColors.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let aviso {
                Text(aviso)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(NxColors.success)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let r = resultado {
                HerrDivisor()
                HerramientaEscaneadaVista(r: r)
                if let accion = EscaneoReglas.accion(r), let prestamoId = r.prestamo?.id {
                    AccionDeHerramienta(r: r, accion: accion, prestamoId: prestamoId) { mensaje in
                        onMovimiento()
                        Task { await buscar(r.codigo ?? "", avisoPrevio: mensaje) }
                    }
                    .id(prestamoId)
                }
                Button("Escanear otra") {
                    resultado = nil
                    aviso = nil
                    error = nil
                }
                .buttonStyle(HerrBotonTextoStyle())
            }
        }
        .fullScreenCover(isPresented: $escaneando) {
            BarcodeScannerSheet(
                titulo: "Escanear herramienta",
                formatos: .etiquetaHerramienta,
                onCodigo: { codigo in
                    escaneando = false
                    manual = codigo
                    Task { await buscar(codigo) }
                },
                onCancel: { escaneando = false }
            )
        }
    }

    /// Android `EscanearOEscribirCodigo`: botón de cámara a todo lo ancho y, debajo,
    /// el campo para escribir el código con su «Buscar» (etiquetas rotas o sin luz).
    private var escanearOEscribir: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(buscando ? "Buscando…" : "Escanear con la cámara") { escaneando = true }
                .buttonStyle(HerrBotonLlenoStyle(alto: 52, anchoCompleto: true))
                .disabled(buscando)
            HStack(alignment: .center, spacing: 8) {
                HerrCampoContorno(
                    etiqueta: "Código de la etiqueta",
                    texto: $manual,
                    mayusculas: true,
                    limite: CodigoBarras.largoMaximo + 8,
                    alEnviar: { buscarManual() }
                )
                Button("Buscar") { buscarManual() }
                    .buttonStyle(HerrBotonContornoStyle(alto: 52))
                    .disabled(buscando || manual.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }

    private func buscarManual() {
        let texto = manual.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !texto.isEmpty, !buscando else { return }
        Task { await buscar(texto) }
    }

    @MainActor
    private func buscar(_ valor: String, avisoPrevio: String? = nil) async {
        if let motivo = CodigoBarras.motivoEtiquetaInvalida(valor) {
            error = motivo
            return
        }
        let codigo = CodigoBarras.normalizarEtiquetaHerramienta(valor)
        buscando = true
        error = nil
        aviso = avisoPrevio
        defer { buscando = false }
        do {
            resultado = try await EscaneoRepository.shared.herramientaPorCodigo(codigo)
        } catch {
            resultado = nil
            self.error = EscaneoReglas.mensaje(
                error, accion: "consultar herramientas", fallback: "No se pudo buscar la etiqueta"
            )
        }
    }
}

/// La herramienta leída: nombre, código y serie, su estado, el del préstamo y quién la tiene.
private struct HerramientaEscaneadaVista: View {
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
private struct AccionDeHerramienta: View {
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
