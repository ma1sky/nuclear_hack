# Временный Maven-кэш для Windows

Нужен только на ПК, где Gradle не может скачать Maven-зависимости из-за обрыва TLS, а curl с проверкой сертификатов работает. Для работы установленного APK эти инструменты не нужны.

Кэш получает файлы с официальных Google Maven, Maven Central и Gradle Plugin Portal; проверку сертификатов не отключает. Слушает только `127.0.0.1:8766`, сохраняет файлы в `%LOCALAPPDATA%/nuclear-hack/maven-cache` и использует уже имеющиеся файлы Gradle. Исходники node_modules не изменяются.

Из корня репозитория, в отдельном PowerShell:

```powershell
# Только если для доступа нужен уже настроенный локальный прокси:
$env:NUCLEAR_BUILD_PROXY = 'http://127.0.0.1:7890'
python tools/windows-build/maven_bridge.py
```

Во втором PowerShell, после обычной подготовки проекта и моделей:

```powershell
$env:JAVA_HOME = 'D:\Programs\Android Studio\jbr' # заменить своим путём
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:EXPO_OFFLINE = '1'
cd app/android
.\gradlew.bat :app:assembleRelease '-PreactNativeArchitectures=x86_64,arm64-v8a' -I ../../tools/windows-build/maven-bridge.init.gradle --console=plain --max-workers=2
```

Init script действует только на эту команду: направляет Maven-запросы в кэш и согласует Android Gradle Plugin подпроектов с корневым 9.2.1 проверенной сборки. Это версия текущей Expo 58 сборки; при обновлении Expo/AGP пересмотреть script. Не применять к другим проектам.

После сборки остановить сервер Ctrl+C. Глобальные настройки Gradle, сети и Windows не меняются. Если в Gradle закэширован ответ об отсутствии файла, однократно добавить `--refresh-dependencies`.

Дополнительно на Windows работает Expo plugin `app/plugins/withShortNativePaths.cjs`, сокращающий длинные объектные пути CMake. Нужны NDK 27.1.12297006, Build Tools 37.0.0 и CMake 3.22.1; установить через Android Studio SDK Manager. См. основной [отчёт сборки](../../docs/android-smoke-2026-11-07.md).
