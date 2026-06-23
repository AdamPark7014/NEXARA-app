package mx.nexara.mobile.nativeapp.ui.util

import android.content.Context
import android.content.Intent
import android.net.Uri

fun openExternalUrl(context: Context, url: String) {
    if (url.isBlank()) return
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    runCatching { context.startActivity(intent) }
}

