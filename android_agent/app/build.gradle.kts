plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.sentinelsoc.agent"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.sentinelsoc.agent"
        minSdk = 26
        targetSdk = 35
        versionCode = 103
        versionName = "1.0.3"
    }

    signingConfigs {
        create("ciRelease") {
            val ksPath = System.getenv("SENTINEL_KEYSTORE_PATH")
            if (!ksPath.isNullOrBlank()) {
                storeFile = file(ksPath)
                storePassword = System.getenv("SENTINEL_KEYSTORE_PASS")
                keyAlias = System.getenv("SENTINEL_KEY_ALIAS")
                keyPassword = System.getenv("SENTINEL_KEY_PASS")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            val ksPath = System.getenv("SENTINEL_KEYSTORE_PATH")
            signingConfig = if (!ksPath.isNullOrBlank()) {
                signingConfigs.getByName("ciRelease")
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
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("com.google.android.material:material:1.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
