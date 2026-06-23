import SwiftUI
import PhotosUI
import UIKit
import UniformTypeIdentifiers

struct CapturedMedia: Identifiable {
    let id = UUID()
    let data: Data
    let suggestedName: String
    let mimeType: String
}

/// Barra con 3 acciones: cámara / galería / archivo (PDF/Excel/Word).
struct MediaPickerBar: View {
    var onPicked: ([CapturedMedia]) -> Void
    @State private var showCamera = false
    @State private var showPhotoPicker = false
    @State private var showDocPicker = false
    @State private var photoItems: [PhotosPickerItem] = []

    var body: some View {
        HStack(spacing: 10) {
            Button {
                showCamera = true
            } label: {
                Label("Cámara", systemImage: "camera.fill")
            }
            .buttonStyle(.bordered)

            PhotosPicker(
                selection: $photoItems,
                maxSelectionCount: 10,
                matching: .images
            ) {
                Label("Galería", systemImage: "photo.on.rectangle")
            }
            .buttonStyle(.bordered)
            .onChange(of: photoItems) { newItems in
                guard !newItems.isEmpty else { return }
                Task {
                    var results: [CapturedMedia] = []
                    for item in newItems {
                        if let data = try? await item.loadTransferable(type: Data.self) {
                            results.append(CapturedMedia(
                                data: data,
                                suggestedName: "photo_\(UUID().uuidString.prefix(8)).jpg",
                                mimeType: "image/jpeg"
                            ))
                        }
                    }
                    if !results.isEmpty { onPicked(results) }
                    photoItems = []
                }
            }

            Button {
                showDocPicker = true
            } label: {
                Label("Archivo", systemImage: "paperclip")
            }
            .buttonStyle(.bordered)
        }
        .sheet(isPresented: $showCamera) {
            CameraCaptureView { image in
                showCamera = false
                guard let img = image, let data = img.jpegData(compressionQuality: 0.85) else { return }
                onPicked([CapturedMedia(
                    data: data,
                    suggestedName: "camera_\(UUID().uuidString.prefix(8)).jpg",
                    mimeType: "image/jpeg"
                )])
            }
        }
        .fileImporter(
            isPresented: $showDocPicker,
            allowedContentTypes: [.pdf, .spreadsheet, UTType(filenameExtension: "xlsx") ?? .data, .plainText, .image, .data],
            allowsMultipleSelection: true
        ) { result in
            switch result {
            case .success(let urls):
                var results: [CapturedMedia] = []
                for url in urls {
                    guard url.startAccessingSecurityScopedResource() else { continue }
                    defer { url.stopAccessingSecurityScopedResource() }
                    if let data = try? Data(contentsOf: url) {
                        results.append(CapturedMedia(
                            data: data,
                            suggestedName: url.lastPathComponent,
                            mimeType: mime(forExtension: url.pathExtension)
                        ))
                    }
                }
                if !results.isEmpty { onPicked(results) }
            case .failure(let err):
                print("fileImporter error: \(err)")
            }
        }
    }

    private func mime(forExtension ext: String) -> String {
        switch ext.lowercased() {
        case "pdf": return "application/pdf"
        case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        case "xls": return "application/vnd.ms-excel"
        case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        case "doc": return "application/msword"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        default: return "application/octet-stream"
        }
    }
}

/// Wrapper UIImagePickerController para la cámara. PhotosUI no captura cámara nativa.
struct CameraCaptureView: UIViewControllerRepresentable {
    var onCaptured: (UIImage?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onCaptured: onCaptured) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onCaptured: (UIImage?) -> Void
        init(onCaptured: @escaping (UIImage?) -> Void) { self.onCaptured = onCaptured }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            onCaptured(info[.originalImage] as? UIImage)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onCaptured(nil)
        }
    }
}
