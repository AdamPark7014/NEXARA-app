import SwiftUI

// MARK: - Confirmación de servicio (Android `TicketsFeedbackPendingScreen`)

/// Borrador de la evaluación de un servicio (Android `FeedbackDraft`): cinco
/// estrellas y «Sí» en todo hasta que el cliente diga otra cosa.
struct PortalFeedbackDraft: Equatable {
    var rating = "5"
    var wasOnTime = "YES"
    var wasFriendly = "YES"
    var wasSolved = "YES"
    var comments = ""
}

@MainActor
final class PortalFeedbackVM: ObservableObject {
    @Published var isLoading = true
    @Published var refreshingVisible = false
    @Published var saving = false
    @Published var error: String?
    @Published var message: String?
    @Published var items: [PendingFeedbackItem] = []
    @Published var drafts: [Int64: PortalFeedbackDraft] = [:]

    private var started = false

    func start() {
        guard !started else { return }
        started = true
        Task { await refresh(.initial) }
    }

    func refresh(_ mode: PortalLoad) async {
        switch mode {
        case .initial: isLoading = true
        case .visible: refreshingVisible = true
        case .pull, .silent: break
        }
        error = nil
        // Android borra el aviso en cada recarga, también en la que sigue al
        // envío: «Evaluación enviada. ¡Gracias!» no llegaba a verse.
        if mode == .initial || mode == .pull { message = nil }
        do {
            let list = try await TicketsRepository.shared.pendingFeedbackItems()
            var next: [Int64: PortalFeedbackDraft] = [:]
            for item in list {
                next[item.id] = drafts[item.id] ?? PortalFeedbackDraft()
            }
            items = list
            drafts = next
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo cargar feedback pendiente")
        }
        isLoading = false
        refreshingVisible = false
    }

    func draft(_ id: Int64) -> PortalFeedbackDraft {
        drafts[id] ?? PortalFeedbackDraft()
    }

    func update(_ id: Int64, _ change: (inout PortalFeedbackDraft) -> Void) {
        var d = draft(id)
        change(&d)
        drafts[id] = d
    }

    func submit(_ activityId: Int64) {
        guard !saving else { return }
        let d = draft(activityId)
        saving = true
        error = nil
        message = nil
        Task {
            do {
                try await TicketsRepository.shared.submitFeedback(
                    activityId: activityId,
                    rating: Int(d.rating.trimmingCharacters(in: .whitespaces)),
                    wasOnTime: d.wasOnTime,
                    wasFriendly: d.wasFriendly,
                    wasSolved: d.wasSolved,
                    comments: d.comments
                )
                saving = false
                message = "Evaluación enviada. ¡Gracias!"
                await refresh(.visible)
            } catch {
                saving = false
                self.error = error.toUserMessage(fallback: "No se pudo enviar feedback")
            }
        }
    }
}

/// Servicios finalizados por evaluar (Android `TicketsFeedbackPendingScreen`):
/// una tarjeta por servicio con estrellas, tres «Sí / No», comentarios y
/// «Enviar evaluación». Solo la cuenta cliente (el API no lo tiene en
/// `branch-portal`).
struct PortalFeedbackView: View {
    @StateObject private var vm = PortalFeedbackVM()

    init() {}

    var body: some View {
        content
            .nxScreenBackground()
            .onAppear { vm.start() }
            .refreshOnModels(["Activity", "ClientSurvey", "ClientFeedback"]) { await vm.refresh(.visible) }
    }

    @ViewBuilder
    private var content: some View {
        if vm.isLoading {
            PortalSkeletonScreen(itemCount: 3, itemHeight: 220)
        } else if vm.items.isEmpty, let error = vm.error {
            ScrollView {
                NxErrorState(message: error) { Task { await vm.refresh(.initial) } }
            }
            .refreshable { await vm.refresh(.pull) }
        } else {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: NxSpacing.listGap) {
                    list
                }
                .padding(.horizontal, NxSpacing.screenH)
                .padding(.vertical, NxSpacing.m)
            }
            .refreshable { await vm.refresh(.pull) }
            .overlay(alignment: .top) { PortalRefreshIndicator(visible: vm.refreshingVisible) }
        }
    }

    @ViewBuilder
    private var list: some View {
        NxSectionHeader(
            title: "Confirmación de servicio",
            subtitle: "Ayúdanos a validar la calidad del servicio recibido."
        )
        if let message = vm.message {
            PortalSuccessBanner(message: message) { vm.message = nil }
        }
        if let error = vm.error {
            NxRefreshErrorBanner(
                message: error,
                onRetry: { Task { await vm.refresh(.visible) } },
                onDismiss: { vm.error = nil }
            )
        }
        if vm.items.isEmpty {
            NxEmptyState(
                title: "Todo al día",
                subtitle: "No tienes servicios pendientes de evaluar.",
                systemImage: "hand.thumbsup"
            )
        } else {
            ForEach(vm.items) { item in
                card(item)
            }
        }
    }

    private func card(_ item: PendingFeedbackItem) -> some View {
        let d = vm.draft(item.id)
        let id = item.id
        return NxPanelShell {
            VStack(alignment: .leading, spacing: NxSpacing.s) {
                HStack(alignment: .top, spacing: NxSpacing.s) {
                    Text(item.anNumber.isEmpty ? "Ticket" : item.anNumber)
                        .font(NxType.titleSmall)
                        .foregroundStyle(NxColors.fg)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    NxStatusChip(text: "Por evaluar", tone: .warning)
                }
                Text(item.title.isEmpty ? "Servicio finalizado" : item.title)
                    .nxTextStyle(.bodyMedium)
                    .foregroundStyle(NxColors.fg)
                    .lineLimit(3)
                if !item.completedAt.isEmpty {
                    Text("Finalizado el \(PortalFormat.dateTime(item.completedAt))")
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                }

                Text("¿Cómo calificas el servicio?")
                    .font(NxType.labelLarge)
                    .foregroundStyle(NxColors.fg)
                    .padding(.top, NxSpacing.s)
                PortalStarRating(rating: Int(d.rating) ?? 0) { score in
                    vm.update(id) { $0.rating = String(score) }
                }

                PortalYesNoRow(label: "Llegó a tiempo", value: d.wasOnTime) { value in
                    vm.update(id) { $0.wasOnTime = value }
                }
                PortalYesNoRow(label: "Atención amable", value: d.wasFriendly) { value in
                    vm.update(id) { $0.wasFriendly = value }
                }
                PortalYesNoRow(label: "Problema resuelto", value: d.wasSolved) { value in
                    vm.update(id) { $0.wasSolved = value }
                }

                PortalOutlinedField(
                    label: "Comentarios (opcional)",
                    text: Binding(
                        get: { vm.draft(id).comments },
                        set: { value in vm.update(id) { $0.comments = value } }
                    ),
                    minLines: 2,
                    radius: NxRadius.l
                )
                NxPrimaryButton(
                    vm.saving ? "Enviando…" : "Enviar evaluación",
                    loading: vm.saving,
                    enabled: !vm.saving
                ) { vm.submit(id) }
            }
        }
    }
}

/// Cinco estrellas tocables de 48 (Android `StarRating`): ámbar las elegidas,
/// gris las demás.
private struct PortalStarRating: View {
    let rating: Int
    let onRate: (Int) -> Void

    private static let ambar = NxColors.rgb(0xF59E0B)

    var body: some View {
        HStack(spacing: 0) {
            ForEach(1...5, id: \.self) { score in
                let on = score <= rating
                Button { onRate(score) } label: {
                    Image(systemName: on ? "star.fill" : "star")
                        .font(.system(size: 26, weight: .regular))
                        .foregroundStyle(on ? Self.ambar : NxColors.muted)
                        .frame(width: 48, height: 48)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(score == 1 ? "1 estrella" : "\(score) estrellas")
                .accessibilityAddTraits(on ? AccessibilityTraits.isSelected : [])
            }
        }
    }
}

/// Pregunta con «Sí / No» a la derecha (Android `YesNoRow` con `NxSegmented`).
private struct PortalYesNoRow: View {
    let label: String
    let value: String
    let onChange: (String) -> Void

    var body: some View {
        HStack(alignment: .center, spacing: NxSpacing.m) {
            Text(label)
                .nxTextStyle(.bodyMedium)
                .foregroundStyle(NxColors.fg)
                .frame(maxWidth: .infinity, alignment: .leading)
            NxSegmented(
                options: ["Sí", "No"],
                selectedIndex: value.uppercased() == "NO" ? 1 : 0,
                onSelect: { index in onChange(index == 1 ? "NO" : "YES") }
            )
        }
    }
}
