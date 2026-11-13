import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { missions as missionData, createLearningUI } from 'learning';

/* ==========================================================================
   MISSION DATA — KELESTARIAN LINGKUNGAN EKOSISTEM LAUT MADURA (LIDM)
   ========================================================================== */
const missions = missionData.map(mission => ({ ...mission, position: new THREE.Vector3(...mission.position) }));

const state = {
    currentMission: 0,
    unlocked: 0,
    completed: new Set(),
    science: 0,
    care: 0,
    points: 0,
    health: 35,
    badges: new Set(),
    inZone: -1,
    inClamZone: false
};

/* ==========================================================================
   THREE.JS SETUP — DIOPTIMALKAN UNTUK MOBILE + OCEAN REALISM
   ========================================================================== */
const canvas = document.getElementById('metaverse-canvas');
/* Deteksi perangkat sentuh: 'ontouchstart' bisa muncul pada laptop/Chrome desktop
   yang mendukung sentuhan, sehingga pointer coarse + maxTouchPoints dipakai agar
   tombol HUD desktop tetap terlihat. */
const hasCoarsePointer = Boolean(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
const hasTouchPoints = navigator.maxTouchPoints > 0;
const isMobile = Boolean(window.isMobileDevice) ||
    (hasTouchPoints && (hasCoarsePointer || window.innerWidth < 820));

const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(isMobile ? Math.min(window.devicePixelRatio, 1.5) : window.devicePixelRatio);
renderer.shadowMap.enabled = !isMobile;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
// Siang Hari Tropis: Biru toska jernih khas perairan pesisir Madura
scene.background = new THREE.Color(0x0ea5e9);
scene.fog = new THREE.FogExp2(0x38bdf8, 0.0036); // Jernih, pandangan tembus jauh (80m+)

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 21.0, 52);
camera.lookAt(0, 16, 0);

const controls = new PointerLockControls(camera, document.body);

// Fish mixer placeholder (opsional, cegah ReferenceError saat animate)
let fishMixer = null;

/* --- STATE FITUR TAMPILAN --- */
const viewFeaturesState = {
    lightingMode: 'day',     // 'day' | 'sunset' | 'bioluminescent'
    cameraMode: 'diver',     // 'diver' | 'wide'
    bioScanner: true,        // true | false
    qualityMode: isMobile ? 'eco' : 'hd' // 'eco' | 'hd'
};
window.viewFeaturesState = viewFeaturesState;

/* --- BRIGHT DAYLIGHT TROPICAL OCEAN LIGHTING (SIANG HARI TROPIS CERAH) --- */
// Ambient: Terang benderang siang hari tropis dengan pantulan dasar pasir emas
const ambientLight = new THREE.AmbientLight(0xe0f2fe, 1.15);
scene.add(ambientLight);

// Hemisphere: Langit toska cerah di atas, pantulan pasir emas lembut di bawah
const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0xfef08a, 1.05);
scene.add(hemiLight);

// Directional: Sinar terik matahari emas menembus permukaan air laut
const dirLight = new THREE.DirectionalLight(0xfffbeb, 2.6);
dirLight.position.set(40, 160, 40);
if (!isMobile) {
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 500;
    dirLight.shadow.camera.left = -100;
    dirLight.shadow.camera.right = 100;
    dirLight.shadow.camera.top = 100;
    dirLight.shadow.camera.bottom = -100;
}
scene.add(dirLight);

// Point lights: Kilau cahaya air laut tropis
const oceanLight = new THREE.PointLight(0x7dd3fc, 2.2, 160);
oceanLight.position.set(0, 10, -20);
scene.add(oceanLight);

const coralLight = new THREE.PointLight(0x38bdf8, 2.0, 130);
coralLight.position.set(-20, 4, -40);
scene.add(coralLight);

// Deep reef light: Tetap terang toska jernih menyinari pasir, BUKAN gelap malam
const deepLight1 = new THREE.PointLight(0x38bdf8, 1.8, 110);
deepLight1.position.set(-30, -3, -70);
scene.add(deepLight1);

const deepLight2 = new THREE.PointLight(0x0ea5e9, 1.6, 100);
deepLight2.position.set(25, -6, -90);
scene.add(deepLight2);

/* --- VOLUMETRIC GOD RAYS (Sinar Matahari Menembus Air) --- */
const godRayGroup = new THREE.Group();
const godRayCount = isMobile ? 6 : 12;
const godRays = [];
for (let i = 0; i < godRayCount; i++) {
    const rayHeight = 70 + Math.random() * 40;
    const rayWidth = 3.5 + Math.random() * 5;
    const rayGeo = new THREE.PlaneGeometry(rayWidth, rayHeight);
    const rayMat = new THREE.MeshBasicMaterial({
        color: 0xfffbeb, // Sinar emas hangat matahari siang
        transparent: true,
        opacity: 0.08 + Math.random() * 0.06,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const ray = new THREE.Mesh(rayGeo, rayMat);
    ray.position.set(
        (Math.random() - 0.5) * 140,
        18 - rayHeight / 2 + Math.random() * 8,
        -25 + (Math.random() - 0.5) * 110
    );
    ray.rotation.y = Math.random() * Math.PI;
    ray.rotation.z = (Math.random() - 0.5) * 0.2;
    ray.userData = {
        baseOpacity: ray.material.opacity,
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.5,
        baseX: ray.position.x
    };
    godRayGroup.add(ray);
    godRays.push(ray);
}
scene.add(godRayGroup);

/* --- CAMERA SWAY --- */
const cameraSway = {
    enabled: true,
    intensity: 0.10,
    speedX: 0.4,
    speedY: 0.5,
    speedZ: 0.3,
    rollIntensity: 0.002
};

/* --- DEPTH-BASED COLOR SETTINGS (SIANG HARI TROPIS CERAH - ANTI-MALAM) --- */
const depthColors = {
    // Permukaan (y > 10): Cyan cerah berkilau matahari
    shallow: { bg: new THREE.Color(0x38bdf8), fog: new THREE.Color(0x7dd3fc), fogDensity: 0.0038, ambient: 1.18 },
    // Mid (y: 0-10): Biru toska kristal
    mid:     { bg: new THREE.Color(0x0ea5e9), fog: new THREE.Color(0x38bdf8), fogDensity: 0.0044, ambient: 1.10 },
    // Deep (y: -15 to 0): Azure tropis cerah kaya cahaya
    deep:    { bg: new THREE.Color(0x0284c7), fog: new THREE.Color(0x0ea5e9), fogDensity: 0.0050, ambient: 1.04 },
    // Seabed (y < -15): Biru laut toska tropis jernih dan berpasir (TERANG SIANG, BUKAN GELAP/MALAM)
    abyss:   { bg: new THREE.Color(0x0369a1), fog: new THREE.Color(0x0ea5e9), fogDensity: 0.0056, ambient: 1.00 }
};

/* ==========================================================================
   LOAD MODELS
   ========================================================================== */
const loadingManager = new THREE.LoadingManager();
const loadingBar = document.getElementById('loading-bar');
const loadingScreen = document.getElementById('loading-screen');
const startOverlay = document.getElementById('start-overlay');
const loadingText = document.getElementById('loading-text');
let hasShownStartOverlay = false;

function setLoadingMessage(message) {
    if (loadingText) {
        loadingText.innerText = message;
    }
}

function showStartOverlay(message) {
    if (hasShownStartOverlay) return;
    hasShownStartOverlay = true;

    if (message) {
        setLoadingMessage(message);
    }

    if (loadingBar) {
        loadingBar.style.width = '100%';
    }

    loadingScreen.style.opacity = '0';
    setTimeout(() => {
        loadingScreen.style.display = 'none';
        startOverlay.style.display = 'flex';

        // Update start overlay for mobile
        if (isMobile) {
            const desktopCtrl = document.getElementById('desktop-controls');
            const mobileCtrl = document.getElementById('mobile-controls-info');
            const hintDesktop = document.getElementById('start-hint-desktop');
            const hintMobile = document.getElementById('start-hint-mobile');
            if (desktopCtrl) desktopCtrl.style.display = 'none';
            if (mobileCtrl) mobileCtrl.style.display = 'block';
            if (hintDesktop) hintDesktop.style.display = 'none';
            if (hintMobile) hintMobile.style.display = 'block';
        }

        updateHUD();
        renderMissionMap();
    }, 1000);
}

loadingManager.onProgress = function(url, itemsLoaded, itemsTotal) {
    const progress = (itemsLoaded / itemsTotal) * 100;
    loadingBar.style.width = progress + '%';
    setLoadingMessage(`Memuat aset lautan ${itemsLoaded}/${itemsTotal}...`);
};

loadingManager.onLoad = function() {
    showStartOverlay('Lautan siap. Selamat menyelam!');
};

loadingManager.onError = function(url) {
    console.warn('Aset gagal dimuat:', url);
    setLoadingMessage('Sebagian aset 3D gagal dimuat, game tetap bisa dimainkan...');
};

setTimeout(() => {
    showStartOverlay('Dunia bawah laut siap. Aset 3D besar dimuat di belakang layar...');
}, 1200);

/* ==========================================================================
   GERBANG LAUT MADURA & BIOTA LAUT TROPIS REALISTIS (Ringan & Bebas Crash)
   ========================================================================== */

// 1. GERBANG LAUT MADURA 3D (Sesuai Konsep LOMBA LIDM & assets/3d/gerbang laut.png)
function createGerbangLautMadura() {
    const gateGroup = new THREE.Group();

    // Material batu karang / limestone hangat khas pantai tropis
    const stoneMat = new THREE.MeshPhongMaterial({
        color: 0xd4b886,
        emissive: 0x2e1c0c,
        shininess: 15,
        flatShading: true
    });
    const stoneDarkMat = new THREE.MeshPhongMaterial({
        color: 0xa88c5a,
        emissive: 0x1f1205,
        shininess: 12,
        flatShading: true
    });

    // Pilar Kiri & Pilar Kanan (Tersusun dari blok-blok batu bertekstur)
    const pillarHeight = 14;
    const pillarWidth = 2.4;
    const pillarDepth = 2.4;
    const halfSpan = 6.5;

    [-halfSpan, halfSpan].forEach((posX) => {
        // Fondasi pilar
        const baseGeo = new THREE.BoxGeometry(pillarWidth * 1.35, 1.5, pillarDepth * 1.35);
        const baseMesh = new THREE.Mesh(baseGeo, stoneDarkMat);
        baseMesh.position.set(posX, 0.75, 0);
        gateGroup.add(baseMesh);

        // Badan pilar (tumpukan balok)
        const blockCount = 8;
        for (let b = 0; b < blockCount; b++) {
            const bMat = (b % 2 === 0) ? stoneMat : stoneDarkMat;
            const bGeo = new THREE.BoxGeometry(
                pillarWidth * (1 - b * 0.02),
                pillarHeight / blockCount,
                pillarDepth * (1 - b * 0.02)
            );
            const bMesh = new THREE.Mesh(bGeo, bMat);
            bMesh.position.set(posX, 1.5 + (b + 0.5) * (pillarHeight / blockCount), 0);
            bMesh.rotation.y = (b % 2 === 0 ? 0.02 : -0.02);
            gateGroup.add(bMesh);
        }

        // Mahkota pilar
        const capGeo = new THREE.BoxGeometry(pillarWidth * 1.25, 0.8, pillarDepth * 1.25);
        const capMesh = new THREE.Mesh(capGeo, stoneDarkMat);
        capMesh.position.set(posX, 1.5 + pillarHeight + 0.4, 0);
        gateGroup.add(capMesh);

        // Lentera / Kristal Penjaga Laut di puncak pilar
        const lanternGeo = new THREE.OctahedronGeometry(0.75);
        const lanternMat = new THREE.MeshPhongMaterial({
            color: 0x38bdf8,
            emissive: 0x0284c7,
            shininess: 100
        });
        const lantern = new THREE.Mesh(lanternGeo, lanternMat);
        lantern.position.set(posX, 1.5 + pillarHeight + 1.6, 0);
        gateGroup.add(lantern);

        const lanternLight = new THREE.PointLight(0x38bdf8, 1.2, 25);
        lanternLight.position.copy(lantern.position);
        gateGroup.add(lanternLight);
    });

    // Lengkungan Atas Gerbang (Arch Ring)
    const archSegments = 16;
    for (let i = 0; i <= archSegments; i++) {
        const angle = (i / archSegments) * Math.PI;
        const radius = halfSpan;
        const x = -Math.cos(angle) * radius;
        const y = 1.5 + pillarHeight + Math.sin(angle) * 4.5;
        const archBlockGeo = new THREE.BoxGeometry(1.6, 1.4, pillarDepth);
        const archBlock = new THREE.Mesh(archBlockGeo, i % 2 === 0 ? stoneMat : stoneDarkMat);
        archBlock.position.set(x, y, 0);
        archBlock.rotation.z = angle - Math.PI / 2;
        gateGroup.add(archBlock);
    }

    // Papan Kayu Header "ECOSEAVERSE"
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 1024;
    signCanvas.height = 256;
    const sCtx = signCanvas.getContext('2d');
    
    // Background papan kayu & border emas
    sCtx.fillStyle = '#14532d'; // Hijau konservasi
    sCtx.roundRect(10, 10, 1004, 236, 30);
    sCtx.fill();
    sCtx.lineWidth = 14;
    sCtx.strokeStyle = '#eab308'; // Border emas
    sCtx.stroke();
    
    // Tulisan ECOSEAVERSE
    sCtx.fillStyle = '#ffffff';
    sCtx.font = 'bold 92px Poppins, sans-serif';
    sCtx.textAlign = 'center';
    sCtx.textBaseline = 'middle';
    sCtx.fillText('ECOSEAVERSE', 512, 105);
    
    // Sub-judul
    sCtx.fillStyle = '#fef08a';
    sCtx.font = '600 38px Poppins, sans-serif';
    sCtx.fillText('GERBANG LAUT MADURA', 512, 185);

    const signTex = new THREE.CanvasTexture(signCanvas);
    const signGeo = new THREE.PlaneGeometry(10, 2.5);
    const signMat = new THREE.MeshPhongMaterial({
        map: signTex,
        side: THREE.DoubleSide,
        shininess: 30
    });
    const signBoard = new THREE.Mesh(signGeo, signMat);
    signBoard.position.set(0, 1.5 + pillarHeight + 2.0, 0);
    gateGroup.add(signBoard);

    // Hiasan karang dan anemon di kaki gerbang
    const coralDecor1 = createCoral(-halfSpan - 1.2, 0, 1.2, 0.9);
    const coralDecor2 = createCoral(halfSpan + 1.2, 0, 1.2, 0.9);
    const anemoneDecor = createAnemone(0, 0, -2.5, 0.8);
    gateGroup.add(coralDecor1);
    gateGroup.add(coralDecor2);
    gateGroup.add(anemoneDecor);

    gateGroup.position.set(0, -1, 0);
    return gateGroup;
}
const gerbangLaut = createGerbangLautMadura();
scene.add(gerbangLaut);

// 2. BIOTA LAUT TROPIS BERWARNA ALAMI (IKAN BADUT / NEMO, BLUE TANG, YELLOW TANG, PENYU HIJAU)
const activeTropicalFish = [];
window.activeTropicalFish = activeTropicalFish;

// Fungsi pembuat Ikan Badut (Amphiprion ocellaris)
function createClownfish(scale = 1) {
    const fishGroup = new THREE.Group();

    // Tubuh oranye cerah khas ikan badut
    const bodyGeo = new THREE.SphereGeometry(0.5 * scale, 12, 8);
    bodyGeo.scale(1.8, 1.0, 0.5);
    const orangeMat = new THREE.MeshPhongMaterial({
        color: 0xff6600,
        emissive: 0x4a1800,
        shininess: 60
    });
    const body = new THREE.Mesh(bodyGeo, orangeMat);
    fishGroup.add(body);

    // 3 Garis vertikal putih khas ikan badut dengan garis tepi hitam
    const whiteMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 40 });
    [-0.3 * scale, 0.05 * scale, 0.45 * scale].forEach((stripX, idx) => {
        const ringGeo = new THREE.CylinderGeometry(0.48 * (1 - idx * 0.15) * scale, 0.5 * (1 - idx * 0.15) * scale, 0.16 * scale, 12);
        ringGeo.scale(1, 0.95, 0.45);
        const stripe = new THREE.Mesh(ringGeo, whiteMat);
        stripe.rotation.z = Math.PI / 2;
        stripe.position.set(stripX, 0, 0);
        fishGroup.add(stripe);
    });

    // Sirip ekor (Caudal fin) bertepi hitam
    const tailGeo = new THREE.BufferGeometry();
    const tailVertices = new Float32Array([
        -0.8 * scale, 0, 0,
        -1.3 * scale, 0.45 * scale, 0,
        -1.3 * scale, -0.45 * scale, 0
    ]);
    tailGeo.setAttribute('position', new THREE.BufferAttribute(tailVertices, 3));
    tailGeo.computeVertexNormals();
    const tailMesh = new THREE.Mesh(tailGeo, orangeMat);
    tailMesh.name = 'tail';
    fishGroup.add(tailMesh);

    // Sirip dorsal (punggung)
    const finGeo = new THREE.ConeGeometry(0.2 * scale, 0.6 * scale, 4);
    finGeo.scale(0.3, 1, 1.5);
    const fin = new THREE.Mesh(finGeo, orangeMat);
    fin.position.set(0.1 * scale, 0.5 * scale, 0);
    fishGroup.add(fin);

    // Mata ikan
    const eyeGeo = new THREE.SphereGeometry(0.08 * scale, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const eye1 = new THREE.Mesh(eyeGeo, eyeMat);
    eye1.position.set(0.6 * scale, 0.15 * scale, 0.22 * scale);
    const eye2 = new THREE.Mesh(eyeGeo, eyeMat);
    eye2.position.set(0.6 * scale, 0.15 * scale, -0.22 * scale);
    fishGroup.add(eye1);
    fishGroup.add(eye2);

    return fishGroup;
}

// Fungsi pembuat Ikan Blue Tang / Dory (Paracanthurus hepatus)
function createBlueTang(scale = 1) {
    const fishGroup = new THREE.Group();

    // Tubuh pipih bulat oval biru royal
    const bodyGeo = new THREE.SphereGeometry(0.55 * scale, 12, 8);
    bodyGeo.scale(1.7, 1.2, 0.35);
    const blueMat = new THREE.MeshPhongMaterial({
        color: 0x1d4ed8,
        emissive: 0x071b52,
        shininess: 70
    });
    const body = new THREE.Mesh(bodyGeo, blueMat);
    fishGroup.add(body);

    // Ekor segitiga kuning cerah khas Blue Tang
    const yellowMat = new THREE.MeshPhongMaterial({ color: 0xfacc15, emissive: 0x6b4f02, shininess: 50 });
    const tailGeo = new THREE.ConeGeometry(0.4 * scale, 0.6 * scale, 4);
    tailGeo.scale(0.2, 1.2, 1);
    const tail = new THREE.Mesh(tailGeo, yellowMat);
    tail.rotation.z = Math.PI / 2;
    tail.position.set(-0.95 * scale, 0, 0);
    tail.name = 'tail';
    fishGroup.add(tail);

    // Corak hitam khas Blue Tang
    const blackMat = new THREE.MeshBasicMaterial({ color: 0x09090b });
    const markGeo = new THREE.TorusGeometry(0.3 * scale, 0.04 * scale, 4, 12, Math.PI);
    const mark = new THREE.Mesh(markGeo, blackMat);
    mark.position.set(0.05 * scale, 0.1 * scale, 0.18 * scale);
    fishGroup.add(mark);

    return fishGroup;
}

// Fungsi pembuat Penyu Hijau (Chelonia mydas)
function createSeaTurtle(scale = 1.6) {
    const turtleGroup = new THREE.Group();

    // Tempurung (Carapace) oval cembung warna zaitun kehijauan & pola sisik
    const shellGeo = new THREE.SphereGeometry(1.2 * scale, 12, 10);
    shellGeo.scale(1.4, 0.55, 1.0);
    const shellMat = new THREE.MeshPhongMaterial({
        color: 0x4d6b38,
        emissive: 0x1e2e13,
        shininess: 45
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.position.y = 0.2 * scale;
    turtleGroup.add(shell);

    // Perut (Plastron) krem kekuningan
    const bellyMat = new THREE.MeshPhongMaterial({ color: 0xfef3c7, emissive: 0x42381c, shininess: 20 });
    const bellyGeo = new THREE.SphereGeometry(1.15 * scale, 10, 8);
    bellyGeo.scale(1.35, 0.3, 0.95);
    const belly = new THREE.Mesh(bellyGeo, bellyMat);
    belly.position.y = -0.1 * scale;
    turtleGroup.add(belly);

    // Kepala penyu
    const headMat = new THREE.MeshPhongMaterial({ color: 0x5a7d42, shininess: 30 });
    const headGeo = new THREE.SphereGeometry(0.35 * scale, 8, 8);
    headGeo.scale(1.4, 0.9, 0.9);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(1.7 * scale, 0.1 * scale, 0);
    turtleGroup.add(head);

    // Sirip depan panjang (Front Flippers)
    const flipperGeo = new THREE.BoxGeometry(1.4 * scale, 0.08 * scale, 0.45 * scale);
    flipperGeo.rotateZ(0.2);
    const flipperL = new THREE.Mesh(flipperGeo, headMat);
    flipperL.position.set(0.8 * scale, 0, 1.2 * scale);
    flipperL.rotation.y = 0.5;
    flipperL.name = 'flipperL';
    turtleGroup.add(flipperL);

    const flipperR = new THREE.Mesh(flipperGeo, headMat);
    flipperR.position.set(0.8 * scale, 0, -1.2 * scale);
    flipperR.rotation.y = -0.5;
    flipperR.name = 'flipperR';
    turtleGroup.add(flipperR);

    // Sirip belakang (Hind Flippers)
    const hindGeo = new THREE.BoxGeometry(0.7 * scale, 0.06 * scale, 0.3 * scale);
    const hindL = new THREE.Mesh(hindGeo, headMat);
    hindL.position.set(-1.3 * scale, -0.05 * scale, 0.6 * scale);
    turtleGroup.add(hindL);

    const hindR = new THREE.Mesh(hindGeo, headMat);
    hindR.position.set(-1.3 * scale, -0.05 * scale, -0.6 * scale);
    turtleGroup.add(hindR);

    return turtleGroup;
}

// Menanam Sekolah Ikan Badut (Clownfish School)
const clownfishCount = isMobile ? 8 : 14;
for (let i = 0; i < clownfishCount; i++) {
    const cf = createClownfish(0.7 + Math.random() * 0.4);
    const baseX = 12 + (Math.random() - 0.5) * 16;
    const baseY = -0.5 + Math.random() * 4;
    const baseZ = -18 + (Math.random() - 0.5) * 18;
    cf.position.set(baseX, baseY, baseZ);
    cf.userData = {
        baseX, baseY, baseZ,
        phase: Math.random() * Math.PI * 2,
        speed: 1.2 + Math.random() * 0.8,
        radius: 2.5 + Math.random() * 3.5,
        type: 'clownfish'
    };
    scene.add(cf);
    activeTropicalFish.push(cf);
}

// Menanam Sekolah Ikan Blue Tang (Dory)
const blueTangCount = isMobile ? 8 : 15;
for (let i = 0; i < blueTangCount; i++) {
    const bt = createBlueTang(0.75 + Math.random() * 0.4);
    const baseX = -18 + (Math.random() - 0.5) * 18;
    const baseY = 2 + Math.random() * 6;
    const baseZ = -35 + (Math.random() - 0.5) * 20;
    bt.position.set(baseX, baseY, baseZ);
    bt.userData = {
        baseX, baseY, baseZ,
        phase: Math.random() * Math.PI * 2,
        speed: 1.5 + Math.random() * 0.7,
        radius: 3.5 + Math.random() * 5.0,
        type: 'bluetang'
    };
    scene.add(bt);
    activeTropicalFish.push(bt);
}

// Menanam Penyu Hijau yang berenang santai
const seaTurtle = createSeaTurtle(1.5);
seaTurtle.position.set(6, 6, -30);
seaTurtle.userData = {
    centerX: 0,
    centerZ: -45,
    radius: 22,
    angle: 0,
    speed: 0.22,
    type: 'turtle'
};
scene.add(seaTurtle);
activeTropicalFish.push(seaTurtle);


/* ==========================================================================
   KEHIDUPAN BAWAH LAUT 3D (Prosedural – ringan, tidak butuh file eksternal)
   ========================================================================== */

// === KARANG (CORAL) ===
function createCoral(x, y, z, scale = 1) {
    const group = new THREE.Group();
    const coralColors = [0xff6b9d, 0xff8a5c, 0xc084fc, 0xf472b6, 0xfb923c, 0x34d399, 0xf43f5e, 0xa78bfa];

    // Batang karang utama
    const baseColor = coralColors[Math.floor(Math.random() * coralColors.length)];
    const baseGeo = new THREE.CylinderGeometry(0.2 * scale, 0.6 * scale, 3 * scale, 8);
    const baseMat = new THREE.MeshPhongMaterial({ color: baseColor, emissive: new THREE.Color(baseColor).multiplyScalar(0.2), shininess: 30 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 1.5 * scale;
    group.add(base);

    // Cabang-cabang karang
    const branchCount = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < branchCount; i++) {
        const bColor = coralColors[Math.floor(Math.random() * coralColors.length)];
        const bGeo = new THREE.CylinderGeometry(0.08 * scale, 0.2 * scale, (1.5 + Math.random()) * scale, 6);
        const bMat = new THREE.MeshPhongMaterial({ color: bColor, emissive: new THREE.Color(bColor).multiplyScalar(0.15) });
        const branch = new THREE.Mesh(bGeo, bMat);
        const angle = (i / branchCount) * Math.PI * 2;
        branch.position.set(Math.cos(angle) * 0.5 * scale, (2.5 + Math.random()) * scale, Math.sin(angle) * 0.5 * scale);
        branch.rotation.z = (Math.random() - 0.5) * 0.6;
        branch.rotation.x = (Math.random() - 0.5) * 0.6;
        group.add(branch);

        // Ujung bulat karang
        const tipGeo = new THREE.SphereGeometry((0.15 + Math.random() * 0.15) * scale, 8, 8);
        const tipMat = new THREE.MeshPhongMaterial({ color: bColor, emissive: new THREE.Color(bColor).multiplyScalar(0.3) });
        const tip = new THREE.Mesh(tipGeo, tipMat);
        tip.position.copy(branch.position);
        tip.position.y += 0.8 * scale;
        group.add(tip);
    }

    // Fan coral (kipas karang) sesekali
    if (Math.random() > 0.5) {
        const fanColor = coralColors[Math.floor(Math.random() * coralColors.length)];
        const fanGeo = new THREE.PlaneGeometry(2 * scale, 2.5 * scale);
        const fanMat = new THREE.MeshPhongMaterial({
            color: fanColor, emissive: new THREE.Color(fanColor).multiplyScalar(0.1),
            side: THREE.DoubleSide, transparent: true, opacity: 0.85
        });
        const fan = new THREE.Mesh(fanGeo, fanMat);
        fan.position.set(0.8 * scale, 2 * scale, 0);
        fan.rotation.y = Math.random() * Math.PI;
        group.add(fan);
    }

    group.position.set(x, y, z);
    if (!isMobile) {
        group.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    }
    return group;
}

// === RUMPUT LAUT (SEAWEED) ===
const seaweedGroups = [];
function createSeaweed(x, y, z, scale = 1) {
    const group = new THREE.Group();
    const strandCount = 3 + Math.floor(Math.random() * 4);
    const seaweedColors = [0x0d9488, 0x059669, 0x16a34a, 0x22d3ee, 0x10b981];

    for (let s = 0; s < strandCount; s++) {
        const color = seaweedColors[Math.floor(Math.random() * seaweedColors.length)];
        const segCount = 4 + Math.floor(Math.random() * 4);
        const strand = new THREE.Group();
        for (let i = 0; i < segCount; i++) {
            const segGeo = new THREE.CylinderGeometry(0.06 * scale, 0.1 * scale, 0.8 * scale, 5);
            const segMat = new THREE.MeshPhongMaterial({ color, emissive: new THREE.Color(color).multiplyScalar(0.1), shininess: 15 });
            const seg = new THREE.Mesh(segGeo, segMat);
            seg.position.y = i * 0.7 * scale;
            strand.add(seg);

            // Daun kecil pada setiap segmen
            if (Math.random() > 0.4) {
                const leafGeo = new THREE.PlaneGeometry(0.4 * scale, 0.2 * scale);
                const leafMat = new THREE.MeshPhongMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
                const leaf = new THREE.Mesh(leafGeo, leafMat);
                leaf.position.set(0.15 * scale, i * 0.7 * scale, 0);
                leaf.rotation.z = Math.random() * 0.5;
                strand.add(leaf);
            }
        }
        strand.position.set((Math.random() - 0.5) * scale, 0, (Math.random() - 0.5) * scale);
        group.add(strand);
    }

    group.position.set(x, y, z);
    seaweedGroups.push(group);
    return group;
}

// === UBUR-UBUR (JELLYFISH) ===
const jellyfishList = [];
function createJellyfish(x, y, z, scale = 1) {
    const group = new THREE.Group();
    const jellyColors = [0x7c3aed, 0x06b6d4, 0xec4899, 0x8b5cf6, 0x14b8a6, 0xf472b6];
    const color = jellyColors[Math.floor(Math.random() * jellyColors.length)];

    // Dome/bell
    const domeGeo = new THREE.SphereGeometry(0.8 * scale, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMat = new THREE.MeshPhongMaterial({
        color, emissive: new THREE.Color(color).multiplyScalar(0.4),
        transparent: true, opacity: 0.7, shininess: 80, side: THREE.DoubleSide
    });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.rotation.x = Math.PI;
    group.add(dome);

    // Tentakel
    const tentCount = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < tentCount; i++) {
        const tGeo = new THREE.CylinderGeometry(0.02 * scale, 0.01 * scale, (1.5 + Math.random() * 1.5) * scale, 4);
        const tMat = new THREE.MeshPhongMaterial({
            color, emissive: new THREE.Color(color).multiplyScalar(0.3),
            transparent: true, opacity: 0.5
        });
        const tent = new THREE.Mesh(tGeo, tMat);
        const angle = (i / tentCount) * Math.PI * 2;
        tent.position.set(Math.cos(angle) * 0.4 * scale, -1 * scale, Math.sin(angle) * 0.4 * scale);
        tent.rotation.z = (Math.random() - 0.5) * 0.3;
        group.add(tent);
    }

    // Point light bioluminescent
    const glow = new THREE.PointLight(color, 0.8, 15 * scale);
    glow.position.set(0, 0, 0);
    group.add(glow);

    group.position.set(x, y, z);
    group.userData = { baseY: y, phase: Math.random() * Math.PI * 2, speed: 0.3 + Math.random() * 0.3 };
    jellyfishList.push(group);
    return group;
}

// === KELOMPOK IKAN KECIL (SMALL FISH SCHOOL) ===
const smallFishSchools = [];
function createSmallFishSchool(x, y, z) {
    const group = new THREE.Group();
    const fishColors = [0xfbbf24, 0x38bdf8, 0xfb7185, 0x00d2ff, 0xf97316, 0xa78bfa];
    const color = fishColors[Math.floor(Math.random() * fishColors.length)];
    const count = 6 + Math.floor(Math.random() * 8);

    for (let i = 0; i < count; i++) {
        const fishGeo = new THREE.ConeGeometry(0.15, 0.5, 4);
        const fishMat = new THREE.MeshPhongMaterial({ color, emissive: new THREE.Color(color).multiplyScalar(0.1), shininess: 40 });
        const fish = new THREE.Mesh(fishGeo, fishMat);
        fish.rotation.x = Math.PI / 2;
        fish.position.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3);
        group.add(fish);

        // Ekor kecil
        const tailGeo = new THREE.ConeGeometry(0.1, 0.2, 3);
        const tail = new THREE.Mesh(tailGeo, fishMat);
        tail.rotation.x = -Math.PI / 2;
        tail.position.copy(fish.position);
        tail.position.z += 0.3;
        group.add(tail);
    }

    group.position.set(x, y, z);
    group.userData = { angle: Math.random() * Math.PI * 2, radius: 5 + Math.random() * 10, speed: 0.2 + Math.random() * 0.3, centerX: x, centerZ: z };
    smallFishSchools.push(group);
    return group;
}

// === GELEMBUNG (BUBBLE STREAMS) ===
const bubbleStreams = [];
function createBubbleStream(x, y, z) {
    const count = 8 + Math.floor(Math.random() * 8);
    const group = new THREE.Group();

    for (let i = 0; i < count; i++) {
        const size = 0.05 + Math.random() * 0.15;
        const bubGeo = new THREE.SphereGeometry(size, 8, 8);
        const bubMat = new THREE.MeshPhongMaterial({
            color: 0xb3e5fc, emissive: 0x4fc3f7,
            transparent: true, opacity: 0.3 + Math.random() * 0.3, shininess: 100
        });
        const bubble = new THREE.Mesh(bubGeo, bubMat);
        bubble.position.set((Math.random() - 0.5) * 1.5, Math.random() * 10, (Math.random() - 0.5) * 1.5);
        bubble.userData = { speed: 0.5 + Math.random() * 1.5, wobble: Math.random() * Math.PI * 2 };
        group.add(bubble);
    }

    group.position.set(x, y, z);
    bubbleStreams.push(group);
    return group;
}

// === BATU KARANG BESAR (ROCK FORMATIONS) ===
function createRock(x, y, z, scale = 1) {
    const group = new THREE.Group();
    const rockCount = 1 + Math.floor(Math.random() * 3);

    for (let i = 0; i < rockCount; i++) {
        const rockGeo = new THREE.DodecahedronGeometry((0.8 + Math.random() * 1.2) * scale, 1);
        const rockColors = [0xc8b28f, 0xbaa27e, 0xd4be9b, 0xa38c6b];
        const rockColor = rockColors[Math.floor(Math.random() * rockColors.length)];
        const rockMat = new THREE.MeshPhongMaterial({
            color: rockColor,
            emissive: 0x2b1c0e,
            shininess: 12,
            flatShading: true
        });
        const rock = new THREE.Mesh(rockGeo, rockMat);
        rock.position.set((Math.random() - 0.5) * 2 * scale, Math.random() * 0.5 * scale, (Math.random() - 0.5) * 2 * scale);
        rock.rotation.set(Math.random(), Math.random(), Math.random());
        group.add(rock);
    }

    group.position.set(x, y, z);
    return group;
}

// === ANEMONE LAUT ===
function createAnemone(x, y, z, scale = 1) {
    const group = new THREE.Group();
    const anemColors = [0xf43f5e, 0xfb923c, 0xa855f7, 0xec4899];
    const color = anemColors[Math.floor(Math.random() * anemColors.length)];

    // Base
    const baseGeo = new THREE.CylinderGeometry(0.5 * scale, 0.8 * scale, 0.5 * scale, 8);
    const baseMat = new THREE.MeshPhongMaterial({ color: 0x5c4033 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    group.add(base);

    // Tentakel anemone
    const tentCount = 10 + Math.floor(Math.random() * 8);
    for (let i = 0; i < tentCount; i++) {
        const tGeo = new THREE.CylinderGeometry(0.03 * scale, 0.06 * scale, (0.8 + Math.random() * 0.8) * scale, 4);
        const tMat = new THREE.MeshPhongMaterial({
            color, emissive: new THREE.Color(color).multiplyScalar(0.2),
            shininess: 20
        });
        const tent = new THREE.Mesh(tGeo, tMat);
        const angle = (i / tentCount) * Math.PI * 2;
        const radius = (0.2 + Math.random() * 0.3) * scale;
        tent.position.set(Math.cos(angle) * radius, 0.5 * scale, Math.sin(angle) * radius);
        tent.rotation.z = (Math.random() - 0.5) * 0.5;
        tent.rotation.x = (Math.random() - 0.5) * 0.5;
        group.add(tent);

        // Tip bulat
        const tipGeo = new THREE.SphereGeometry(0.05 * scale, 6, 6);
        const tipMat = new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: color });
        const tip = new THREE.Mesh(tipGeo, tipMat);
        tip.position.copy(tent.position);
        tip.position.y += 0.5 * scale;
        group.add(tip);
    }

    group.position.set(x, y, z);
    return group;
}

// === KERANG BAMBU (RAZOR CLAM / LORJUK - SOLEN GRANDIS) ===
const kerangBambuList = [];
window.kerangBambuList = kerangBambuList;
const clamBubbles = [];
const clamBubbleGeo = new THREE.SphereGeometry(0.08, 6, 6);
const clamBubbleMat = new THREE.MeshBasicMaterial({
    color: 0xbae6fd,
    transparent: true,
    opacity: 0.75
});

function createClamBubble(x, y, z) {
    if (clamBubbles.length > 40) return;
    const b = new THREE.Mesh(clamBubbleGeo, clamBubbleMat);
    b.position.set(x + (Math.random() - 0.5) * 0.25, y, z + (Math.random() - 0.5) * 0.25);
    b.userData = {
        speedY: 1.1 + Math.random() * 0.9,
        swaySpeed: 2.0 + Math.random() * 2.0,
        baseX: b.position.x,
        life: 0,
        maxLife: 3.5 + Math.random() * 2.0
    };
    scene.add(b);
    clamBubbles.push(b);
}

function createKerangBambu(x, y, z, scale = 1, rotX = 0, rotZ = 0) {
    const group = new THREE.Group();

    // 1. SUBSTRAT PASIR ALAMI INTERTIDAL (Realistic Sand Substrate Bed)
    const sandSubstrateGroup = new THREE.Group();

    // A. Gundukan pasir landai bergradasi (smooth sand mound)
    const moundGeo = new THREE.CylinderGeometry(0.35 * scale, 1.45 * scale, 0.35 * scale, 16);
    const moundMat = new THREE.MeshPhongMaterial({
        color: 0xdfbe8f,
        emissive: 0x3d2812,
        specular: 0xffedd5,
        shininess: 18,
        flatShading: false
    });
    const mound = new THREE.Mesh(moundGeo, moundMat);
    mound.position.y = 0.16 * scale;
    sandSubstrateGroup.add(mound);

    // B. Riak gelombang pasir pesisir di sekitar lubang (sand ripples rings)
    const rippleGeo1 = new THREE.TorusGeometry(1.1 * scale, 0.05 * scale, 6, 16);
    const rippleMat = new THREE.MeshPhongMaterial({ color: 0xc9a066, shininess: 15 });
    const ripple1 = new THREE.Mesh(rippleGeo1, rippleMat);
    ripple1.rotation.x = Math.PI * 0.5;
    ripple1.position.y = 0.07 * scale;
    sandSubstrateGroup.add(ripple1);

    const rippleGeo2 = new THREE.TorusGeometry(0.68 * scale, 0.04 * scale, 6, 16);
    const ripple2 = new THREE.Mesh(rippleGeo2, rippleMat);
    ripple2.rotation.x = Math.PI * 0.5;
    ripple2.position.y = 0.20 * scale;
    sandSubstrateGroup.add(ripple2);

    // C. Lubang galian vertikal pasir basah (wet sand burrow hole rim)
    const burrowRimGeo = new THREE.TorusGeometry(0.28 * scale, 0.038 * scale, 6, 16);
    const burrowRimMat = new THREE.MeshLambertMaterial({ color: 0x7c4314 }); // pasir basah lebih pekat
    const burrowRim = new THREE.Mesh(burrowRimGeo, burrowRimMat);
    burrowRim.rotation.x = Math.PI * 0.5;
    burrowRim.position.y = 0.32 * scale;
    sandSubstrateGroup.add(burrowRim);

    // D. Taburan butiran kerikil pasir & pecahan cangkang kecil di sekeliling gundukan
    const pebbleGeo = new THREE.DodecahedronGeometry(0.06 * scale);
    const pebbleColors = [0xfef3c7, 0xfde68a, 0xd4b982, 0xffffff];
    for (let p = 0; p < 4; p++) {
        const pMat = new THREE.MeshPhongMaterial({
            color: pebbleColors[p % pebbleColors.length],
            shininess: 30
        });
        const pebble = new THREE.Mesh(pebbleGeo, pMat);
        const pAngle = (p / 4) * Math.PI * 2 + Math.random() * 0.5;
        const pDist = (0.75 + Math.random() * 0.5) * scale;
        pebble.position.set(Math.cos(pAngle) * pDist, 0.08 * scale, Math.sin(pAngle) * pDist);
        pebble.scale.set(1 + Math.random() * 0.4, 0.6 + Math.random() * 0.3, 1 + Math.random() * 0.4);
        sandSubstrateGroup.add(pebble);
    }

    group.add(sandSubstrateGroup);

    // Sub-grup cangkang vertikal (agak condong alami)
    const shellGroup = new THREE.Group();

    // Material Cangkang: Cokelat keemasan bambu mengkilap (glossy amber bamboo)
    const clamShellMat = new THREE.MeshPhongMaterial({
        color: 0xd99b42,
        emissive: 0x3d2008,
        specular: 0xffe6aa,
        shininess: 75,
        side: THREE.DoubleSide
    });

    // Cangkang Kerang Bambu: 2 belahan katup (bivalve) memanjang silindris
    const shellLength = 3.6 * scale;
    const shellRadius = 0.22 * scale;
    const halfCylGeo = new THREE.CylinderGeometry(shellRadius * 0.92, shellRadius, shellLength, 16, 6, false, 0, Math.PI);
    
    // Katup Kiri (Left Valve)
    const leftValve = new THREE.Mesh(halfCylGeo, clamShellMat);
    leftValve.position.set(-0.06 * scale, shellLength * 0.5, 0);
    leftValve.rotation.y = Math.PI * 0.5;
    shellGroup.add(leftValve);

    // Katup Kanan (Right Valve)
    const rightValve = new THREE.Mesh(halfCylGeo, clamShellMat);
    rightValve.position.set(0.06 * scale, shellLength * 0.5, 0);
    rightValve.rotation.y = -Math.PI * 0.5;
    shellGroup.add(rightValve);

    // Guratan pertumbuhan melintang (transverse growth rings khas ruas bambu)
    const ringMat = new THREE.MeshLambertMaterial({ color: 0x7c3f12 });
    const ringCount = 6;
    for (let r = 1; r <= ringCount; r++) {
        const ringGeo = new THREE.TorusGeometry(shellRadius * 0.96, 0.022 * scale, 6, 16);
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI * 0.5;
        ring.position.y = (shellLength * 0.16) + (r * (shellLength * 0.12));
        shellGroup.add(ring);
    }

    // Kaki berotot putih-krem (muscular foot) yang menancap ke pasir
    const footGeo = new THREE.ConeGeometry(shellRadius * 0.85, 1.1 * scale, 12);
    const footMat = new THREE.MeshPhongMaterial({
        color: 0xfffcf0,
        emissive: 0x443a2a,
        transparent: true,
        opacity: 0.92
    });
    const foot = new THREE.Mesh(footGeo, footMat);
    foot.rotation.x = Math.PI;
    foot.position.y = 0.25 * scale;
    shellGroup.add(foot);

    // Sifon ganda (incurrent & excurrent siphon) yang menjulur keluar di ujung atas cangkang
    const siphonGroup = new THREE.Group();
    const siphonMat = new THREE.MeshPhongMaterial({
        color: 0xfff0dd,
        emissive: 0x553311,
        transparent: true,
        opacity: 0.92,
        shininess: 40
    });

    const siphon1Geo = new THREE.CylinderGeometry(0.045 * scale, 0.06 * scale, 0.55 * scale, 10);
    const siphon1 = new THREE.Mesh(siphon1Geo, siphonMat);
    siphon1.position.set(-0.065 * scale, shellLength + 0.22 * scale, 0);
    siphonGroup.add(siphon1);

    const siphon2Geo = new THREE.CylinderGeometry(0.04 * scale, 0.055 * scale, 0.5 * scale, 10);
    const siphon2 = new THREE.Mesh(siphon2Geo, siphonMat);
    siphon2.position.set(0.065 * scale, shellLength + 0.2 * scale, 0);
    siphonGroup.add(siphon2);

    shellGroup.add(siphonGroup);

    // Kemiringan alami saat membenam di substrat pasir pantai
    shellGroup.rotation.x = rotX || (Math.random() - 0.5) * 0.22;
    shellGroup.rotation.z = rotZ || (Math.random() - 0.5) * 0.22;
    shellGroup.rotation.y = Math.random() * Math.PI * 2;
    group.add(shellGroup);

    group.position.set(x, y, z);

    if (!isMobile) {
        group.traverse(c => {
            if (c.isMesh) {
                c.castShadow = true;
                c.receiveShadow = true;
            }
        });
    }

    const clamData = {
        group,
        leftValve,
        rightValve,
        siphonGroup,
        baseScale: scale,
        phase: Math.random() * Math.PI * 2,
        speed: 1.4 + Math.random() * 1.2,
        bubbleTimer: Math.random() * 3.0,
        worldPos: new THREE.Vector3(x, y, z)
    };
    kerangBambuList.push(clamData);

    return group;
}

// === TANAM SEMUA KEHIDUPAN LAUT ===

// Karang berwarna-warni
const coralPositions = [
    [-15, -1, -10], [15, -1, -10], [-25, -1, -25], [25, -1, -25],
    [-10, -1, -50], [10, -1, -50], [-35, -1, -45], [35, -1, -45],
    [-20, -1, -70], [20, -1, -70], [-5, -1, -90], [5, -1, -90],
    [-40, -1, -80], [40, -1, -80], [0, -1, -110], [-30, -1, -100],
    [30, -1, -100], [-50, -1, -60], [50, -1, -60], [-45, -1, -30],
    [45, -1, -30], [0, -1, -35], [-60, -1, -50], [60, -1, -50],
];
coralPositions.forEach(([x, y, z]) => {
    const scale = 0.6 + Math.random() * 1.0;
    scene.add(createCoral(x, y, z, scale));
});

// Rumput laut
const seaweedPositions = [
    [-12, -1, -15], [18, -1, -20], [-28, -1, -35], [22, -1, -55],
    [-8, -1, -65], [12, -1, -75], [-32, -1, -85], [38, -1, -30],
    [-18, -1, -95], [8, -1, -105], [-42, -1, -55], [48, -1, -45],
    [0, -1, -40], [-55, -1, -65], [55, -1, -35], [-22, -1, -48],
];
seaweedPositions.forEach(([x, y, z]) => {
    const scale = 0.8 + Math.random() * 0.6;
    scene.add(createSeaweed(x, y, z, scale));
});

// Ubur-ubur melayang
const jellyfishPositions = [
    [-8, 5, -20], [12, 8, -35], [-20, 3, -55], [30, 10, -45],
    [-35, 6, -70], [15, 12, -80], [-5, 7, -95], [25, 4, -60],
    [0, 15, -30], [-40, 8, -40], [40, 6, -90], [-15, 11, -110],
];
jellyfishPositions.forEach(([x, y, z]) => {
    const scale = 0.5 + Math.random() * 0.8;
    scene.add(createJellyfish(x, y, z, scale));
});

// Kelompok ikan kecil
const fishSchoolPositions = [
    [-10, 2, -25], [20, -3, -50], [-25, 5, -40], [35, 0, -70],
    [0, -2, -60], [-30, 3, -80], [10, 8, -100], [-45, 0, -55],
];
fishSchoolPositions.forEach(([x, y, z]) => {
    scene.add(createSmallFishSchool(x, y, z));
});

// Gelembung dari dasar laut
const bubblePositions = [
    [-5, -1, -15], [8, -1, -30], [-18, -1, -45], [25, -1, -60],
    [-12, -1, -75], [15, -1, -90], [0, -1, -50], [-35, -1, -35],
    [40, -1, -50], [-50, -1, -70],
];
bubblePositions.forEach(([x, y, z]) => {
    scene.add(createBubbleStream(x, y, z));
});

// Batu karang besar
const rockPositions = [
    [-20, -1, -18], [25, -1, -30], [-38, -1, -55], [45, -1, -65],
    [5, -1, -85], [-48, -1, -42], [55, -1, -55], [-10, -1, -100],
];
rockPositions.forEach(([x, y, z]) => {
    scene.add(createRock(x, y, z, 1 + Math.random()));
});

// Anemone laut
const anemonePositions = [
    [-14, -1, -12], [16, -1, -22], [-26, -1, -40], [32, -1, -50],
    [-6, -1, -70], [18, -1, -85], [0, -1, -55], [-36, -1, -60],
];
anemonePositions.forEach(([x, y, z]) => {
    scene.add(createAnemone(x, y, z, 0.7 + Math.random() * 0.5));
});

// === ZONA SUBSTRAT PASIR INTERTIDAL KERANG BAMBU (LORJUK) PESISIR MADURA ===
function createIntertidalSandbank(centerX, centerY, centerZ, radius = 10) {
    const sandbankGroup = new THREE.Group();

    // Gundukan pasir intertidal bertingkat yang menonjol dari dasar laut
    const bankGeo = new THREE.CylinderGeometry(radius * 0.75, radius, 0.45, 24);
    const bankMat = new THREE.MeshPhongMaterial({
        color: 0xe8cf9d, // Pasir emas terang pantai Madura
        emissive: 0x4a3215,
        specular: 0xffedd5,
        shininess: 25,
        flatShading: false
    });
    const bankMesh = new THREE.Mesh(bankGeo, bankMat);
    bankMesh.position.set(0, 0.18, 0);
    sandbankGroup.add(bankMesh);

    // Lapisan pasir atas yang bergelombang lembut (intertidal sand dunes)
    const duneGeo = new THREE.ConeGeometry(radius * 0.60, 0.38, 20);
    const duneMesh = new THREE.Mesh(duneGeo, bankMat);
    duneMesh.position.set(-1.2, 0.42, -1.0);
    sandbankGroup.add(duneMesh);

    // Papan Kayu Edukasi 3D: "HABITAT PASIR INTERTIDAL — KERANG BAMBU (LORJUK)"
    const boardCanvas = document.createElement('canvas');
    boardCanvas.width = 1024;
    boardCanvas.height = 320;
    const bCtx = boardCanvas.getContext('2d');

    // Background papan kayu pesisir Madura
    bCtx.fillStyle = '#78350f';
    bCtx.roundRect(10, 10, 1004, 300, 24);
    bCtx.fill();
    bCtx.lineWidth = 12;
    bCtx.strokeStyle = '#f59e0b';
    bCtx.stroke();

    // Header lencana
    bCtx.fillStyle = '#fef08a';
    bCtx.font = 'bold 42px Poppins, sans-serif';
    bCtx.textAlign = 'center';
    bCtx.fillText('ZONA SUBSTRAT PASIR INTERTIDAL', 512, 75);

    // Judul Spesies
    bCtx.fillStyle = '#ffffff';
    bCtx.font = 'bold 66px Poppins, sans-serif';
    bCtx.fillText('KERANG BAMBU (LORJUK)', 512, 160);

    // Nama Latin & Peran
    bCtx.fillStyle = '#bae6fd';
    bCtx.font = 'italic 38px Poppins, sans-serif';
    bCtx.fillText('Solen grandis — Organisme Bentik Pesisir Madura', 512, 240);

    const boardTex = new THREE.CanvasTexture(boardCanvas);
    const boardGeo = new THREE.PlaneGeometry(6.2, 2.0);
    const boardMat = new THREE.MeshPhongMaterial({ map: boardTex, side: THREE.DoubleSide, shininess: 30 });
    const signMesh = new THREE.Mesh(boardGeo, boardMat);
    signMesh.position.set(0, 3.4, 4.2);
    sandbankGroup.add(signMesh);

    // Tiang penyangga papan kayu dari pasir
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.4, 8);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x543210 });
    const pole1 = new THREE.Mesh(poleGeo, poleMat);
    pole1.position.set(-2.3, 1.7, 4.2);
    sandbankGroup.add(pole1);
    const pole2 = new THREE.Mesh(poleGeo, poleMat);
    pole2.position.set(2.3, 1.7, 4.2);
    sandbankGroup.add(pole2);

    sandbankGroup.position.set(centerX, centerY, centerZ);
    return sandbankGroup;
}

// Pasang Zona Substrat Pasir Intertidal di Koloni Utama Observasi
const intertidalSandbank = createIntertidalSandbank(8, -1, -18, 11);
scene.add(intertidalSandbank);

// Koloni Utama Observasi (Paling dekat dengan rute eksplorasi)
const clamObservationPos = new THREE.Vector3(8, -1, -18);
const mainClamCluster = [
    [8, -1, -18, 1.15],
    [7.2, -1, -17.4, 0.95],
    [8.8, -1, -18.7, 1.05],
    [6.7, -1, -18.9, 0.85],
    [8.5, -1, -17.1, 1.0],
    [9.4, -1, -18.2, 0.9],
    [7.5, -1, -19.5, 0.88],
    [9.1, -1, -16.8, 1.08],
    [6.3, -1, -17.8, 0.92]
];
mainClamCluster.forEach(([x, y, z, s]) => {
    scene.add(createKerangBambu(x, y, z, s));
});

// Beacon Emas & Kristal Observasi untuk Koloni Utama Kerang Bambu
const clamBeaconGeo = new THREE.CylinderGeometry(0.8, 0.8, 160, 16);
const clamBeaconMat = new THREE.MeshBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
});
const clamBeacon = new THREE.Mesh(clamBeaconGeo, clamBeaconMat);
clamBeacon.position.set(clamObservationPos.x, clamObservationPos.y + 80, clamObservationPos.z);
scene.add(clamBeacon);

const clamIconGeo = new THREE.OctahedronGeometry(0.7);
const clamIconMat = new THREE.MeshPhongMaterial({
    color: 0xf59e0b,
    emissive: 0x92400e,
    shininess: 90
});
const clamIcon = new THREE.Mesh(clamIconGeo, clamIconMat);
clamIcon.position.set(clamObservationPos.x, clamObservationPos.y + 5.5, clamObservationPos.z);
scene.add(clamIcon);

// Koloni 2: Dekat Misi 2 (Eksplorasi Ekosistem Pesisir & Bentik)
const cluster2 = [
    [22, -1, -28, 1.0], [21.2, -1, -27.4, 0.85], [22.8, -1, -28.5, 1.15],
    [23.5, -1, -27.6, 0.9], [21.8, -1, -29.2, 0.95]
];
cluster2.forEach(([x, y, z, s]) => scene.add(createKerangBambu(x, y, z, s)));

// Koloni 3: Dekat Misi 3 (Rantai Makanan Laut & Filter Feeder)
const cluster3 = [
    [-27, -1, -47, 1.1], [-26.2, -1, -46.3, 0.9], [-27.9, -1, -47.8, 1.05],
    [-25.5, -1, -47.2, 0.85], [-28.3, -1, -46.5, 0.95]
];
cluster3.forEach(([x, y, z, s]) => scene.add(createKerangBambu(x, y, z, s)));

// Kerang Bambu Liar Tersebar di Sepanjang Dasar Laut Berpasir
const wildClams = [
    [-15, -1, -62, 1.0], [-14.2, -1, -61.5, 0.85], [-15.8, -1, -62.7, 1.1],
    [4, -1, -38, 0.9], [14, -1, -52, 1.05], [-35, -1, -35, 0.95],
    [28, -1, -68, 1.0], [-5, -1, -78, 0.88], [32, -1, -42, 1.12],
    [-42, -1, -75, 0.92], [10, -1, -95, 1.0]
];
wildClams.forEach(([x, y, z, s]) => scene.add(createKerangBambu(x, y, z, s)));

// === MATEMATIKA KONTUR PASIR: PANTAI MADURA MENUJU LAUTAN LEPAS ===
function getTerrainHeight(worldX, worldZ) {
    // 1. Riak gelombang pasir alami (natural sand ripples & underwater dunes)
    const localY = -worldZ;
    const dune = Math.sin(worldX * 0.02) * 0.8 + Math.cos(localY * 0.015) * 0.6;
    const ripple = Math.sin(worldX * 0.15 + localY * 0.1) * 0.12 + Math.cos(worldX * 0.1 - localY * 0.12) * 0.08;

    // 2. Transisi Pantai Pesisir Madura ke Lautan
    // z <= 12: Lautan Bawah Air (ketinggian dasar -1.0)
    // z: 12 -> 38: Lereng pasir pantai landai masuk ke air (kedalaman dari -1 ke 18.0 / garis pantai)
    // z: 38 -> 65: Daratan pasir pantai Madura yang landai & hangat (ketinggian 18.0 -> 21.0)
    if (worldZ > 12) {
        if (worldZ <= 38) {
            const t = (worldZ - 12) / 26.0; // 0 di z=12, 1 di z=38
            const smoothT = t * t * (3.0 - 2.0 * t);
            return -1.0 + dune + ripple + smoothT * 19.0;
        } else {
            const t = Math.min(1.0, (worldZ - 38) / 27.0);
            const smoothT = t * t * (3.0 - 2.0 * t);
            const coastDunes = Math.sin(worldX * 0.05) * 1.0 + Math.cos(worldZ * 0.08) * 0.5;
            return 18.0 + smoothT * 2.5 + coastDunes + ripple * 0.4;
        }
    }

    return -1.0 + dune + ripple;
}
window.getTerrainHeight = getTerrainHeight;

// === PERMUKAAN AIR REALISTIS (Water Surface) ===
// Air membentang dari garis pantai z = 38 ke arah lautan bebas (z = -230)
const waterZLength = 270;
const waterSurfaceGeo = new THREE.PlaneGeometry(400, waterZLength, isMobile ? 20 : 32, isMobile ? 20 : 32);
const waterSurfaceMat = new THREE.MeshPhongMaterial({
    color: 0x0284c7,   // biru laut toska tropis cerah
    emissive: 0x0369a1,
    transparent: true, opacity: 0.38,
    shininess: 160, side: THREE.DoubleSide,
    specular: 0xbae6fd
});
const waterSurface = new THREE.Mesh(waterSurfaceGeo, waterSurfaceMat);
waterSurface.rotation.x = -Math.PI / 2;
waterSurface.position.set(0, 18.0, 38.0 - waterZLength / 2);
scene.add(waterSurface);

// Secondary shimmer layer
const waterSurface2Geo = new THREE.PlaneGeometry(400, waterZLength, 16, 16);
const waterSurface2Mat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true, opacity: 0.14,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});
const waterSurface2 = new THREE.Mesh(waterSurface2Geo, waterSurface2Mat);
waterSurface2.rotation.x = -Math.PI / 2;
waterSurface2.position.set(0, 18.15, 38.0 - waterZLength / 2);
scene.add(waterSurface2);

// Garis Buih Ombak Pantai (Shoreline Wave Foam Strip di Bibir Pantai)
const waveLineGeo = new THREE.PlaneGeometry(380, 3.8, 32, 4);
const waveLineMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.70,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});
const shoreWaveLine = new THREE.Mesh(waveLineGeo, waveLineMat);
shoreWaveLine.rotation.x = -Math.PI / 2;
shoreWaveLine.position.set(0, 18.08, 37.2);
scene.add(shoreWaveLine);

// === DASAR LAUT & PANTAI BERPASIR EMAS (Realistic Sand Terrain) ===
const groundSegments = isMobile ? 60 : 120;
const groundGeo = new THREE.PlaneGeometry(400, 400, groundSegments, groundSegments);
const groundPositions = groundGeo.attributes.position;
for (let i = 0; i < groundPositions.count; i++) {
    const x = groundPositions.getX(i);
    const y = groundPositions.getY(i);
    const h = getTerrainHeight(x, -y);
    groundPositions.setZ(i, h + 1.0);
}
groundGeo.computeVertexNormals();

// === DASAR LAUT BERPASIR REALISTIS (TROPICAL GOLDEN SAND TEXTURE) ===
function createRealisticSandTexture() {
    const sandCanvas = document.createElement('canvas');
    sandCanvas.width = 512;
    sandCanvas.height = 512;
    const ctx = sandCanvas.getContext('2d');

    // 1. Dasar gradien pasir pantai emas-krem lembut
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0.0, '#fbf3e4');
    grad.addColorStop(0.25, '#f5e4c3');
    grad.addColorStop(0.65, '#ebd1a7');
    grad.addColorStop(1.0, '#dfbe8f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // 2. Riak undulasi gelombang pasir pesisir (sand wave ripples)
    for (let y = 0; y < 512; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= 512; x += 16) {
            const waveY = y + Math.sin(x * 0.04) * 5 + Math.cos(x * 0.02) * 2.5;
            ctx.lineTo(x, waveY);
        }
        ctx.lineWidth = (y % 40 === 0) ? 3.5 : 2;
        ctx.strokeStyle = (y % 40 === 0) ? 'rgba(255, 255, 255, 0.28)' : 'rgba(180, 135, 80, 0.16)';
        ctx.stroke();
    }

    // 3. Butiran pasir mikro & mineral laut (micro sand grains)
    const imgData = ctx.getImageData(0, 0, 512, 512);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 32;
        data[i] = Math.min(255, Math.max(0, data[i] + noise));
        data[i+1] = Math.min(255, Math.max(0, data[i+1] + noise * 0.9));
        data[i+2] = Math.min(255, Math.max(0, data[i+2] + noise * 0.7));
    }
    ctx.putImageData(imgData, 0, 0);

    // 4. Bintik-bintik pecahan kerang & batu kuarsa pasir pantai
    for (let s = 0; s < 220; s++) {
        const sx = Math.random() * 512;
        const sy = Math.random() * 512;
        const sr = 1 + Math.random() * 2.2;
        ctx.fillStyle = (Math.random() > 0.45) ? 'rgba(255, 252, 242, 0.7)' : 'rgba(217, 119, 6, 0.35)';
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
    }

    const tex = new THREE.CanvasTexture(sandCanvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(16, 16);
    return tex;
}

const sandTexture = createRealisticSandTexture();

const groundMat = new THREE.MeshPhongMaterial({
    map: sandTexture,
    color: 0xffffff,
    emissive: 0x3d2812, // Pantulan hangat pasir kena sinar matahari
    shininess: 20,
    specular: 0xffedd5,
    flatShading: false
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1;
if (!isMobile) ground.receiveShadow = true;
scene.add(ground);

// Taburan Bintang Laut (Starfish) di atas pasir
function createStarfish(x, y, z, colorHex = 0xef4444, scale = 1) {
    const starGroup = new THREE.Group();
    const armGeo = new THREE.ConeGeometry(0.18 * scale, 0.9 * scale, 5);
    const starMat = new THREE.MeshPhongMaterial({ color: colorHex, emissive: new THREE.Color(colorHex).multiplyScalar(0.2), shininess: 30 });
    
    // Pusat bintang laut
    const centerMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.25 * scale, 0.12 * scale, 8), starMat);
    starGroup.add(centerMesh);

    // 5 lengan bintang laut
    for (let i = 0; i < 5; i++) {
        const arm = new THREE.Mesh(armGeo, starMat);
        const angle = (i / 5) * Math.PI * 2;
        arm.rotation.z = Math.PI / 2;
        arm.rotation.y = angle;
        arm.position.set(Math.cos(angle) * 0.45 * scale, 0, Math.sin(angle) * 0.45 * scale);
        starGroup.add(arm);
    }
    starGroup.position.set(x, y + 0.08, z);
    starGroup.rotation.x = (Math.random() - 0.5) * 0.1;
    starGroup.rotation.z = (Math.random() - 0.5) * 0.1;
    return starGroup;
}

// Menabur bintang laut merah & biru di atas pasir
const starfishPositions = [
    [5, -1, -12, 0x0284c7, 1.1],   // Bintang laut biru Linckia laevigata
    [10, -1, -22, 0xf97316, 0.9],  // Bintang laut oranye
    [-12, -1, -18, 0xef4444, 1.0], // Bintang laut merah
    [-22, -1, -38, 0x0ea5e9, 1.2],
    [18, -1, -48, 0xf59e0b, 1.0],
    [-8, -1, -62, 0xef4444, 0.95],
    [26, -1, -72, 0x0284c7, 1.15]
];
starfishPositions.forEach(([x, y, z, col, sc]) => scene.add(createStarfish(x, y, z, col, sc)));

// === PANTAI PESISIR MADURA: HUTAN POHON KELAPA TROPIS (COCONUT PALMS) & VEGETASI PESISIR ===
function createPalmTree(x, z, scale = 1, leanDir = -1) {
    const palmGroup = new THREE.Group();
    const groundY = getTerrainHeight(x, z);

    // Batang kelapa bertekstur cincin, ramping dan melengkung alami ke arah laut
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
    const trunkRingMat = new THREE.MeshLambertMaterial({ color: 0x5c3a21 });
    const trunkSegments = 9;
    const trunkHeight = (8.0 + Math.sin(x * 0.2) * 1.5) * scale;
    const curveOffset = (Math.sin(x * 0.4) * 0.9 + 0.5) * scale;
    const oceanLean = (0.8 + Math.random() * 0.6) * scale * leanDir;

    for (let i = 0; i < trunkSegments; i++) {
        const segH = trunkHeight / trunkSegments;
        const radius = (0.38 - (i / trunkSegments) * 0.16) * scale;
        const segGeo = new THREE.CylinderGeometry(radius * 0.88, radius, segH, 8);
        const segMesh = new THREE.Mesh(segGeo, (i % 2 === 0) ? trunkMat : trunkRingMat);
        const progress = i / trunkSegments;
        const curveX = Math.sin(progress * Math.PI * 0.5) * curveOffset;
        const curveZ = progress * progress * oceanLean;
        segMesh.position.set(curveX, i * segH + segH / 2, curveZ);
        segMesh.rotation.z = -progress * 0.22;
        segMesh.rotation.x = progress * 0.18 * leanDir;
        palmGroup.add(segMesh);
    }

    // Daun pelepah kelapa hijau segar melengkung membentuk kubah anggun
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x16a34a, side: THREE.DoubleSide });
    const leafMatLight = new THREE.MeshLambertMaterial({ color: 0x22c55e, side: THREE.DoubleSide });
    const leafCount = 10;
    const topY = trunkHeight * 0.96;
    const topX = curveOffset;
    const topZ = oceanLean;

    for (let i = 0; i < leafCount; i++) {
        const angle = (i / leafCount) * Math.PI * 2 + (scale * 0.5);
        const leafLen = (3.8 + (i % 2) * 0.6) * scale;
        const leafGeo = new THREE.ConeGeometry(0.55 * scale, leafLen, 4);
        const leaf = new THREE.Mesh(leafGeo, (i % 2 === 0) ? leafMat : leafMatLight);
        leaf.position.set(
            topX + Math.cos(angle) * 1.6 * scale,
            topY - 0.35 * scale,
            topZ + Math.sin(angle) * 1.6 * scale
        );
        leaf.rotation.y = angle;
        leaf.rotation.x = 1.15;
        leaf.rotation.z = (Math.sin(angle) * 0.2);
        palmGroup.add(leaf);
    }

    // Gerombolan buah kelapa di pangkal pelepah (kelapa muda hijau-emas)
    const coconutMat = new THREE.MeshLambertMaterial({ color: 0x65a30d });
    const coconutGeo = new THREE.SphereGeometry(0.24 * scale, 6, 6);
    const numCoconuts = 4;
    for (let c = 0; c < numCoconuts; c++) {
        const cMesh = new THREE.Mesh(coconutGeo, coconutMat);
        const cAngle = (c / numCoconuts) * Math.PI * 2 + 0.4;
        cMesh.position.set(
            topX + Math.cos(cAngle) * 0.40 * scale,
            topY - 0.25 * scale,
            topZ + Math.sin(cAngle) * 0.40 * scale
        );
        palmGroup.add(cMesh);
    }

    palmGroup.position.set(x, groundY, z);
    return palmGroup;
}

// Sebaran pohon kelapa di sepanjang pantai pesisir Madura (Rimbun & Alami)
const palmPositions = [
    // Pesisir Kiri
    [-56, 52, 1.1, -1], [-48, 58, 0.95, -1], [-42, 46, 1.05, -1], [-36, 54, 1.2, -1],
    [-30, 47, 0.9, -1], [-24, 62, 1.15, -1], [-18, 52, 1.0, -1], [-12, 59, 1.05, -1],
    // Pesisir Tengah (Pintu Keluar dari Pantai ke Laut)
    [-6, 54, 1.1, -1], [0, 64, 1.25, -1], [6, 53, 0.95, -1],
    // Pesisir Kanan
    [14, 58, 1.1, -1], [20, 49, 1.05, -1], [26, 62, 1.2, -1], [32, 47, 0.9, -1],
    [38, 56, 1.15, -1], [44, 46, 1.0, -1], [50, 55, 1.1, -1], [56, 49, 0.95, -1],
    // Barisan Belakang (Latar Belakang Daratan Tropis)
    [-44, 66, 1.25, -1], [-22, 68, 1.15, -1], [16, 67, 1.2, -1], [38, 68, 1.25, -1]
];
palmPositions.forEach(([px, pz, sc, lean]) => {
    scene.add(createPalmTree(px, pz, sc, lean));
});

// === MANGROVE PESISIR MADURA (ZONA REHABILITASI & PELESTARIAN PANTAI) ===
function createMangrovePlant(x, z, scale = 1) {
    const g = new THREE.Group();
    const gy = getTerrainHeight(x, z);
    const rootMat = new THREE.MeshLambertMaterial({ color: 0x5a3518 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x15803d });

    // Akar tunjang (stilt roots) menopang tanaman di pasir pasang-surut
    for (let r = 0; r < 5; r++) {
        const a = (r / 5) * Math.PI * 2;
        const rootGeo = new THREE.CylinderGeometry(0.04 * scale, 0.08 * scale, 1.3 * scale, 6);
        const root = new THREE.Mesh(rootGeo, rootMat);
        root.position.set(Math.cos(a) * 0.45 * scale, 0.45 * scale, Math.sin(a) * 0.45 * scale);
        root.rotation.z = Math.cos(a) * 0.4;
        root.rotation.x = Math.sin(a) * 0.4;
        g.add(root);
    }

    // Batang pohon mangrove
    const stemGeo = new THREE.CylinderGeometry(0.11 * scale, 0.15 * scale, 1.6 * scale, 6);
    const stem = new THREE.Mesh(stemGeo, rootMat);
    stem.position.y = 0.95 * scale;
    g.add(stem);

    // Rindang dedaunan mangrove
    for (let l = 0; l < 4; l++) {
        const crownGeo = new THREE.DodecahedronGeometry((0.72 - l * 0.1) * scale);
        const crown = new THREE.Mesh(crownGeo, leafMat);
        crown.position.set(
            (Math.sin(l * 1.6) * 0.3) * scale,
            (1.6 + l * 0.42) * scale,
            (Math.cos(l * 1.6) * 0.3) * scale
        );
        g.add(crown);
    }

    g.position.set(x, gy, z);
    return g;
}

const mangrovePositions = [
    [-34, 37, 1.0], [-20, 36, 1.15], [-9, 37.5, 0.9],
    [9, 37, 1.05], [22, 36, 1.1], [36, 37.5, 0.95]
];
mangrovePositions.forEach(([mx, mz, sc]) => {
    scene.add(createMangrovePlant(mx, mz, sc));
});

// === PERAHU TRADISIONAL NELAYAN MADURA (PERAHU JUKUNG) ===
function createMaduraFishingBoat(x, z, rotY = 0.35) {
    const boatGroup = new THREE.Group();
    const groundY = getTerrainHeight(x, z);

    // Badan perahu kayu ramping khas Madura
    const hullMat = new THREE.MeshLambertMaterial({ color: 0x0284c7 });
    const hullGeo = new THREE.BoxGeometry(1.4, 0.8, 6.0);
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.y = 0.4;
    boatGroup.add(hull);

    // Haluan lancip depan berwarna kuning cerah khas Madura
    const bowGeo = new THREE.ConeGeometry(0.7, 1.8, 4);
    const bowMat = new THREE.MeshLambertMaterial({ color: 0xfacc15 });
    const bow = new THREE.Mesh(bowGeo, bowMat);
    bow.rotation.x = -Math.PI / 2;
    bow.position.set(0, 0.4, -3.8);
    boatGroup.add(bow);

    // Cadik penyeimbang bambu samping
    const outriggerMat = new THREE.MeshLambertMaterial({ color: 0xfef08a });
    const armMat = new THREE.MeshLambertMaterial({ color: 0x78350f });

    [-1.8, 1.8].forEach(sideX => {
        const floatGeo = new THREE.CylinderGeometry(0.12, 0.12, 5.2, 6);
        const floatMesh = new THREE.Mesh(floatGeo, outriggerMat);
        floatMesh.rotation.x = Math.PI / 2;
        floatMesh.position.set(sideX, 0.2, -0.5);
        boatGroup.add(floatMesh);

        const armGeo = new THREE.CylinderGeometry(0.06, 0.06, Math.abs(sideX), 6);
        const armMesh = new THREE.Mesh(armGeo, armMat);
        armMesh.rotation.z = Math.PI / 2;
        armMesh.position.set(sideX / 2, 0.5, 0.5);
        boatGroup.add(armMesh);

        const armMesh2 = armMesh.clone();
        armMesh2.position.z = -1.5;
        boatGroup.add(armMesh2);
    });

    // Tiang layar & bendera merah putih
    const mastGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.5, 6);
    const mast = new THREE.Mesh(mastGeo, armMat);
    mast.position.set(0, 2.0, -0.5);
    boatGroup.add(mast);

    const flagGeo = new THREE.PlaneGeometry(0.8, 0.5);
    const flagMat = new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide });
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(0.4, 3.4, -0.5);
    boatGroup.add(flag);

    boatGroup.position.set(x, groundY + 0.1, z);
    boatGroup.rotation.y = rotY;
    return boatGroup;
}
scene.add(createMaduraFishingBoat(16, 36, 0.35));
scene.add(createMaduraFishingBoat(-24, 42, -0.28));
scene.add(createMaduraFishingBoat(34, 40, 0.55));

// === BURUNG CAMAR (SEAGULLS) DI LANGIT PANTAI TROPIS ===
const seagulls = [];
function createSeagull(baseX, baseY, baseZ, radius, speed, phase) {
    const g = new THREE.Group();
    const bodyGeo = new THREE.ConeGeometry(0.18, 0.8, 5);
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const wingMat = new THREE.MeshLambertMaterial({ color: 0xe2e8f0, side: THREE.DoubleSide });

    const body = new THREE.Mesh(bodyGeo, whiteMat);
    body.rotation.x = Math.PI / 2;
    g.add(body);

    const leftWingGeo = new THREE.PlaneGeometry(0.85, 0.3);
    const leftWing = new THREE.Mesh(leftWingGeo, wingMat);
    leftWing.position.set(-0.45, 0.05, 0);
    leftWing.rotation.x = Math.PI / 2;
    g.add(leftWing);

    const rightWingGeo = new THREE.PlaneGeometry(0.85, 0.3);
    const rightWing = new THREE.Mesh(rightWingGeo, wingMat);
    rightWing.position.set(0.45, 0.05, 0);
    rightWing.rotation.x = Math.PI / 2;
    g.add(rightWing);

    g.userData = { baseX, baseY, baseZ, radius, speed, phase, leftWing, rightWing };
    return g;
}

for (let s = 0; s < 5; s++) {
    const sg = createSeagull(
        (s - 2) * 12,
        25 + s * 2,
        45 + (s % 2) * 6,
        22 + s * 4,
        0.85 + s * 0.15,
        s * 1.2
    );
    scene.add(sg);
    seagulls.push(sg);
}

// === PAPAN KAYU EDUKASI PANTAI MADURA ===
function createBeachWelcomeSign(x, z) {
    const signGroup = new THREE.Group();
    const groundY = getTerrainHeight(x, z);

    // Tiang kayu
    const postMat = new THREE.MeshLambertMaterial({ color: 0x5c3a21 });
    const postGeo = new THREE.CylinderGeometry(0.14, 0.16, 3.2, 8);
    const post1 = new THREE.Mesh(postGeo, postMat);
    post1.position.set(-1.4, 1.6, 0);
    const post2 = new THREE.Mesh(postGeo, postMat);
    post2.position.set(1.4, 1.6, 0);
    signGroup.add(post1, post2);

    const bCanvas = document.createElement('canvas');
    bCanvas.width = 1024;
    bCanvas.height = 360;
    const bCtx = bCanvas.getContext('2d');
    bCtx.fillStyle = '#fef3c7';
    bCtx.fillRect(0, 0, 1024, 360);
    bCtx.lineWidth = 14;
    bCtx.strokeStyle = '#78350f';
    bCtx.strokeRect(7, 7, 1010, 346);

    bCtx.font = 'bold 42px sans-serif';
    bCtx.fillStyle = '#0369a1';
    bCtx.textAlign = 'center';
    bCtx.fillText('PANTAI KONSERVASI PESISIR MADURA', 512, 82);

    bCtx.font = '28px sans-serif';
    bCtx.fillStyle = '#0f172a';
    bCtx.fillText('Zona Kelestarian Lingkungan Bahari & Kerang Bambu (Lorjuk)', 512, 155);
    bCtx.fillText('Jelajahi dari pasir pantai berpohon kelapa menuju terumbu karang samudra!', 512, 218);

    bCtx.font = 'italic 25px sans-serif';
    bCtx.fillStyle = '#d97706';
    bCtx.fillText('Gunakan W / Joystick untuk berjalan menuruni pasir & menyelam ke laut', 512, 290);

    const signTex = new THREE.CanvasTexture(bCanvas);
    const boardGeo = new THREE.PlaneGeometry(3.6, 1.4);
    const boardMat = new THREE.MeshLambertMaterial({ map: signTex, side: THREE.DoubleSide });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(0, 2.3, 0.05);
    signGroup.add(board);

    signGroup.position.set(x, groundY, z);
    signGroup.rotation.y = 0.28;
    return signGroup;
}
scene.add(createBeachWelcomeSign(-6.5, 44));

// === FITUR TELEPORTASI / KEMBALI KE PANTAI KELAPA ===
function teleportToBeach() {
    camera.position.set(0, 21.0, 52);
    camera.lookAt(0, 16, 0);
    showAiMessage("Selamat datang di Pantai Pesisir Madura! Nikmati panorama pohon kelapa tropis dan pesisir pantai. Berjalanlah maju keluar dari pantai menuju laut untuk melanjutkan misi kelestarian bahari.", true);
}
window.teleportToBeach = teleportToBeach;


// === CAUSTICS (Pola cahaya air di dasar laut) ===
const causticsCanvas = document.createElement('canvas');
const causticsSize = isMobile ? 256 : 512;
causticsCanvas.width = causticsSize;
causticsCanvas.height = causticsSize;
const causticsCtx = causticsCanvas.getContext('2d');
const causticsTexture = new THREE.CanvasTexture(causticsCanvas);
causticsTexture.wrapS = THREE.RepeatWrapping;
causticsTexture.wrapT = THREE.RepeatWrapping;
causticsTexture.repeat.set(8, 8);

const causticsPlaneGeo = new THREE.PlaneGeometry(300, 300);
const causticsPlaneMat = new THREE.MeshBasicMaterial({
    map: causticsTexture,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});
const causticsPlane = new THREE.Mesh(causticsPlaneGeo, causticsPlaneMat);
causticsPlane.rotation.x = -Math.PI / 2;
causticsPlane.position.y = -0.9;
scene.add(causticsPlane);

function updateCaustics(time) {
    const t = time * 0.0005;
    const s = causticsSize;
    const ctx = causticsCtx;
    ctx.clearRect(0, 0, s, s);
    const cellSize = s / 12;
    for (let ix = 0; ix < 14; ix++) {
        for (let iy = 0; iy < 14; iy++) {
            const cx = ix * cellSize + Math.sin(t + ix * 0.7 + iy * 0.3) * cellSize * 0.5;
            const cy = iy * cellSize + Math.cos(t * 0.8 + iy * 0.5 + ix * 0.4) * cellSize * 0.5;
            const r = cellSize * (0.3 + 0.3 * Math.sin(t * 1.2 + ix + iy));
            const brightness = Math.floor(120 + 80 * Math.sin(t + ix * 0.9 + iy * 0.6));
            ctx.beginPath();
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            grad.addColorStop(0, 'rgba(' + brightness + ',' + (brightness + 40) + ',' + (brightness + 60) + ',0.4)');
            grad.addColorStop(0.6, 'rgba(' + (brightness - 40) + ',' + brightness + ',' + (brightness + 30) + ',0.15)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    causticsTexture.needsUpdate = true;
}

// === MARINE SNOW (debu laut melayang) ===
const marineSnowCount = isMobile ? 150 : 400;
const marineSnowGeo = new THREE.BufferGeometry();
const msPos = new Float32Array(marineSnowCount * 3);
const msVel = [];
for (let i = 0; i < marineSnowCount; i++) {
    msPos[i * 3] = (Math.random() - 0.5) * 200;
    msPos[i * 3 + 1] = (Math.random() - 0.5) * 50 - 5;
    msPos[i * 3 + 2] = (Math.random() - 0.5) * 200;
    msVel.push({
        x: (Math.random() - 0.3) * 0.8,
        y: -0.05 + Math.random() * 0.1,
        z: (Math.random() - 0.5) * 0.3,
        wobblePhase: Math.random() * Math.PI * 2
    });
}
marineSnowGeo.setAttribute('position', new THREE.BufferAttribute(msPos, 3));
const marineSnowMat = new THREE.PointsMaterial({
    color: 0xaaccdd,
    size: isMobile ? 0.12 : 0.08,
    transparent: true,
    opacity: 0.4,
    depthWrite: false
});
const marineSnow = new THREE.Points(marineSnowGeo, marineSnowMat);
scene.add(marineSnow);

// === LIGHT SHAFTS (from surface) ===
const shaftGroup = new THREE.Group();
const shaftCount = isMobile ? 3 : 6;
for (let i = 0; i < shaftCount; i++) {
    const shaftGeo = new THREE.CylinderGeometry(0.5, 3, 40, 6, 1, true);
    const shaftMat = new THREE.MeshBasicMaterial({
        color: 0x88ccee,
        transparent: true,
        opacity: 0.015,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.set(
        (Math.random() - 0.5) * 80,
        0,
        -20 + (Math.random() - 0.5) * 80
    );
    shaft.rotation.z = (Math.random() - 0.5) * 0.2;
    shaft.userData = {
        baseOpacity: shaftMat.opacity,
        phase: Math.random() * Math.PI * 2
    };
    shaftGroup.add(shaft);
}
scene.add(shaftGroup);

/* ==========================================================================
   MISSION ZONES & PARTICLES
   ========================================================================== */
// === 3D FLOATING BILLBOARD BADGE UNTUK SETIAP MISI ===
// === 3D FLOATING BILLBOARD BADGE DENGAN NOMOR JELAS DI ATAS (REQUEST USER) ===
function renderMissionBadgeCanvas(canvas, index, title, isCompleted, isCurrent) {
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 512);

    const goldColor = '#facc15';
    const cyanColor = '#38bdf8';
    const greenColor = '#34d399';
    const glowColor = isCompleted ? '#10b981' : (isCurrent ? '#fbbf24' : '#00e5ff');
    const accentColor = isCompleted ? greenColor : (isCurrent ? goldColor : cyanColor);

    // 1. PIN CONNECTOR STEM (Panah penunjuk ke bawah tepat ke kristal)
    ctx.fillStyle = 'rgba(5, 18, 38, 0.96)';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(226, 385);
    ctx.lineTo(286, 385);
    ctx.lineTo(256, 465);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Titik bercahaya di ujung panah
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(256, 465, 6, 0, Math.PI * 2);
    ctx.fill();

    // 2. MAIN HORIZONTAL BANNER (Kotak kaca gelap dengan judul & status)
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 25;
    ctx.fillStyle = 'rgba(4, 16, 36, 0.95)';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(26, 220, 460, 165, 26);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Header Misi di Banner
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 36px "Poppins", sans-serif, system-ui';
    ctx.fillText(`★ MISI ${index + 1} ★`, 256, 260);

    // Judul Misi
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 25px "Poppins", sans-serif, system-ui';
    let shortTitle = title;
    if (shortTitle.length > 22) {
        shortTitle = shortTitle.substring(0, 20) + '...';
    }
    ctx.fillText(shortTitle, 256, 305);

    // Sub-Status Tag
    ctx.font = '600 20px "Poppins", sans-serif, system-ui';
    if (isCompleted) {
        ctx.fillStyle = '#6ee7b7';
        ctx.fillText('✓ MISI SELESAI', 256, 348);
    } else if (isCurrent) {
        ctx.fillStyle = '#fef08a';
        ctx.fillText('🎯 TARGET SAAT INI', 256, 348);
    } else {
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('EKSPLORASI BAHARI', 256, 348);
    }

    // 3. TOP NUMBER BADGE MEDAL (ANGKA BESAR TINGGI DI ATAS SESUAI REQUEST USER)
    const medalX = 256;
    const medalY = 115;
    const medalRadius = 90;

    // Glowing Aura Medal
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 35;

    // Outer Ring
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(medalX, medalY, medalRadius, 0, Math.PI * 2);
    ctx.fill();

    // Dark Inner Core
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#06162d';
    ctx.beginPath();
    ctx.arc(medalX, medalY, medalRadius - 8, 0, Math.PI * 2);
    ctx.fill();

    // Inner Accent Ring
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(medalX, medalY, medalRadius - 16, 0, Math.PI * 2);
    ctx.stroke();

    // Mini "MISI" Label di atas angka
    ctx.fillStyle = isCompleted ? '#a7f3d0' : (isCurrent ? '#fef08a' : '#7dd3fc');
    ctx.font = '800 22px "Poppins", sans-serif, system-ui';
    ctx.fillText('MISI', medalX, medalY - 45);

    // GIANT NUMBER IN THE CENTER OF THE MEDAL (SANGAT JELAS DARI JAUH)
    ctx.fillStyle = isCompleted ? '#34d399' : (isCurrent ? '#facc15' : '#ffffff');
    ctx.font = '900 86px "Poppins", sans-serif, system-ui';
    ctx.fillText(`${isCompleted ? '✓' : index + 1}`, medalX, medalY + 8);
}

function createMissionBadgeSprite(index, title) {
    const canvas = document.createElement('canvas');
    const isCompleted = state.completed.has(index);
    const isCurrent = index === state.unlocked;
    renderMissionBadgeCanvas(canvas, index, title, isCompleted, isCurrent);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        depthTest: false
    });

    const sprite = new THREE.Sprite(spriteMat);
    // Skala 13x13 agar sangat jelas terbaca bahkan dari jarak 80-100 meter di bawah laut
    sprite.scale.set(13.0, 13.0, 1);
    sprite.renderOrder = 999;
    return { sprite, canvas, texture };
}

function updateMissionBadges() {
    zones.forEach((z, idx) => {
        if (!z.badgeCanvas || !z.badgeTexture) return;
        const isCompleted = state.completed.has(idx);
        const isCurrent = idx === state.unlocked;
        renderMissionBadgeCanvas(z.badgeCanvas, idx, missions[idx].title, isCompleted, isCurrent);
        z.badgeTexture.needsUpdate = true;
    });
}

const zones = [];
const zoneGeometry = new THREE.CylinderGeometry(2, 2, 10, 16);
const zoneMaterial = new THREE.MeshBasicMaterial({
    color: 0x00bcd4,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide
});

missions.forEach((m, index) => {
    const zoneMesh = new THREE.Mesh(zoneGeometry, zoneMaterial.clone());
    zoneMesh.position.copy(m.position);
    scene.add(zoneMesh);
    zones.push({
        id: index,
        mesh: zoneMesh,
        active: false
    });

    // Floating icon – bentuk kristal laut
    const iconGeo = new THREE.OctahedronGeometry(0.6);
    const iconMat = new THREE.MeshPhongMaterial({ color: 0x00e5ff, emissive: 0x006064 });
    const icon = new THREE.Mesh(iconGeo, iconMat);
    icon.position.set(m.position.x, m.position.y + 6, m.position.z);
    scene.add(icon);
    zones[index].icon = icon;

    // Floating 3D Badge bertuliskan nomor misi BESAR DI ATAS
    const badgeData = createMissionBadgeSprite(index, m.title);
    badgeData.sprite.position.set(m.position.x, m.position.y + 11.5, m.position.z);
    scene.add(badgeData.sprite);
    zones[index].badgeSprite = badgeData.sprite;
    zones[index].badgeCanvas = badgeData.canvas;
    zones[index].badgeTexture = badgeData.texture;

    // Beacon of light (Pilar Cahaya Vertikal)
    const beaconGeo = new THREE.CylinderGeometry(1.5, 1.5, 300, 16);
    const beaconMat = new THREE.MeshBasicMaterial({
        color: 0x00e5ff,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
    });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(m.position.x, m.position.y + 150, m.position.z);
    scene.add(beacon);
    zones[index].beacon = beacon;
});

// Update badge pertama kali sesuai state
updateMissionBadges();

// Partikel – gelembung & plankton melayang (lebih sedikit untuk HP)
const particleCount = isMobile ? 300 : 700;
const particlesGeo = new THREE.BufferGeometry();
const particlePos = new Float32Array(particleCount * 3);
const particleVel = [];

for (let i = 0; i < particleCount; i++) {
    particlePos[i * 3] = (Math.random() - 0.5) * 200;
    particlePos[i * 3 + 1] = (Math.random() - 0.5) * 60 - 10;
    particlePos[i * 3 + 2] = (Math.random() - 0.5) * 200;
    particleVel.push(Math.random() * 0.02 + 0.003);
}

particlesGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
const particleMat = new THREE.PointsMaterial({
    color: 0x00d4ff,
    size: 0.3,
    transparent: true,
    opacity: 0.5,
    map: createCircleTexture()
});
const particles = new THREE.Points(particlesGeo, particleMat);
scene.add(particles);

function createCircleTexture() {
    const cnv = document.createElement('canvas');
    cnv.width = 32; cnv.height = 32;
    const ctx = cnv.getContext('2d');
    const gradient = ctx.createRadialGradient(16, 16, 2, 16, 16, 14);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.5, 'rgba(100,200,255,0.6)');
    gradient.addColorStop(1, 'rgba(0,100,200,0)');
    ctx.beginPath();
    ctx.arc(16, 16, 14, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    return new THREE.CanvasTexture(cnv);
}

/* ==========================================================================
   INPUT & MOVEMENT â€” KEYBOARD
   ========================================================================== */
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let moveUp = false;
let moveDown = false;

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const speed = 26.0;

document.getElementById('start-btn').addEventListener('click', () => {
    // Langsung mulai game tanpa menunggu pointer lock
    onGameStart();
    // Di desktop, minta pointer lock setelah game mulai
    if (!isMobile) {
        setTimeout(() => {
            controls.lock();
        }, 300);
    }
});

let audioCtx;
let isStarted = false;
let oceanAudioGain = null;

function startOceanBGM() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // === LAYER 1: Deep ocean hum ===
    const osc1 = audioCtx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 40;

    const osc2 = audioCtx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 80;

    // === LAYER 2: Mid-frequency rumble (arus) ===
    const oscRumble = audioCtx.createOscillator();
    oscRumble.type = 'triangle';
    oscRumble.frequency.value = 55;

    // === LAYER 3: High-freq bubble shimmer ===
    const oscBubble = audioCtx.createOscillator();
    oscBubble.type = 'sine';
    oscBubble.frequency.value = 2000;
    const bubbleGain = audioCtx.createGain();
    bubbleGain.gain.value = 0.003;
    const bubbleLfo = audioCtx.createOscillator();
    bubbleLfo.type = 'sine';
    bubbleLfo.frequency.value = 3;
    const bubbleLfoGain = audioCtx.createGain();
    bubbleLfoGain.gain.value = 0.003;
    bubbleLfo.connect(bubbleLfoGain);
    bubbleLfoGain.connect(bubbleGain.gain);
    oscBubble.connect(bubbleGain);

    // Underwater muffled filter
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    // LFO untuk efek arus laut (lebih organic)
    const lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.08;

    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 180;

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    // Second LFO for volume modulation (ocean breathing)
    const lfo2 = audioCtx.createOscillator();
    lfo2.type = 'sine';
    lfo2.frequency.value = 0.05;
    const lfo2Gain = audioCtx.createGain();
    lfo2Gain.gain.value = 0.02;

    oceanAudioGain = audioCtx.createGain();
    oceanAudioGain.gain.value = 0.08;

    lfo2.connect(lfo2Gain);
    lfo2Gain.connect(oceanAudioGain.gain);

    osc1.connect(filter);
    osc2.connect(filter);
    oscRumble.connect(filter);
    bubbleGain.connect(filter);
    filter.connect(oceanAudioGain);
    oceanAudioGain.connect(audioCtx.destination);

    osc1.start();
    osc2.start();
    oscRumble.start();
    oscBubble.start();
    lfo.start();
    lfo2.start();
    bubbleLfo.start();

    // === Periodic bubble pop sounds ===
    function scheduleBubblePop() {
        if (!audioCtx || audioCtx.state === 'closed') return;
        const now = audioCtx.currentTime;
        const popOsc = audioCtx.createOscillator();
        const popGain = audioCtx.createGain();
        popOsc.type = 'sine';
        popOsc.frequency.setValueAtTime(800 + Math.random() * 1200, now);
        popOsc.frequency.exponentialRampToValueAtTime(200 + Math.random() * 300, now + 0.08);
        popGain.gain.setValueAtTime(0.008, now);
        popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        popOsc.connect(popGain);
        popGain.connect(audioCtx.destination);
        popOsc.start(now);
        popOsc.stop(now + 0.08);
        setTimeout(scheduleBubblePop, 3000 + Math.random() * 8000);
    }
    setTimeout(scheduleBubblePop, 2000);

    // === Distant whale-like call ===
    function scheduleWhaleCall() {
        if (!audioCtx || audioCtx.state === 'closed') return;
        const now = audioCtx.currentTime;
        const whaleOsc = audioCtx.createOscillator();
        const whaleGain = audioCtx.createGain();
        const whaleFilter = audioCtx.createBiquadFilter();
        whaleOsc.type = 'sine';
        whaleOsc.frequency.setValueAtTime(80, now);
        whaleOsc.frequency.linearRampToValueAtTime(120, now + 1.5);
        whaleOsc.frequency.linearRampToValueAtTime(70, now + 3);
        whaleGain.gain.setValueAtTime(0.001, now);
        whaleGain.gain.linearRampToValueAtTime(0.015, now + 0.8);
        whaleGain.gain.linearRampToValueAtTime(0.001, now + 3);
        whaleFilter.type = 'lowpass';
        whaleFilter.frequency.value = 200;
        whaleOsc.connect(whaleFilter);
        whaleFilter.connect(whaleGain);
        whaleGain.connect(audioCtx.destination);
        whaleOsc.start(now);
        whaleOsc.stop(now + 3.5);
        setTimeout(scheduleWhaleCall, 25000 + Math.random() * 40000);
    }
    setTimeout(scheduleWhaleCall, 10000);
}

function speakAI(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const msg = new SpeechSynthesisUtterance(text);
        msg.lang = 'id-ID';
        msg.rate = 1.0;
        msg.pitch = 1.2;
        window.speechSynthesis.speak(msg);
    }
}

// Hint overlay kecil untuk desktop (klik canvas = aktifkan mouse look)
let clickHintEl = null;
function showClickHint() {
    if (isMobile || clickHintEl) return;
    clickHintEl = document.createElement('div');
    clickHintEl.id = 'click-hint';
    clickHintEl.innerHTML = `<i class="fa-solid fa-computer-mouse"></i> Klik layar untuk mengaktifkan kontrol mouse`;
    clickHintEl.style.cssText = `
        position:fixed; bottom:20px; left:50%; transform:translateX(-50%);
        background:rgba(0,0,0,0.7); color:#fff; padding:10px 22px;
        border-radius:30px; font-size:0.9rem; z-index:100;
        border:1px solid rgba(0,210,255,0.5); font-family:'Poppins',sans-serif;
        display:flex; align-items:center; gap:8px; backdrop-filter:blur(6px);
        pointer-events:none;
    `;
    document.body.appendChild(clickHintEl);
}
function hideClickHint() {
    if (clickHintEl) { clickHintEl.remove(); clickHintEl = null; }
}

function onGameStart() {
    if (isStarted) return; // Cegah double-call
    isStarted = true;

    startOverlay.style.display = 'none';
    document.getElementById('hud-top').classList.remove('hidden');
    document.getElementById('hud-missions').classList.remove('hidden');
    document.getElementById('ai-guardian').classList.remove('hidden');
    document.getElementById('hud-objective').classList.remove('hidden');

    if (isMobile) {
        document.getElementById('virtual-joystick').classList.remove('hidden');
        document.getElementById('mobile-actions').classList.remove('hidden');
        document.getElementById('crosshair').classList.add('hidden');
        document.getElementById('ai-guardian').classList.add('mobile-layout');
        document.body.classList.add('touch-layout');
        const diveText = document.getElementById('dive-prompt-text');
        if (diveText) diveText.innerText = 'Gunakan tombol panah di kanan untuk naik / menyelam';
    } else {
        document.getElementById('crosshair').classList.remove('hidden');
        // Tampilkan hint klik canvas di desktop
        showClickHint();
    }

    // Backsound musik
    const bgMusic = new Audio('assets/bgm.mp3');
    bgMusic.loop = true;
    bgMusic.volume = 0.15;
    bgMusic.play().catch(e => console.log('Autoplay MP3 diblokir browser', e));

    // Ambient bawah laut
    startOceanBGM();

    // AI Intro
    setTimeout(() => {
        const introMsg = "Halo, Pejuang Bahari! Saya AI Marine Guardian. Selamat datang di Pantai Pesisir Madura! Kita memiliki tujuh misi konservasi untuk menjaga kelestarian lingkungan laut dan pesisir. Mulailah dengan melangkah keluar dari pantai berpohon kelapa ini menuju lautan luas dan ikuti pilar cahaya biru untuk menjalankan misi kelestarian. Selamat menjelajah!";
        showAiMessage(introMsg, true);
    }, 1000);
}

controls.addEventListener('lock', () => {
    // Pointer lock berhasil â€” sembunyikan hint, aktifkan crosshair
    hideClickHint();
    document.getElementById('crosshair').classList.remove('hidden');
});

controls.addEventListener('unlock', () => {
    // Saat pointer lock lepas (ESC ditekan), tampilkan hint klik lagi
    if (isStarted && !isMobile) {
        document.getElementById('crosshair').classList.remove('hidden');
        const mModal = document.getElementById('materi-modal');
        if (document.getElementById('mission-popup').classList.contains('hidden') &&
            document.getElementById('clam-modal').classList.contains('hidden') &&
            (!mModal || mModal.classList.contains('hidden')) &&
            document.getElementById('view-modal').classList.contains('hidden')) {
            showClickHint();
        }
    }
});

// Klik canvas di desktop = aktifkan pointer lock
canvas.addEventListener('click', () => {
    if (isStarted && !isMobile && !controls.isLocked) {
        controls.lock();
    }
});

// === FUNGSI MASUK MISI CEPAT & CERDAS (KEYBOARD E / KLIK BUTTON / MOBILE) ===
function triggerOpenCurrentOrNearMission() {
    // 1. Jika sedang berada dalam zona misi terbuka
    if (state.inZone !== -1 && state.inZone <= state.unlocked) {
        openMissionPopup(state.inZone);
        return;
    }

    // 2. Cari misi terbuka terdekat dalam radius toleran 35 meter
    let bestId = -1;
    let bestDist = 35;
    missions.forEach((m, idx) => {
        if (idx <= state.unlocked) {
            const d = camera.position.distanceTo(m.position);
            if (d < bestDist) {
                bestDist = d;
                bestId = idx;
            }
        }
    });

    if (bestId !== -1) {
        openMissionPopup(bestId);
        return;
    }

    // 3. Jika sedang mengarah ke misi saat ini dalam radius hingga 45m
    if (state.unlocked < missions.length) {
        const curM = missions[state.unlocked];
        const dist = Math.round(camera.position.distanceTo(curM.position));
        if (dist <= 45) {
            openMissionPopup(state.unlocked);
            return;
        }
        showAiMessage(`Kamu berjarak ${dist}m dari Misi ${state.unlocked + 1} (${curM.title}). Klik tombol [ ↗ ] di sidebar kiri untuk langsung menuju lokasi misi!`, true);
    }
}
window.triggerOpenCurrentOrNearMission = triggerOpenCurrentOrNearMission;

const onKeyDown = function (event) {
    const mModal = document.getElementById('materi-modal');
    if (mModal && !mModal.classList.contains('hidden')) {
        if (event.code === 'Escape') closeMateriModal();
        return;
    }
    if (!clamModal.classList.contains('hidden')) {
        if (event.code === 'Escape') closeClamModal();
        return;
    }
    const vModal = document.getElementById('view-modal');
    if (vModal && !vModal.classList.contains('hidden')) {
        if (event.code === 'Escape') closeViewModal();
        return;
    }
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW': moveForward = true; break;
        case 'ArrowLeft':
        case 'KeyA': moveLeft = true; break;
        case 'ArrowDown':
        case 'KeyS': moveBackward = true; break;
        case 'ArrowRight':
        case 'KeyD': moveRight = true; break;
        case 'Space': moveUp = true; break;
        case 'ShiftLeft': moveDown = true; break;
        case 'KeyE':
            triggerOpenCurrentOrNearMission();
            break;
        case 'KeyF':
            if (state.inClamZone) {
                openClamModal();
            } else {
                shoot();
            }
            break;
    }
};

const onKeyUp = function (event) {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW': moveForward = false; break;
        case 'ArrowLeft':
        case 'KeyA': moveLeft = false; break;
        case 'ArrowDown':
        case 'KeyS': moveBackward = false; break;
        case 'ArrowRight':
        case 'KeyD': moveRight = false; break;
        case 'Space': moveUp = false; break;
        case 'ShiftLeft': moveDown = false; break;
    }
};

document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);

/* ==========================================================================
   MOBILE CONTROLS — TOUCH JOYSTICK & BUTTONS (HIGH RESPONSIVENESS)
   ========================================================================== */
let joystickActive = false;
let joystickTouchId = null;
let joystickBaseCenterX = 0;
let joystickBaseCenterY = 0;
let joystickDeltaX = 0;
let joystickDeltaY = 0;
const joystickMaxRadius = 46;

// Look/camera touch
let lookTouchId = null;
let lookStartX = 0;
let lookStartY = 0;
const lookSensitivity = 0.0038;

const joystickBase = document.getElementById('joystick-base');
const joystickKnob = document.getElementById('joystick-knob');

function updateJoystickOrigin() {
    if (joystickBase) {
        const rect = joystickBase.getBoundingClientRect();
        joystickBaseCenterX = rect.left + rect.width / 2;
        joystickBaseCenterY = rect.top + rect.height / 2;
    }
}

function processJoystickMove(clientX, clientY) {
    if (!joystickActive) return;
    const dx = clientX - joystickBaseCenterX;
    const dy = clientY - joystickBaseCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clampedDist = Math.min(dist, joystickMaxRadius);
    const angle = Math.atan2(dy, dx);

    if (dist < 4) {
        joystickDeltaX = 0;
        joystickDeltaY = 0;
    } else {
        // Respons kurva progresif untuk pergerakan halus & lincah
        const norm = clampedDist / joystickMaxRadius;
        joystickDeltaX = Math.cos(angle) * norm;
        joystickDeltaY = Math.sin(angle) * norm;
    }

    const kx = Math.cos(angle) * clampedDist;
    const ky = Math.sin(angle) * clampedDist;
    if (joystickKnob) {
        joystickKnob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
    }
}

function resetJoystickState() {
    joystickActive = false;
    joystickTouchId = null;
    joystickDeltaX = 0;
    joystickDeltaY = 0;
    if (joystickKnob) {
        joystickKnob.style.transform = 'translate(-50%, -50%)';
    }
}

if (joystickBase) {
    // Touch events pada joystick base
    joystickBase.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (joystickActive) return;
        const touch = e.changedTouches[0];
        joystickActive = true;
        joystickTouchId = touch.identifier;
        updateJoystickOrigin();
        processJoystickMove(touch.clientX, touch.clientY);
    }, { passive: false });

    // Window listeners — gerak tetap mulus saat jari bergeser di layar
    window.addEventListener('touchmove', (e) => {
        if (!joystickActive || joystickTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier === joystickTouchId) {
                processJoystickMove(touch.clientX, touch.clientY);
                break;
            }
        }
    }, { passive: false });

    const handleTouchEnd = (e) => {
        if (!joystickActive || joystickTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === joystickTouchId) {
                resetJoystickState();
                break;
            }
        }
    };
    window.addEventListener('touchend', handleTouchEnd, { passive: false });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    // Pointer support untuk hybrid touch laptop / desktop testing
    joystickBase.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') return;
        e.preventDefault();
        joystickActive = true;
        joystickTouchId = 'pointer';
        updateJoystickOrigin();
        processJoystickMove(e.clientX, e.clientY);
    });

    window.addEventListener('pointermove', (e) => {
        if (!joystickActive || joystickTouchId !== 'pointer') return;
        processJoystickMove(e.clientX, e.clientY);
    });

    window.addEventListener('pointerup', (e) => {
        if (joystickActive && joystickTouchId === 'pointer') {
            resetJoystickState();
        }
    });
}

// Dynamic touch zone: sentuhan di area kiri bawah layar langsung mengaktifkan pergerakan
window.addEventListener('touchstart', (e) => {
    if (!isStarted || !clamModal.classList.contains('hidden')) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        // Sisi kiri layar (lebar < 45% dan tinggi > 35%) -> Aktifkan joystick
        if (touch.clientX < window.innerWidth * 0.45 && touch.clientY > window.innerHeight * 0.35) {
            if (!joystickActive) {
                joystickActive = true;
                joystickTouchId = touch.identifier;
                updateJoystickOrigin();
                processJoystickMove(touch.clientX, touch.clientY);
            }
        } else if (touch.clientX >= window.innerWidth * 0.40 && lookTouchId === null) {
            // Sisi kanan layar -> Menggeser sudut pandang kamera
            lookTouchId = touch.identifier;
            lookStartX = touch.clientX;
            lookStartY = touch.clientY;
        }
    }
}, { passive: true });

window.addEventListener('touchmove', (e) => {
    if (!isStarted || lookTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === lookTouchId) {
            const dx = touch.clientX - lookStartX;
            const dy = touch.clientY - lookStartY;
            lookStartX = touch.clientX;
            lookStartY = touch.clientY;
            // Rotasi kamera mobile mulus
            camera.rotation.order = 'YXZ';
            camera.rotation.y -= dx * lookSensitivity;
            camera.rotation.x -= dy * lookSensitivity;
            camera.rotation.x = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, camera.rotation.x));
            break;
        }
    }
}, { passive: true });

window.addEventListener('touchend', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === lookTouchId) {
            lookTouchId = null;
        }
    }
});

function getSafeForwardVector() {
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() > 0.0001) {
        fwd.normalize();
    } else {
        fwd.set(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y).normalize();
    }
    return fwd;
}

function startGameMobile() {
    onGameStart();
}

// Mobile action buttons
const mobBtnE = document.getElementById('mob-btn-e');
const mobBtnF = document.getElementById('mob-btn-f');
const mobBtnShoot = document.getElementById('mob-btn-shoot');
const mobBtnUp = document.getElementById('mob-btn-up');
const mobBtnDown = document.getElementById('mob-btn-down');
const mobBtnView = document.getElementById('mob-btn-view');

if (mobBtnE) {
    mobBtnE.addEventListener('touchstart', (e) => {
        e.preventDefault();
        triggerOpenCurrentOrNearMission();
    }, { passive: false });
    mobBtnE.addEventListener('click', () => {
        triggerOpenCurrentOrNearMission();
    });
}

// Klik langsung pada popup prompt di tengah bawah layar
const zonePromptEl = document.getElementById('zone-prompt');
if (zonePromptEl) {
    zonePromptEl.addEventListener('click', () => {
        triggerOpenCurrentOrNearMission();
    });
}

// Klik tombol "Masuk Misi" di HUD Objective atas
const btnEnterMission = document.getElementById('btn-enter-mission');
if (btnEnterMission) {
    btnEnterMission.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerOpenCurrentOrNearMission();
    });
}
if (mobBtnF) {
    mobBtnF.addEventListener('touchstart', (e) => {
        e.preventDefault();
        openClamModal();
    }, { passive: false });
    mobBtnF.addEventListener('click', () => {
        openClamModal();
    });
}
if (mobBtnShoot) {
    mobBtnShoot.addEventListener('touchstart', (e) => {
        e.preventDefault();
        shoot();
    }, { passive: false });
    mobBtnShoot.addEventListener('click', () => {
        shoot();
    });
}
if (mobBtnUp) {
    mobBtnUp.addEventListener('touchstart', (e) => { e.preventDefault(); moveUp = true; }, { passive: false });
    mobBtnUp.addEventListener('touchend', () => { moveUp = false; });
    mobBtnUp.addEventListener('mousedown', () => { moveUp = true; });
    mobBtnUp.addEventListener('mouseup', () => { moveUp = false; });
}
if (mobBtnDown) {
    mobBtnDown.addEventListener('touchstart', (e) => { e.preventDefault(); moveDown = true; }, { passive: false });
    mobBtnDown.addEventListener('touchend', () => { moveDown = false; });
    mobBtnDown.addEventListener('mousedown', () => { moveDown = true; });
    mobBtnDown.addEventListener('mouseup', () => { moveDown = false; });
}
if (mobBtnView) {
    mobBtnView.addEventListener('touchstart', (e) => {
        e.preventDefault();
        openViewModal();
    }, { passive: false });
    mobBtnView.addEventListener('click', () => {
        openViewModal();
    });
}
const mobBtnMateriEl = document.getElementById('mob-btn-materi');
if (mobBtnMateriEl) {
mobBtnMateriEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        openMateriModal('A');
    }, { passive: false });
    mobBtnMateriEl.addEventListener('click', () => {
        openMateriModal('A');
    });
}

// Tombol Fitur Tampilan di HUD top bar
const btnViewFeatures = document.getElementById('btn-view-features');
const viewModal = document.getElementById('view-modal');
const viewClose = document.getElementById('view-close');
const viewApplyBtn = document.getElementById('view-apply-btn');

function openViewModal() {
    if (viewModal) {
        viewModal.classList.remove('hidden');
        if (!isMobile && controls.isLocked) {
            controls.unlock();
        }
    }
}

function closeViewModal() {
    if (viewModal) {
        viewModal.classList.add('hidden');
        if (!isMobile && isStarted && !controls.isLocked) {
            controls.lock();
        }
    }
}

if (btnViewFeatures) btnViewFeatures.addEventListener('click', openViewModal);
if (viewClose) viewClose.addEventListener('click', closeViewModal);
if (viewApplyBtn) viewApplyBtn.addEventListener('click', closeViewModal);

// Tombol Kembali ke Pantai (Pohon Kelapa)
const mobBtnBeach = document.getElementById('mob-btn-beach');
const btnTeleportBeach = document.getElementById('btn-teleport-beach');

if (mobBtnBeach) {
    mobBtnBeach.addEventListener('touchstart', (e) => {
        e.preventDefault();
        teleportToBeach();
    }, { passive: false });
    mobBtnBeach.addEventListener('click', () => {
        teleportToBeach();
    });
}

if (btnTeleportBeach) {
    btnTeleportBeach.addEventListener('click', () => {
        teleportToBeach();
    });
}

/* --- SISTEM PENGATURAN SUASANA & FITUR TAMPILAN INTERAKTIF --- */
function setLightingMode(mode) {
    viewFeaturesState.lightingMode = mode;
    document.querySelectorAll('#opt-lighting-mode .opt-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    if (mode === 'day') {
        // Siang Tropis Cerah (Pantulan Pasir & Sinar Emas Matahari)
        scene.background.set(0x0ea5e9);
        scene.fog.color.set(0x38bdf8);
        scene.fog.density = 0.0036;
        ambientLight.color.set(0xe0f2fe);
        ambientLight.intensity = 1.25;
        hemiLight.color.set(0x38bdf8);
        hemiLight.groundColor.set(0xfef08a);
        dirLight.color.set(0xfffbeb);
        dirLight.intensity = 2.8;
        godRays.forEach(r => { r.material.color.set(0xfffbeb); r.material.opacity = 0.10; });
        showAiMessage("Suasana laut: Siang Tropis Cerah Madura. Sinar matahari emas menembus dasar pasir!", false);
    } else if (mode === 'sunset') {
        // Senja Keemasan Pesisir Madura (Hangat, Cerah & Berkilau Emas)
        scene.background.set(0x0284c7);
        scene.fog.color.set(0x38bdf8);
        scene.fog.density = 0.0042;
        ambientLight.color.set(0xfef3c7);
        ambientLight.intensity = 1.10;
        hemiLight.color.set(0xfb923c);
        hemiLight.groundColor.set(0xd97706);
        dirLight.color.set(0xfbbf24);
        dirLight.intensity = 2.4;
        godRays.forEach(r => { r.material.color.set(0xfde68a); r.material.opacity = 0.14; });
        showAiMessage("Suasana laut: Senja Keemasan Bahari. Nuansa emas hangat pesisir Madura!", false);
    } else if (mode === 'crystal' || mode === 'bioluminescent') {
        // Pagi Kristal Tropis Pesisir Madura (Sangat cerah, berkilau matahari pagi & air toska jernih)
        scene.background.set(0x38bdf8);
        scene.fog.color.set(0x7dd3fc);
        scene.fog.density = 0.0034;
        ambientLight.color.set(0xf0fdfa);
        ambientLight.intensity = 1.30;
        hemiLight.color.set(0x38bdf8);
        hemiLight.groundColor.set(0xfef9c3);
        dirLight.color.set(0xfffbeb);
        dirLight.intensity = 3.0;
        godRays.forEach(r => { r.material.color.set(0xfffbeb); r.material.opacity = 0.12; });
        showAiMessage("Suasana laut: Pagi Kristal Tropis. Sinar fajar cerah menyinari pesisir pantai & air laut jernih!", false);
    }
}

function setCameraMode(cam) {
    viewFeaturesState.cameraMode = cam;
    document.querySelectorAll('#opt-camera-mode .opt-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cam === cam);
    });
    if (cam === 'diver') {
        camera.fov = 75;
        camera.updateProjectionMatrix();
        showAiMessage("Mode kamera: Penyelam Imersif (First-Person).", false);
    } else if (cam === 'wide') {
        camera.fov = 95;
        camera.updateProjectionMatrix();
        showAiMessage("Mode kamera: Pandangan Luas Bawah Laut (Wide Panoramic).", false);
    }
}

function setBioScanner(enabled) {
    viewFeaturesState.bioScanner = enabled;
    document.querySelectorAll('#opt-scanner-mode .opt-btn').forEach(btn => {
        btn.classList.toggle('active', (btn.dataset.scanner === 'on') === enabled);
    });
    const container = document.getElementById('bio-scanner-container');
    if (container) container.style.display = enabled ? 'block' : 'none';
    showAiMessage(enabled ? "AI Bio-Scanner AKTIF. Label ilmiah biota laut muncul di layar!" : "AI Bio-Scanner DINONAKTIFKAN.", false);
}

function setQualityMode(mode) {
    viewFeaturesState.qualityMode = mode;
    document.querySelectorAll('#opt-quality-mode .opt-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.quality === mode);
    });
    if (mode === 'eco') {
        renderer.setPixelRatio(1.0);
        renderer.shadowMap.enabled = false;
        showAiMessage("Mode Hemat Daya HP aktif: performa 60 FPS stabil & hemat baterai.", false);
    } else {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.shadowMap.enabled = true;
        showAiMessage("Mode Kualitas HD aktif: efek grafis bayangan & visual maksimal.", false);
    }
}

// Pasang event listener untuk pilihan pengaturan
document.querySelectorAll('#opt-lighting-mode .opt-btn').forEach(btn => {
    btn.addEventListener('click', () => setLightingMode(btn.dataset.mode));
});
document.querySelectorAll('#opt-camera-mode .opt-btn').forEach(btn => {
    btn.addEventListener('click', () => setCameraMode(btn.dataset.cam));
});
document.querySelectorAll('#opt-scanner-mode .opt-btn').forEach(btn => {
    btn.addEventListener('click', () => setBioScanner(btn.dataset.scanner === 'on'));
});
document.querySelectorAll('#opt-quality-mode .opt-btn').forEach(btn => {
    btn.addEventListener('click', () => setQualityMode(btn.dataset.quality));
});

// Target spesimen AI Bio-Scanner dengan nama sains & peran ekologis
const bioScannerTargets = [
    { name: "Kerang Bambu (Lorjuk)", latin: "Solen sp.", role: "Organisme bentik pasir & filter feeder alami", pos: new THREE.Vector3(8, -0.2, -18) },
    { name: "Ikan Badut (Nemo)", latin: "Amphiprion ocellaris", role: "Simbiosis mutualisme dengan anemon laut", pos: new THREE.Vector3(12, 1, -18) },
    { name: "Blue Tang (Dory)", latin: "Paracanthurus hepatus", role: "Pemakan alga pengendali karang", pos: new THREE.Vector3(-18, 3, -35) },
    { name: "Penyu Hijau", latin: "Chelonia mydas", role: "Reptil laut penjaga padang lamun", pos: seaTurtle.position },
    { name: "Terumbu Karang", latin: "Acropora sp.", role: "Habitat utama 25% biota laut", pos: new THREE.Vector3(15, 0.5, -10) },
    { name: "Padang Lamun", latin: "Enhalus acoroides", role: "Penyerap karbon biru (Blue Carbon)", pos: new THREE.Vector3(-12, 0, -15) },
    { name: "Pusaran Sampah & Kotoran Palung", latin: "Accumulatio Plastica Abyssalis", role: "Endapan limbah plastik & jaring hantu yang mencemari palung laut", pos: new THREE.Vector3(0, -22, -90) }
];


/* ==========================================================================
   UI & GAMEPLAY LOGIC
   ========================================================================== */

function updateHUD() {
    document.getElementById('hud-science').innerText = state.science;
    document.getElementById('hud-care').innerText = state.care;
    document.getElementById('hud-points').innerText = state.points;
    document.getElementById('hud-health-num').innerText = state.health;
    document.getElementById('hud-health-bar').style.width = state.health + '%';

    let visibleBadges = ["Aksi Nyata", "Laut Seimbang", "Penjaga Laut", "Aksi Konservasi", "Ekosistem Seimbang", "Pejuang Biodiversitas"].filter(b => state.badges.has(b)).length;
    document.getElementById('hud-badges').innerText = visibleBadges + '/3';

    document.getElementById('hud-progress-label').innerText = state.completed.size + '/7';

    let y = camera.position.y;
    let label = "Permukaan Laut Madura";
    if (y < -5) label = "Zona Terumbu & Kerang Bambu";
    if (y < -20) label = "Zona Palung Selat Madura";
    document.getElementById('hud-depth-label').innerText = label;
}

function teleportToMission(index) {
    const m = missions[index];
    if (!m) return;
    // Posisikan kamera tepat di depan kristal dalam jarak ~5 meter
    camera.position.set(m.position.x, m.position.y + 1.2, m.position.z + 5.5);
    camera.lookAt(m.position.x, m.position.y + 3.0, m.position.z);
    state.inZone = index;
    const promptNameEl = document.getElementById('zone-prompt-name');
    if (promptNameEl) promptNameEl.innerText = `[ MISI ${index + 1} ] ${m.title}`;
    const zonePromptEl = document.getElementById('zone-prompt');
    if (zonePromptEl) zonePromptEl.classList.remove('hidden');
    showAiMessage(`🎯 Tiba di kawasan Misi ${index + 1}: ${m.title}. Tekan [E] atau klik tombol 'Masuk Misi' untuk mulai!`, true);
}
window.teleportToMission = teleportToMission;

function renderMissionMap() {
    const list = document.getElementById('hud-mission-list');
    list.innerHTML = '';

    missions.forEach((m, index) => {
        const div = document.createElement('div');
        div.className = 'm-node';
        const isUnlocked = index <= state.unlocked;
        const isDone = state.completed.has(index);
        const isCurrent = index === state.unlocked;

        if (isUnlocked) div.classList.add("is-open");
        if (isDone) div.classList.add("is-done");
        if (index === state.currentMission) div.classList.add("is-current");

        const titleColor = isCurrent ? '#facc15' : (isDone ? '#6ee7b7' : '#f8fafc');

        div.innerHTML = `
            <div class="m-node-num">${isDone ? "✓" : index + 1}</div>
            <div class="m-node-info" style="flex:1;">
                <strong style="color:${titleColor};">MISI ${index + 1}: ${m.title}</strong>
                <small>${m.tag}</small>
            </div>
            ${isUnlocked ? `<button class="m-node-teleport-btn" title="Arahkan ke Lokasi Misi ${index + 1}"><i class="fa-solid fa-location-arrow"></i></button>` : ''}
        `;

        div.style.cursor = 'pointer';
        div.title = isUnlocked ? `Klik untuk membuka Misi ${index + 1}` : 'Misi terkunci';

        const teleBtn = div.querySelector('.m-node-teleport-btn');
        if (teleBtn) {
            teleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                teleportToMission(index);
            });
        }

        div.addEventListener('click', () => {
            if (isUnlocked) {
                openMissionPopup(index);
            } else {
                showAiMessage(`Selesaikan Misi ${state.unlocked + 1} terlebih dahulu untuk membuka misi ini!`, true);
            }
        });

        list.appendChild(div);
    });

}

function showAiMessage(text, useVoice = true) {
    document.getElementById('ai-text').innerText = text;
    document.getElementById('ai-bubble').classList.remove('collapsed');

    const ping = document.querySelector('.ai-ping');
    ping.style.animation = 'none';
    setTimeout(() => ping.style.animation = 'ping 2s infinite', 10);

    if (useVoice) {
        speakAI(text);
    }
}

document.getElementById('ai-close-btn').addEventListener('click', () => {
    document.getElementById('ai-bubble').classList.add('collapsed');
});
document.getElementById('ai-avatar-btn').addEventListener('click', () => {
    document.getElementById('ai-bubble').classList.toggle('collapsed');
});

// MISSION POPUP LOGIC
const popup = document.getElementById('mission-popup');
const learning = createLearningUI({
    state,
    onComplete(index, result) {
        if (state.completed.has(index)) return;
        const mission = missions[index];
        state.completed.add(index);
        state.points += mission.points;
        state.science = Math.min(100, state.science + Math.round(mission.score.science * (result ? result.correct / result.total : 0)));
        state.care = Math.min(100, state.care + mission.score.care);
        state.health = Math.min(100, state.health + mission.score.health);
        if (mission.badge) state.badges.add(mission.badge);
        state.unlocked = Math.max(state.unlocked, Math.min(index + 1, missions.length - 1));
        showAiMessage(`Misi ${index + 1} selesai. ${result ? `Nilai: ${result.percent}/100. ` : ''}+${mission.points} poin penyelesaian.`, false);
        updateHUD();
        renderMissionMap();
        updateMissionBadges();
    },
    onChange() { updateHUD(); renderMissionMap(); },
    onOpen() {
        moveForward = moveBackward = moveLeft = moveRight = moveUp = moveDown = false;
        velocity.set(0, 0, 0);
        resetJoystickState();
        lookTouchId = null;
        if (!isMobile && controls.isLocked) controls.unlock();
        hideClickHint();
    },
    onClose() {
        if (!isMobile && isStarted && ['mission-popup', 'materi-modal', 'clam-modal', 'view-modal'].every(id => document.getElementById(id).classList.contains('hidden'))) showClickHint();
    },
    notify: message => showAiMessage(message, true),
    speak: speakAI
});

function openMissionPopup(id) { learning.openMission(id); }

// KERANG BAMBU (LORJUK) — LABORATORIUM 3D DARI FILE LOKAL
const clamModal = document.getElementById('clam-modal');
const btnClamClose = document.getElementById('clam-close');
const btnClamAction = document.getElementById('clam-action-btn');
const clamPrompt = document.getElementById('clam-prompt');

const clamLabFrame = document.getElementById('clam-lab-frame');
const clamLabStatus = document.getElementById('clam-lab-status');
let clamReturnFocus = null;

function setClamLabActive(active) {
    if (typeof clamLabFrame.contentWindow?.setLorjukActive === 'function') {
        clamLabFrame.contentWindow.setLorjukActive(active);
    }
}

clamLabFrame.addEventListener('load', () => {
    if (!clamLabFrame.hasAttribute('src')) return;
    const labWindow = clamLabFrame.contentWindow;
    if (labWindow.lorjukReady) {
        clamLabStatus.classList.add('hidden');
        setClamLabActive(!clamModal.classList.contains('hidden'));
    } else {
        clamLabStatus.textContent = 'Model 3D belum dapat dimuat. Coba muat ulang halaman; materi dan kuis tetap dapat dibaca jika tersedia.';
    }
    labWindow.document.addEventListener('keydown', (event) => {
        if (event.code === 'Escape' && !labWindow.document.fullscreenElement) {
            closeClamModal();
        }
    });
});

function openClamModal() {
    if (!clamModal.classList.contains('hidden')) return;
    clamReturnFocus = document.activeElement;
    clamModal.classList.remove('hidden');
    moveForward = moveBackward = moveLeft = moveRight = moveUp = moveDown = false;
    resetJoystickState();
    lookTouchId = null;
    if (!isMobile && controls.isLocked) controls.unlock();
    hideClickHint();
    if (!clamLabFrame.hasAttribute('src')) {
        clamLabFrame.src = clamLabFrame.dataset.src;
    } else {
        setClamLabActive(true);
    }
    btnClamClose.focus({ preventScroll: true });
    showAiMessage("Mengapa lorjuk khas Madura bersifat musiman? Buka Masalah lorjuk untuk menelaah kondisi lingkungan dan dugaan pengaruh plastik. Ikuti lima tahap pembelajaran pada bagian 7a, lalu gunakan model 3D untuk memahami cara hidup lorjuk!", true);
}

function closeClamModal() {
    if (clamModal.classList.contains('hidden')) return;
    setClamLabActive(false);
    clamModal.classList.add('hidden');
    clamReturnFocus?.focus({ preventScroll: true });
    if (!isMobile && isStarted && popup.classList.contains('hidden') && viewModal.classList.contains('hidden')) showClickHint();
}

document.getElementById('btn-open-clam').addEventListener('click', openClamModal);
if (btnClamClose) btnClamClose.addEventListener('click', closeClamModal);
if (btnClamAction) btnClamAction.addEventListener('click', closeClamModal);
if (clamPrompt) clamPrompt.addEventListener('click', openClamModal);

/* ==========================================================================
   MATERI EKOLOGI MODAL LOGIC (IPA 7 SMP KURIKULUM MERDEKA)
   ========================================================================== */
function openMateriModal(chapter = 'A') { learning.openMateri(chapter); }
function closeMateriModal() { learning.closeMateri(); }
window.openMateriModal = openMateriModal;
window.closeMateriModal = closeMateriModal;
window.switchMateriChapter = learning.switchChapter;
window.openPretest = learning.openPretest;

/* ==========================================================================
   COMBAT & MONSTER MECHANICS — Damai & Ramah Pendidikan SMP
   ========================================================================== */
const combatState = {
    projectiles: [],
    monsters: [],
    lastSpawnTime: performance.now(),
    spawnInterval: 48000 // Muncul setiap 48 detik jika menyelam di air (y < 12)
};

function playShootSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
}

function playDamageSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, audioCtx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
}

function playMonsterHitSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
}

function playTrashAlertSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(70, audioCtx.currentTime + 0.45);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.45);
}
const playMonsterRoarSound = playTrashAlertSound;

function createTrashRecycleBurst(pos) {
    const burstGroup = new THREE.Group();
    const count = 22;
    for (let i = 0; i < count; i++) {
        const bubGeo = new THREE.SphereGeometry(0.12 + Math.random() * 0.22, 6, 6);
        const bubMat = new THREE.MeshBasicMaterial({
            color: Math.random() > 0.4 ? 0x00e5ff : (Math.random() > 0.5 ? 0x10b981 : 0xfbbf24),
            transparent: true,
            opacity: 0.85
        });
        const p = new THREE.Mesh(bubGeo, bubMat);
        p.position.copy(pos);
        const angle = Math.random() * Math.PI * 2;
        const spd = 3 + Math.random() * 6;
        p.userData = {
            vx: Math.cos(angle) * spd,
            vy: (Math.random() - 0.1) * spd,
            vz: Math.sin(angle) * spd,
            life: 0.9
        };
        burstGroup.add(p);
    }
    scene.add(burstGroup);

    const burstAnim = () => {
        let alive = false;
        burstGroup.children.forEach(p => {
            p.userData.life -= 0.035;
            if (p.userData.life > 0) {
                p.position.x += p.userData.vx * 0.035;
                p.position.y += p.userData.vy * 0.035;
                p.position.z += p.userData.vz * 0.035;
                p.material.opacity = p.userData.life / 0.9;
                alive = true;
            }
        });
        if (alive) {
            requestAnimationFrame(burstAnim);
        } else {
            scene.remove(burstGroup);
        }
    };
    requestAnimationFrame(burstAnim);
}
const createMonsterBurst = createTrashRecycleBurst;

// Generator 3D Prosedural Kotoran & Sampah Laut (Marine Debris & Toxic Sludge Monster)
function createKotoranLautMonster(scale = 1.0, isBoss = false) {
    const group = new THREE.Group();
    const mats = [];

    // Bahan Dasar: Gumpalan Lumpur Limbah & Minyak Hitam Keruh
    const sludgeMat = new THREE.MeshPhongMaterial({
        color: isBoss ? 0x18181b : 0x27272a,
        emissive: isBoss ? 0x2e1065 : 0x064e3b,
        specular: 0x64748b,
        shininess: 25,
        flatShading: true
    });
    mats.push(sludgeMat);

    // Bahan Jaring Hantu & Tali Pancing Kusut (Ghost Fishing Net / Tangled Ropes)
    const ropeMat = new THREE.MeshPhongMaterial({
        color: isBoss ? 0x4c1d95 : 0x334155,
        emissive: isBoss ? 0x3b0764 : 0x0f172a,
        shininess: 40
    });
    mats.push(ropeMat);

    // Bahan Sampah Plastik Terapung (Botol Plastik, Kaleng, Styrofoam)
    const plasticMatBlue = new THREE.MeshPhongMaterial({
        color: 0x0284c7,
        emissive: 0x0369a1,
        transparent: true,
        opacity: 0.82,
        shininess: 90
    });
    const plasticMatRed = new THREE.MeshPhongMaterial({ color: 0xef4444, emissive: 0x450a0a, shininess: 70 });
    const plasticMatYellow = new THREE.MeshPhongMaterial({ color: 0xeab308, emissive: 0x422006, shininess: 60 });
    const styrofoamMat = new THREE.MeshPhongMaterial({ color: 0xf1f5f9, shininess: 10 });
    mats.push(plasticMatBlue, plasticMatRed, plasticMatYellow, styrofoamMat);

    // 1. Inti Gumpalan Limbah (Core Sludge Clusters - Bentuk kotoran sampah laut ireguler)
    const core1Geo = new THREE.DodecahedronGeometry(1.5 * scale, 1);
    const core1 = new THREE.Mesh(core1Geo, sludgeMat);
    core1.scale.set(1.4, 0.95, 1.1);
    group.add(core1);

    const core2Geo = new THREE.DodecahedronGeometry(1.15 * scale, 1);
    const core2 = new THREE.Mesh(core2Geo, sludgeMat);
    core2.position.set(0.75 * scale, 0.35 * scale, -0.3 * scale);
    group.add(core2);

    const core3Geo = new THREE.DodecahedronGeometry(0.95 * scale, 1);
    const core3 = new THREE.Mesh(core3Geo, sludgeMat);
    core3.position.set(-0.7 * scale, -0.3 * scale, 0.4 * scale);
    group.add(core3);

    // 2. Sampah Plastik yang Menancap & Terperangkap (Trapped Marine Litter)
    // Botol Plastik Bekas Terapung
    const bottleGeo = new THREE.CylinderGeometry(0.14 * scale, 0.14 * scale, 0.75 * scale, 6);
    const bottle1 = new THREE.Mesh(bottleGeo, plasticMatBlue);
    bottle1.position.set(0.9 * scale, 0.9 * scale, 0.5 * scale);
    bottle1.rotation.set(0.6, 0.3, 0.4);
    group.add(bottle1);

    const bottle2 = new THREE.Mesh(bottleGeo, plasticMatBlue);
    bottle2.position.set(-0.8 * scale, 0.7 * scale, -0.6 * scale);
    bottle2.rotation.set(-0.5, 0.8, -0.3);
    group.add(bottle2);

    // Kaleng Minuman Berkarat / Limbah Kemasan
    const canGeo = new THREE.CylinderGeometry(0.18 * scale, 0.18 * scale, 0.45 * scale, 6);
    const can1 = new THREE.Mesh(canGeo, plasticMatRed);
    can1.position.set(0.4 * scale, -0.8 * scale, 0.8 * scale);
    can1.rotation.set(0.2, 0.9, 0.7);
    group.add(can1);

    const can2 = new THREE.Mesh(canGeo, plasticMatYellow);
    can2.position.set(1.2 * scale, -0.2 * scale, -0.7 * scale);
    can2.rotation.set(-0.4, 0.2, 0.9);
    group.add(can2);

    // Serpihan Styrofoam & Mikroplastik Terapung
    const styroGeo = new THREE.BoxGeometry(0.35 * scale, 0.25 * scale, 0.3 * scale);
    for (let s = 0; s < 5; s++) {
        const styro = new THREE.Mesh(styroGeo, styrofoamMat);
        const sAngle = (s / 5) * Math.PI * 2;
        styro.position.set(
            Math.cos(sAngle) * 1.35 * scale,
            (Math.sin(s * 2) * 0.5) * scale,
            Math.sin(sAngle) * 1.35 * scale
        );
        styro.rotation.set(Math.random(), Math.random(), Math.random());
        group.add(styro);
    }

    // Kantong Kresek Plastik Robek (Floating Plastic Sheet)
    const bagGeo = new THREE.BoxGeometry(0.8 * scale, 0.04 * scale, 0.7 * scale);
    const bag = new THREE.Mesh(bagGeo, plasticMatBlue);
    bag.position.set(0, 1.3 * scale, 0);
    bag.rotation.set(0.2, 0.5, -0.1);
    group.add(bag);

    // 3. Aura Pendaran Kimia Toksik (Toxic Sludge Glow)
    const toxicEyeMat = new THREE.MeshBasicMaterial({ color: isBoss ? 0xa855f7 : 0x22c55e });
    const toxicGlow1 = new THREE.Mesh(new THREE.SphereGeometry(0.25 * scale, 8, 8), toxicEyeMat);
    toxicGlow1.position.set(0.85 * scale, 0.3 * scale, 0.6 * scale);
    group.add(toxicGlow1);

    const toxicGlow2 = new THREE.Mesh(new THREE.SphereGeometry(0.25 * scale, 8, 8), toxicEyeMat);
    toxicGlow2.position.set(0.85 * scale, 0.3 * scale, -0.6 * scale);
    group.add(toxicGlow2);

    // 4. Untaian Jaring Hantu Mengambang & Tali Tambang Terbelit (Tangled Ghost Nets & Ropes)
    const ropeGeo = new THREE.CylinderGeometry(0.08 * scale, 0.04 * scale, 2.2 * scale, 6);

    const tentacleL = new THREE.Group();
    tentacleL.position.set(0.5 * scale, -0.3 * scale, 1.2 * scale);
    tentacleL.name = 'flipperL';
    const ropeL = new THREE.Mesh(ropeGeo, ropeMat);
    ropeL.position.set(0, -0.8 * scale, 0);
    ropeL.rotation.z = -0.3;
    tentacleL.add(ropeL);
    group.add(tentacleL);

    const tentacleR = new THREE.Group();
    tentacleR.position.set(0.5 * scale, -0.3 * scale, -1.2 * scale);
    tentacleR.name = 'flipperR';
    const ropeR = new THREE.Mesh(ropeGeo, ropeMat);
    ropeR.position.set(0, -0.8 * scale, 0);
    ropeR.rotation.z = 0.3;
    tentacleR.add(ropeR);
    group.add(tentacleR);

    // Ekor Jaring Hantu Panjang di Belakang
    const tailNet = new THREE.Group();
    tailNet.position.set(-1.6 * scale, 0, 0);
    tailNet.name = 'tail';

    const netTailGeo = new THREE.CylinderGeometry(0.12 * scale, 0.05 * scale, 2.8 * scale, 6);
    netTailGeo.rotateZ(Math.PI / 2);
    const netTail = new THREE.Mesh(netTailGeo, ropeMat);
    netTail.position.set(-1.2 * scale, 0, 0);
    tailNet.add(netTail);

    const trashKnot = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 * scale, 1), sludgeMat);
    trashKnot.position.set(-2.5 * scale, 0, 0);
    tailNet.add(trashKnot);

    group.add(tailNet);

    // Metadata untuk animasi & sistem HP pembersihan
    group.userData = {
        hp: isBoss ? 6 : 3,
        maxHp: isBoss ? 6 : 3,
        scale: scale,
        isBoss: isBoss,
        isTrash: true,
        mats: mats,
        flashTimer: 0,
        originalEmissive: mats.map(m => m.emissive ? m.emissive.getHex() : 0x000000)
    };

    return group;
}
const createSeaMonster = createKotoranLautMonster;
window.createKotoranLautMonster = createKotoranLautMonster;
window.createSeaMonster = createKotoranLautMonster;

// Pusaran Sampah & Kotoran Palung Raksasa (Deep Sea Marine Debris Vortex)
const deepLeviathan = createKotoranLautMonster(3.5, true);
deepLeviathan.position.set(0, -22, -90);
deepLeviathan.userData = {
    ...deepLeviathan.userData,
    centerX: 0,
    centerZ: -90,
    baseY: -22,
    radiusX: 45,
    radiusZ: 35,
    angle: 0,
    speed: 0.22,
    isPatrol: true
};
scene.add(deepLeviathan);
window.deepLeviathan = deepLeviathan;

// Pastikan koordinat AI Bio-Scanner terhubung ke Pusaran Sampah Palung
if (typeof bioScannerTargets !== 'undefined') {
    const levTarget = bioScannerTargets.find(t => t.name && (t.name.includes("Sampah") || t.name.includes("Leviathan")));
    if (levTarget) levTarget.pos = deepLeviathan.position;
}

function shoot() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    playShootSound();

    const geometry = new THREE.SphereGeometry(0.25, 6, 6);
    const material = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
    const projectile = new THREE.Mesh(geometry, material);

    projectile.position.copy(camera.position);

    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    projectile.userData.velocity = dir.multiplyScalar(60);
    projectile.userData.life = 2.0;

    scene.add(projectile);
    combatState.projectiles.push(projectile);
}
window.shoot = shoot;

function spawnMonster() {
    const monster = createKotoranLautMonster(1.3 + Math.random() * 0.4, false);

    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();

    // Munculkan di depan pemain pada jarak ~36m di kedalaman air
    const spawnDist = 36;
    monster.position.copy(camera.position).add(dir.multiplyScalar(spawnDist));
    monster.position.x += (Math.random() - 0.5) * 16;
    const targetY = Math.min(10, camera.position.y + (Math.random() - 0.5) * 6);
    monster.position.y = targetY;

    // Arahkan monster menghadap kamera
    monster.lookAt(camera.position);

    scene.add(monster);
    combatState.monsters.push(monster);

    playTrashAlertSound();
    showAiMessage("⚠️ Deteksi Pencemaran: Gumpalan Kotoran & Sampah Plastik Laut mendekat! Bersihkan dengan Sinar Konservasi (Klik Kiri / [F] / Tombol ⚡)!", true);
}
window.spawnSeaMonster = spawnMonster;
window.spawnKotoranLaut = spawnMonster;

function takeDamage(amount) {
    playDamageSound();
    state.health -= amount;

    const overlay = document.getElementById('damage-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        void overlay.offsetWidth;
        overlay.classList.add('active');
        setTimeout(() => overlay.classList.remove('active'), 200);
    }

    if (state.health <= 0) {
        state.health = 100;
        state.science = Math.max(0, state.science - 10);
        state.care = Math.max(0, state.care - 10);
        showAiMessage("Peringatan! Limbah kotoran laut mencemari air dan merusak ekosistem. Poin sains dan kepedulianmu berkurang 10. Ayo bersihkan laut!", true);
    } else {
        showAiMessage("Ouch! Kamu terpapar limbah kotoran laut terapung! Segera bersihkan sebelum merusak ekosistem!", true);
    }
    updateHUD();
}

document.addEventListener('mousedown', (e) => {
    if (controls.isLocked && e.button === 0) {
        shoot();
    }
});

/* ==========================================================================
   ANIMATION LOOP
   ========================================================================== */
let prevTime = performance.now();
let frameCount = 0;
let stepCycle = 0;
let isSwimming = false;

function animate() {
    requestAnimationFrame(animate);
    frameCount++;

    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    // Fokuskan GPU ke laboratorium dan hentikan gerakan pemain saat observasi.
    if (!clamModal.classList.contains('hidden')) {
        prevTime = time;
        return;
    }

    // === SISTEM PERGERAKAN TERPADU: BERJALAN DI ATAS PASIR & BERENANG DI LAUT ===
    if (isStarted) {
        const forward = getSafeForwardVector();
        // Vektor horisontal murni agar berjalan di pasir tidak terpengaruh pitch kamera
        const horizForward = new THREE.Vector3(forward.x, 0, forward.z).normalize();
        const horizRight = new THREE.Vector3().crossVectors(horizForward, new THREE.Vector3(0, 1, 0)).normalize();
        const moveVec = new THREE.Vector3(0, 0, 0);

        // 1. Virtual Joystick
        if (joystickDeltaX !== 0 || joystickDeltaY !== 0) {
            moveVec.addScaledVector(horizForward, -joystickDeltaY);
            moveVec.addScaledVector(horizRight, joystickDeltaX);
        }

        // 2. Keyboard Movement (WASD / Panah)
        const hasKeyMovement = moveForward || moveBackward || moveLeft || moveRight;
        if (hasKeyMovement) {
            const fwdAmount = Number(moveForward) - Number(moveBackward);
            const rgtAmount = Number(moveRight) - Number(moveLeft);
            moveVec.addScaledVector(horizForward, fwdAmount);
            moveVec.addScaledVector(horizRight, rgtAmount);
        }

        const isMoving = moveVec.lengthSq() > 0.0001;
        if (isMoving) {
            if (moveVec.lengthSq() > 1.0) moveVec.normalize();
            camera.position.addScaledVector(moveVec, speed * delta);
        }

        // Pergerakan vertikal (berenang di kolom air laut)
        if (moveUp) {
            camera.position.y += speed * 0.70 * delta;
            isSwimming = true;
        }
        if (moveDown) {
            camera.position.y -= speed * 0.70 * delta;
        }

        // Kontur pasir & batas ketinggian kaki player di atas pasir
        const terrainY = getTerrainHeight(camera.position.x, camera.position.z);
        const playerEyeHeight = 1.7;
        const groundWalkY = terrainY + playerEyeHeight;

        // Kondisi berjalan di atas pasir: di daratan pantai & lereng (z >= 10) atau saat menyentuh dasar laut
        const onBeachOrSlope = camera.position.z >= 10;
        const touchingSeafloor = camera.position.y <= groundWalkY + 0.50;

        if (touchingSeafloor && !moveUp) {
            isSwimming = false;
        }

        if (onBeachOrSlope || (!isSwimming && touchingSeafloor)) {
            // Berjalan alami di atas pasir dengan langkah kaki (footstep bobbing)
            if (isMoving) {
                stepCycle += delta * 8.5;
                const bob = Math.sin(stepCycle) * 0.04;
                camera.position.y = THREE.MathUtils.lerp(camera.position.y, groundWalkY + bob, 0.35);
            } else {
                camera.position.y = THREE.MathUtils.lerp(camera.position.y, groundWalkY, 0.25);
            }
        } else {
            // Berenang bebas di kolom air lautan
            if (camera.position.y < groundWalkY) {
                camera.position.y = groundWalkY;
                isSwimming = false;
            }
            if (camera.position.y > 22.0) {
                camera.position.y = 22.0;
            }
        }
    }

    if (isStarted || controls.isLocked) {
        if (fishMixer) {
            fishMixer.update(delta);
        }

        // Animasi Biota Laut Tropis (Ikan Badut, Blue Tang, Penyu Hijau)
        if (typeof activeTropicalFish !== 'undefined' && activeTropicalFish.length > 0) {
            activeTropicalFish.forEach((f) => {
                const u = f.userData;
                if (!u) return;
                if (u.type === 'clownfish' || u.type === 'bluetang') {
                    const curAngle = time * 0.001 * u.speed + u.phase;
                    f.position.x = u.baseX + Math.cos(curAngle) * u.radius;
                    f.position.z = u.baseZ + Math.sin(curAngle) * u.radius;
                    f.position.y = u.baseY + Math.sin(curAngle * 2) * 0.45;
                    f.rotation.y = -curAngle + Math.PI / 2;
                    const tail = f.getObjectByName('tail');
                    if (tail) tail.rotation.y = Math.sin(time * 0.012 * u.speed) * 0.35;
                } else if (u.type === 'turtle') {
                    u.angle += delta * u.speed * 0.25;
                    f.position.x = u.centerX + Math.cos(u.angle) * u.radius;
                    f.position.z = u.centerZ + Math.sin(u.angle) * u.radius;
                    f.position.y = 4 + Math.sin(u.angle * 2) * 1.5;
                    f.rotation.y = -u.angle - Math.PI / 2;
                    f.rotation.z = Math.sin(u.angle * 2) * 0.06;
                    const fL = f.getObjectByName('flipperL');
                    const fR = f.getObjectByName('flipperR');
                    const wave = Math.sin(time * 0.003) * 0.28;
                    if (fL) fL.rotation.z = 0.2 + wave;
                    if (fR) fR.rotation.z = -0.2 - wave;
                }
            });
        }

        // AI Bio-Scanner: Proyeksi label ilmiah 3D ke koordinat layar
        if (viewFeaturesState.bioScanner) {
            const scannerContainer = document.getElementById('bio-scanner-container');
            if (scannerContainer && Math.floor(time) % 2 === 0) {
                let htmlStr = '';
                const halfW = window.innerWidth / 2;
                const halfH = window.innerHeight / 2;
                const tempVec = new THREE.Vector3();

                bioScannerTargets.forEach((t) => {
                    tempVec.copy(t.pos);
                    const dist = camera.position.distanceTo(tempVec);
                    if (dist > 38) return; // Hanya tampilkan jika dalam radius 38 meter

                    tempVec.project(camera);
                    // Pastikan objek berada di depan kamera (z < 1)
                    if (tempVec.z < 1) {
                        const screenX = (tempVec.x * halfW) + halfW;
                        const screenY = -(tempVec.y * halfH) + halfH;
                        // Pastikan masih di dalam layar
                        if (screenX > 10 && screenX < window.innerWidth - 10 && screenY > 10 && screenY < window.innerHeight - 10) {
                            htmlStr += `
                                <div class="bio-label-3d" style="left:${screenX}px; top:${screenY - 24}px;">
                                    <i class="fa-solid fa-barcode"></i>
                                    <span><strong>${t.name}</strong> <em>(${t.latin})</em></span>
                                </div>
                            `;
                        }
                    }
                });
                scannerContainer.innerHTML = htmlStr;
            }
        }

        // Animasi Giant Deep Leviathan di Palung Laut
        if (typeof deepLeviathan !== 'undefined' && deepLeviathan) {
            const lu = deepLeviathan.userData;
            lu.angle += delta * lu.speed * 0.25;
            deepLeviathan.position.x = lu.centerX + Math.cos(lu.angle) * lu.radiusX;
            deepLeviathan.position.z = lu.centerZ + Math.sin(lu.angle) * lu.radiusZ;
            deepLeviathan.position.y = lu.baseY + Math.sin(lu.angle * 2) * 2.8;

            const nextX = lu.centerX + Math.cos(lu.angle + 0.05) * lu.radiusX;
            const nextZ = lu.centerZ + Math.sin(lu.angle + 0.05) * lu.radiusZ;
            deepLeviathan.lookAt(nextX, deepLeviathan.position.y, nextZ);

            const lTail = deepLeviathan.getObjectByName('tail');
            if (lTail) lTail.rotation.y = Math.sin(time * 0.0035) * 0.45;
            const lFL = deepLeviathan.getObjectByName('flipperL');
            const lFR = deepLeviathan.getObjectByName('flipperR');
            if (lFL) lFL.rotation.z = -0.2 + Math.sin(time * 0.0025) * 0.25;
            if (lFR) lFR.rotation.z = -0.2 - Math.sin(time * 0.0025) * 0.25;
        }

        // COMBAT LOGIC
        for (let i = combatState.projectiles.length - 1; i >= 0; i--) {
            const p = combatState.projectiles[i];
            p.position.addScaledVector(p.userData.velocity, delta);
            p.userData.life -= delta;

            if (p.userData.life <= 0) {
                scene.remove(p);
                combatState.projectiles.splice(i, 1);
                continue;
            }

            for (let j = combatState.monsters.length - 1; j >= 0; j--) {
                const m = combatState.monsters[j];
                const hitDist = (m.userData.scale || 1.0) * 3.2;
                if (p.position.distanceTo(m.position) < hitDist) {
                    playMonsterHitSound();
                    scene.remove(p);
                    combatState.projectiles.splice(i, 1);

                    // Kurangi HP monster
                    m.userData.hp = (m.userData.hp || 3) - 1;
                    m.userData.flashTimer = 0.18;
                    if (m.userData.mats) {
                        m.userData.mats.forEach(mat => mat.emissive.setHex(0xffffff));
                    }

                    if (m.userData.hp <= 0) {
                        createMonsterBurst(m.position);
                        scene.remove(m);
                        combatState.monsters.splice(j, 1);
                        state.points += 50;
                        state.care = Math.min(100, state.care + 5);
                        updateHUD();
                        showAiMessage("🎉 Bersih! Gumpalan Kotoran & Sampah Plastik berhasil didaur ulang (+50 Poin Konservasi)!", true);
                    } else {
                        showAiMessage(`💥 Kena! Sampah laut mulai terurai (Sisa Daya Rusak: ${m.userData.hp}/${m.userData.maxHp || 3})! Tembak lagi hingga bersih tuntas!`, true);
                    }
                    break;
                }
            }
        }

        for (let j = combatState.monsters.length - 1; j >= 0; j--) {
            const m = combatState.monsters[j];

            const dir = new THREE.Vector3();
            dir.subVectors(camera.position, m.position).normalize();
            m.position.addScaledVector(dir, 6.2 * delta);
            m.lookAt(camera.position);

            const tail = m.getObjectByName('tail');
            if (tail) tail.rotation.y = Math.sin(time * 0.009) * 0.45;
            const fL = m.getObjectByName('flipperL');
            const fR = m.getObjectByName('flipperR');
            if (fL) fL.rotation.z = -0.2 + Math.sin(time * 0.005) * 0.3;
            if (fR) fR.rotation.z = -0.2 - Math.sin(time * 0.005) * 0.3;

            if (m.userData.flashTimer > 0) {
                m.userData.flashTimer -= delta;
                if (m.userData.flashTimer <= 0 && m.userData.mats && m.userData.originalEmissive) {
                    m.userData.mats.forEach((mat, idx) => {
                        mat.emissive.setHex(m.userData.originalEmissive[idx]);
                    });
                }
            }

            if (m.position.distanceTo(camera.position) < 3.2) {
                scene.remove(m);
                combatState.monsters.splice(j, 1);
                takeDamage(20);
            }
        }

        if (time - combatState.lastSpawnTime > combatState.spawnInterval) {
            combatState.lastSpawnTime = time;
            if (camera.position.y < 12 && combatState.monsters.length < 2) {
                spawnMonster();
            }
        }

        // Check Zones
        let nearZone = -1;
        zones.forEach(z => {
            z.icon.rotation.y += 1 * delta;
            z.icon.position.y = z.mesh.position.y + 6 + Math.sin(time * 0.003) * 0.5;
            if (z.badgeSprite) {
                // Posisi badge melayang tinggi di atas dengan nomor jelas di atas
                z.badgeSprite.position.y = z.mesh.position.y + 11.5 + Math.sin(time * 0.003 + z.id) * 0.45;
            }

            const dist = camera.position.distanceTo(z.mesh.position);
            // Radius toleransi 25 meter agar tombol E dan prompt interaksi selalu aktif saat pemain mendekat
            if (dist < 25) {
                nearZone = z.id;
                z.mesh.material.color.setHex(0xfbbf24); // kuning saat dekat
            } else {
                z.mesh.material.color.setHex(0x00bcd4); // cyan laut normal
            }
        });

        // Update Objective HUD and Beacons (Semua pilar cahaya terlihat jelas di dunia 3D)
        const nextId = state.unlocked;
        zones.forEach(z => {
            if (z.id === nextId) {
                z.beacon.visible = true;
                z.beacon.material.color.setHex(0x00e5ff);
                z.beacon.material.opacity = 0.35 + Math.sin(time * 0.006) * 0.20;
            } else if (state.completed.has(z.id)) {
                z.beacon.visible = true;
                z.beacon.material.color.setHex(0x10b981);
                z.beacon.material.opacity = 0.14;
            } else {
                z.beacon.visible = true;
                z.beacon.material.color.setHex(0x38bdf8);
                z.beacon.material.opacity = 0.09;
            }
        });

        if (nextId < missions.length) {
            const targetPos = missions[nextId].position;
            const dist = camera.position.distanceTo(targetPos);
            document.getElementById('obj-name').innerText = `MISI ${nextId + 1}: ${missions[nextId].title}`;
            document.getElementById('obj-dist').innerText = Math.floor(dist) + 'm';
            document.getElementById('hud-objective').style.display = 'flex';
        } else {
            document.getElementById('hud-objective').style.display = 'none';
        }

        if (nearZone !== state.inZone) {
            state.inZone = nearZone;
            if (nearZone !== -1) {
                document.getElementById('zone-prompt-name').innerText = `[ MISI ${nearZone + 1} ] ${missions[nearZone].title}`;
                document.getElementById('zone-prompt').classList.remove('hidden');
                if (!isMobile) document.getElementById('crosshair').classList.add('active');
                // Mobile: highlight mission button
                if (isMobile && mobBtnE) mobBtnE.classList.add('mob-btn-active');
            } else {
                document.getElementById('zone-prompt').classList.add('hidden');
                if (!isMobile) document.getElementById('crosshair').classList.remove('active');
                if (isMobile && mobBtnE) mobBtnE.classList.remove('mob-btn-active');
            }
        }

        // Check Kerang Bambu Observation Proximity
        let nearClam = false;
        if (typeof clamObservationPos !== 'undefined') {
            const distClam = camera.position.distanceTo(clamObservationPos);
            if (distClam < 9) {
                nearClam = true;
            }
        }
        if (nearClam !== state.inClamZone) {
            state.inClamZone = nearClam;
            const clamPromptEl = document.getElementById('clam-prompt');
            const mobClamBtnEl = document.getElementById('mob-btn-f');
            if (clamPromptEl) {
                if (nearClam) {
                    clamPromptEl.classList.remove('hidden');
                    if (mobClamBtnEl) mobClamBtnEl.classList.add('mob-btn-active');
                } else {
                    clamPromptEl.classList.add('hidden');
                    if (mobClamBtnEl) mobClamBtnEl.classList.remove('mob-btn-active');
                }
            }
        }

        // Show fly/up prompt
        if (camera.position.y > 0) {
            document.getElementById('dive-prompt').classList.remove('hidden');
        } else {
            document.getElementById('dive-prompt').classList.add('hidden');
        }

        // Animate Kerang Bambu (Lorjuk) filter feeding & breathing
        if (typeof kerangBambuList !== 'undefined') {
            kerangBambuList.forEach(clam => {
                const pulse = Math.sin(time * 0.002 * clam.speed + clam.phase);
                clam.leftValve.rotation.z = pulse * 0.04;
                clam.rightValve.rotation.z = -pulse * 0.04;
                clam.siphonGroup.scale.y = 1 + pulse * 0.12;

                clam.bubbleTimer += delta;
                if (clam.bubbleTimer > 3.0 + Math.random() * 2.5) {
                    clam.bubbleTimer = 0;
                    createClamBubble(clam.worldPos.x, clam.worldPos.y + 3.2 * clam.baseScale, clam.worldPos.z);
                }
            });
        }

        // Animate Kerang Bambu bubbles
        if (typeof clamBubbles !== 'undefined') {
            for (let bIdx = clamBubbles.length - 1; bIdx >= 0; bIdx--) {
                const b = clamBubbles[bIdx];
                b.userData.life += delta;
                b.position.y += b.userData.speedY * delta;
                b.position.x = b.userData.baseX + Math.sin(time * 0.003 * b.userData.swaySpeed) * 0.15;
                if (b.userData.life >= b.userData.maxLife || b.position.y > 16) {
                    scene.remove(b);
                    clamBubbles.splice(bIdx, 1);
                }
            }
        }

        // Animate Kerang Bambu Observation Icon & Beacon
        if (typeof clamIcon !== 'undefined' && typeof clamBeacon !== 'undefined') {
            clamIcon.rotation.y += delta * 1.2;
            clamIcon.rotation.x = Math.sin(time * 0.002) * 0.2;
            clamIcon.position.y = clamObservationPos.y + 5.5 + Math.sin(time * 0.003) * 0.4;
            clamBeacon.material.opacity = 0.2 + Math.sin(time * 0.004) * 0.15;
        }

        if (Math.floor(time) % 10 === 0) updateHUD();
    }

    /* --- DEPTH-BASED COLOR SHIFT (HANYA AKTIF SAAT MODE SIANG TROPIS) --- */
    const camY = camera.position.y;
    if (viewFeaturesState.lightingMode === 'day') {
        let depthA, depthB, depthT;
        if (camY > 10) {
            depthA = depthColors.shallow; depthB = depthColors.shallow; depthT = 0;
        } else if (camY > 0) {
            depthA = depthColors.shallow; depthB = depthColors.mid; depthT = 1 - camY / 10;
        } else if (camY > -15) {
            depthA = depthColors.mid; depthB = depthColors.deep; depthT = -camY / 15;
        } else {
            depthA = depthColors.deep; depthB = depthColors.abyss; depthT = Math.min(1, (-camY - 15) / 25);
        }
        scene.background.lerpColors(depthA.bg, depthB.bg, depthT);
        scene.fog.color.lerpColors(depthA.fog, depthB.fog, depthT);
        scene.fog.density = depthA.fogDensity + (depthB.fogDensity - depthA.fogDensity) * depthT;
        ambientLight.intensity = depthA.ambient + (depthB.ambient - depthA.ambient) * depthT;
    }

    // God rays visible and radiant all the way down to the sandy seabed (tetap benderang siang hari)
    const godRayVisibility = Math.max(0.45, Math.min(1, (camY + 25) / 35));
    godRays.forEach(ray => {
        const pulse = Math.sin(time * 0.001 * ray.userData.speed + ray.userData.phase);
        ray.material.opacity = ray.userData.baseOpacity * godRayVisibility * (0.7 + 0.3 * pulse);
        ray.position.x = ray.userData.baseX + Math.sin(time * 0.0003 + ray.userData.phase) * 2;
    });

    // Light shafts animation
    shaftGroup.children.forEach(shaft => {
        const pulse = Math.sin(time * 0.0008 + shaft.userData.phase);
        shaft.material.opacity = shaft.userData.baseOpacity * godRayVisibility * (0.6 + 0.4 * pulse);
    });

    // Deep sea lights - maintain bright tropical clarity
    const deepFactor = Math.max(0, Math.min(1, (-camY) / 20));
    deepLight1.intensity = 1.2 + deepFactor * 0.8 + Math.sin(time * 0.001) * 0.3;
    deepLight2.intensity = 1.0 + deepFactor * 0.6 + Math.cos(time * 0.0012) * 0.3;

    // Caustics visibility on the golden sand (kilau cahaya di atas pasir)
    const causticsVisibility = Math.max(0.40, Math.min(1, (camY + 20) / 25));
    causticsPlaneMat.opacity = 0.28 * causticsVisibility;
    if (Math.floor(time * 0.05) % 4 === 0) updateCaustics(time);

    // Underwater overlay depth
    const overlayEl = document.getElementById('underwater-overlay');
    if (overlayEl) {
        const depthPercent = Math.min(1, Math.max(0, (-camY + 5) / 40));
        overlayEl.style.setProperty('--depth-opacity', depthPercent.toFixed(2));
    }

    /* --- CAMERA SWAY (arus laut) --- */
    if (cameraSway.enabled && isStarted) {
        const swayX = Math.sin(time * 0.001 * cameraSway.speedX) * cameraSway.intensity * 0.01;
        const swayY = Math.sin(time * 0.001 * cameraSway.speedY + 1.5) * cameraSway.intensity * 0.008;
        const swayZ = Math.sin(time * 0.001 * cameraSway.speedZ + 3.0) * cameraSway.intensity * 0.005;
        camera.position.x += swayX;
        camera.position.y += swayY;
        camera.position.z += swayZ;
        if (!isMobile && controls.isLocked) {
            camera.rotation.z = Math.sin(time * 0.0004) * cameraSway.rollIntensity;
        }
    }

    // Animate Particles (gelembung & plankton melayang)
    const posAttribute = particlesGeo.attributes.position;
    for (let i = 0; i < particleCount; i++) {
        let y = posAttribute.getY(i);
        let x = posAttribute.getX(i);
        y += particleVel[i];
        x += Math.sin(time * 0.0008 + i) * 0.015;
        if (y > 20) y = -30;
        posAttribute.setY(i, y);
        posAttribute.setX(i, x);
    }
    posAttribute.needsUpdate = true;

    // Marine snow horizontal drift
    const msPositions = marineSnowGeo.attributes.position;
    for (let i = 0; i < marineSnowCount; i++) {
        let mx = msPositions.getX(i);
        let my = msPositions.getY(i);
        let mz = msPositions.getZ(i);
        const vel = msVel[i];
        mx += vel.x * delta;
        my += vel.y * delta + Math.sin(time * 0.001 + vel.wobblePhase) * 0.003;
        mz += vel.z * delta;
        if (mx > 100) mx = -100;
        if (mx < -100) mx = 100;
        if (my < -30) my = 20;
        if (my > 20) my = -30;
        if (mz > 100) mz = -100;
        if (mz < -100) mz = 100;
        msPositions.setX(i, mx);
        msPositions.setY(i, my);
        msPositions.setZ(i, mz);
    }
    msPositions.needsUpdate = true;

    // Animasi cahaya bioluminescent berpulsa
    oceanLight.intensity = 2.0 + Math.sin(time * 0.0015) * 0.8;
    coralLight.intensity = 1.2 + Math.sin(time * 0.002 + 1) * 0.5;

    // Animasi ubur-ubur naik turun + horizontal
    jellyfishList.forEach(jf => {
        jf.position.y = jf.userData.baseY + Math.sin(time * 0.001 * jf.userData.speed + jf.userData.phase) * 2;
        jf.rotation.y += delta * 0.2;
        jf.position.x += Math.sin(time * 0.0005 + jf.userData.phase) * 0.005;
    });

    // Animasi rumput laut bergoyang (lebih natural)
    seaweedGroups.forEach((sg, idx) => {
        sg.children.forEach((strand, si) => {
            const swayAmount = 0.15 + Math.sin(time * 0.0003) * 0.05;
            strand.rotation.z = Math.sin(time * 0.001 + idx + si) * swayAmount;
            strand.rotation.x = Math.sin(time * 0.0008 + idx * 2 + si) * swayAmount * 0.7;
        });
    });

    // Animasi kelompok ikan kecil berenang melingkar
    smallFishSchools.forEach(school => {
        school.userData.angle += delta * school.userData.speed;
        school.position.x = school.userData.centerX + Math.cos(school.userData.angle) * school.userData.radius;
        school.position.z = school.userData.centerZ + Math.sin(school.userData.angle) * school.userData.radius;
        school.rotation.y = -school.userData.angle + Math.PI / 2;
        school.position.y += Math.sin(time * 0.001 + school.userData.angle) * 0.01;
    });

    // Animasi gelembung naik (dengan wobble realistis)
    bubbleStreams.forEach(stream => {
        stream.children.forEach(bubble => {
            bubble.position.y += bubble.userData.speed * delta;
            bubble.position.x += Math.sin(time * 0.002 + bubble.userData.wobble) * 0.008;
            bubble.position.z += Math.cos(time * 0.0015 + bubble.userData.wobble * 1.3) * 0.005;
            const scale = 1 + (bubble.position.y / 25) * 0.3;
            bubble.scale.setScalar(Math.max(0.5, scale));
            if (bubble.position.y > 20) {
                bubble.position.y = 0;
                bubble.scale.setScalar(1);
            }
        });
    });

    // Animasi permukaan air bergelombang (multi-layered, throttled every 2 frames)
    if (waterSurface && frameCount % 2 === 0) {
        const wPos = waterSurface.geometry.attributes.position;
        for (let i = 0; i < wPos.count; i++) {
            const x = wPos.getX(i);
            const z = wPos.getZ(i);
            const wave1 = Math.sin(x * 0.03 + time * 0.001) * 0.4;
            const wave2 = Math.cos(z * 0.04 + time * 0.0012) * 0.3;
            const wave3 = Math.sin((x + z) * 0.06 + time * 0.0008) * 0.15;
            const chop = Math.sin(x * 0.15 + time * 0.003) * 0.05;
            wPos.setZ(i, wave1 + wave2 + wave3 + chop);
        }
        wPos.needsUpdate = true;
    }

    // Secondary water shimmer
    if (waterSurface2 && frameCount % 2 === 0) {
        const w2Pos = waterSurface2.geometry.attributes.position;
        for (let i = 0; i < w2Pos.count; i++) {
            const x = w2Pos.getX(i);
            const z = w2Pos.getZ(i);
            const w = Math.sin(x * 0.04 - time * 0.0015) * 0.25 + Math.cos(z * 0.035 + time * 0.001) * 0.2;
            w2Pos.setZ(i, w);
        }
        w2Pos.needsUpdate = true;
        waterSurface2Mat.opacity = 0.08 + Math.sin(time * 0.002) * 0.04;
    }

    // Animasi buih ombak menyapu bibir pantai Madura
    if (typeof shoreWaveLine !== 'undefined' && shoreWaveLine) {
        const wavePulse = Math.sin(time * 0.0018);
        shoreWaveLine.position.z = 37.2 + wavePulse * 1.0;
        shoreWaveLine.material.opacity = 0.55 + wavePulse * 0.20;
    }

    // Animasi burung camar terbang melayang di langit pantai
    if (typeof seagulls !== 'undefined' && seagulls.length > 0) {
        seagulls.forEach(sg => {
            const u = sg.userData;
            const angle = time * 0.0007 * u.speed + u.phase;
            sg.position.x = u.baseX + Math.cos(angle) * u.radius;
            sg.position.z = u.baseZ + Math.sin(angle) * (u.radius * 0.6);
            sg.position.y = u.baseY + Math.sin(time * 0.002 * u.speed) * 1.5;
            sg.rotation.y = -angle - Math.PI / 2;
            const flap = Math.sin(time * 0.012 * u.speed);
            u.leftWing.rotation.z = flap * 0.4;
            u.rightWing.rotation.z = -flap * 0.4;
        });
    }

    renderer.render(scene, camera);
    prevTime = time;
}

animate();

// Resize handler
window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Expose to window
window.state = state;
window.camera = camera;
window.missions = missions;
window.openMissionPopup = openMissionPopup;
window.openClamModal = openClamModal;
window.closeClamModal = closeClamModal;
window.scene = scene;


