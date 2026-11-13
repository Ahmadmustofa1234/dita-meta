const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'www');

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const files = [
  'index.html',
  'styles.css',
  'error-handler.js',
  'metaverse.js',
  'learning.js',
  'learning-data.js',
  'chatbot.js',
  'kerang-bambu-3d.html',
  'manifest.webmanifest',
  'sw.js',
  'assets/ai_robot.png',
  'assets/bgm.mp3',
  'assets/materi-pdf/subbab-a.pdf',
  'assets/materi-pdf/subbab-b.pdf',
  'assets/materi-pdf/subbab-c.pdf',
  'assets/materi-pdf/subbab-d.pdf',
  'assets/materi-pdf/subbab-e.pdf'
];

for (const rel of files) {
  const src = path.join(root, rel);
  const dst = path.join(outDir, rel);
  if (!fs.existsSync(src)) {
    throw new Error(`Asset tidak ditemukan: ${rel}`);
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

// Salin seluruh folder vendor/three agar semua loader (FBXLoader, GLTFLoader, PointerLockControls, fflate, dll.) tersedia offline
const vendorSrc = path.join(root, 'vendor', 'three');
const vendorDst = path.join(outDir, 'vendor', 'three');
fs.cpSync(vendorSrc, vendorDst, { recursive: true });

console.log(`Bundle offline Android (www/) siap: ${files.length} file + vendor/three.`);
