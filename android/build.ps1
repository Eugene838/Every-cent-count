$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$toolRoot = Join-Path $projectRoot '.android-tools'
$javaRoot = $env:JAVA_HOME
if (!$javaRoot) { $javaRoot = (Get-ChildItem "$toolRoot/java" -Directory | Select-Object -First 1).FullName }
if (!$javaRoot) { throw 'Install Java 17 under .android-tools/java first. See android/README.md.' }
$env:JAVA_HOME = $javaRoot
$sdkRoot = $env:ANDROID_HOME
if (!$sdkRoot) { $sdkRoot = Join-Path $toolRoot 'sdk' }
$buildTools = Join-Path $sdkRoot 'build-tools/35.0.0'
$platform = Join-Path $sdkRoot 'platforms/android-35/android.jar'
$build = Join-Path $PSScriptRoot 'build'
$signing = Join-Path $PSScriptRoot 'signing'
$dist = Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Force $build,"$build/classes","$build/dex",$signing,$dist | Out-Null
function Run-Tool([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable failed with exit code $LASTEXITCODE" }
}
Run-Tool "$buildTools/aapt2.exe" @('compile','--dir',"$PSScriptRoot/res",'-o',"$build/resources.zip")
Run-Tool "$buildTools/aapt2.exe" @('link','-o',"$build/unsigned.apk",'--manifest',"$PSScriptRoot/AndroidManifest.xml",'-I',$platform,"$build/resources.zip")
$sources = @(Get-ChildItem "$PSScriptRoot/src" -Recurse -Filter '*.java' | ForEach-Object { $_.FullName })
Run-Tool "$javaRoot/bin/javac.exe" (@('-encoding','UTF-8','-source','8','-target','8','-classpath',$platform,'-d',"$build/classes") + $sources)
Run-Tool "$javaRoot/bin/jar.exe" @('cf',"$build/classes.jar",'-C',"$build/classes",'.')
Run-Tool "$buildTools/d8.bat" @('--release','--min-api','26','--lib',$platform,'--output',"$build/dex","$build/classes.jar")
Run-Tool "$javaRoot/bin/jar.exe" @('uf',"$build/unsigned.apk",'-C',"$build/dex",'classes.dex')
Run-Tool "$buildTools/zipalign.exe" @('-f','-p','4',"$build/unsigned.apk","$build/aligned.apk")
$keyStore = Join-Path $signing 'every-cent-counts.jks'
$passwordFile = Join-Path $signing 'keystore-password.txt'
if (!(Test-Path $keyStore)) {
    if ($env:CI) { throw 'Release signing key is missing. Refusing to generate a replacement key in CI.' }
    if (!(Test-Path $passwordFile)) {
        $randomBytes = New-Object byte[] 32
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        $rng.GetBytes($randomBytes)
        $rng.Dispose()
        [IO.File]::WriteAllText($passwordFile, [Convert]::ToBase64String($randomBytes))
    }
    Run-Tool "$javaRoot/bin/keytool.exe" @('-genkeypair','-keystore',$keyStore,'-storepass:file',$passwordFile,'-keypass:file',$passwordFile,'-alias','every-cent-counts','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=Every Cent Counts','-noprompt')
}
$apk = Join-Path $dist 'Every-Cent-Counts.apk'
Run-Tool "$buildTools/apksigner.bat" @('sign','--ks',$keyStore,'--ks-pass',"file:$passwordFile",'--out',$apk,"$build/aligned.apk")
Run-Tool "$buildTools/apksigner.bat" @('verify','--verbose',$apk)
Run-Tool "$buildTools/zipalign.exe" @('-c','-v','4',$apk)
Get-FileHash $apk -Algorithm SHA256
Write-Host "APK ready: $apk"
