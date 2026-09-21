import SwiftUI

/// «Viáticos» del hub «Más»: qué pedí, en qué va y cuánto queda del anticipo.
/// Quien autoriza tiene además la pestaña de su gente, con los que esperan
/// decisión.
///
/// Un fallo de red se enseña como aviso **encima** de la lista, nunca en su
/// lugar: el técnico que abre esto en un sótano sigue viendo lo último bueno.
///
/// Va dentro del `NavigationStack` de la cubierta del shell: aquí no se crea otro.
struct ViaticosView: View {
    /// Viático que abrir en cuanto entre (viene del aviso push).
    var abrirId: Int? = nil

    @State private var todos: [Viatico] = []
    @State private var cargando = true
    @State private var error: String?
    @State private var pestana = Pestana.mios
    @State private var pidiendo = false
    @State private var aviso: String?
    @State private var decision: Viatico?
    @State private var destino: ViaticoDestino?

    /// `Int` no es `Identifiable`, y `navigationDestination(item:)` lo exige.
    private struct ViaticoDestino: Identifiable, Hashable {
        let id: Int
    }

    private enum Pestana: String, CaseIterable, Identifiable {
        case mios, equipo
        var id: String { rawValue }
        var titulo: String { self == .mios ? "Míos" : "Del equipo" }
    }

    private var miId: Int? {
        SessionStore.shared.currentUser.flatMap { Int($0.id) }
    }

    /// `viatics.manage` / super admin: quien puede autorizar, pagar y ver a su gente.
    private var administra: Bool {
        guard let user = SessionStore.shared.currentUser else { return false }
        if user.isSuperAdmin { return true }
        return user.permissions.contains { $0 == "viatics.manage" || $0 == "CONSOLE_ADMIN" }
    }

    private var mios: [Viatico] {
        guard let miId else { return todos }
        return todos.filter { $0.usuarioId == nil || $0.usuarioId == miId }
    }

    private var delEquipo: [Viatico] {
        guard let miId else { return [] }
        return todos.filter { $0.usuarioId != nil && $0.usuarioId != miId }
    }

    private var porAutorizar: Int { delEquipo.filter(\.estaPendiente).count }

    private var hayEquipo: Bool { administra && !delEquipo.isEmpty }

    private var visibles: [Viatico] { (hayEquipo && pestana == .equipo) ? delEquipo : mios }

    var body: some View {
        List {
            if let error {
                Section {
                    NxAlertBanner(
                        alert: NxAlert(
                            id: "viaticos",
                            title: error,
                            subtitle: todos.isEmpty ? nil : "Abajo sigue lo último que se pudo leer.",
                            tone: .danger
                        ),
                        actionLabel: "Reintentar",
                        onAction: { Task { await cargar() } }
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
            }

            if hayEquipo {
                Section {
                    Picker("Qué ver", selection: $pestana) {
                        ForEach(Pestana.allCases) { p in
                            Text(p == .equipo && porAutorizar > 0 ? "\(p.titulo) (\(porAutorizar))" : p.titulo)
                                .tag(p)
                        }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                }
            }

            if cargando && todos.isEmpty {
                Section { ProgressView().frame(maxWidth: .infinity) }
            }

            Section {
                ForEach(visibles) { viatico in
                    NavigationLink {
                        ViaticoDetalleView(viaticoId: viatico.id, onCambio: { Task { await cargar() } })
                    } label: {
                        FilaViatico(viatico: viatico, mostrarPersona: hayEquipo && pestana == .equipo)
                    }
                    // Gesto nativo de iOS: el jefe resuelve sin abrir la ficha.
                    // Pide confirmación porque mueve dinero.
                    .swipeActions(edge: .leading, allowsFullSwipe: false) {
                        if administra, viatico.usuarioId != miId, viatico.estaPendiente {
                            Button {
                                decision = viatico
                            } label: {
                                Label("Resolver", systemImage: "checkmark.circle")
                            }
                            .tint(NxTone.success.fg)
                        }
                    }
                }
            }

            if !cargando, visibles.isEmpty {
                Section {
                    if hayEquipo, pestana == .equipo {
                        NxEmptyState(
                            title: "Nada por autorizar",
                            subtitle: "Tu equipo no tiene viáticos esperando decisión."
                        )
                    } else {
                        NxEmptyState(
                            title: "Todavía no pides viáticos",
                            subtitle: "Pon la gasolina, toma la foto del ticket y pídelo aquí mismo. "
                                + "No hace falta esperar a llegar a una computadora.",
                            actionLabel: "Pedir un viático",
                            onAction: { pidiendo = true }
                        )
                    }
                }
                .listRowBackground(Color.clear)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Viáticos")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    pidiendo = true
                } label: {
                    Label("Pedir viático", systemImage: "plus")
                }
                .accessibilityLabel("Pedir viático")
            }
        }
        .refreshable { await cargar() }
        .task { await cargar() }
        .sheet(isPresented: $pidiendo) {
            NuevoViaticoView(onCreado: { mensaje in
                aviso = mensaje
                Task { await cargar() }
            })
        }
        .sheet(item: $decision) { viatico in
            HojaDecisionViatico(viatico: viatico) { mensaje in
                aviso = mensaje
                decision = nil
                Task { await cargar() }
            }
        }
        .navigationDestination(item: $destino) { item in
            ViaticoDetalleView(viaticoId: item.id, onCambio: { Task { await cargar() } })
        }
        .alert(
            "Viáticos",
            isPresented: Binding(get: { aviso != nil }, set: { if !$0 { aviso = nil } })
        ) {
            Button("Entendido") { aviso = nil }
        } message: {
            Text(aviso ?? "")
        }
        .onAppear {
            // El aviso push trae el id: se abre ESE viático, no la lista.
            if let abrirId, destino == nil { destino = ViaticoDestino(id: abrirId) }
        }
    }

    private func cargar() async {
        if todos.isEmpty { cargando = true }
        do {
            todos = try await ViaticosRepository.shared.lista()
            error = nil
        } catch {
            // Se conserva lo que ya estaba: el aviso va arriba, no en su lugar.
            self.error = error.localizedDescription
        }
        cargando = false
    }
}

/// Un viático en la lista: la cifra manda, el estado la acompaña.
private struct FilaViatico: View {
    let viatico: Viatico
    let mostrarPersona: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    if mostrarPersona, let nombre = viatico.usuario?.nombre, !nombre.isEmpty {
                        Text(nombre)
                            .font(.caption.weight(.bold))
                            .foregroundStyle(NxBrand.primary)
                    }
                    Text(viatico.titulo)
                        .font(.body.weight(.semibold))
                        .lineLimit(2)
                    Text(
                        [
                            Viatico.etiquetaCategoria(viatico.categoria),
                            viatico.fechaCorta,
                            viatico.actividad?.anNumber ?? "",
                        ]
                        .filter { !$0.isEmpty }
                        .joined(separator: " · ")
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                }
                Spacer(minLength: 0)
                VStack(alignment: .trailing, spacing: 2) {
                    Text(Dinero.pesos(viatico.vigenteCentavos))
                        .font(.title3.weight(.bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    if viatico.fueRecortado {
                        // El jefe recortó la cifra: se dice, no se esconde.
                        Text("pediste \(Dinero.pesos(viatico.solicitadoCentavos))")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            ChipsDeViatico(viatico: viatico)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}
