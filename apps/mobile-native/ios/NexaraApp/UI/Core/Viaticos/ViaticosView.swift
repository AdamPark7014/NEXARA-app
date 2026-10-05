import SwiftUI

/// Pestaña de la lista de viáticos.
private enum PestanaViaticos {
    case mios, equipo
}

/// «Viáticos» del hub «Más» (Android `ViaticosScreen`): qué pedí, en qué va y
/// cuánto queda del anticipo. Quien autoriza tiene además la pestaña de su
/// gente, con la insignia de los que esperan decisión.
///
/// Un fallo de red se enseña como aviso **encima** de la lista, nunca en su
/// lugar: el técnico que abre esto en un sótano sigue viendo lo último bueno.
///
/// Va dentro del `NavigationStack` de la cubierta del shell: aquí no se crea
/// otro. El título «Viáticos» lo pone quien abre la pantalla.
struct ViaticosView: View {
    /// Viático que abrir en cuanto entre (viene del aviso push).
    var abrirId: Int? = nil

    @State private var todos: [Viatico] = []
    @State private var cargando = true
    @State private var cargado = false
    @State private var error: String?
    @State private var pestana = PestanaViaticos.mios
    @State private var pidiendo = false
    @State private var mensaje: String?
    @State private var decision: Viatico?
    @State private var destino: ViaticoDestino?
    /// El aviso push se abre UNA vez: al volver del detalle no se reabre.
    @State private var avisoAbierto = false

    /// `Int` no es `Identifiable`, y `navigationDestination(item:)` lo exige.
    private struct ViaticoDestino: Identifiable, Hashable {
        let id: Int
    }

    private var miId: Int? { ViaticoSesion.miId }

    /// Android `ViaticosViewModel.cargar`: lo mío es lo que no trae dueño o es mío.
    private var mios: [Viatico] {
        guard let miId else { return todos }
        return todos.filter { $0.usuarioId == nil || $0.usuarioId == miId }
    }

    private var delEquipo: [Viatico] {
        guard let miId else { return [] }
        return todos.filter { $0.usuarioId != nil && $0.usuarioId != miId }
    }

    /// Cuántos del equipo esperan una decisión: es la insignia de la pestaña.
    private var porAutorizar: Int { delEquipo.filter(\.estaPendiente).count }

    private var hayEquipo: Bool { ViaticoSesion.administra && !delEquipo.isEmpty }

    private var enEquipo: Bool { hayEquipo && pestana == .equipo }

    private var lista: [Viatico] { enEquipo ? delEquipo : mios }

    private var vacio: Bool { todos.isEmpty }

    /// Con la lista vacía el propio estado vacío ya ofrece «Pedir un viático»:
    /// dos primarios para la misma acción sobran (Android, regla 4).
    private var vacioYaInvita: Bool { !cargando && lista.isEmpty && !enEquipo }

    var body: some View {
        VStack(spacing: 0) {
            if hayEquipo {
                PestanasDeViaticos(pestana: $pestana, porAutorizar: porAutorizar)
            }
            ScrollView {
                LazyVStack(alignment: .leading, spacing: NxSpacing.listGap) {
                    if let error {
                        NxAlertBanner(
                            alert: NxAlert(
                                id: "viaticos-error",
                                title: error,
                                subtitle: vacio ? nil : "Abajo sigue lo último que se pudo leer.",
                                tone: .danger
                            ),
                            actionLabel: "Reintentar",
                            onAction: { Task { await cargar() } }
                        )
                    }

                    if cargando && vacio {
                        NxSkeletonList(itemCount: 4, itemHeight: 96)
                    }

                    ForEach(lista) { viatico in
                        tarjeta(viatico)
                    }

                    if !cargando, lista.isEmpty {
                        if enEquipo {
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

                    Color.clear.frame(height: 8)
                }
                .padding(.horizontal, NxSpacing.screenH)
                .padding(.top, 12)
                .padding(.bottom, 96)
            }
            .refreshable { await cargar() }
        }
        .nxScreenBackground()
        // Pedir es la acción de esta pantalla: siempre a la mano del pulgar.
        .nxFab("Pedir viático", systemImage: "plus", visible: !vacioYaInvita) {
            pidiendo = true
        }
        .avisoSnackbar($mensaje, abajo: 72)
        .task {
            if !cargado { await cargar() }
        }
        .navigationDestination(isPresented: $pidiendo) {
            NuevoViaticoView(onCreado: { texto in
                mensaje = texto
                Task { await cargar() }
            })
            .nxBrandNavBar(title: "Pedir viático")
        }
        .navigationDestination(item: $destino) { item in
            ViaticoDetalleView(viaticoId: item.id, onCambio: { Task { await cargar() } })
                .nxBrandNavBar(title: "Viático")
        }
        .sheet(item: $decision) { viatico in
            HojaDecisionViatico(viatico: viatico) { texto in
                mensaje = texto
                decision = nil
                Task { await cargar() }
            }
        }
        .onAppear {
            // El aviso push trae el id: se abre ESE viático, no la lista. Una sola vez.
            if let abrirId, !avisoAbierto {
                avisoAbierto = true
                destino = ViaticoDestino(id: abrirId)
            }
        }
    }

    /// La tarjeta; a un viático del equipo que espera decisión se le puede
    /// autorizar o rechazar con una pulsación larga, como en la fila de la web.
    @ViewBuilder
    private func tarjeta(_ viatico: Viatico) -> some View {
        let base = TarjetaViatico(viatico: viatico, mostrarPersona: enEquipo) {
            destino = ViaticoDestino(id: viatico.id)
        }
        if ViaticoSesion.administra, let miId, viatico.usuarioId != nil, viatico.usuarioId != miId, viatico.estaPendiente {
            base.contextMenu {
                Button {
                    decision = viatico
                } label: {
                    Label("Autorizar o rechazar", systemImage: "checkmark.circle")
                }
            }
        } else {
            base
        }
    }

    private func cargar() async {
        if todos.isEmpty { cargando = true }
        do {
            todos = try await ViaticosRepository.shared.lista()
            error = nil
            cargado = true
        } catch {
            // Se conserva lo que ya estaba: el aviso va arriba, no en su lugar.
            self.error = error.toUserMessage(fallback: "No se pudieron cargar tus viáticos")
        }
        cargando = false
    }
}

/// Pestañas subrayadas «Míos» | «Del equipo» (Android `TabRow` blanco): letra
/// 14 SemiBold, la activa en marca con su subrayado y la insignia roja de los
/// que esperan decisión junto a «Del equipo».
private struct PestanasDeViaticos: View {
    @Binding var pestana: PestanaViaticos
    let porAutorizar: Int

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                boton(.mios, titulo: "Míos", insignia: 0)
                boton(.equipo, titulo: "Del equipo", insignia: porAutorizar)
            }
            Rectangle().fill(NxColors.border).frame(height: 1)
        }
        .background(NxColors.card)
    }

    private func boton(_ destino: PestanaViaticos, titulo: String, insignia: Int) -> some View {
        let activa = pestana == destino
        return Button {
            pestana = destino
        } label: {
            VStack(spacing: 0) {
                HStack(spacing: 6) {
                    Text(titulo)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(activa ? NxColors.brand : NxColors.muted)
                        .lineLimit(1)
                    if insignia > 0 {
                        NxCountBadge(count: insignia)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 45)
                Rectangle()
                    .fill(activa ? NxColors.brand : Color.clear)
                    .frame(height: 3)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(titulo)
        .accessibilityValue(insignia > 0 ? "\(insignia) por autorizar" : "")
        .accessibilityAddTraits(activa ? AccessibilityTraits.isSelected : [])
    }
}

/// Un viático en la lista (Android `TarjetaViatico`): la cifra manda, el estado
/// la acompaña. Toda la tarjeta es un solo objetivo de toque y se lee de una
/// vez con VoiceOver.
private struct TarjetaViatico: View {
    let viatico: Viatico
    let mostrarPersona: Bool
    let onClick: () -> Void

    private var persona: String {
        (viatico.usuario?.nombre ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var meta: String {
        [
            Viatico.etiquetaCategoria(viatico.categoria),
            FechaMexico.dia(iso: viatico.fechaSolicitud) ?? "",
            (viatico.actividad?.anNumber ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
        ]
        .filter { !$0.isEmpty }
        .joined(separator: " · ")
    }

    private var descripcion: String {
        var partes: [String] = []
        if mostrarPersona, !persona.isEmpty { partes.append(persona) }
        partes.append(viatico.titulo)
        partes.append(Dinero.pesos(viatico.vigenteCentavos))
        partes.append(NxStatusText.label(viatico.estatus))
        if let resumen = viatico.liquidacion?.resumenCorto { partes.append(resumen) }
        return partes.joined(separator: ". ")
    }

    var body: some View {
        NxPanelShell(onClick: onClick) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        if mostrarPersona, !persona.isEmpty {
                            Text(persona)
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(NxColors.brand)
                                .lineLimit(1)
                        }
                        Text(viatico.titulo)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(NxColors.fg)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                        Text(meta)
                            .font(NxType.labelMedium)
                            .foregroundStyle(NxColors.muted)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(Dinero.pesos(viatico.vigenteCentavos))
                            .font(.system(size: 22, weight: .bold))
                            .foregroundStyle(NxColors.fg)
                            .lineLimit(1)
                        if viatico.fueRecortado {
                            // El jefe recortó la cifra: se dice, no se esconde.
                            Text("pediste \(Dinero.pesos(viatico.solicitadoCentavos))")
                                .font(NxType.labelSmall)
                                .foregroundStyle(NxColors.muted)
                        }
                    }
                }
                ChipsDeViatico(viatico: viatico)
            }
        }
        .accessibilityLabel(descripcion)
    }
}
