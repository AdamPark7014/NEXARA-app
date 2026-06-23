import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.gms.google-services")
}

android {
    namespace = "mx.nexara.mobile.nativeapp"
    compileSdk = 36

    defaultConfig {
        applicationId = "mx.nexara.mobile.nativeapp"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        // Production API base (should include /api).
        buildConfigField("String", "API_BASE_URL", "\"https://api.nexara.com.mx/api\"")

        // Google Maps API key. Lee de -P GOOGLE_MAPS_API_KEY=... o local.properties.
        val mapsKey: String = (project.findProperty("GOOGLE_MAPS_API_KEY") as String?)
            ?: run {
                val lp = rootProject.file("local.properties")
                if (lp.exists()) {
                    val props = Properties()
                    lp.inputStream().use { props.load(it) }
                    props.getProperty("GOOGLE_MAPS_API_KEY", "")
                } else ""
            }
        manifestPlaceholders["MAPS_API_KEY"] = mapsKey.ifBlank { "AIzaSyPLACEHOLDER" }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
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

    packaging {
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
    implementation("androidx.activity:activity-compose:1.11.0")
    
    // Material Components para retrocompatibilidad con Material3 themes en API < 31
    implementation("com.google.android.material:material:1.12.0")

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")

    implementation("androidx.compose.material3:material3:1.3.2")
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

    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("com.google.android.gms:play-services-location:21.3.0")
    implementation("io.socket:socket.io-client:2.1.0") {
        exclude(group = "org.json", module = "json")
    }

    // Google Maps embebido (Compose-friendly)
    implementation("com.google.android.gms:play-services-maps:19.0.0")
    implementation("com.google.maps.android:maps-compose:4.4.1")

    // CameraX para captura de evidencias
    val cameraX = "1.3.4"
    implementation("androidx.camera:camera-core:$cameraX")
    implementation("androidx.camera:camera-camera2:$cameraX")
    implementation("androidx.camera:camera-lifecycle:$cameraX")
    implementation("androidx.camera:camera-view:$cameraX")

    // Image picker (Android Photo Picker - Android 13+, fallback a selector del sistema)
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.documentfile:documentfile:1.0.1")

    // Firebase Cloud Messaging (push externo)
    implementation(platform("com.google.firebase:firebase-bom:33.5.1"))
    implementation("com.google.firebase:firebase-messaging-ktx")
    implementation("com.google.firebase:firebase-analytics-ktx")

    // PDF renderer (in-app, sin depender de viewer externo)
    // El módulo android.graphics.pdf.PdfRenderer viene en el SDK, no requiere dep extra.

    testImplementation("junit:junit:4.13.2")
}

