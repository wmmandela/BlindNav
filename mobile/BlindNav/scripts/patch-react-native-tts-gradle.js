const fs = require('fs');
const path = require('path');

const appRoot = path.join(__dirname, '..');

function patchTts() {
  const gradlePath = path.join(
    appRoot,
    'node_modules',
    'react-native-tts',
    'android',
    'build.gradle',
  );

  let contents = fs.readFileSync(gradlePath, 'utf8');

  contents = contents.replace(
    /\nbuildscript\s*\{[\s\S]*?\n\}\n\napply plugin: 'com\.android\.library'/,
    "\napply plugin: 'com.android.library'",
  );

  if (!contents.includes("namespace 'net.no_mad.tts'")) {
    contents = contents.replace(
      /android\s*\{\n/,
      "android {\n    namespace 'net.no_mad.tts'\n",
    );
  }

  fs.writeFileSync(gradlePath, contents);
}

function patchVoice() {
  const gradlePath = path.join(
    appRoot,
    'node_modules',
    '@react-native-voice',
    'voice',
    'android',
    'build.gradle',
  );

  let contents = fs.readFileSync(gradlePath, 'utf8');

  contents = contents.replaceAll('jcenter()', 'google()\n    mavenCentral()');
  contents = contents.replace(
    'def DEFAULT_SUPPORT_LIB_VERSION = "28.0.0"',
    'def DEFAULT_APPCOMPAT_VERSION = "1.7.0"',
  );
  contents = contents.replace(
    /android\s*\{\n\s*compileSdkVersion rootProject\.hasProperty\('compileSdkVersion'\) \? rootProject\.compileSdkVersion : DEFAULT_COMPILE_SDK_VERSION\n\s*buildToolsVersion rootProject\.hasProperty\('buildToolsVersion'\) \? rootProject\.buildToolsVersion : DEFAULT_BUILD_TOOLS_VERSION/,
    "android {\n    namespace 'com.wenkesj.voice'\n    compileSdkVersion rootProject.ext.has('compileSdkVersion') ? rootProject.ext.get('compileSdkVersion') : DEFAULT_COMPILE_SDK_VERSION\n    buildToolsVersion rootProject.ext.has('buildToolsVersion') ? rootProject.ext.get('buildToolsVersion') : DEFAULT_BUILD_TOOLS_VERSION",
  );
  contents = contents.replace(
    "targetSdkVersion rootProject.hasProperty('targetSdkVersion') ? rootProject.targetSdkVersion : DEFAULT_TARGET_SDK_VERSION",
    "targetSdkVersion rootProject.ext.has('targetSdkVersion') ? rootProject.ext.get('targetSdkVersion') : DEFAULT_TARGET_SDK_VERSION",
  );
  contents = contents.replace(
    "classpath 'com.android.tools.build:gradle:3.3.2'",
    "classpath 'com.android.tools.build:gradle:8.13.1'",
  );
  contents = contents.replace(
    "def supportVersion = rootProject.hasProperty('supportLibVersion') ? rootProject.supportLibVersion : DEFAULT_SUPPORT_LIB_VERSION",
    "def appcompatVersion = rootProject.ext.has('appCompatVersion') ? rootProject.ext.get('appCompatVersion') : DEFAULT_APPCOMPAT_VERSION",
  );
  contents = contents.replace(
    'implementation "com.android.support:appcompat-v7:${supportVersion}"',
    'implementation "androidx.appcompat:appcompat:${appcompatVersion}"',
  );

  fs.writeFileSync(gradlePath, contents);
}

patchTts();
patchVoice();
console.log('Patched Android Gradle config for react-native-tts and @react-native-voice/voice.');
