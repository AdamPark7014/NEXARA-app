import SwiftUI

/// Evaluaciones de desempeño — `GET hr/reviews`, con las dos transiciones de
/// estado que la web ofrece en `/erp/hr`, pestaña «Evaluaciones»:
/// enviar el borrador (`submit`) y confirmar que se ha recibido (`acknowledge`).
///
/// **No** se crean ni se editan evaluaciones desde el teléfono: redactar una
/// evaluación de desempeño en un formulario móvil es peor que no hacerlo, y el
/// alta (`POST hr/reviews`) queda en la web.
struct HrReviewsView: View {
    @StateObject private var vm = HrReviewsVM()

    var body: some View {
        List {
            if let message = vm.message {
                Text(message).font(.footnote)
                    .foregroundColor(vm.messageIsError ? .red : .green)
            }
            if let error = vm.errorText {
                Text(error).font(.footnote).foregroundColor(.red)
            }

            if !vm.items.isEmpty {
                Section {
                    Picker("Estado", selection: $vm.statusFilter) {
                        ForEach(vm.statuses, id: \.self) { key in
                            Text(vm.statusLabel(key)).tag(key)
                        }
                    }
                    .pickerStyle(.segmented)
                }
            }

            if vm.isLoading && vm.items.isEmpty {
                ProgressView()
            } else if vm.filtered.isEmpty {
                Text("Sin evaluaciones").foregroundColor(.secondary)
            } else {
                ForEach(vm.filtered) { review in
                    Section {
                        HrReviewRow(review: review)
                        actions(for: review)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("RR. HH. · Evaluaciones")
        .refreshable { await vm.load() }
        .task {
            vm.loadSessionFacts()
            await vm.load()
        }
    }

    @ViewBuilder
    private func actions(for review: HrReviewItem) -> some View {
        // Sólo el evaluador cierra el borrador, y sólo el evaluado confirma que
        // la recibió. Enseñar el botón a quien el API va a rechazar con un 403
        // es prometer algo que no se puede cumplir.
        if review.isDraft && vm.canManage {
            Button {
                Task { await vm.submit(review) }
            } label: {
                Label("Enviar al evaluado", systemImage: "paperplane")
            }
            .disabled(vm.actingId == review.id)
        }
        if review.isSubmitted && vm.isMine(review) {
            Button {
                Task { await vm.acknowledge(review) }
            } label: {
                Label("Confirmar que la recibí", systemImage: "checkmark.seal")
            }
            .disabled(vm.actingId == review.id)
        }
    }
}

// MARK: – Fila

private struct HrReviewRow: View {
    let review: HrReviewItem

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(review.userName.isEmpty ? review.displayPeriod : review.userName)
                    .font(.subheadline.bold())
                Spacer()
                Text(review.statusLabel)
                    .font(.caption2).bold()
                    .foregroundColor(statusColor)
                    .padding(.horizontal, 7).padding(.vertical, 2)
                    .background(statusColor.opacity(0.12))
                    .clipShape(Capsule())
            }
            HStack(spacing: 12) {
                Label(review.displayPeriod, systemImage: "calendar")
                    .font(.caption2).foregroundColor(.secondary)
                if review.overallRating > 0 {
                    Label(review.ratingText, systemImage: "star")
                        .font(.caption2).foregroundColor(.secondary)
                }
            }
            if !review.reviewerName.isEmpty {
                Text("Evalúa: \(review.reviewerName)")
                    .font(.caption2).foregroundColor(.secondary)
            }
            detail("Fortalezas", review.strengths)
            detail("Áreas de mejora", review.areasOfImprovement)
            detail("Objetivos", review.goals)
            detail("Comentarios", review.comments)
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder private func detail(_ label: String, _ value: String) -> some View {
        if !value.isEmpty {
            VStack(alignment: .leading, spacing: 1) {
                Text(label).font(.caption2.bold()).foregroundColor(.secondary)
                Text(value).font(.caption)
            }
            .padding(.top, 2)
        }
    }

    private var statusColor: Color {
        switch review.status.uppercased() {
        case "ACKNOWLEDGED": return .green
        case "SUBMITTED": return .blue
        case "DRAFT": return .orange
        default: return .secondary
        }
    }
}

// MARK: – ViewModel

@MainActor
final class HrReviewsVM: ObservableObject {
    @Published var items: [HrReviewItem] = []
    @Published var statusFilter = "todos"
    @Published var isLoading = false
    @Published var errorText: String?
    @Published var message: String?
    @Published var messageIsError = false
    @Published var actingId: Int64?

    @Published private(set) var myUserId: Int64 = 0
    @Published private(set) var canManage = false

    let statuses = ["todos", "DRAFT", "SUBMITTED", "ACKNOWLEDGED"]

    func statusLabel(_ key: String) -> String {
        switch key {
        case "todos": return "Todas"
        case "DRAFT": return "Borrador"
        case "SUBMITTED": return "Enviadas"
        case "ACKNOWLEDGED": return "Confirmadas"
        default: return key
        }
    }

    var filtered: [HrReviewItem] {
        guard statusFilter != "todos" else { return items }
        return items.filter { $0.status.caseInsensitiveCompare(statusFilter) == .orderedSame }
    }

    /// La evaluación es mía cuando yo soy el evaluado.
    func isMine(_ review: HrReviewItem) -> Bool {
        myUserId > 0 && review.userId == myUserId
    }

    func loadSessionFacts() {
        guard let user = SessionStore.shared.currentUser else { return }
        myUserId = Int64(user.id) ?? 0
        canManage = user.isSuperAdmin || user.permissions.contains { permission in
            permission.contains("hr.manage") || permission.contains("console.admin")
        }
    }

    func load() async {
        isLoading = true
        errorText = nil
        defer { isLoading = false }
        do {
            items = try await HrRepository.shared.reviews()
        } catch {
            errorText = error.toUserMessage(fallback: "No se pudieron cargar las evaluaciones")
        }
    }

    func submit(_ review: HrReviewItem) async {
        actingId = review.id
        defer { actingId = nil }
        do {
            let updated = try await HrRepository.shared.submitReview(id: review.id)
            replace(updated, fallbackId: review.id)
            show("Evaluación enviada", isError: false)
        } catch {
            show(error.toUserMessage(fallback: "No se pudo enviar"), isError: true)
        }
    }

    func acknowledge(_ review: HrReviewItem) async {
        actingId = review.id
        defer { actingId = nil }
        do {
            let updated = try await HrRepository.shared.acknowledgeReview(id: review.id)
            replace(updated, fallbackId: review.id)
            show("Confirmada", isError: false)
        } catch {
            show(error.toUserMessage(fallback: "No se pudo confirmar"), isError: true)
        }
    }

    /// El API devuelve la fila ya actualizada; se sustituye en sitio para no
    /// recargar la lista entera por un cambio de estado.
    private func replace(_ updated: HrReviewItem, fallbackId: Int64) {
        let targetId = updated.id > 0 ? updated.id : fallbackId
        guard let index = items.firstIndex(where: { $0.id == targetId }) else { return }
        if updated.id > 0 {
            items[index] = updated
        } else {
            // Respuesta vacía (o encolada sin conexión): se recarga y ya.
            Task { await load() }
        }
    }

    private func show(_ text: String, isError: Bool) {
        message = text
        messageIsError = isError
    }
}
