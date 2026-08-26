import SwiftUI

/// Cotizador inteligente iOS — paridad Android (copilot, labor, sustitutos, CT).
struct SmartQuoteView: View {
    @State private var step = 1
    @State private var clientName = ""
    @State private var projectName = ""
    @State private var query = ""
    @State private var copilotPrompt = ""
    @State private var targetMargin = 30
    @State private var selectedBrand: String?
    @State private var selectedCategory: String?
    @State private var brands: [String] = []
    @State private var categories: [String] = []
    @State private var catalogCount = 0
    @State private var results: [[String: Any]] = []
    @State private var cart: [[String: Any]] = []
    @State private var marginWarnings: [Int: String] = [:]
    @State private var loading = false
    @State private var copilotLoading = false
    @State private var saving = false
    @State private var message: String?
    @State private var clientError: String?
    @State private var createdQuoteId: Int?
    @State private var ctPreview: [String: Any]?
    @State private var ctAlmacen = "MTY"
    @State private var ctSubmitting = false
    @State private var supplierStats: [String: Any]?
    @State private var supplierStatsLoading = false
    @State private var supplierStatsError: String?

    private let templates: [(id: String, label: String)] = [
        ("CCTV", "CCTV"),
        ("WIFI", "WiFi"),
        ("ACCESS", "Acceso"),
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                stepIndicator
                TabView(selection: $step) {
                    stepOne.tag(1)
                    stepTwo.tag(2)
                    stepThree.tag(3)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.easeInOut, value: step)

                footerNav
            }
            .navigationTitle("Cotizador inteligente")
            .navigationBarTitleDisplayMode(.inline)
            .task { await bootstrap() }
        }
    }

    private var stepIndicator: some View {
        HStack(spacing: 8) {
            ForEach(1...3, id: \.self) { n in
                Text(stepLabel(n))
                    .font(.caption.weight(step == n ? .bold : .regular))
                    .foregroundStyle(step == n ? Color.teal : Color.secondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(step == n ? Color.teal.opacity(0.12) : Color.clear)
                    .clipShape(Capsule())
            }
            Spacer()
            if catalogCount > 0 {
                Text("\(catalogCount) SKUs CT")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    private func stepLabel(_ n: Int) -> String {
        switch n {
        case 1: return "1 · Contexto"
        case 2: return "2 · Catálogo"
        default: return "3 · Revisar"
        }
    }

    private var stepOne: some View {
        Form {
            Section("Cliente") {
                TextField("Nombre del cliente", text: $clientName)
                if let clientError {
                    Text(clientError).font(.caption).foregroundStyle(.red)
                }
                TextField("Proyecto (opcional)", text: $projectName)
            }
            Section("Copilot") {
                TextField("Describe el proyecto (8+ caracteres)", text: $copilotPrompt, axis: .vertical)
                    .lineLimit(2...4)
                Button(copilotLoading ? "Generando…" : "Generar propuesta") {
                    Task { await runCopilot() }
                }
                .disabled(copilotLoading || copilotPrompt.trimmingCharacters(in: .whitespaces).count < 8)
            }
            Section("Plantillas rápidas") {
                ForEach(templates, id: \.id) { t in
                    Button(t.label) { Task { await applyTemplate(t.id) } }
                }
            }
            Section("Margen objetivo") {
                Stepper("\(targetMargin)%", value: $targetMargin, in: 5...80)
            }
            if let message, step == 1 {
                Text(message).font(.caption)
            }
        }
    }

    private var stepTwo: some View {
        List {
            Section {
                HStack {
                    TextField("Buscar SKU, modelo…", text: $query)
                    if loading { ProgressView() }
                }
                .onChange(of: query) { _, _ in Task { await searchDebounced() } }
            }
            if !brands.isEmpty {
                Section("Marca") {
                    chipRow(
                        items: brands,
                        selected: selectedBrand,
                        allLabel: "Todas",
                        onSelect: { b in
                            selectedBrand = b
                            Task { await performSearch() }
                        }
                    )
                }
            }
            if !categories.isEmpty {
                Section("Categoría") {
                    chipRow(
                        items: categories,
                        selected: selectedCategory,
                        allLabel: "Todas",
                        onSelect: { c in
                            selectedCategory = c
                            Task { await performSearch() }
                        }
                    )
                }
            }
            Section("Resultados") {
                ForEach(results.indices, id: \.self) { idx in
                    resultRow(results[idx])
                }
            }
        }
    }

    private var stepThree: some View {
        List {
            Section {
                SupplierStatsSection(
                    stats: supplierStats,
                    loading: supplierStatsLoading,
                    error: supplierStatsError,
                    onRefresh: { Task { await loadSupplierStats() } }
                )
            }
            Section {
                Button("Sugerir mano de obra") {
                    Task { await suggestLabor() }
                }
                .disabled(cart.isEmpty || loading)
            }
            Section("Carrito (\(cart.count))") {
                ForEach(cart.indices, id: \.self) { idx in
                    let row = cart[idx]
                    HStack {
                        VStack(alignment: .leading) {
                            Text(ConsoleHelpers.mapStr(row, "nombre", "name"))
                            Text(String(format: "$%.2f × %d", linePrice(row), lineQty(row)))
                                .font(.caption)
                            if let warn = marginWarnings[idx] {
                                Text(warn).font(.caption2).foregroundStyle(.orange)
                            }
                        }
                        Spacer()
                        Button("✕") { cart.remove(at: idx); marginWarnings.removeValue(forKey: idx) }
                            .foregroundStyle(.red)
                    }
                }
            }
            Section("Totales") {
                Text("Subtotal: \(fmtMoney(cartSubtotal()))")
                Text("IVA est.: \(fmtMoney(cartSubtotal() * 0.16))")
                Text("Total est.: \(fmtMoney(cartSubtotal() * 1.16))").font(.headline)
            }
            if let message {
                Section { Text(message).font(.caption) }
            }
            if let ctPreview, createdQuoteId != nil {
                Section("Pedido CT") {
                    let lines = ctPreview["lines"] as? [[String: Any]] ?? []
                    Text("\(lines.count) líneas CT disponibles")
                        .font(.caption)
                    TextField("Almacén", text: $ctAlmacen)
                    Button(ctSubmitting ? "Enviando…" : "Enviar pedido a CT") {
                        Task { await submitCtOrder() }
                    }
                    .disabled(ctSubmitting || lines.isEmpty)
                }
            }
        }
        .task { await loadSupplierStats() }
        .sheet(isPresented: Binding(
            get: { createdQuoteId != nil && ctPreview != nil },
            set: { if !$0 { createdQuoteId = nil; ctPreview = nil } }
        )) {
            ctOrderSheet
        }
    }

    private var ctOrderSheet: some View {
        NavigationStack {
            List {
                if let ctPreview {
                    let lines = ctPreview["lines"] as? [[String: Any]] ?? []
                    Section("Resumen CT") {
                        Text("\(lines.count) líneas · Cotización #\(createdQuoteId ?? 0)")
                        TextField("Almacén destino", text: $ctAlmacen)
                    }
                    Section("Líneas") {
                        ForEach(lines.indices, id: \.self) { idx in
                            let row = lines[idx]
                            Text(ConsoleHelpers.mapStr(row, "name", "nombre"))
                        }
                    }
                    let orders = ctPreview["existingOrders"] as? [[String: Any]] ?? []
                    if !orders.isEmpty {
                        Section("Pedidos pendientes") {
                            ForEach(orders.indices, id: \.self) { idx in
                                let order = orders[idx]
                                let oid = ConsoleHelpers.mapInt(order, "id")
                                let status = ConsoleHelpers.mapStr(order, "status").uppercased()
                                if status != "CONFIRMED" && oid > 0 {
                                    Button("Confirmar pedido #\(oid)") {
                                        Task { await confirmCtOrder(orderId: oid) }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Pedido CT")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { createdQuoteId = nil; ctPreview = nil }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(ctSubmitting ? "…" : "Enviar") { Task { await submitCtOrder() } }
                        .disabled(ctSubmitting)
                }
            }
        }
    }

    private var footerNav: some View {
        HStack {
            if step > 1 {
                Button("Atrás") { step -= 1 }
            }
            Spacer()
            if step < 3 {
                Button("Siguiente") { goNext() }
                    .buttonStyle(.borderedProminent)
                    .tint(.teal)
            } else {
                Button(saving ? "Guardando…" : "Crear cotización") {
                    Task { await saveQuote() }
                }
                .buttonStyle(.borderedProminent)
                .tint(.teal)
                .disabled(saving || cart.isEmpty || clientName.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding()
        .background(Color(.systemGroupedBackground))
    }

    @ViewBuilder
    private func chipRow(
        items: [String],
        selected: String?,
        allLabel: String,
        onSelect: @escaping (String?) -> Void
    ) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack {
                filterChip(allLabel, selected: selected == nil) { onSelect(nil) }
                ForEach(items, id: \.self) { item in
                    filterChip(item, selected: selected == item) { onSelect(item) }
                }
            }
        }
    }

    @ViewBuilder
    private func filterChip(_ label: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.caption)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(selected ? Color.teal.opacity(0.2) : Color.gray.opacity(0.15))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func resultRow(_ row: [String: Any]) -> some View {
        let name = ConsoleHelpers.mapStr(row, "nombre", "name")
        let price = ConsoleHelpers.mapDouble(row, "sellPriceSuggested", "precio")
        let clave = ConsoleHelpers.mapStr(row, "clave", "sku")
        return HStack {
            VStack(alignment: .leading) {
                Text(name.isEmpty ? "Producto" : name).font(.headline)
                Text(String(format: "$%.2f", price)).font(.caption)
            }
            Spacer()
            if !clave.isEmpty {
                Button("≈") { Task { await loadSubstitutes(clave: clave) } }
                    .font(.caption)
            }
            Button("＋") { addToCart(row) }
        }
    }

    private func loadSupplierStats() async {
        supplierStatsLoading = true
        supplierStatsError = nil
        do {
            supplierStats = try await SmartQuoteRepository.shared.supplierStats()
        } catch {
            supplierStatsError = error.localizedDescription
        }
        supplierStatsLoading = false
    }

    private func bootstrap() async {
        catalogCount = await SmartQuoteRepository.shared.ctProductCount()
        do {
            let f = try await SmartQuoteRepository.shared.facets()
            brands = f.brands.prefix(12).map { $0 }
            categories = f.categories.prefix(12).map { $0 }
        } catch {
            message = error.localizedDescription
        }
    }

    private func goNext() {
        if step == 1 {
            if clientName.trimmingCharacters(in: .whitespaces).isEmpty {
                clientError = "Indica el nombre del cliente"
                return
            }
            clientError = nil
        }
        step = min(3, step + 1)
        if step == 2 && results.isEmpty && !query.isEmpty {
            Task { await performSearch() }
        }
    }

    private func searchDebounced() async {
        try? await Task.sleep(nanoseconds: 350_000_000)
        await performSearch()
    }

    private func performSearch() async {
        loading = true
        do {
            results = try await SmartQuoteRepository.shared.search(
                query: query,
                margin: targetMargin,
                brand: selectedBrand,
                category: selectedCategory
            )
        } catch {
            message = error.localizedDescription
        }
        loading = false
    }

    private func runCopilot() async {
        copilotLoading = true
        message = nil
        do {
            let draft = try await SmartQuoteRepository.shared.copilotDraft(prompt: copilotPrompt)
            let proposal = draft["proposal"] as? [String: Any]
            let hardware = proposal?["hardware"] as? [[String: Any]] ?? []
            for line in hardware {
                addToCart(line)
            }
            if let note = draft["disclaimer"] as? String ?? proposal?["notes"] as? String {
                message = note
            } else {
                message = "Copilot · \(hardware.count) líneas agregadas"
            }
            step = 2
        } catch {
            message = error.localizedDescription
        }
        copilotLoading = false
    }

    private func loadSubstitutes(clave: String) async {
        loading = true
        do {
            let subs = try await SmartQuoteRepository.shared.substitutes(clave: clave, margin: targetMargin)
            results = subs
            message = "\(subs.count) sustitutos para \(clave)"
        } catch {
            message = error.localizedDescription
        }
        loading = false
    }

    private func suggestLabor() async {
        loading = true
        do {
            let items = try await SmartQuoteRepository.shared.laborSuggest(cart: cart)
            for item in items {
                var line = item
                if line["qty"] == nil { line["qty"] = 1 }
                line["isLabor"] = true
                addToCart(line)
            }
            message = "Mano de obra · \(items.count) líneas"
        } catch {
            message = error.localizedDescription
        }
        loading = false
    }

    private func applyTemplate(_ template: String) async {
        loading = true
        message = nil
        do {
            let lines = try await SmartQuoteRepository.shared.configureTemplate(template: template, margin: targetMargin)
            for line in lines {
                addToCart(line)
            }
            step = 2
            message = "Plantilla \(template) aplicada · \(lines.count) líneas"
        } catch {
            message = error.localizedDescription
        }
        loading = false
    }

    private func addToCart(_ row: [String: Any]) {
        var copy = row
        if copy["qty"] == nil { copy["qty"] = 1 }
        let idx = cart.count
        cart.append(copy)
        Task { await checkMarginForLine(idx) }
    }

    private func checkMarginForLine(_ idx: Int) async {
        guard cart.indices.contains(idx) else { return }
        let row = cart[idx]
        let cost = ConsoleHelpers.mapDouble(row, "costMxn", "unitCost")
        let price = linePrice(row)
        guard cost > 0 && price > 0 else { return }
        do {
            let res = try await SmartQuoteRepository.shared.checkMargin(
                unitCost: cost,
                unitPrice: price,
                category: ConsoleHelpers.mapStr(row, "categoria", "category").nilIfEmpty,
                brand: ConsoleHelpers.mapStr(row, "marca", "brand").nilIfEmpty
            )
            if let ok = res["ok"] as? Bool, !ok {
                let reason = ConsoleHelpers.mapStr(res, "message", "reason")
                marginWarnings[idx] = reason.isEmpty ? "Margen bajo política" : reason
            }
        } catch {
            // margin check is advisory
        }
    }

    private func lineQty(_ row: [String: Any]) -> Int {
        max(1, ConsoleHelpers.mapInt(row, "qty", "quantity"))
    }

    private func linePrice(_ row: [String: Any]) -> Double {
        ConsoleHelpers.mapDouble(row, "sellPriceSuggested", "unitPrice", "precio")
    }

    private func cartSubtotal() -> Double {
        cart.reduce(0) { $0 + linePrice($1) * Double(lineQty($1)) }
    }

    private func fmtMoney(_ v: Double) -> String {
        String(format: "$%.2f MXN", v)
    }

    private func saveQuote() async {
        saving = true
        message = nil
        createdQuoteId = nil
        ctPreview = nil
        do {
            let res = try await SmartQuoteRepository.shared.createQuote(
                quoteNumber: "",
                clientName: clientName.trimmingCharacters(in: .whitespaces),
                projectName: projectName.trimmingCharacters(in: .whitespaces),
                items: cart
            )
            let id = ConsoleHelpers.mapInt(res, "id")
            message = id > 0 ? "Cotización #\(id) creada" : "Cotización guardada"
            if id > 0 {
                createdQuoteId = id
                await loadCtPreview(id)
            }
            cart = []
            marginWarnings = [:]
            step = 1
        } catch {
            message = error.localizedDescription
        }
        saving = false
    }

    private func loadCtPreview(_ id: Int) async {
        do {
            ctPreview = try await SmartQuoteRepository.shared.ctOrderPreview(cotizacionId: id)
        } catch {
            ctPreview = nil
        }
    }

    private func submitCtOrder() async {
        guard let id = createdQuoteId else { return }
        ctSubmitting = true
        do {
            try await SmartQuoteRepository.shared.submitCtOrder(
                cotizacionId: id,
                almacen: ctAlmacen.trimmingCharacters(in: .whitespaces).isEmpty ? "MTY" : ctAlmacen,
                confirmNow: false
            )
            message = "Pedido CT enviado para cotización #\(id)"
            await loadCtPreview(id)
        } catch {
            message = error.localizedDescription
        }
        ctSubmitting = false
    }

    private func confirmCtOrder(orderId: Int) async {
        ctSubmitting = true
        do {
            try await SmartQuoteRepository.shared.confirmCtOrder(orderId: orderId)
            message = "Pedido confirmado en CT"
            if let id = createdQuoteId { await loadCtPreview(id) }
        } catch {
            message = error.localizedDescription
        }
        ctSubmitting = false
    }
}
