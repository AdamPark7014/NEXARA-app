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

/// La herramienta leída: nombre, modelo, código y serie (un dato por renglón), su estado,
/// el del préstamo y quién la tiene.
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
        let detalle = EscaneoReglas.codigoYSerie(r)
        VStack(alignment: .leading, spacing: 8) {
            Text(EscaneoReglas.nombreHerramientaRenglones(r))
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

/// Registrar la salida (préstamo aprobado: código de recolección y fotos de cómo sale) o la
/// entrada (préstamo en uso: cómo volvió y fotos de después) de la herramienta escaneada.
struct AccionDeHerramienta: View {
    let r: HerramientaPorCodigo
    let accion: EscaneoReglas.AccionHerramienta
    let prestamoId: Int
    let onHecho: (String) -> Void

    @State private var abierta = false
    @State private var guardando = false
    @State private var error: String?

    private var nombre: String { EscaneoReglas.nombreHerramienta(r) }
    private var persona: String { r.prestamo?.usuario?.nombre?.nilSiVacio ?? "quien la pidió" }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HerrDivisor()
            Text(accion == .entregar
                 ? "Para entregarla se pide el código de quien la recoge y una foto de cómo sale."
                 : "Para recibirla se dice cómo volvió y se toma una foto.")
                .font(NxType.labelMedium)
                .foregroundStyle(NxColors.muted)
                .fixedSize(horizontal: false, vertical: true)
            if accion == .entregar, r.prestamo?.vencido == true {
                // Mismo texto que Android (`HerramientasEscaneo.kt`): generar otro
                // código es de quien aprueba, y eso no se hace desde el teléfono.
                Text("El código de recolección ya venció: hay que generar otro en la web.")
                    .font(NxType.bodyMedium)
                    .foregroundStyle(NxColors.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button(accion.etiqueta) {
                error = nil
                abierta = true
            }
            .buttonStyle(HerrBotonLlenoStyle(alto: 52, anchoCompleto: true))
            .disabled(guardando)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .sheet(isPresented: $abierta) {
            switch accion {
            case .entregar:
                HojaDeEntrega(
                    titulo: nombre,
                    persona: persona,
                    // El campo sale siempre: el código prueba que quien la recoge es quien la pidió.
                    pideCodigo: true,
                    codigoObligatorio: r.prestamo?.pickupCode?.nilSiVacio != nil,
                    codigoVencido: r.prestamo?.vencido == true,
                    enviando: guardando,
                    error: error,
                    onCerrar: { abierta = false },
                    onEntregar: { codigo, fotos in
                        Task {
                            await registrar(mensaje: "Salida registrada: \(nombre).") {
                                try await EscaneoRepository.shared.entregarHerramienta(
                                    prestamoId: prestamoId, pickupCode: codigo, fotos: fotos
                                )
                            }
                        }
                    }
                )
            case .recibir:
                HojaDeEntrada(
                    titulo: nombre,
                    persona: persona,
                    fotosDeSalida: EvidenciaPrestamoReglas.urls(r.prestamo?.deliveryPhotos),
                    enviando: guardando,
                    error: error,
                    onCerrar: { abierta = false },
                    onRecibir: { condicion, descripcion, fotos in
                        Task {
                            await registrar(mensaje: EvidenciaPrestamoReglas.avisoEntrada(condicion)) {
                                try await EscaneoRepository.shared.recibirHerramienta(
                                    prestamoId: prestamoId,
                                    condicion: condicion.rawValue,
                                    descripcion: descripcion,
                                    fotos: fotos
                                )
                            }
                        }
                    }
                )
            }
        }
    }

    /// Corre la entrega o la entrada; mientras falle, la hoja se queda abierta con el motivo.
    @MainActor
    private func registrar(mensaje: String, _ enviar: () async throws -> Void) async {
        guard !guardando else { return }
        guardando = true
        error = nil
        defer { guardando = false }
        do {
            try await enviar()
            abierta = false
            onHecho(mensaje)
        } catch {
            self.error = EscaneoReglas.mensaje(
                error, accion: "entregar o recibir herramientas", fallback: "No se pudo registrar"
            )
        }
    }
}
