import SwiftUI
import MapKit

struct MapPin: Identifiable, Hashable {
    let id: String
    let latitude: Double
    let longitude: Double
    let title: String?
    let subtitle: String?
}

/// Mapa nativo con MapKit. Acepta una lista de puntos y se auto-ajusta.
struct NexaraMapView: View {
    let pins: [MapPin]
    @State private var region: MKCoordinateRegion

    init(pins: [MapPin]) {
        self.pins = pins
        let first = pins.first
        let center = CLLocationCoordinate2D(
            latitude: first?.latitude ?? 19.4326,
            longitude: first?.longitude ?? -99.1332
        )
        _region = State(initialValue: MKCoordinateRegion(
            center: center,
            span: MKCoordinateSpan(latitudeDelta: 0.1, longitudeDelta: 0.1)
        ))
    }

    var body: some View {
        Map(coordinateRegion: $region, annotationItems: pins) { pin in
            MapAnnotation(coordinate: CLLocationCoordinate2D(latitude: pin.latitude, longitude: pin.longitude)) {
                VStack(spacing: 2) {
                    Image(systemName: "mappin.circle.fill")
                        .font(.title)
                        .foregroundColor(.red)
                    if let t = pin.title {
                        Text(t)
                            .font(.caption2)
                            .padding(.horizontal, 4)
                            .background(.thinMaterial)
                            .cornerRadius(4)
                    }
                }
            }
        }
        .frame(minHeight: 260)
        .cornerRadius(12)
    }
}
