package mx.nexara.mobile.nativeapp.data.offline

import android.content.Context

object NexaraOffline {
    private var queue: OfflineMutationQueue? = null
    private var cache: OfflineApiCache? = null
    private var media: OfflineMediaStore? = null

    fun install(context: Context) {
        val app = context.applicationContext
        NetworkMonitor.install(app)
        queue = OfflineMutationQueue(app)
        cache = OfflineApiCache(app)
        media = OfflineMediaStore(app)
    }

    fun mutationQueue(): OfflineMutationQueue =
        queue ?: error("NexaraOffline.install() not called")

    fun apiCache(): OfflineApiCache =
        cache ?: error("NexaraOffline.install() not called")

    fun mediaStore(): OfflineMediaStore =
        media ?: error("NexaraOffline.install() not called")

    fun httpInterceptor(): OfflineHttpInterceptor? {
        val q = queue ?: return null
        val c = cache ?: return null
        val m = media ?: return null
        return OfflineHttpInterceptor(q, c, m)
    }
}
