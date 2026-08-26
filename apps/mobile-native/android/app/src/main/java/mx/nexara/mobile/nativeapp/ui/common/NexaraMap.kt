package mx.nexara.mobile.nativeapp.ui.common

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.maps.android.compose.CameraPositionState
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.Polyline
import com.google.maps.android.compose.rememberCameraPositionState

data class MapPin(
    val id: String,
    val lat: Double,
    val lng: Double,
    val title: String? = null,
    val snippet: String? = null,
)

/**
 * Mapa de Google Maps embebido. Requiere la API key en AndroidManifest
 * (meta-data com.google.android.geo.API_KEY).
 */
@Composable
fun NexaraMap(
    pins: List<MapPin>,
    modifier: Modifier = Modifier,
    polylinePoints: List<LatLng> = emptyList(),
    polylineColor: Color = Color(0xFF3B82F6),
    defaultCenter: LatLng = LatLng(19.4326, -99.1332), // CDMX
    defaultZoom: Float = 11f,
    height: Dp = 280.dp,
    showUser: Boolean = true,
) {
    val center = polylinePoints.firstOrNull()
        ?: pins.firstOrNull()?.let { LatLng(it.lat, it.lng) }
        ?: defaultCenter
    val cameraPositionState: CameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(center, defaultZoom)
    }
    val mapProperties = remember { MapProperties(isMyLocationEnabled = false) }
    val uiSettings = remember {
        MapUiSettings(
            zoomControlsEnabled = true,
            compassEnabled = true,
            myLocationButtonEnabled = showUser,
        )
    }

    LaunchedEffect(pins, polylinePoints) {
        val allPoints = buildList {
            pins.forEach { add(LatLng(it.lat, it.lng)) }
            addAll(polylinePoints)
        }
        if (allPoints.isEmpty()) return@LaunchedEffect
        if (allPoints.size == 1) {
            cameraPositionState.animate(CameraUpdateFactory.newLatLngZoom(allPoints[0], defaultZoom))
            return@LaunchedEffect
        }
        val builder = LatLngBounds.builder()
        allPoints.forEach { builder.include(it) }
        runCatching {
            cameraPositionState.animate(CameraUpdateFactory.newLatLngBounds(builder.build(), 80))
        }.onFailure {
            cameraPositionState.animate(CameraUpdateFactory.newLatLngZoom(allPoints.first(), defaultZoom))
        }
    }

    GoogleMap(
        modifier = modifier
            .fillMaxSize()
            .height(height),
        cameraPositionState = cameraPositionState,
        properties = mapProperties,
        uiSettings = uiSettings,
    ) {
        if (polylinePoints.size >= 2) {
            Polyline(
                points = polylinePoints,
                color = polylineColor,
                width = 8f,
            )
        }
        pins.forEach { pin ->
            Marker(
                state = MarkerState(LatLng(pin.lat, pin.lng)),
                title = pin.title,
                snippet = pin.snippet,
            )
        }
    }
}
