package mx.nexara.mobile.nativeapp.ui.common

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.app.ActivityCompat
import com.google.android.gms.common.api.ResolvableApiException
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.LocationSettingsRequest
import com.google.android.gms.location.Priority
import mx.nexara.mobile.nativeapp.util.DeviceLocation

/**
 * Antes de checar: permiso de ubicación y ubicación del teléfono encendida.
 *
 * Adam (23-10-2026): Iván «siempre dice que no muestra su ubicación al iniciar jornada». En octubre
 * checó once veces sin ubicación: permiso negado (14, 15, 19 y 20) o la ubicación del teléfono
 * apagada (21 y 23). La app checaba igual y la entrada quedaba «Sin ubicación».
 *
 * Ahora, al tocar «Registrar entrada/salida»:
 * 1. Sin permiso → se pide. Si Android ya no deja pedirlo (lo negó dos veces), un diálogo lleva a
 *    los ajustes de NEXARA.
 * 2. Con permiso y la ubicación apagada → el diálogo del sistema «Activar ubicación» (un toque).
 * 3. Pase lo que pase se sigue a la foto: nadie se queda sin checar por la ubicación. Si aun así
 *    no hubo, el servidor le pone a la entrada el primer punto del GPS de jornada.
 *
 * Devuelve la función que envuelve la acción: `asegurar { tomarFoto() }`.
 */
@Composable
fun rememberAsegurarUbicacion(): (onListo: () -> Unit) -> Unit {
    val context = LocalContext.current
    var pendiente by remember { mutableStateOf<(() -> Unit)?>(null) }
    var pedirAjustes by remember { mutableStateOf(false) }

    fun continuar() {
        val accion = pendiente
        pendiente = null
        accion?.invoke()
    }

    val activarLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartIntentSenderForResult(),
    ) {
        // Aceptó o no: se sigue. La lectura de la checada espera unos segundos al GPS recién encendido.
        continuar()
    }

    fun pedirEncender() {
        if (DeviceLocation.ubicacionEncendida(context)) {
            continuar()
            return
        }
        val activity = context.findActivity()
        if (activity == null) {
            continuar()
            return
        }
        val request = LocationSettingsRequest.Builder()
            .addLocationRequest(LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10_000L).build())
            .setAlwaysShow(true)
            .build()
        LocationServices.getSettingsClient(activity).checkLocationSettings(request)
            .addOnSuccessListener { continuar() }
            .addOnFailureListener { e ->
                val resolvable = e as? ResolvableApiException
                if (resolvable == null) {
                    continuar()
                    return@addOnFailureListener
                }
                runCatching {
                    activarLauncher.launch(IntentSenderRequest.Builder(resolvable.resolution).build())
                }.onFailure { continuar() }
            }
    }

    val permisoLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) {
        if (DeviceLocation.hasPermission(context)) {
            pedirEncender()
            return@rememberLauncherForActivityResult
        }
        val activity = context.findActivity()
        // Negado y Android ya no muestra el diálogo («No volver a preguntar» o dos negativas).
        val bloqueado = activity != null &&
            !ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.ACCESS_FINE_LOCATION)
        if (bloqueado) pedirAjustes = true else continuar()
    }

    if (pedirAjustes) {
        AlertDialog(
            onDismissRequest = {
                pedirAjustes = false
                continuar()
            },
            title = { Text("Permite tu ubicación") },
            text = {
                Text(
                    "Tu checada y tu jornada llevan tu ubicación. En Ajustes → Permisos → Ubicación, " +
                        "elige «Permitir solo con la app en uso» y vuelve a checar.",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    pedirAjustes = false
                    pendiente = null
                    val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                        .setData(Uri.fromParts("package", context.packageName, null))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    runCatching { context.startActivity(intent) }
                }) { Text("Abrir ajustes") }
            },
            dismissButton = {
                TextButton(onClick = {
                    pedirAjustes = false
                    continuar()
                }) { Text("Checar sin ubicación") }
            },
        )
    }

    return { onListo ->
        pendiente = onListo
        if (!DeviceLocation.hasPermission(context)) {
            permisoLauncher.launch(
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
            )
        } else {
            pedirEncender()
        }
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
