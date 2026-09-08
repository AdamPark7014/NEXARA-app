import SwiftUI

/// Plan, asientos y consumo del tenant — `GET company/billing`.
///
/// **Solo lectura, a propósito.** La página web equivalente
/// (`/erp/settings/billing`) trae además dos botones de Stripe:
/// `POST company/billing/checkout`, que abre una compra de suscripción, y
/// `POST company/billing/portal`, que abre el portal de cobro. Contratar,
/// cambiar de plan o mover el método de pago desde el teléfono requiere
/// autorización del dueño, así que aquí se enseña el estado y se remite a la
/// consola web. Tampoco se expone el `PATCH` que cambia plan y asientos.
struct CompanyBillingView: View {
    @StateObject private var vm = CompanyBillingVM()

    var body: some View {
        List {
            if vm.isLoading && vm.billing == nil { ProgressView() }
            if let error = vm.errorText {
                Text(error).font(.footnote).foregroundColor(.red)
            }

            if let data = vm.billing {
                if data.isEmpty {
                    Text("El servidor no devolvió datos de facturación para esta empresa.")
                        .font(.footnote).foregroundColor(.secondary)
                } else {
                    Section("Plan") {
                        billingRow("Plan", data.planLabel)
                        billingRow("Estado", data.statusLabel)
                    }

                    Section("Asientos") {
                        billingRow("Ocupados", data.seatsText)
                        if let ratio = data.seatUsageRatio {
                            GeometryReader { geo in
                                ZStack(alignment: .leading) {
                                    Capsule().fill(Color.secondary.opacity(0.15))
                                    Capsule()
                                        .fill(data.seatsExhausted ? Color.red : Color.accentColor)
                                        .frame(width: max(2, geo.size.width * ratio))
                                }
                            }
                            .frame(height: 6)
                            .padding(.vertical, 4)
                        }
                        if data.seatsExhausted {
                            // Sin asientos libres el alta de usuarios falla con
                            // un 402 que en la app se lee como error genérico.
                            Text("No quedan asientos libres: dar de alta a alguien más fallará hasta ampliar el plan.")
                                .font(.caption).foregroundColor(.orange)
                        }
                    }

                    Section("Cobro") {
                        billingRow("Stripe configurado", data.stripeConfigured ? "Sí" : "No")
                        billingRow("Suscripción activa", data.stripeHasSubscription ? "Sí" : "No")
                    }

                    if !data.usage30d.isEmpty {
                        Section("Consumo (30 días)") {
                            ForEach(data.usage30d) { metric in
                                billingRow(metric.displayMetric, metric.quantityText)
                            }
                        }
                    }
                }
            }

            Section {
                Text("""
                Contratar o cambiar el plan, ampliar asientos y gestionar el \
                método de pago se hacen desde la consola web. Desde el teléfono \
                esta pantalla sólo consulta.
                """)
                .font(.caption).foregroundColor(.secondary)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Facturación")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await vm.load() }
        .task { await vm.load() }
    }

    private func billingRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundColor(.secondary)
            Spacer()
            Text(value).multilineTextAlignment(.trailing)
        }
    }
}

// MARK: – ViewModel

@MainActor
final class CompanyBillingVM: ObservableObject {
    @Published var billing: CompanyBillingState?
    @Published var isLoading = false
    @Published var errorText: String?

    func load() async {
        isLoading = true
        errorText = nil
        defer { isLoading = false }
        do {
            billing = try await CompanyAdminRepository.shared.billing()
        } catch {
            errorText = error.toUserMessage(
                fallback: "No se pudo leer la facturación (requiere console.admin o company.settings.manage)"
            )
        }
    }
}
