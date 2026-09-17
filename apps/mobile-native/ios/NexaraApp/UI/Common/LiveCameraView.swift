import SwiftUI
import AVFoundation
import UIKit

/// Foto tomada con la cámara en vivo, ya comprimida y con la ubicación del momento.
struct CapturedGeoPhoto: Identifiable {
    let id = UUID()
    let image: UIImage
    let jpeg: Data
    let coords: DeviceCoords?
    let capturedAt: Date

    var dataUrl: String { "data:image/jpeg;base64,\(jpeg.base64EncodedString())" }
}

enum CorePhotoProcessing {
    /// JPEG de máximo 1280 px por lado y calidad 0.6, como la web.
    static func jpeg(from image: UIImage, maxDimension: CGFloat = 1280, quality: CGFloat = 0.6) -> Data? {
        let size = image.size
        let longest = max(size.width, size.height)
        guard longest > 0 else { return nil }
        let scale = min(1, maxDimension / longest)
        let target = CGSize(
            width: max(1, floor(size.width * scale)),
            height: max(1, floor(size.height * scale))
        )
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: target, format: format)
        let resized = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
        return resized.jpegData(compressionQuality: quality)
    }
}

enum CoreMaps {
    /// Apple Maps con un pin en la coordenada.
    static func url(latitude: Double?, longitude: Double?, label: String = "Evidencia") -> URL? {
        guard let latitude, let longitude, latitude.isFinite, longitude.isFinite,
              !(latitude == 0 && longitude == 0) else { return nil }
        let query = label.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "Evidencia"
        return URL(string: "https://maps.apple.com/?ll=\(latitude),\(longitude)&q=\(query)")
    }
}

// MARK: - Sesión de cámara

/// `AVCaptureSession` con salida de foto. Toda la configuración corre en una
/// cola propia; lo que ve la interfaz se publica en el hilo principal.
final class CameraSessionController: NSObject, ObservableObject {
    @Published private(set) var isReady = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var usingFrontCamera = false

    let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private let queue = DispatchQueue(label: "mx.nexara.camera.session")
    private var videoInput: AVCaptureDeviceInput?
    private var position: AVCaptureDevice.Position = .back
    private var photoCallback: ((UIImage?) -> Void)?

    static let permissionMessage = "Da permiso de cámara en Ajustes › NEXARA para tomar la foto."

    func start() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            startSession()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                if granted {
                    self?.startSession()
                } else {
                    self?.publish(error: CameraSessionController.permissionMessage)
                }
            }
        default:
            publish(error: CameraSessionController.permissionMessage)
        }
    }

    func stop() {
        queue.async { [session] in
            if session.isRunning { session.stopRunning() }
        }
    }

    func switchCamera() {
        queue.async { [weak self] in
            guard let self else { return }
            self.position = self.position == .back ? .front : .back
            self.configure()
            let front = self.position == .front
            let ready = self.videoInput != nil
            DispatchQueue.main.async {
                self.usingFrontCamera = front
                self.isReady = ready
            }
        }
    }

    /// Dispara cuando el usuario ya encuadró. `completion` llega en el hilo principal.
    func capture(_ completion: @escaping (UIImage?) -> Void) {
        queue.async { [weak self] in
            guard let self, self.videoInput != nil, self.session.isRunning else {
                DispatchQueue.main.async { completion(nil) }
                return
            }
            self.photoCallback = completion
            if let connection = self.photoOutput.connection(with: .video) {
                self.applyOrientation(to: connection)
            }
            self.photoOutput.capturePhoto(with: AVCapturePhotoSettings(), delegate: self)
        }
    }

    private func startSession() {
        queue.async { [weak self] in
            guard let self else { return }
            if self.videoInput == nil { self.configure() }
            if self.videoInput != nil, !self.session.isRunning {
                self.session.startRunning()
            }
            let ready = self.videoInput != nil
            DispatchQueue.main.async { self.isReady = ready }
        }
    }

    /// Solo desde `queue`.
    private func configure() {
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        if session.canSetSessionPreset(.photo) {
            session.sessionPreset = .photo
        }
        if let current = videoInput {
            session.removeInput(current)
            videoInput = nil
        }
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else {
            publish(error: "No hay cámara disponible en este dispositivo.")
            return
        }
        session.addInput(input)
        videoInput = input
        if !session.outputs.contains(where: { $0 === photoOutput }), session.canAddOutput(photoOutput) {
            session.addOutput(photoOutput)
        }
        if let connection = photoOutput.connection(with: .video) {
            applyOrientation(to: connection)
        }
    }

    /// Vertical siempre (la app solo corre en vertical) y la frontal en espejo,
    /// para que la foto salga como se vio en pantalla.
    private func applyOrientation(to connection: AVCaptureConnection) {
        if connection.isVideoRotationAngleSupported(90) {
            connection.videoRotationAngle = 90
        }
        if connection.isVideoMirroringSupported {
            connection.automaticallyAdjustsVideoMirroring = false
            connection.isVideoMirrored = position == .front
        }
    }

    private func publish(error message: String) {
        DispatchQueue.main.async { [weak self] in
            self?.errorMessage = message
            self?.isReady = false
        }
    }
}

extension CameraSessionController: AVCapturePhotoCaptureDelegate {
    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        let image = error == nil ? photo.fileDataRepresentation().flatMap { UIImage(data: $0) } : nil
        let callback = photoCallback
        photoCallback = nil
        DispatchQueue.main.async { callback?(image) }
    }
}

final class CameraPreviewUIView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }

    var previewLayer: AVCaptureVideoPreviewLayer {
        // `layerClass` garantiza el tipo.
        layer as! AVCaptureVideoPreviewLayer
    }
}

/// Vista previa en vivo de la sesión.
struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> CameraPreviewUIView {
        let view = CameraPreviewUIView()
        view.backgroundColor = .black
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ uiView: CameraPreviewUIView, context: Context) {}
}

// MARK: - Flujo completo: encuadrar → disparar → revisar → enviar

/// Cámara en vivo con obturador y cambio frontal/trasera; después la vista
/// previa «Tu foto de …» con la ubicación, «Enviar/Usar esta foto», «Tomar otra»
/// y «Cancelar». Paridad con la cámara de `ActivityEvidenceFlow` en la web.
struct GeoPhotoCaptureView: View {
    let title: String
    /// Texto del botón; el icono de palomita lo pone la vista.
    var confirmLabel: String = "Enviar esta foto"
    /// Entrada y salida exigen GPS; sin ubicación no se puede enviar.
    var requireLocation: Bool = true
    /// `nil` si se guardó; si no, el mensaje a mostrar sin cerrar la vista.
    let onConfirm: (CapturedGeoPhoto) async -> String?
    let onCancel: () -> Void

    @StateObject private var camera = CameraSessionController()
    @State private var captured: CapturedGeoPhoto?
    @State private var working = false
    @State private var locating = false
    @State private var message: String?
    @Environment(\.openURL) private var openURL

    static let locationError = "No se pudo obtener tu ubicación: activa el GPS y da permiso de ubicación"

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let captured {
                preview(captured)
            } else {
                live
            }
        }
        .onAppear { camera.start() }
        .onDisappear { camera.stop() }
    }

    private var live: some View {
        ZStack {
            CameraPreview(session: camera.session)
                .ignoresSafeArea()

            VStack(spacing: 12) {
                HStack {
                    Button("Cancelar", action: onCancel)
                        .foregroundStyle(Color.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(Color.black.opacity(0.45), in: Capsule())
                    Spacer()
                    Text(title)
                        .font(.subheadline.bold())
                        .foregroundStyle(Color.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.black.opacity(0.45), in: Capsule())
                }
                .padding(.horizontal)
                .padding(.top, 8)

                if let error = camera.errorMessage {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(Color.white)
                        .multilineTextAlignment(.center)
                        .padding(12)
                        .background(Color.red.opacity(0.75), in: RoundedRectangle(cornerRadius: 12))
                        .padding(.horizontal)
                }
                if let message {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(Color.white)
                        .padding(10)
                        .background(Color.black.opacity(0.6), in: RoundedRectangle(cornerRadius: 12))
                }

                Spacer()

                if locating {
                    Label("Obteniendo ubicación…", systemImage: "location")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Color.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.black.opacity(0.55), in: Capsule())
                }

                HStack {
                    Color.clear.frame(width: 56, height: 56)
                    Spacer()
                    Button {
                        shoot()
                    } label: {
                        ZStack {
                            Circle()
                                .stroke(Color.white.opacity(0.7), lineWidth: 4)
                                .frame(width: 86, height: 86)
                            Circle()
                                .fill(Color.white)
                                .frame(width: 70, height: 70)
                            if working {
                                ProgressView().tint(.black)
                            }
                        }
                    }
                    .disabled(!camera.isReady || working)
                    .accessibilityLabel("Tomar foto")
                    Spacer()
                    Button {
                        camera.switchCamera()
                    } label: {
                        Image(systemName: "arrow.triangle.2.circlepath.camera")
                            .font(.title2)
                            .foregroundStyle(Color.white)
                            .frame(width: 56, height: 56)
                            .background(Color.black.opacity(0.45), in: Circle())
                    }
                    .disabled(!camera.isReady || working)
                    .accessibilityLabel(camera.usingFrontCamera ? "Usar cámara trasera" : "Usar cámara frontal")
                }
                .padding(.horizontal, 28)
                .padding(.bottom, 24)
            }
        }
    }

    private func preview(_ photo: CapturedGeoPhoto) -> some View {
        VStack(spacing: 12) {
            Text(title)
                .font(.headline)
                .foregroundStyle(Color.white)
                .padding(.top, 12)

            Image(uiImage: photo.image)
                .resizable()
                .scaledToFit()
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .frame(maxHeight: .infinity)
                .padding(.horizontal)

            if let coords = photo.coords,
               let mapUrl = CoreMaps.url(latitude: coords.latitude, longitude: coords.longitude, label: title) {
                Button {
                    openURL(mapUrl)
                } label: {
                    Label("Ubicación capturada · Ver en mapa", systemImage: "mappin.and.ellipse")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.green)
                }
            } else if locating {
                ProgressView("Obteniendo ubicación…")
                    .tint(.white)
                    .foregroundStyle(Color.white)
            }

            if let message {
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(photo.coords == nil && requireLocation ? Color.red : Color.orange)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }

            VStack(spacing: 10) {
                Button {
                    confirm(photo)
                } label: {
                    HStack(spacing: 8) {
                        if working {
                            ProgressView().tint(.white)
                        } else {
                            Image(systemName: "checkmark.circle.fill")
                        }
                        Text(confirmLabel).bold()
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent)
                .tint(NxBrand.primary)
                .disabled(working || locating || (requireLocation && photo.coords == nil))

                if photo.coords == nil {
                    Button { retryLocation(photo) } label: {
                        Label("Reintentar ubicación", systemImage: "location")
                    }
                        .buttonStyle(.bordered)
                        .tint(.white)
                        .disabled(working || locating)
                }

                HStack(spacing: 10) {
                    Button {
                        captured = nil
                        message = nil
                    } label: {
                        Label("Tomar otra", systemImage: "camera").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(.white)
                    .disabled(working)

                    Button {
                        onCancel()
                    } label: {
                        Text("Cancelar").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(.white)
                    .disabled(working)
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 20)
        }
    }

    private func shoot() {
        guard !working else { return }
        working = true
        message = nil
        camera.capture { image in
            Task { @MainActor in
                await handleCaptured(image)
            }
        }
    }

    @MainActor
    private func handleCaptured(_ image: UIImage?) async {
        guard let image, let jpeg = CorePhotoProcessing.jpeg(from: image) else {
            working = false
            message = "No se pudo tomar la foto. Intenta de nuevo."
            return
        }
        locating = true
        let coords = await DeviceLocation.shared.current()
        locating = false
        working = false
        captured = CapturedGeoPhoto(
            image: UIImage(data: jpeg) ?? image,
            jpeg: jpeg,
            coords: coords,
            capturedAt: Date()
        )
        if coords == nil {
            message = requireLocation
                ? GeoPhotoCaptureView.locationError
                : "Sin ubicación: la foto se enviará sin GPS."
        }
    }

    private func retryLocation(_ photo: CapturedGeoPhoto) {
        locating = true
        message = nil
        Task { @MainActor in
            let coords = await DeviceLocation.shared.current()
            locating = false
            captured = CapturedGeoPhoto(image: photo.image, jpeg: photo.jpeg, coords: coords, capturedAt: photo.capturedAt)
            if coords == nil {
                message = requireLocation
                    ? GeoPhotoCaptureView.locationError
                    : "Sin ubicación: la foto se enviará sin GPS."
            }
        }
    }

    private func confirm(_ photo: CapturedGeoPhoto) {
        guard !working else { return }
        if requireLocation && photo.coords == nil {
            message = GeoPhotoCaptureView.locationError
            return
        }
        working = true
        message = nil
        Task { @MainActor in
            let error = await onConfirm(photo)
            working = false
            if let error { message = error }
        }
    }
}
