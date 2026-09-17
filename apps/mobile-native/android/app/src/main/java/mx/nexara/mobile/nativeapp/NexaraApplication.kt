package mx.nexara.mobile.nativeapp

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache
import com.google.firebase.crashlytics.FirebaseCrashlytics
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.data.realtime.RealtimeBus
import mx.nexara.mobile.nativeapp.push.NexaraNotifications
import mx.nexara.mobile.nativeapp.push.NexaraPushRenderer
import mx.nexara.mobile.nativeapp.push.PushPayload

class NexaraApplication : Application(), ImageLoaderFactory {
    override fun onCreate() {
        super.onCreate()
        FirebaseCrashlytics.getInstance().isCrashlyticsCollectionEnabled = !BuildConfig.DEBUG
        // Canales antes que nada: un push con la app cerrada arranca el proceso
        // directo en NexaraFirebaseService, sin pasar por MainActivity.
        NexaraNotifications.ensureChannels(this)
        // Nombre del teléfono para los avisos de inicio de sesión («desde Galaxy S24 Ultra»).
        mx.nexara.mobile.nativeapp.data.api.ApiClient.deviceDisplayName = runCatching {
            android.provider.Settings.Global.getString(contentResolver, android.provider.Settings.Global.DEVICE_NAME)
        }.getOrNull()?.takeIf { it.isNotBlank() }

        // Mientras el proceso vive (app abierta, en segundo plano o con la jornada activa), cada
        // aviso que llega por el socket se muestra igual que un push de FCM. Si FCM también lo
        // entrega, el renderizador descarta el repetido.
        CoroutineScope(SupervisorJob() + Dispatchers.Default).launch {
            RealtimeBus.pushes.collect { data ->
                runCatching { NexaraPushRenderer.render(this@NexaraApplication, PushPayload.from(data)) }
            }
        }
    }

    override fun newImageLoader(): ImageLoader {
        return ImageLoader.Builder(this)
            .memoryCache {
                MemoryCache.Builder(this)
                    .maxSizePercent(0.25)
                    .build()
            }
            .diskCache {
                DiskCache.Builder()
                    .directory(cacheDir.resolve("image_cache"))
                    .maxSizeBytes(256L * 1024 * 1024)
                    .build()
            }
            .crossfade(true)
            .respectCacheHeaders(true)
            .build()
    }
}
