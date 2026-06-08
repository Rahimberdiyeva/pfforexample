import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';

// --- Инициализация рендереров ---
const container2d = document.getElementById('canvas2d');
const container3d = document.getElementById('canvas3d');

const scene2d = new THREE.Scene(); scene2d.background = null;
const camera2d = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10); camera2d.position.z = 1;
const renderer2d = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
renderer2d.setClearColor(0x000000, 0);

const scene3d = new THREE.Scene(); scene3d.background = null;
const camera3d = new THREE.PerspectiveCamera(45, 1, 0.1, 1000); camera3d.position.set(2.2, 1.6, 2.8);
const renderer3d = new THREE.WebGLRenderer({ antialias: true, alpha: true });

container2d.appendChild(renderer2d.domElement);
container3d.appendChild(renderer3d.domElement);

// --- Оффскрин рендерер для PBR/экспорта ---
// ВАЖНО: preserveDrawingBuffer: true, иначе toBlob() возвращает пустые файлы!
const offscreenRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
offscreenRenderer.setSize(1024, 1024);

function updateSizes() {
    const rect2d = container2d.parentElement.getBoundingClientRect();
    let size2d = Math.min(rect2d.width, rect2d.height);
    if (size2d <= 0) size2d = 256;
    renderer2d.setSize(size2d, size2d);
    
    const w3 = container3d.clientWidth, h3 = container3d.clientHeight;
    if (w3 && h3) {
        renderer3d.setSize(w3, h3);
        camera3d.aspect = w3 / h3;
        camera3d.updateProjectionMatrix();
    }
}

new ResizeObserver(() => updateSizes()).observe(container3d);
new ResizeObserver(() => updateSizes()).observe(container2d.parentElement);
window.addEventListener('resize', updateSizes);
updateSizes();

const controls3d = new OrbitControls(camera3d, renderer3d.domElement);
controls3d.enableDamping = true; controls3d.enableZoom = true; controls3d.target.set(0, 0, 0);

// --- Освещение ---
scene3d.add(new THREE.AmbientLight(0xffffff, 0.4));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.2); keyLight.position.set(5, 5, 5); scene3d.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffffff, 0.5); fillLight.position.set(-5, 0, 5); scene3d.add(fillLight);
const rimLight = new THREE.DirectionalLight(0xffffff, 0.8); rimLight.position.set(0, 5, -5); scene3d.add(rimLight);

let currentMesh3d = null, currentGeometryType = 'cube', customModel = null, overlayTexture = null;
let backgroundImageEl = null;
let activeColors = [ new THREE.Color('#FF6B8B'), new THREE.Color('#4CC9F0'), new THREE.Color('#F9C74F'), new THREE.Color('#9B5DE5') ];
let layers = [];
let selectedLayerId = null;
let isDraggingLayer = false;
let dragStart = { x: 0, y: 0, layerX: 0, layerY: 0 };

// --- UNIFORMS (с новыми PBR-параметрами) ---
const uniforms = {
    uScale: { value: 0.8 }, uIntensity: { value: 1.0 }, uPatternType: { value: 0 },
    uColor0: { value: new THREE.Vector3() }, uColor1: { value: new THREE.Vector3() }, uColor2: { value: new THREE.Vector3() }, uColor3: { value: new THREE.Vector3() },
    uColor4: { value: new THREE.Vector3() }, uColor5: { value: new THREE.Vector3() }, uColor6: { value: new THREE.Vector3() }, uColor7: { value: new THREE.Vector3() },
    uColorsCount: { value: 4 }, uSaturation: { value: 1.5 }, uBlendMode: { value: 0 },
    uRotation: { value: 0 }, uOffset: { value: new THREE.Vector2(0,0) }, uMirror: { value: 0 },
    uOctaves: { value: 3 }, uPersistence: { value: 0.5 }, uLacunarity: { value: 2.0 },
    uTileEnabled: { value: 0 }, uOverlayTexture: { value: null }, uUseOverlay: { value: 1 },
    uWarpEnable: { value: 0 }, uWarpStrength: { value: 0.3 }, uWarpOctaves: { value: 2 },
    uShowRelief: { value: 0 }, uReliefStrength: { value: 1.0 }, uTile3DScale: { value: 1.0 },
    uTime: { value: 0 }, uOverlayScale: { value: 1.0 }, uExportMode: { value: 0 },
    // НОВЫЕ uniform-ы для PBR
    uTexelSize: { value: new THREE.Vector2(1/1024, 1/1024) },
    uNormalStrength: { value: 1.0 },
    uRoughnessContrast: { value: 1.5 },
    uMetalThreshold: { value: 0.4 },
    uMetalScale: { value: 2.0 }
};

function updateColorUniforms() {
    const lastColor = activeColors.length ? activeColors[activeColors.length-1] : new THREE.Color(1,1,1);
    for (let i=0; i<8; i++) {
        const c = i < activeColors.length ? activeColors[i] : lastColor;
        uniforms[`uColor${i}`].value.set(c.r, c.g, c.b);
    }
    uniforms.uColorsCount.value = activeColors.length;
}
updateColorUniforms();

let pbrUpdateTimeout;
function schedulePBRUpdate() {
    clearTimeout(pbrUpdateTimeout);
    pbrUpdateTimeout = setTimeout(updatePBRPreviews, 300);
}

async function updatePBRPreviews() {
    const pbrGrid = document.getElementById('pbrGrid');
    if (!pbrGrid) return;
    if (pbrGrid.children.length === 0) {
        const maps = ['basecolor', 'normal', 'roughness', 'metallic', 'height', 'ao'];
        const names = ['Base Color', 'Normal', 'Roughness', 'Metallic', 'Height', 'AO'];
        maps.forEach((type, i) => {
            const div = document.createElement('div'); div.className = 'pbr-item';
            const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
            const span = document.createElement('span'); span.textContent = names[i];
            div.appendChild(canvas); div.appendChild(span); pbrGrid.appendChild(div);
        });
    }
    const maps = ['basecolor', 'normal', 'roughness', 'metallic', 'height', 'ao'];
    for (let i = 0; i < maps.length; i++) {
        const canvas = pbrGrid.children[i].querySelector('canvas');
        const blob = await renderPBRMap(128, maps[i]);
        const img = new Image();
        img.onload = () => {
            const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, 128, 128);
        };
        img.src = URL.createObjectURL(blob);
    }
}

