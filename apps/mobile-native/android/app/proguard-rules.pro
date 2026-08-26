# NEXARA Android — R8/ProGuard rules for release builds.
# Stack: Retrofit + OkHttp + Moshi (not Gson), Coil, Socket.IO, Firebase, Maps.

# ---------------------------------------------------------------------------
# General / Kotlin
# ---------------------------------------------------------------------------
-keepattributes Signature, InnerClasses, EnclosingMethod
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations
-keepattributes *Annotation*

-keep class kotlin.Metadata { *; }
-keepclassmembers class **$WhenMappings { <fields>; }

-dontwarn org.jetbrains.annotations.**
-dontwarn kotlin.Unit
-dontwarn kotlin.jvm.internal.**

# ---------------------------------------------------------------------------
# Retrofit + OkHttp
# ---------------------------------------------------------------------------
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-dontwarn org.codehaus.mojo.animal_sniffer.**

-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response

-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}

-if interface * { @retrofit2.http.* <methods>; }
-keep,allowobfuscation interface <1>

-keep interface mx.nexara.mobile.nativeapp.data.api.** { *; }

# ---------------------------------------------------------------------------
# Moshi (KotlinJsonAdapterFactory uses reflection on DTOs)
# ---------------------------------------------------------------------------
-dontwarn com.squareup.moshi.**

-keep @com.squareup.moshi.JsonQualifier interface *
-keep @com.squareup.moshi.JsonClass class * { *; }

-keepclasseswithmembers class * {
    @com.squareup.moshi.* <methods>;
}

-keep class mx.nexara.mobile.nativeapp.data.api.** { *; }
-keep class mx.nexara.mobile.nativeapp.data.console.** { *; }
-keep class mx.nexara.mobile.nativeapp.data.realtime.** { *; }
-keep class mx.nexara.mobile.nativeapp.data.tickets.** { *; }

# ---------------------------------------------------------------------------
# Coil
# ---------------------------------------------------------------------------
-keep class coil.** { *; }
-dontwarn coil.**

# ---------------------------------------------------------------------------
# Socket.IO client
# ---------------------------------------------------------------------------
-keep class io.socket.** { *; }
-keep class io.socket.engineio.** { *; }
-dontwarn io.socket.**
-dontwarn org.json.**

# ---------------------------------------------------------------------------
# Firebase / Google Play services
# ---------------------------------------------------------------------------
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# ---------------------------------------------------------------------------
# AndroidX Security, Biometric, CameraX, ML Kit
# ---------------------------------------------------------------------------
-keep class androidx.security.crypto.** { *; }
-keep class androidx.biometric.** { *; }
-keep class androidx.camera.** { *; }
-keep class com.google.mlkit.** { *; }

# ---------------------------------------------------------------------------
# Gson (not a direct dependency; Socket.IO may reference it transitively)
# ---------------------------------------------------------------------------
-dontwarn com.google.gson.**
