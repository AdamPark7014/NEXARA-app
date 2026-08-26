package mx.nexara.mobile.nativeapp

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.enableEdgeToEdge
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.fragment.app.FragmentActivity
import com.google.firebase.messaging.FirebaseMessaging
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.offline.NexaraOffline
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.DevicesApi
import mx.nexara.mobile.nativeapp.data.api.RegisterFcmTokenRequest
import mx.nexara.mobile.nativeapp.push.NexaraNotifications
import mx.nexara.mobile.nativeapp.access.DeepLinkParser
import mx.nexara.mobile.nativeapp.access.NotificationDeepLinkResolver
import mx.nexara.mobile.nativeapp.navigation.PendingDeepLink
import mx.nexara.mobile.nativeapp.security.AppLock
import mx.nexara.mobile.nativeapp.security.AppLockScreen
import mx.nexara.mobile.nativeapp.ui.NexaraScaffold
import mx.nexara.mobile.nativeapp.ui.NexaraApp
import mx.nexara.mobile.nativeapp.screenshots.ScreenshotAutomation
import mx.nexara.mobile.nativeapp.ui.theme.NexaraTheme

class MainActivity : FragmentActivity() {
    private val requestPostNotifications =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* respuesta opcional */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        NexaraNotifications.ensureChannels(this)
        NexaraOffline.install(applicationContext)
        handleDeepLink(intent)
        askNotificationPermissionIfNeeded()
        refreshFcmToken()

        setContent {
            NexaraTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    var locked by remember { mutableStateOf(false) }
                    var isUnlocking by remember { mutableStateOf(false) }
                    var unlockAttempt by remember { mutableStateOf(0) }
                    val authRepo = remember { AuthRepository(this@MainActivity) }
                    val activity = this@MainActivity

                    LaunchedEffect(locked, unlockAttempt) {
                        if (!locked) return@LaunchedEffect
                        isUnlocking = true
                        val ok = AppLock.authenticate(activity)
                        isUnlocking = false
                        if (ok) {
                            AppLock.clearBackground(activity)
                            locked = false
                        }
                    }

                    DisposableEffect(Unit) {
                        val callbacks = object : android.app.Application.ActivityLifecycleCallbacks {
                            override fun onActivityStopped(a: android.app.Activity) {
                                if (a !== activity) return
                                if (activity.isChangingConfigurations) return
                                if (authRepo.loadSession() != null && AppLock.shouldLock(activity)) {
                                    AppLock.recordBackground(activity)
                                }
                            }
                            override fun onActivityStarted(a: android.app.Activity) {
                                if (a !== activity) return
                                if (
                                    authRepo.loadSession() != null &&
                                    AppLock.shouldLockAfterBackground(activity)
                                ) {
                                    locked = true
                                }
                            }
                            override fun onActivityCreated(a: android.app.Activity, b: Bundle?) {}
                            override fun onActivityResumed(a: android.app.Activity) {}
                            override fun onActivityPaused(a: android.app.Activity) {}
                            override fun onActivitySaveInstanceState(a: android.app.Activity, b: Bundle) {}
                            override fun onActivityDestroyed(a: android.app.Activity) {}
                        }
                        application.registerActivityLifecycleCallbacks(callbacks)
                        onDispose { application.unregisterActivityLifecycleCallbacks(callbacks) }
                    }

                    if (!locked) {
                        NexaraScaffold {
                            NexaraApp()
                        }
                    } else {
                        AppLockScreen(
                            isUnlocking = isUnlocking,
                            onUnlock = { if (!isUnlocking) unlockAttempt++ },
                        )
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLink(intent)
    }

    private fun handleDeepLink(intent: Intent?) {
        if (intent == null) return

        val uri = intent.data
        if (ScreenshotAutomation.isDebugAutomationUri(uri) && uri != null) {
            lifecycleScope.launch {
                val action = uri.pathSegments.firstOrNull()?.lowercase()
                ScreenshotAutomation.handle(
                    context = applicationContext,
                    uri = uri,
                    emailExtra = intent.getStringExtra(ScreenshotAutomation.EXTRA_EMAIL),
                    passwordExtra = intent.getStringExtra(ScreenshotAutomation.EXTRA_PASSWORD),
                )
                if (action == "auto-login") {
                    recreate()
                }
            }
            return
        }

        if (uri != null) {
            DeepLinkParser.parse(uri)?.let { PendingDeepLink.publish(it) }
            return
        }

        val pushData = pushDataFromIntent(intent)
        NotificationDeepLinkResolver.resolveFromPushData(pushData)?.let { PendingDeepLink.publish(it) }
    }

    private fun pushDataFromIntent(intent: Intent): Map<String, String> {
        val extras = intent.extras ?: return emptyMap()
        return extras.keySet()
            .asSequence()
            .filter { it.startsWith("nexara_") }
            .mapNotNull { key ->
                val value = extras.getString(key)?.trim().orEmpty()
                if (value.isBlank()) null else key.removePrefix("nexara_") to value
            }
            .toMap()
    }

    private fun askNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(
            this, Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) requestPostNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    /** Obtiene el token actual de FCM y lo reenvía al backend si hay sesión. */
    private fun refreshFcmToken() {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (!task.isSuccessful) {
                Log.w("MainActivity", "FCM getToken falló: ${task.exception?.message}")
                return@addOnCompleteListener
            }
            val token = task.result ?: return@addOnCompleteListener
            CoroutineScope(Dispatchers.IO).launch {
                runCatching {
                    val auth = AuthRepository(applicationContext)
                    if (auth.token().isNullOrBlank()) return@runCatching
                    val api = ApiClient.authed { auth.token() }.create(DevicesApi::class.java)
                    api.registerPushToken(RegisterFcmTokenRequest(token, "android"))
                }.onFailure { Log.w("MainActivity", "registerPushToken: ${it.message}") }
            }
        }
    }
}
