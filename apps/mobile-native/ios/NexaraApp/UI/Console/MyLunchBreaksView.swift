import SwiftUI

// MARK: – ViewModel

@MainActor
final class MyLunchBreaksVM: ObservableObject {
    @Published var breaks: [LunchBreak] = []
    @Published var isLoading = false
    @Published var actionLoading = false
    @Published var actionMessage: String?
    @Published var error: String?

    func load() {
        isLoading = true; error = nil
        Task {
            breaks    = await ExtraRepository.shared.myLunchBreakItems()
            isLoading = false
        }
    }

    func checkin(photoDataUrl: String?) async {
        actionLoading = true; actionMessage = nil
        do {
            let now = ISO8601DateFormatter().string(from: Date())
            let coord = await DeviceLocation.shared.current()
            try await ExtraRepository.shared.lunchCheckin(checkinTime: now, photoDataUrl: photoDataUrl)
            var msg = "✅ Entrada a comida registrada"
            if let c = coord {
                if let acc = c.accuracyM {
                    msg += String(format: " · GPS ±%.0fm", acc)
                } else {
                    msg += " · GPS ok"
                }
            } else {
                msg += " (sin GPS)"
            }
            actionMessage = msg
            load()
        } catch {
            actionMessage = "❌ \(error.localizedDescription)"
        }
        actionLoading = false
    }

    func checkout(photoDataUrl: String?) async {
        actionLoading = true; actionMessage = nil
        do {
            let now = ISO8601DateFormatter().string(from: Date())
            let coord = await DeviceLocation.shared.current()
            try await ExtraRepository.shared.lunchCheckout(checkoutTime: now, photoDataUrl: photoDataUrl)
            var msg = "✅ Salida de comida registrada"
            if let c = coord {
                if let acc = c.accuracyM {
                    msg += String(format: " · GPS ±%.0fm", acc)
                } else {
                    msg += " · GPS ok"
                }
            } else {
                msg += " (sin GPS)"
            }
            actionMessage = msg
            load()
        } catch {
            actionMessage = "❌ \(error.localizedDescription)"
        }
        actionLoading = false
    }

    func clearMessage() { actionMessage = nil }
}

// MARK: – View

struct MyLunchBreaksView: View {
    @StateObject private var vm = MyLunchBreaksVM()
    @State private var pendingAction: LunchAction?
    @State private var capturedPhoto: CapturedMedia?

    private var today: String {
        let fmt = DateFormatter(); fmt.dateFormat = "yyyy-MM-dd"
        return fmt.string(from: Date())
    }

    private var todayBreak: LunchBreak? {
        vm.breaks.first { $0.date.hasPrefix(today) }
    }

    private var isCheckedIn: Bool  { !(todayBreak?.checkinTime.isEmpty ?? true) }
    private var isCheckedOut: Bool { !(todayBreak?.checkoutTime.isEmpty ?? true) }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                todayCard
                historySection
                Spacer(minLength: 24)
            }
            .padding()
        }
        .navigationTitle("Mis comidas")
        .refreshable { vm.load() }
        .task { vm.load() }
        .onChange(of: vm.actionMessage) { msg in
            if msg != nil {
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { vm.clearMessage() }
            }
        }
    }

    // ── Today card
    private var todayCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Hoy — \(today)")
                .font(.headline).foregroundColor(.teal)

            // Status
            if isCheckedOut {
                HStack {
                    Text("✅").font(.title2)
                    Text("Comida completada: \(String((todayBreak?.checkinTime ?? "–").prefix(5))) → \(String((todayBreak?.checkoutTime ?? "–").prefix(5)))")
                        .font(.subheadline).foregroundColor(.green)
                }
            } else if isCheckedIn {
                HStack {
                    Text("🟡").font(.title2)
                    Text("En comida desde \(String((todayBreak?.checkinTime ?? "–").prefix(5)))")
                        .font(.subheadline).foregroundColor(.orange)
                }
            } else {
                Text("Sin registro de comida hoy")
                    .font(.subheadline).foregroundColor(.secondary)
            }

            // Action message
            if let msg = vm.actionMessage {
                Text(msg)
                    .font(.footnote)
                    .foregroundColor(msg.hasPrefix("✅") ? .green : .red)
            }

            // Action buttons
            if pendingAction == nil && !isCheckedIn {
                Button {
                    pendingAction = .checkin
                    capturedPhoto = nil
                } label: {
                    Label("Registrar entrada a comida", systemImage: "camera.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(.teal)
            }
            if pendingAction == nil && isCheckedIn && !isCheckedOut {
                Button {
                    pendingAction = .checkout
                    capturedPhoto = nil
                } label: {
                    Label("Registrar salida de comida", systemImage: "camera.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(.orange)
            }

            // Camera picker
            if pendingAction != nil {
                VStack(alignment: .leading, spacing: 8) {
                    Text(pendingAction == .checkin ? "Toma una foto para registrar entrada" : "Toma una foto para registrar salida")
                        .font(.caption).foregroundColor(.secondary)

                    if capturedPhoto == nil {
                        MediaPickerBar { picked in
                            capturedPhoto = picked.first
                        }
                    } else {
                        HStack(spacing: 10) {
                            Button {
                                let dataUrl = capturedPhoto.map { "data:\($0.mimeType);base64,\($0.data.base64EncodedString())" }
                                Task {
                                    if pendingAction == .checkin { await vm.checkin(photoDataUrl: dataUrl) }
                                    else { await vm.checkout(photoDataUrl: dataUrl) }
                                    pendingAction = nil; capturedPhoto = nil
                                }
                            } label: {
                                Text(vm.actionLoading ? "Enviando…" : "Confirmar")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(.teal)
                            .disabled(vm.actionLoading)

                            Button {
                                capturedPhoto = nil
                            } label: {
                                Text("Repetir foto").frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                        }
                    }

                    Button(role: .cancel) {
                        pendingAction = nil; capturedPhoto = nil
                    } label: {
                        Text("Cancelar").frame(maxWidth: .infinity)
                    }
                    .tint(.red)
                }
                .padding(.top, 4)
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // ── History
    @ViewBuilder
    private var historySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Historial").font(.headline).foregroundColor(.secondary)

            if vm.isLoading {
                ProgressView().frame(maxWidth: .infinity)
            } else if vm.breaks.isEmpty {
                Text("Sin registros de comida").foregroundColor(.secondary).padding()
            } else {
                ForEach(vm.breaks) { l in
                    LunchBreakRow(item: l)
                }
            }
        }
    }
}

// MARK: – Subview

private struct LunchBreakRow: View {
    let item: LunchBreak
    var body: some View {
        let date     = item.date.isEmpty ? "–" : item.date
        let checkin  = item.checkinTime.isEmpty ? "–" : String(item.checkinTime.prefix(5))
        let checkout = item.checkoutTime.isEmpty ? nil : String(item.checkoutTime.prefix(5))
        let isLate   = item.isCheckinLate || item.isCheckoutLate

        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(date).font(.subheadline).bold()
                Text("\(checkin)\(checkout.map { " → \($0)" } ?? "")").font(.caption).foregroundColor(.secondary)
            }
            Spacer()
            Text(isLate ? "Tarde" : "OK")
                .font(.caption2).bold()
                .foregroundColor(isLate ? .red : .green)
                .padding(.horizontal, 7).padding(.vertical, 2)
                .background((isLate ? Color.red : Color.green).opacity(0.12))
                .clipShape(Capsule())
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: – Helpers

private enum LunchAction { case checkin, checkout }
