import SwiftUI

/// «¿Qué sigue?» y Mis pendientes (Velocidad Core, Ola 6): en Mi día, cuando no traes nada corriendo.
/// «Empezar» crea la actividad a tu nombre y arranca el reloj, sin escribir nada.
struct QueSigueSection: View {
    let onOpenActivity: (Int) -> Void
    let onOpenActividades: () -> Void

    @State private var datos: QueSigueRespuesta?
    @State private var pendientes: [PendientePersonal] = []
    @State private var texto = ""
    @State private var ocupado = false
    @State private var error: String?

    var body: some View {
        Group {
            if let datos, datos.aplica {
                VStack(alignment: .leading, spacing: 12) {
                    tarjetaSugerencias(datos)
                    tarjetaPendientes
                }
            }
        }
        .task { await recargar() }
    }

    private func recargar() async {
        // Sin red o con una API vieja, esta parte no estorba: el resto de Mi día sigue.
        guard let q = try? await QueSigueRepository.shared.queSigue() else { return }
        datos = q
        if let p = try? await QueSigueRepository.shared.pendientes() { pendientes = p }
    }

    private func correr(porDefecto: String, _ accion: @escaping () async throws -> Void) {
        ocupado = true
        error = nil
        Task { @MainActor in
            do {
                try await accion()
            } catch {
                self.error = error.toUserMessage(fallback: porDefecto)
            }
            await recargar()
            ocupado = false
        }
    }

    private func arrancar(_ accion: @escaping () async throws -> ActividadArrancada) {
        ocupado = true
        error = nil
        Task { @MainActor in
            do {
                let r = try await accion()
                ocupado = false
                onOpenActivity(r.activityId)
            } catch {
                self.error = error.toUserMessage(fallback: "No se pudo empezar")
                await recargar()
                ocupado = false
            }
        }
    }

    private func tarjetaSugerencias(_ d: QueSigueRespuesta) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("¿Qué sigue?")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(NxColors.fg)
            if let error {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundStyle(NxColors.danger)
            }
            ForEach(d.sugerencias) { s in
                filaSugerencia(s)
            }
            if let resumen = d.resumen {
                Text(resumen)
                    .font(.system(size: 13))
                    .foregroundStyle(NxColors.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .nxCardSurface(radius: 22)
    }

    private func filaSugerencia(_ s: SugerenciaQueSigue) -> some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(s.titulo)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
                    .fixedSize(horizontal: false, vertical: true)
                if let detalle = s.detalle {
                    Text(detalle)
                        .font(.system(size: 12.5))
                        .foregroundStyle(NxColors.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            botonSugerencia(s)
        }
    }

    @ViewBuilder
    private func botonSugerencia(_ s: SugerenciaQueSigue) -> some View {
        switch QueSigueRules.boton(de: s) {
        case .empezar:
            if s.tipo == "fija" {
                Button("Empezar") { arrancar { try await QueSigueRepository.shared.empezar(clave: s.clave) } }
                    .buttonStyle(.bordered)
                    .tint(NxColors.brand)
                    .disabled(ocupado)
            } else {
                Button("Empezar") { arrancar { try await QueSigueRepository.shared.empezar(clave: s.clave) } }
                    .buttonStyle(.borderedProminent)
                    .tint(NxColors.brand)
                    .disabled(ocupado)
            }
        case .abrirActividad:
            Button("Abrir") {
                if let id = QueSigueRules.actividadDe(s.href) { onOpenActivity(id) }
            }
            .tint(NxColors.brandText)
            .disabled(ocupado)
        case .abrirActividades:
            Button("Abrir") { onOpenActividades() }
                .tint(NxColors.brandText)
                .disabled(ocupado)
        case .ninguno:
            EmptyView()
        }
    }

    private var tarjetaPendientes: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Mis pendientes")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(NxColors.fg)
            HStack(spacing: 8) {
                TextField("Anota algo para no olvidarlo…", text: $texto)
                    .textFieldStyle(.roundedBorder)
                Button("Agregar") { agregar() }
                    .disabled(ocupado || !QueSigueRules.pendienteValido(texto))
                    .tint(NxColors.brandText)
            }
            if pendientes.isEmpty {
                Text("Lo que anotes aquí solo lo ves tú. Palomea lo que ya hiciste, o hazlo actividad con un toque.")
                    .font(.system(size: 13))
                    .foregroundStyle(NxColors.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ForEach(pendientes) { p in
                filaPendiente(p)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .nxCardSurface(radius: 22)
    }

    private func agregar() {
        let limpio = texto.trimmingCharacters(in: .whitespacesAndNewlines)
        correr(porDefecto: "No se pudo guardar tu pendiente") {
            try await QueSigueRepository.shared.agregar(texto: limpio)
            await MainActor.run { texto = "" }
        }
    }

    private func filaPendiente(_ p: PendientePersonal) -> some View {
        HStack(spacing: 8) {
            Button {
                correr(porDefecto: "No se pudo palomear") { try await QueSigueRepository.shared.palomear(id: p.id) }
            } label: {
                Image(systemName: "square")
                    .foregroundStyle(NxColors.muted)
            }
            .buttonStyle(.plain)
            .disabled(ocupado)
            .accessibilityLabel("Palomear \(p.texto)")
            Text(p.texto)
                .font(.system(size: 14))
                .foregroundStyle(NxColors.fg)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
            Button("Empezar") { arrancar { try await QueSigueRepository.shared.empezarPendiente(id: p.id) } }
                .font(.system(size: 13, weight: .semibold))
                .tint(NxColors.brandText)
                .disabled(ocupado)
            Button("Borrar") {
                correr(porDefecto: "No se pudo borrar") { try await QueSigueRepository.shared.borrar(id: p.id) }
            }
            .font(.system(size: 13))
            .tint(NxColors.muted)
            .disabled(ocupado)
        }
    }
}
