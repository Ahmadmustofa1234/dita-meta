# Three.js 0.158.0

Distribusi lokal dari paket resmi `three@0.158.0` (https://threejs.org/),
disalin tanpa perubahan menggunakan `npm run vendor`.
Sertakan seluruh folder ini saat mengunggah game ke hosting.

- `build/three.module.js`: inti Three.js.
- `examples/jsm/`: FBXLoader, GLTFLoader, PointerLockControls dan dependensinya
  (fflate 0.6.9, NURBSCurve, NURBSUtils, BufferGeometryUtils).
- `LICENSE`: lisensi MIT Three.js.
- `LICENSE-fflate`: lisensi MIT fflate, dari
  https://github.com/101arrowz/fflate/blob/v0.6.9/LICENSE.

Untuk membuat ulang berkas distribusi dari versi terkunci di package-lock.json,
jalankan `npm ci` dan `npm run vendor` dari direktori utama proyek.
