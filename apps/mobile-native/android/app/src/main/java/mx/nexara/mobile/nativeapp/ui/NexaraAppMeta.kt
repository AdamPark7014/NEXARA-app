package mx.nexara.mobile.nativeapp.ui

import android.content.Context
import mx.nexara.mobile.nativeapp.BuildConfig

object NexaraAppMeta {
    const val PRIVACY_URL = "https://nexara.com.mx/legal/privacidad"
    const val SUPPORT_URL = "https://nexara.com.mx/contacto"
    const val WEBSITE_URL = "https://nexara.com.mx"

    fun versionName(): String = BuildConfig.VERSION_NAME

    fun versionCode(): Int = BuildConfig.VERSION_CODE

    /** Lo que ve la gente: solo la versión, sin número de compilación ni tipo de build. */
    fun versionLabel(): String = "v${BuildConfig.VERSION_NAME}"

    fun isDebugBuild(): Boolean = BuildConfig.DEBUG

    fun buildLabel(context: Context): String = versionLabel()
}
