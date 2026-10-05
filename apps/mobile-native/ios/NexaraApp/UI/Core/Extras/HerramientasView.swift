import SwiftUI

/// Herramientas (`/erp/almacen/herramientas`) en iPhone: el escáner de etiquetas para
/// saber de quién es una herramienta y, si quien escanea lleva el inventario, registrar
/// su salida o su entrada. Pedir prestada, aprobar y ver el kit llegan con la
/// pantalla completa de Herramientas (paridad con Android).
struct HerramientasView: View {
    var body: some View {
        List {
            EscanerDeHerramientas()

            Section {
                CoreExtrasNotaDeAlcance(
                    texto: "Entregar y recibir con el escáner solo lo puede quien lleva el inventario de herramientas."
                )
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Herramientas")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Escáner de Herramientas: lee la etiqueta Code 128 (o se teclea), enseña la herramienta,
/// su préstamo y quién la tiene, y deja registrar la salida (préstamo aprobado) o la
/// entrada (préstamo en uso). Espejo de `HerramientasEscaneo.kt` en Android.
struct EscanerDeHerramientas: View {
    var onMovimiento: () -> Void = {}

    @State private var buscando = false
    @State private var error: String?
    @State private var aviso: String?
    @State private var resultado: HerramientaPorCodigo?

    var body: some View {
        Section {
            EscanearOEscribirCodigo(
                titulo: "Escanear herramienta",
                formatos: .etiquetaHerramienta,
                buscando: buscando,
                etiquetaCampo: "Código de la etiqueta",
                mayusculas: true
            ) { valor in
                Task { await buscar(valor) }
            }
            if let error {
                Text(error).font(.footnote).foregroundStyle(CorePalette.red)
            }
            if let aviso {
                NxIconText(systemName: "checkmark.circle.fill", text: aviso, tint: CorePalette.green)
                    .font(.footnote.weight(.semibold))
            }
        } header: {
            Text("Escanear herramienta")
        } footer: {
            if resultado == nil {
                Text("Lee la etiqueta NEXARA de la herramienta (o escribe su código) para ver quién la tiene.")
            }
        }

        if let r = resultado {
            herramientaSection(r)
            if let accion = EscaneoReglas.accion(r), let prestamoId = r.prestamo?.id {
                AccionDeHerramientaSection(r: r, accion: accion, prestamoId: prestamoId) { mensaje in
                    onMovimiento()
                    Task { await buscar(r.codigo ?? "", avisoPrevio: mensaje) }
                }
                .id(prestamoId)
            }
            Section {
                Button("Escanear otra") {
                    resultado = nil
                    aviso = nil
                    error = nil
                }
            }
        }
    }

    private func herramientaSection(_ r: HerramientaPorCodigo) -> some View {
        let (texto, color) = tono(r.item?.status)
        let detalle = [r.codigo?.nilSiVacio, r.item?.serialNumber?.nilSiVacio.map { "Serie \($0)" }]
            .compactMap { $0 }
            .joined(separator: " · ")
        return Section {
            VStack(alignment: .leading, spacing: 6) {
                Text(EscaneoReglas.nombreHerramienta(r)).font(.headline)
                if !detalle.isEmpty {
                    Text(detalle).font(.caption).foregroundStyle(.secondary)
                }
                CoreChip(text: texto, color: color)
            }
            .padding(.vertical, 2)
            Text(EscaneoReglas.estadoPrestamo(r.prestamo?.status))
            if let quien = EscaneoReglas.quienLaTiene(r) {
                Text(quien).font(.body.weight(.semibold))
            }
            if let fecha = CoreFormat.when(r.prestamo?.expectedReturnDate) {
                LabeledContent("Devolución esperada", value: fecha)
            }
            if r.esMia == true {
                Text("Está a tu nombre.").font(.footnote).foregroundStyle(.secondary)
            }
        } header: {
            Text("Herramienta")
        }
    }

    private func tono(_ status: String?) -> (String, Color) {
        let texto = EscaneoReglas.estadoHerramienta(status)
        switch status {
        case "AVAILABLE": return (texto, CorePalette.green)
        case "IN_REPAIR": return (texto, CorePalette.orange)
        case "RETIRED": return (texto, CorePalette.red)
        default: return (texto, CorePalette.blue)
        }
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

private struct AccionDeHerramientaSection: View {
    let r: HerramientaPorCodigo
    let accion: EscaneoReglas.AccionHerramienta
    let prestamoId: Int
    let onHecho: (String) -> Void

    @State private var codigoRecogida = ""
    @State private var dano = ""
    @State private var guardando = false
    @State private var error: String?

    var body: some View {
        Section {
            switch accion {
            case .entregar:
                if r.prestamo?.vencido == true {
                    Text("El código de recolección ya venció: hay que generar otro en la web.")
                        .foregroundStyle(CorePalette.red)
                }
                TextField("Código de recolección", text: $codigoRecogida)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
            case .recibir:
                TextField("¿Llegó con daño? Descríbelo (opcional)", text: $dano, axis: .vertical)
                    .lineLimit(1...4)
            }
            if let error {
                Text(error).font(.footnote).foregroundStyle(CorePalette.red)
            }
            Button {
                Task { await registrar() }
            } label: {
                Text(guardando ? "Registrando…" : accion.etiqueta)
            }
            .buttonStyle(NxPrimaryButtonStyle())
            .disabled(guardando)
            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        } header: {
            Text(accion.etiqueta)
        } footer: {
            Text(accion == .entregar
                 ? "Para entregarla, teclea el código de recolección que enseña quien la recoge."
                 : "Con daño queda en reparación.")
        }
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
                try await EscaneoRepository.shared.recibirHerramienta(prestamoId: prestamoId, damageDescription: dano)
                mensaje = dano.nilSiVacio == nil
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
