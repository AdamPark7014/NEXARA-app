# NEXARA Android — R8/ProGuard rules for release builds.
# Stack: Retrofit + OkHttp + Moshi (not Gson), Coil, Socket.IO, Firebase, Maps.

# ---------------------------------------------------------------------------
# General / Kotlin
# ---------------------------------------------------------------------------
-keepattributes Signature, InnerClasses, EnclosingMethod
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations
-keepattributes *Annotation*

# Crashlytics necesita fichero + línea para desofuscar el stack trace con mapping.txt.
# Sin esto los reportes de la v2 llegan sin número de línea y no sirven para nada.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

-keep class kotlin.Metadata { *; }
-keepclassmembers class **$WhenMappings { <fields>; }

-dontwarn org.jetbrains.annotations.**
-dontwarn kotlin.Unit
-dontwarn kotlin.jvm.internal.**

# El adaptador reflexivo de Moshi (KotlinJsonAdapterFactory) resuelve los parámetros
# del constructor primario vía kotlin-reflect y usa el constructor sintético
# (DefaultConstructorMarker) cuando el DTO tiene valores por defecto.
-keep class kotlin.jvm.internal.DefaultConstructorMarker { *; }
-dontwarn kotlin.reflect.jvm.internal.**

# Reglas estándar que faltaban: enums (Moshi los serializa por nombre),
# Parcelable, Serializable y métodos nativos.
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
    **[] $VALUES;
    public *;
}
-keepclassmembers class * implements android.os.Parcelable {
    public static final ** CREATOR;
}
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}
-keepclasseswithmembernames class * {
    native <methods>;
}

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
# Moshi — CRÍTICO
#
# La app usa Moshi con KotlinJsonAdapterFactory (adaptador REFLEXIVO, no generado
# por KSP). Ese adaptador deriva las claves JSON de los nombres de propiedad que
# lee de @kotlin.Metadata. Si R8 renombra un DTO o sus campos, la deserialización
# NO falla al compilar ni al arrancar: devuelve listas vacías o campos nulos, solo
# en release. Es el fallo más caro posible y el más difícil de ver.
#
# Por eso las reglas de abajo son ESTRUCTURALES (por forma del nombre y por
# anotación), no una lista de paquetes: una lista se queda obsoleta en cuanto
# alguien crea un DTO en un paquete nuevo, y nadie se entera hasta producción.
# ---------------------------------------------------------------------------
-dontwarn com.squareup.moshi.**

-keep @com.squareup.moshi.JsonQualifier interface *
-keep @com.squareup.moshi.JsonClass class * { *; }

-keepclasseswithmembers class * {
    @com.squareup.moshi.* <methods>;
}
-keepclassmembers class * {
    @com.squareup.moshi.Json <fields>;
}

# --- Red de seguridad estructural: cualquier tipo con forma de payload JSON,
# --- viva en el paquete que viva. Cubre DTOs futuros sin tocar este fichero.
-keep class mx.nexara.mobile.nativeapp.**Dto { *; }
-keep class mx.nexara.mobile.nativeapp.**Request { *; }
-keep class mx.nexara.mobile.nativeapp.**Response { *; }
-keep class mx.nexara.mobile.nativeapp.**Body { *; }
-keep class mx.nexara.mobile.nativeapp.**Payload { *; }
-keep class mx.nexara.mobile.nativeapp.**Event { *; }

# --- Paquetes de datos completos (DTOs, envoltorios y sus tipos anidados).
-keep class mx.nexara.mobile.nativeapp.data.api.** { *; }
-keep class mx.nexara.mobile.nativeapp.data.console.** { *; }
-keep class mx.nexara.mobile.nativeapp.data.realtime.** { *; }
-keep class mx.nexara.mobile.nativeapp.data.tickets.** { *; }

# --- Cola offline: QueuedMutation se PERSISTE EN DISCO como JSON y sobrevive a
# --- las actualizaciones. Si la v2 la ofuscara, las mutaciones que la v1 dejó
# --- encoladas quedarían ilegibles y el trabajo de campo pendiente se perdería
# --- en silencio al actualizar. Hoy solo la salvaba la anotación @JsonClass;
# --- aquí queda explícito para que no dependa de eso.
-keep class mx.nexara.mobile.nativeapp.data.offline.** { *; }

# --- Repositorios que construyen su propio Moshi reflexivo. Los tipos que
# --- deserializan ya están cubiertos arriba; esto protege sus tipos anidados.
-keep class mx.nexara.mobile.nativeapp.data.crm.** { *; }
-keep class mx.nexara.mobile.nativeapp.data.extra.** { *; }
-keep class mx.nexara.mobile.nativeapp.data.integra.** { *; }
-keep class mx.nexara.mobile.nativeapp.data.ops.** { *; }
-keep class mx.nexara.mobile.nativeapp.data.studio.** { *; }

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

# security-crypto empaqueta Tink, que resuelve sus primitivas por reflexión
# sobre protobuf. Si R8 recorta ahí, EncryptedSharedPreferences revienta al
# abrir la sesión — y eso es un crash al arranque, solo en release.
-keep class com.google.crypto.tink.** { *; }
-dontwarn com.google.crypto.tink.**
-dontwarn com.google.protobuf.**

# ---------------------------------------------------------------------------
# Gson (not a direct dependency; Socket.IO may reference it transitively)
# ---------------------------------------------------------------------------
-dontwarn com.google.gson.**
