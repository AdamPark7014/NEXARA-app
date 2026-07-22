import SwiftUI
import VisionKit

/// Escáner de códigos (DataScanner iOS 16+) para WMS SKU.
struct BarcodeScannerView: View {
    var onResult: (String) -> Void
    var onCancel: () -> Void

    var body: some View {
        NavigationStack {
            Group {
                if DataScannerViewController.isSupported && DataScannerViewController.isAvailable {
                    DataScannerRepresentable(onResult: onResult)
                } else {
                    VStack(spacing: 12) {
                        Text("Escáner no disponible en este dispositivo")
                            .foregroundColor(.secondary)
                        Text("Escribe el SKU manualmente en el picker.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Button("Cerrar", action: onCancel)
                    }
                    .padding()
                }
            }
            .navigationTitle("Escanear SKU")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar", action: onCancel)
                }
            }
        }
    }
}

@available(iOS 16.0, *)
private struct DataScannerRepresentable: UIViewControllerRepresentable {
    var onResult: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let vc = DataScannerViewController(
            recognizedDataTypes: [.barcode()],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: true,
            isHighlightingEnabled: true
        )
        vc.delegate = context.coordinator
        try? vc.startScanning()
        return vc
    }

    func updateUIViewController(_ uiViewController: DataScannerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onResult: onResult) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onResult: (String) -> Void
        private var done = false

        init(onResult: @escaping (String) -> Void) {
            self.onResult = onResult
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didTapOn item: RecognizedItem) {
            guard case .barcode(let barcode) = item,
                  let raw = barcode.payloadStringValue?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !raw.isEmpty,
                  !done
            else { return }
            done = true
            dataScanner.stopScanning()
            onResult(raw)
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            guard !done else { return }
            for item in addedItems {
                if case .barcode(let barcode) = item,
                   let raw = barcode.payloadStringValue?.trimmingCharacters(in: .whitespacesAndNewlines),
                   !raw.isEmpty {
                    done = true
                    dataScanner.stopScanning()
                    onResult(raw)
                    return
                }
            }
        }
    }
}
