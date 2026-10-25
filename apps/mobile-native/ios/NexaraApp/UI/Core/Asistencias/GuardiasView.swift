import SwiftUI

/// Renglón de Asistencias que abre la pantalla de guardias.
struct GuardiasEntrada: View {
    let onClick: () -> Void

    var body: some View {
        Button(action: onClick) {
            VStack(spacing: 0) {
                HStack {
                    Text("Guardias")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(NxColors.fg)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(NxColors.fg4)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                Rectangle().fill(NxColors.border).frame(height: 1)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Guardias")
    }
}

/// Programar guardias de sábado y domingo. La barra es clara y lleva volver.
/// Las personas salen de `GET /guardias`; la app no vuelve a filtrar el equipo.
struct GuardiasView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var datos: GuardiasRango?
    @State private var cargando = true
    @State private var error: String?
    @State private var personaId: Int?
    @State private var fecha = ""
    @State private var nota = ""
    @State private var guardando = false
    @State private var errorForm: String?
    @State private var aviso: String?
    @State private var porQuitar: GuardiaItem?
    @State private var selector: SelectorCampo?
    @FocusState private var notaFoco: Bool

    private enum SelectorCampo: String, Identifiable {
        case persona, dia
        var id: String { rawValue }
    }

    var body: some View {
        NavigationStack {
            contenido
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(NxColors.surface)
                .navigationTitle("Guardias")
                .navigationBarTitleDisplayMode(.inline)
                .navigationBarBackButtonHidden(true)
                .toolbarBackground(Color.white, for: .navigationBar)
                .toolbarBackground(.visible, for: .navigationBar)
                .toolbarColorScheme(.light, for: .navigationBar)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button { dismiss() } label: {
                            Image(systemName: "chevron.backward")
                                .font(.system(size: 17, weight: .semibold))
                                .foregroundStyle(NxColors.fg)
                        }
                        .accessibilityLabel("Volver")
                    }
                }
        }
        .onAppear { NxStatusBar.textoBlanco(false) }
        .onDisappear { NxStatusBar.textoBlanco(true) }
        .task { await cargar() }
        .sheet(item: $selector) { campo in
            selectorHoja(campo)
        }
        .alert(
            "Quitar guardia",
            isPresented: Binding(get: { porQuitar != nil }, set: { if !$0 { porQuitar = nil } }),
            presenting: porQuitar
        ) { item in
            Button("Quitar", role: .destructive) { Task { await quitarGuardia(item) } }
            Button("Cancelar", role: .cancel) { porQuitar = nil }
        } message: { item in
            let nombre = item.persona?.nombre.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? "Esta persona"
            Text(GuardiasTextos.confirmarQuitar(nombre: nombre, dia: GuardiasFechas.diaCorto(item.fecha)))
        }
    }

    @ViewBuilder
    private var contenido: some View {
        if cargando && datos == nil {
            ProgressView().tint(NxColors.brand)
        } else if let error, datos == nil {
            frase(error, accion: "Reintentar") { Task { await cargar() } }
        } else if let datos, GuardiasFechas.mostrarVacio(puedeProgramar: datos.puedeProgramar, guardias: datos.items.count) {
            frase(GuardiasTextos.vacio)
        } else if let datos {
            let dias = GuardiasFechas.diasProgramables(desde: datos.desde, hasta: datos.hasta, hoy: datos.hoy)
            let fines = GuardiasFechas.finesDeSemana(desde: datos.desde, hasta: datos.hasta)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if let error {
                        frase(error, accion: "Reintentar", centrada: false) { Task { await cargar() } }
                    }
                    if datos.puedeProgramar {
                        formulario(datos: datos, dias: dias)
                    }
                    ForEach(Array(fines.enumerated()), id: \.offset) { _, fin in
                        finBloque(fin, datos: datos)
                    }
                }
                .padding(.bottom, 24)
            }
            .refreshable { await cargar() }
        }
    }

    private func formulario(datos: GuardiasRango, dias: [String]) -> some View {
        let persona = datos.personas.first { $0.id == personaId }
        return VStack(alignment: .leading, spacing: 0) {
            campo("Persona", valor: persona.map(etiquetaPersona) ?? "", vacio: "Elige a quién") {
                selector = .persona
            }
            campo("Día", valor: fecha.isEmpty ? "" : GuardiasFechas.diaCorto(fecha), vacio: "Sábado o domingo") {
                selector = .dia
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("Nota").font(.system(size: 12)).foregroundStyle(NxColors.muted)
                TextField("Opcional", text: $nota)
                    .focused($notaFoco)
                    .font(.system(size: 16))
                    .foregroundStyle(NxColors.fg)
                    .onChange(of: nota) { _, nuevo in
                        if nuevo.count > 300 { nota = String(nuevo.prefix(300)) }
                    }
            }
            .padding(.vertical, 10)
            Rectangle().fill(NxColors.border).frame(height: 1)
            if let errorForm {
                Text(errorForm).font(.system(size: 14)).foregroundStyle(NxColors.danger).padding(.top, 8)
            }
            if let aviso {
                Text(aviso).font(.system(size: 14)).foregroundStyle(NxColors.muted).padding(.top, 8)
            }
            Button {
                notaFoco = false
                Task { await programar() }
            } label: {
                ZStack {
                    if guardando {
                        ProgressView().tint(.white)
                    } else {
                        Text("Programar").font(.system(size: 16, weight: .semibold))
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 52)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.white)
            .background(NxColors.brand, in: RoundedRectangle(cornerRadius: 12))
            .opacity(personaId == nil || fecha.isEmpty || guardando || dias.isEmpty ? 0.45 : 1)
            .disabled(personaId == nil || fecha.isEmpty || guardando || dias.isEmpty)
            .padding(.top, 14)
            Rectangle().fill(NxColors.border).frame(height: 1).padding(.top, 18)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    private func campo(_ etiqueta: String, valor: String, vacio: String, accion: @escaping () -> Void) -> some View {
        Button(action: accion) {
            VStack(alignment: .leading, spacing: 2) {
                Text(etiqueta).font(.system(size: 12)).foregroundStyle(NxColors.muted)
                HStack {
                    Text(valor.isEmpty ? vacio : valor)
                        .font(.system(size: 16))
                        .foregroundStyle(valor.isEmpty ? NxColors.muted : NxColors.fg)
                        .lineLimit(1)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(NxColors.fg4)
                }
            }
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) { Rectangle().fill(NxColors.border).frame(height: 1) }
    }

    @ViewBuilder
    private func finBloque(_ fin: FinDeSemana, datos: GuardiasRango) -> some View {
        let dias = [fin.sabado, fin.domingo].compactMap { $0 }
        let hay = dias.contains { dia in datos.items.contains { $0.fecha == dia } }
        if datos.puedeProgramar || hay {
            VStack(alignment: .leading, spacing: 0) {
                Text(GuardiasFechas.tituloFin(fin))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(NxColors.muted)
                    .padding(.bottom, 4)
                ForEach(dias, id: \.self) { dia in
                    let lista = datos.items.filter { $0.fecha == dia }
                    if datos.puedeProgramar || !lista.isEmpty {
                        Button {
                            if datos.puedeProgramar && dia >= datos.hoy { fecha = dia; errorForm = nil }
                        } label: {
                            HStack(alignment: .firstTextBaseline) {
                                Text(GuardiasFechas.diaCorto(dia))
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(NxColors.fg)
                                    .frame(width: 92, alignment: .leading)
                                if lista.isEmpty {
                                    Text(GuardiasTextos.nadie)
                                        .font(.system(size: 15))
                                        .foregroundStyle(NxColors.muted)
                                }
                                Spacer(minLength: 0)
                            }
                            .padding(.vertical, 8)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(!datos.puedeProgramar || dia < datos.hoy)
                        ForEach(lista) { g in
                            HStack(alignment: .center) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(g.persona?.nombre.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? "Persona")
                                        .font(.system(size: 16, weight: .medium))
                                        .foregroundStyle(NxColors.fg)
                                        .lineLimit(1)
                                    if let nota = g.nota?.trimmingCharacters(in: .whitespacesAndNewlines), !nota.isEmpty {
                                        Text(nota)
                                            .font(.system(size: 13))
                                            .foregroundStyle(NxColors.muted)
                                            .lineLimit(2)
                                    }
                                }
                                Spacer(minLength: 8)
                                    if g.puedeQuitar {
                                    Button("Quitar") { porQuitar = g }
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundStyle(NxColors.danger)
                                }
                            }
                            .padding(.leading, 92)
                            .padding(.bottom, 8)
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }

    private func selectorHoja(_ campo: SelectorCampo) -> some View {
        let opciones: [(String, String)] = {
            guard let datos else { return [] }
            if campo == .persona {
                return datos.personas.map { ("\($0.id)", etiquetaPersona($0)) }
            }
            return GuardiasFechas.diasProgramables(desde: datos.desde, hasta: datos.hasta, hoy: datos.hoy)
                .map { ($0, GuardiasFechas.diaCorto($0)) }
        }()
        return NavigationStack {
            List {
                if opciones.isEmpty {
                    Text(campo == .dia ? "No hay sábado ni domingo por programar." : "No hay personas.")
                        .foregroundStyle(NxColors.muted)
                } else {
                    ForEach(opciones, id: \.0) { id, etiqueta in
                        Button(etiqueta) {
                            if campo == .persona { personaId = Int(id) } else { fecha = id }
                            errorForm = nil
                            aviso = nil
                            selector = nil
                        }
                        .foregroundStyle(NxColors.fg)
                    }
                }
            }
            .navigationTitle(campo == .persona ? "Persona" : "Día")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { selector = nil }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .onAppear { NxStatusBar.textoBlanco(false) }
    }

    private func frase(_ texto: String, accion: String? = nil, centrada: Bool = true, onAccion: (() -> Void)? = nil) -> some View {
        VStack(alignment: centrada ? .center : .leading, spacing: 4) {
            Text(texto)
                .font(.system(size: 16))
                .foregroundStyle(NxColors.fg)
                .multilineTextAlignment(centrada ? .center : .leading)
            if let accion, let onAccion {
                Button(accion, action: onAccion)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(NxColors.brandText)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: centrada ? .infinity : nil, alignment: centrada ? .center : .leading)
        .padding(.horizontal, centrada ? 28 : 20)
        .padding(.vertical, centrada ? 0 : 16)
    }

    private func etiquetaPersona(_ p: PersonaGuardia) -> String {
        let nombre = p.nombre.trimmingCharacters(in: .whitespacesAndNewlines)
        let puesto = p.puesto?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let base = nombre.isEmpty ? "Persona" : nombre
        return puesto.isEmpty ? base : "\(base) · \(puesto)"
    }

    private func cargar() async {
        if datos == nil { cargando = true }
        error = nil
        do {
            let rango = try await GuardiasRepository.listar()
            datos = rango
            let dias = GuardiasFechas.diasProgramables(desde: rango.desde, hasta: rango.hasta, hoy: rango.hoy)
            if let personaId, !rango.personas.contains(where: { $0.id == personaId }) { self.personaId = nil }
            if !fecha.isEmpty && !dias.contains(fecha) { fecha = "" }
        } catch {
            self.error = error.toUserMessage(fallback: GuardiasTextos.errorCarga)
        }
        cargando = false
    }

    private func programar() async {
        guard let personaId, !fecha.isEmpty, !guardando else { return }
        guardando = true
        errorForm = nil
        aviso = nil
        do {
            try await GuardiasRepository.programar(userId: personaId, fecha: fecha, nota: nota)
            self.personaId = nil
            nota = ""
            await cargar()
        } catch {
            errorForm = error.toUserMessage(fallback: GuardiasTextos.errorProgramar)
        }
        guardando = false
    }

    private func quitarGuardia(_ item: GuardiaItem) async {
        do {
            try await GuardiasRepository.quitar(id: item.id)
            porQuitar = nil
            await cargar()
        } catch {
            self.error = error.toUserMessage(fallback: GuardiasTextos.errorQuitar)
            porQuitar = nil
        }
    }
}
