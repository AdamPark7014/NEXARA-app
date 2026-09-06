import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.gms.google-services")
    id("com.google.firebase.crashlytics")
}

val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

// `const val` no es legal en el cuerpo de un script .kts (las declaraciones de
// script son locales), así que va como val normal.
val MAPS_KEY_PLACEHOLDER = "AIzaSyPLACEHOLDER"

/** Google Maps API key: -P GOOGLE_MAPS_API_KEY=... o local.properties. */
val googleMapsApiKey: String = (project.findProperty("GOOGLE_MAPS_API_KEY") as String?)
    ?: run {
        val lp = rootProject.file("local.properties")
        if (lp.exists()) {
            val props = Properties()
            lp.inputStream().use { props.load(it) }
            props.getProperty("GOOGLE_MAPS_API_KEY", "")
        } else {
            ""
        }
    }

val declaredVersionCode: Int? = (project.findProperty("VERSION_CODE") as String?)?.toIntOrNull()
val declaredVersionName: String? = project.findProperty("VERSION_NAME") as String?

android {
    namespace = "mx.nexara.mobile.nativeapp"
    compileSdk = 36

    defaultConfig {
        applicationId = "mx.nexara.mobile.nativeapp"
        minSdk = 24
        targetSdk = 36
        // El fallback existe para que un `assembleDebug` funcione en cualquier
        // máquina. Para release NO vale: el preflight del final del fichero
        // aborta el build si VERSION_CODE no está declarado en gradle.properties.
        versionCode = declaredVersionCode ?: 1
        versionName = declaredVersionName ?: "0.1.0"

        // Production API base (should include /api). Overridden in debug buildType.
        buildConfigField("String", "API_BASE_URL", "\"https://api.nexara.com.mx/api\"")

        manifestPlaceholders["MAPS_API_KEY"] = googleMapsApiKey.ifBlank { MAPS_KEY_PLACEHOLDER }
    }

    signingConfigs {
        create("release") {
            if (keystorePropertiesFile.exists()) {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                storeFile = rootProject.file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
            }
        }
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
            isShrinkResources = false
            val screenshotApi = project.findProperty("SCREENSHOT_API") == "true"
            buildConfigField(
                "String",
                "API_BASE_URL",
                if (screenshotApi) "\"https://api.nexara.com.mx/api\"" else "\"http://10.0.2.2:3001/api\"",
            )
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            ndk {
                debugSymbolLevel = "SYMBOL_TABLE"
            }
            // Sin key.properties esto degrada a la firma de debug. Se mantiene así
            // para que la CONFIGURACIÓN de Gradle no reviente en máquinas sin
            // keystore (p. ej. un runner que solo compila debug), pero el bloque
            // `gradle.taskGraph.whenReady` del final aborta cualquier tarea de
            // release antes de que llegue a producir un AAB firmado en debug.
            signingConfig = if (keystorePropertiesFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    lint {
        // Un fallo de lint no debe detener un build de release urgente, pero
        // el informe tiene que generarse siempre para poder revisarlo.
        abortOnError = false
        checkReleaseBuilds = true
    }

    packaging {
        jniLibs {
            // AGP 8.5.1+ zip-aligns uncompressed native libs for 16 KB page sizes.
            useLegacyPackaging = false
        }
        resources {
            excludes += setOf(
                "/META-INF/{AL2.0,LGPL2.1}",
            )
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.02.00")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.activity:activity-compose:1.11.0")
    
    // Material Components para retrocompatibilidad con Material3 themes en API < 31
    implementation("com.google.android.material:material:1.12.0")

    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")

    implementation("androidx.compose.material3:material3:1.3.2")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("io.coil-kt:coil-compose:2.7.0")

    implementation("androidx.navigation:navigation-compose:2.9.0")

    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.8.1")

    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-moshi:2.11.0")
    implementation("com.squareup.moshi:moshi-kotlin:1.15.2")
    implementation("com.squareup.retrofit2:converter-scalars:2.11.0")

    implementation("androidx.datastore:datastore-preferences:1.1.7")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("androidx.fragment:fragment-ktx:1.8.6")
    implementation("com.google.android.gms:play-services-location:21.3.0")
    implementation("io.socket:socket.io-client:2.1.0") {
        exclude(group = "org.json", module = "json")
    }

    // Google Maps embebido (Compose-friendly)
    implementation("com.google.android.gms:play-services-maps:19.0.0")
    implementation("com.google.maps.android:maps-compose:4.4.1")

    // CameraX 1.4.2+ ships 16 KB–aligned libimage_processing_util_jni.so (Play requirement).
    val cameraX = "1.4.2"
    implementation("androidx.camera:camera-core:$cameraX")
    implementation("androidx.camera:camera-camera2:$cameraX")
    implementation("androidx.camera:camera-lifecycle:$cameraX")
    implementation("androidx.camera:camera-view:$cameraX")
    implementation("com.google.mlkit:barcode-scanning:17.3.0")

    // Image picker (Android Photo Picker - Android 13+, fallback a selector del sistema).
    // activity-compose ya está declarado arriba; el picker no necesita otra dep.
    implementation("androidx.documentfile:documentfile:1.0.1")

    // Firebase Cloud Messaging + Crashlytics (sin Analytics — evita permiso AD_ID en Play).
    implementation(platform("com.google.firebase:firebase-bom:33.5.1"))
    implementation("com.google.firebase:firebase-messaging-ktx")
    implementation("com.google.firebase:firebase-crashlytics-ktx")

    // PDF renderer (in-app, sin depender de viewer externo)
    // El módulo android.graphics.pdf.PdfRenderer viene en el SDK, no requiere dep extra.

    testImplementation("junit:junit:4.13.2")
}


// ===========================================================================
// Preflight de release
//
// Tres formas de subir a Play un AAB roto sin que nada se queje durante el
// build. Las tres ya pasaron o estuvieron a punto de pasar en este proyecto:
//
//   1. Sin `key.properties`, `bundleRelease` firma con la llave de DEBUG y Play
//      lo rechaza con «el certificado de subida no coincide» — pero solo
//      después de subir 26 MB.
//   2. Sin `GOOGLE_MAPS_API_KEY`, el manifiesto sale con el placeholder y la
//      app compila igual: los mapas salen en blanco solo en la tienda.
//   3. Sin `VERSION_CODE` en gradle.properties, el fallback pone `1` y Play
//      rechaza la versión por versionCode ya usado.
//
// Nada de esto rompe la compilación, así que hay que romperla a propósito.
// Solo se aplica a tareas de release: `assembleDebug` y los tests no se tocan.
// ===========================================================================
gradle.taskGraph.whenReady {
    val buildsReleaseArtifact = allTasks.any { task ->
        task.name.startsWith("bundleRelease") ||
            task.name.startsWith("assembleRelease") ||
            task.name.startsWith("packageRelease")
    }
    if (!buildsReleaseArtifact) return@whenReady

    val problems = mutableListOf<String>()

    if (!keystorePropertiesFile.exists()) {
        problems += """
            |Falta ${keystorePropertiesFile.path}
            |  Sin ese fichero el AAB se firmaría con la llave de DEBUG y Play lo
            |  rechaza tras la subida. Copia key.properties.example y rellénalo, o
            |  genera el keystore con:
            |      pwsh -File scripts/build-play-aab.ps1 -CreateKeystore
        """.trimMargin()
    }

    if (googleMapsApiKey.isBlank() || googleMapsApiKey == MAPS_KEY_PLACEHOLDER) {
        problems += """
            |GOOGLE_MAPS_API_KEY sin definir (o con el placeholder).
            |  El AAB saldría con mapas en blanco y no lo notarías hasta que un
            |  usuario lo reporte. Defínela en apps/mobile-native/android/local.properties:
            |      GOOGLE_MAPS_API_KEY=<clave>
            |  o pásala al build:  -PGOOGLE_MAPS_API_KEY=<clave>
        """.trimMargin()
    }

    if (declaredVersionCode == null) {
        problems += """
            |VERSION_CODE sin declarar en gradle.properties.
            |  El fallback pondría versionCode=1 y Play rechaza cualquier
            |  versionCode ya subido. Declara el valor real antes de compilar.
        """.trimMargin()
    }

    if (declaredVersionName.isNullOrBlank()) {
        problems += "VERSION_NAME sin declarar en gradle.properties."
    }

    if (problems.isNotEmpty()) {
        throw GradleException(
            buildString {
                appendLine()
                appendLine("=".repeat(72))
                appendLine("PREFLIGHT DE RELEASE FALLIDO — el AAB no se generó a propósito.")
                appendLine("=".repeat(72))
                problems.forEach {
                    appendLine()
                    appendLine(it)
                }
                appendLine()
                appendLine("Detalle: docs/ANDROID-RELEASE.md")
                appendLine("=".repeat(72))
            },
        )
    }

    logger.lifecycle(
        "Preflight de release OK — versionCode=$declaredVersionCode versionName=$declaredVersionName",
    )
}
