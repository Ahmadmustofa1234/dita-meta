// Salin distribusi Three.js yang dipakai game, termasuk dependensi loader.
// Jalankan npm ci lalu npm run vendor hanya saat menyiapkan ulang library.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'node_modules', 'three');
const target = path.join(root, 'vendor', 'three');
const expectedVersion = require('../package.json').devDependencies.three;
const installedVersion = require(path.join(source, 'package.json')).version;

if (installedVersion !== expectedVersion) {
  throw new Error(`Three.js ${installedVersion} tidak sesuai ${expectedVersion}. Jalankan npm ci terlebih dahulu.`);
}

const files = [
  'LICENSE',
  'build/three.module.js',
  'examples/jsm/loaders/FBXLoader.js',
  'examples/jsm/loaders/GLTFLoader.js',
  'examples/jsm/controls/PointerLockControls.js',
  'examples/jsm/libs/fflate.module.js',
  'examples/jsm/curves/NURBSCurve.js',
  'examples/jsm/curves/NURBSUtils.js',
  'examples/jsm/utils/BufferGeometryUtils.js'
];

for (const file of files) {
  const destination = path.join(target, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(source, file), destination);
}

console.log(`Three.js ${installedVersion}: ${files.length} file siap di vendor/three/.`);
