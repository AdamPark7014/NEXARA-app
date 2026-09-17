package mx.nexara.mobile.nativeapp.storedemo

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import mx.nexara.mobile.nativeapp.data.api.ApiDebugHooks

/**
 * Solo debug: instala [StoreDemoInterceptor] antes de que exista cualquier cliente HTTP
 * (un ContentProvider arranca antes que `Application.onCreate`). No expone datos.
 */
class StoreDemoProvider : ContentProvider() {
    override fun onCreate(): Boolean {
        val ctx = context ?: return true
        ApiDebugHooks.interceptors = listOf(StoreDemoInterceptor(ctx))
        ApiDebugHooks.forceSelfCheckIn = java.io.File(ctx.filesDir, "store_demo/checador").exists()
        return true
    }

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? = null
    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0
}
