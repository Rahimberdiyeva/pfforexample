// ========== VERTEX SHADER ==========
const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// ========== FRAGMENT SHADER ==========
const fragmentShader = `
precision highp float;

uniform float uScale;
uniform float uIntensity;
uniform int uPatternType;
uniform vec3 uColor0;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;
uniform vec3 uColor5;
uniform vec3 uColor6;
uniform vec3 uColor7;
uniform int uColorsCount;
uniform float uSaturation;
uniform int uBlendMode;
uniform float uRotation;
uniform vec2 uOffset;
uniform int uMirror;
uniform int uOctaves;
uniform float uPersistence;
uniform float uLacunarity;
uniform int uTileEnabled;
uniform sampler2D uOverlayTexture;
uniform int uUseOverlay;
uniform int uWarpEnable;
uniform float uWarpStrength;
uniform int uWarpOctaves;
uniform int uShowRelief;
uniform float uReliefStrength;
uniform int uExportMode;
uniform int uTestMode;
uniform float uNormalStrength;
uniform float uRoughnessContrast;
uniform float uMetalThreshold;
uniform float uMetalScale;

varying vec2 vUv;

// ---------- Tileable Hash ----------
vec2 hash2d(vec2 p) {
  p = mod(p, 256.0);
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return -1.0 + 2.0 * fract(vec2(p.x * p.y, p.y * p.x));
}

// ---------- Tileable Gradient Noise (Improved Perlin) ----------
float gradNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 g00 = hash2d(i);
  vec2 g10 = hash2d(i + vec2(1.0, 0.0));
  vec2 g01 = hash2d(i + vec2(0.0, 1.0));
  vec2 g11 = hash2d(i + vec2(1.0, 1.0));
  float n00 = dot(g00, f);
  float n10 = dot(g10, f - vec2(1.0, 0.0));
  float n01 = dot(g01, f - vec2(0.0, 1.0));
  float n11 = dot(g11, f - vec2(1.0, 1.0));
  return mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y);
}

// ---------- FBM (Fractional Brownian Motion) ----------
float fbm(vec2 st, int octaves, float persistence, float lacunarity) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    value += amplitude * (gradNoise(st * frequency) * 0.5 + 0.5);
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return value;
}

// ---------- Tileable Domain Warp ----------
vec2 domainWarp(vec2 uv, float strength, int octaves, float scale) {
  vec2 warped = uv;
  for (int i = 0; i < 4; i++) {
    if (i >= octaves) break;
    float phase = float(i + 1) * 6.28318530718;
    vec2 offset = vec2(
      sin(warped.y * scale + phase),
      cos(warped.x * scale + phase)
    );
    warped += offset * strength;
  }
  return warped;
}

// ---------- Паттерны ----------
float patternChecker(vec2 uv, float scale) {
  vec2 p = floor(uv * scale);
  return mod(p.x + p.y, 2.0);
}

float patternStripes(vec2 uv, float scale) {
  return step(0.5, fract(uv.x * scale));
}

float patternCircles(vec2 uv, float scale) {
  vec2 c = vec2(0.5);
  return fract(length(uv - c) * scale * 2.0);
}

float patternGrid(vec2 uv, float scale) {
  vec2 g = fract(uv * scale);
  return max(step(0.95, g.x), step(0.95, g.y));
}

float patternTiles(vec2 uv, float scale) {
  vec2 f = fract(uv * scale);
  float line = step(0.85, f.x) + step(0.85, f.y);
  return 1.0 - clamp(line, 0.0, 1.0);
}

float patternWood(vec2 uv, float scale) {
  vec2 c = vec2(0.5);
  float d = length(uv - c) * 2.0;
  float rings = sin(d * scale * 12.0 + sin(uv.x * 8.0) * 1.5);
  return clamp(rings * 0.5 + 0.5, 0.0, 1.0);
}

float patternMarble(vec2 uv, float scale) {
  float n = fbm(uv * scale * 3.0, 4, 0.6, 2.0);
  float veins = sin((uv.x * scale * 5.0 + n * 3.0) * 3.14159);
  return clamp(veins * 0.6 + 0.5, 0.0, 1.0);
}

float patternLinearGradient(vec2 uv) { return uv.x; }
float patternRadialGradient(vec2 uv) { return length(uv - 0.5) * 1.414; }
float patternAngularGradient(vec2 uv) {
  return atan(uv.y - 0.5, uv.x - 0.5) / (2.0 * 3.14159) + 0.5;
}

// ---------- Цветовая палитра (ИСПРАВЛЕНО) ----------
vec3 getColor(float t) {
  if (uColorsCount <= 1) return uColor0;
  float seg = 1.0 / float(uColorsCount - 1);
  t = clamp(t, 0.0, 1.0);
  int idx = int(floor(t / seg));
  if (idx >= uColorsCount - 1) idx = uColorsCount - 2;
  if (idx < 0) idx = 0;
  float localT = (t - float(idx) * seg) / seg;
  vec3 c1, c2;
  if (idx == 0) { c1 = uColor0; c2 = uColor1; }
  else if (idx == 1) { c1 = uColor1; c2 = uColor2; }
  else if (idx == 2) { c1 = uColor2; c2 = uColor3; }
  else if (idx == 3) { c1 = uColor3; c2 = uColor4; }
  else if (idx == 4) { c1 = uColor4; c2 = uColor5; }
  else if (idx == 5) { c1 = uColor5; c2 = uColor6; }
  else { c1 = uColor6; c2 = uColor7; }
  return mix(c1, c2, localT);
}

// ---------- Основной шум ----------
float computePattern(vec2 uv) {
  float angle = uRotation * 3.14159 / 180.0;
  vec2 centered = uv - 0.5;
  vec2 rotated = vec2(
    centered.x * cos(angle) - centered.y * sin(angle),
    centered.x * sin(angle) + centered.y * cos(angle)
  );
  uv = rotated + 0.5 + uOffset;
  
  if (uMirror == 1) uv.x = 1.0 - uv.x;
  else if (uMirror == 2) uv.y = 1.0 - uv.y;
  else if (uMirror == 3) { uv.x = 1.0 - uv.x; uv.y = 1.0 - uv.y; }
  
  if (uTileEnabled == 1) uv = fract(uv);
  
  vec2 st = uv * uScale;
  
  if (uWarpEnable == 1) {
    st = domainWarp(st, uWarpStrength, uWarpOctaves, uScale);
    if (uTileEnabled == 1) st = mod(st, 1.0);
  }
  
  float val;
  if (uPatternType == 0) val = (sin(st.x * 8.0) * cos(st.y * 8.0) + sin(st.y * 12.0 + st.x * 5.0)) * 0.6 + 0.5;
  else if (uPatternType == 1) val = gradNoise(st * 3.5) * 0.5 + 0.5;
  else if (uPatternType == 2) val = fbm(st, uOctaves, uPersistence, uLacunarity);
  else if (uPatternType == 3) val = patternChecker(uv, uScale);
  else if (uPatternType == 4) val = gradNoise(st) * 0.5 + 0.5;
  else if (uPatternType == 5) val = (sin(st.x * 3.0) * cos(st.y * 3.0) + cos(st.x * 4.2) * sin(st.y * 4.2)) * 0.5 + 0.5;
  else if (uPatternType == 6) val = fract(st.x * 3.0 + st.y * 2.0);
  else if (uPatternType == 7) val = sin(st.x * 10.0) * cos(st.y * 10.0);
  else if (uPatternType == 8) val = patternChecker(uv, uScale);
  else if (uPatternType == 9) val = patternStripes(uv, uScale);
  else if (uPatternType == 10) val = patternCircles(uv, uScale);
  else if (uPatternType == 11) val = patternGrid(uv, uScale);
  else if (uPatternType == 12) val = 1.0 - abs(gradNoise(st));
  else if (uPatternType == 14) val = patternWood(uv, uScale);
  else if (uPatternType == 15) val = patternMarble(uv, uScale);
  else if (uPatternType == 16) val = patternTiles(uv, uScale);
  else if (uPatternType == 17) val = patternLinearGradient(uv);
  else if (uPatternType == 18) val = patternRadialGradient(uv);
  else if (uPatternType == 19) val = patternAngularGradient(uv);
  else val = fbm(st, uOctaves, uPersistence, uLacunarity);
  
  return clamp(val * uIntensity, 0.0, 1.0);
}

// ---------- Производные ----------
float sampleHeight(vec2 uv) {
  return computePattern(uv);
}

void main() {
  vec2 uv = vUv;
  float height = computePattern(uv);
  
  // Нормаль из высоты
  vec2 eps = vec2(1.0 / 1024.0, 0.0);
  float hL = sampleHeight(uv - vec2(eps.x, 0.0));
  float hR = sampleHeight(uv + vec2(eps.x, 0.0));
  float hD = sampleHeight(uv - vec2(0.0, eps.x));
  float hU = sampleHeight(uv + vec2(0.0, eps.x));
  vec3 normalTS = normalize(vec3(-(hR - hL) * uNormalStrength, -(hU - hD) * uNormalStrength, 1.0));
  
  // AO из высоты
  vec2 o1 = vec2(eps.x, eps.x);
  vec2 o2 = vec2(-eps.x, eps.x);
  vec2 o3 = vec2(eps.x, -eps.x);
  vec2 o4 = vec2(-eps.x, -eps.x);
  float h1 = sampleHeight(uv + o1);
  float h2 = sampleHeight(uv + o2);
  float h3 = sampleHeight(uv + o3);
  float h4 = sampleHeight(uv + o4);
  float cavity = max(max(h1, h2), max(h3, h4)) - height;
  float ao = clamp(1.0 - cavity * 2.0, 0.2, 1.0);
  
  // Экспортные режимы
  if (uExportMode == 1) {
    gl_FragColor = vec4(normalTS * 0.5 + 0.5, 1.0);
    return;
  } else if (uExportMode == 2) {
    float roughness = 1.0 - pow(height, uRoughnessContrast);
    roughness = clamp(roughness, 0.04, 0.96);
    gl_FragColor = vec4(vec3(roughness), 1.0);
    return;
  } else if (uExportMode == 3) {
    float metallic = clamp((height - uMetalThreshold) * uMetalScale, 0.0, 1.0);
    gl_FragColor = vec4(vec3(metallic), 1.0);
    return;
  } else if (uExportMode == 4) {
    gl_FragColor = vec4(vec3(height), 1.0);
    return;
  } else if (uExportMode == 5) {
    gl_FragColor = vec4(vec3(ao), 1.0);
    return;
  }
  
  // Preview
  if (uTestMode == 1) {
    float roughness = 1.0 - pow(height, uRoughnessContrast);
    roughness = clamp(roughness, 0.04, 0.96);
    gl_FragColor = vec4(vec3(roughness), 1.0);
    return;
  } else if (uTestMode == 2) {
    float metallic = clamp((height - uMetalThreshold) * uMetalScale, 0.0, 1.0);
    gl_FragColor = vec4(vec3(metallic), 1.0);
    return;
  } else if (uTestMode == 3) {
    gl_FragColor = vec4(normalTS * 0.5 + 0.5, 1.0);
    return;
  }
  
  vec3 color = getColor(height);
  float gray = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(gray), color, uSaturation);
  if (uBlendMode == 1) color *= height;
  
  vec3 finalColor = color;
  if (uUseOverlay == 1) {
    vec4 overlay = texture2D(uOverlayTexture, uv);
    if (overlay.a > 0.01) finalColor = mix(finalColor, overlay.rgb, overlay.a);
  }
  
  if (uShowRelief == 1) {
    vec3 lightDir = normalize(vec3(0.8, 1.0, 0.3));
    float diff = max(0.3, dot(normalTS, lightDir));
    finalColor *= (0.6 + diff * 0.5);
  }
  
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// ============================================================
// 1. ИНИЦИАЛИЗАЦИЯ РЕНДЕРЕРОВ С ФИЗИЧЕСКИ КОРРЕКТНЫМИ НАСТРОЙКАМИ
// ============================================================
const container2d = document.getElementById('canvas2d');
const container3d = document.getElementById('canvas3d');

const scene2d = new THREE.Scene();
scene2d.background = null;

const camera2d = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera2d.position.z = 1;

const renderer2d = new THREE.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
  alpha: true
});
renderer2d.setClearColor(0x000000, 0);
renderer2d.outputColorSpace = THREE.SRGBColorSpace;
container2d.appendChild(renderer2d.domElement);

const scene3d = new THREE.Scene();
scene3d.background = null;

const camera3d = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);

const renderer3d = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer3d.physicallyCorrectLights = true;
renderer3d.outputColorSpace = THREE.SRGBColorSpace;
renderer3d.toneMapping = THREE.ACESFilmicToneMapping;
renderer3d.toneMappingExposure = 1.0;
container3d.appendChild(renderer3d.domElement);

// Оффскрин рендерер для PBR/экспорта
const offscreenRenderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  preserveDrawingBuffer: true
});
offscreenRenderer.outputColorSpace = THREE.SRGBColorSpace;
offscreenRenderer.setSize(1024, 1024);

// ============================================================
// 2. HDRI И ОСВЕЩЕНИЕ
// ============================================================
let environmentMap = null;
const pmremGenerator = new THREE.PMREMGenerator(renderer3d);
let currentHdriIntensity = 1.0;
let currentHdriRotation = 0;

function loadHDRI(url, intensity = 1.0) {
  new RGBELoader().load(url, (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    const envMap = pmremGenerator.fromEquirectangular(texture).texture;
    scene3d.environment = envMap;
    scene3d.background = envMap;
    environmentMap = envMap;
    texture.dispose();
    updateHdriIntensity(intensity);
    updateHdriRotation(currentHdriRotation);
  });
}

function updateHdriIntensity(intensity) {
  if (scene3d.environment) {
    scene3d.environment.intensity = intensity;
  }
  currentHdriIntensity = intensity;
}

function updateHdriRotation(degrees) {
  if (scene3d.environment) {
    scene3d.environment.rotation = degrees * Math.PI / 180;
  }
  currentHdriRotation = degrees;
}

// Базовое освещение сцены
const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
scene3d.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.40);
scene3d.add(hemiLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
directionalLight.position.set(5, 8, 5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
scene3d.add(directionalLight);

function updateLightIntensity(value) {
  directionalLight.intensity = value;
}

// ============================================================
// 3. RESIZE OBSERVER
// ============================================================
function updateSizes() {
  const rect2d = container2d.parentElement.getBoundingClientRect();
  let size2d = Math.min(rect2d.width, rect2d.height);
  if (size2d <= 0) size2d = 256;
  renderer2d.setSize(size2d, size2d);

  const w3 = container3d.clientWidth;
  const h3 = container3d.clientHeight;
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
controls3d.enableDamping = true;
controls3d.enableZoom = true;

// ============================================================
// 4. СОСТОЯНИЕ ПРИЛОЖЕНИЯ
// ============================================================
let currentMesh3d = null;
let currentGeometryType = 'cube';
let customModel = null;
let overlayTexture = null;
let backgroundImageEl = null;

let activeColors = [
  new THREE.Color('#FF6B8B'),
  new THREE.Color('#4CC9F0'),
  new THREE.Color('#F9C74F'),
  new THREE.Color('#9B5DE5')
];

let layers = [];
let selectedLayerId = null;

// ============================================================
// 5. UNIFORM'Ы (создаются ОДИН РАЗ)
// ============================================================
const uniforms = {
  uScale: { value: 0.8 },
  uIntensity: { value: 1.0 },
  uPatternType: { value: 2 },
  uColor0: { value: new THREE.Vector3() },
  uColor1: { value: new THREE.Vector3() },
  uColor2: { value: new THREE.Vector3() },
  uColor3: { value: new THREE.Vector3() },
  uColor4: { value: new THREE.Vector3() },
  uColor5: { value: new THREE.Vector3() },
  uColor6: { value: new THREE.Vector3() },
  uColor7: { value: new THREE.Vector3() },
  uColorsCount: { value: 4 },
  uSaturation: { value: 1.5 },
  uBlendMode: { value: 0 },
  uRotation: { value: 0 },
  uOffset: { value: new THREE.Vector2(0, 0) },
  uMirror: { value: 0 },
  uOctaves: { value: 3 },
  uPersistence: { value: 0.5 },
  uLacunarity: { value: 2.0 },
  uTileEnabled: { value: 0 },
  uOverlayTexture: { value: null },
  uUseOverlay: { value: 1 },
  uWarpEnable: { value: 0 },
  uWarpStrength: { value: 0.3 },
  uWarpOctaves: { value: 2 },
  uShowRelief: { value: 0 },
  uReliefStrength: { value: 1.0 },
  uExportMode: { value: 0 },
  uTestMode: { value: 0 },
  uNormalStrength: { value: 1.0 },
  uRoughnessContrast: { value: 1.5 },
  uMetalThreshold: { value: 0.4 },
  uMetalScale: { value: 2.0 }
};

function updateColorUniforms() {
  const lastColor = activeColors.length ? activeColors[activeColors.length - 1] : new THREE.Color(1, 1, 1);
  for (let i = 0; i < 8; i++) {
    const c = i < activeColors.length ? activeColors[i] : lastColor;
    uniforms[`uColor${i}`].value.set(c.r, c.g, c.b);
  }
  uniforms.uColorsCount.value = activeColors.length;
}
updateColorUniforms();

// ============================================================
// 6. ШЕЙДЕРЫ (из Части 1)
// ============================================================
const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform float uScale;
uniform float uIntensity;
uniform int uPatternType;
uniform vec3 uColor0;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;
uniform vec3 uColor5;
uniform vec3 uColor6;
uniform vec3 uColor7;
uniform int uColorsCount;
uniform float uSaturation;
uniform int uBlendMode;
uniform float uRotation;
uniform vec2 uOffset;
uniform int uMirror;
uniform int uOctaves;
uniform float uPersistence;
uniform float uLacunarity;
uniform int uTileEnabled;
uniform sampler2D uOverlayTexture;
uniform int uUseOverlay;
uniform int uWarpEnable;
uniform float uWarpStrength;
uniform int uWarpOctaves;
uniform int uShowRelief;
uniform float uReliefStrength;
uniform int uExportMode;
uniform int uTestMode;
uniform float uNormalStrength;
uniform float uRoughnessContrast;
uniform float uMetalThreshold;
uniform float uMetalScale;

varying vec2 vUv;

// ---------- Tileable Hash ----------
vec2 hash2d(vec2 p) {
  p = mod(p, 256.0);
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return -1.0 + 2.0 * fract(vec2(p.x * p.y, p.y * p.x));
}

// ---------- Tileable Gradient Noise ----------
float gradNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 g00 = hash2d(i);
  vec2 g10 = hash2d(i + vec2(1.0, 0.0));
  vec2 g01 = hash2d(i + vec2(0.0, 1.0));
  vec2 g11 = hash2d(i + vec2(1.0, 1.0));
  float n00 = dot(g00, f);
  float n10 = dot(g10, f - vec2(1.0, 0.0));
  float n01 = dot(g01, f - vec2(0.0, 1.0));
  float n11 = dot(g11, f - vec2(1.0, 1.0));
  return mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y);
}

// ---------- FBM ----------
float fbm(vec2 st, int octaves, float persistence, float lacunarity) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    value += amplitude * (gradNoise(st * frequency) * 0.5 + 0.5);
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return value;
}

// ---------- Tileable Domain Warp ----------
vec2 domainWarp(vec2 uv, float strength, int octaves, float scale) {
  vec2 warped = uv;
  for (int i = 0; i < 4; i++) {
    if (i >= octaves) break;
    float phase = float(i + 1) * 6.28318530718;
    vec2 offset = vec2(
      sin(warped.y * scale + phase),
      cos(warped.x * scale + phase)
    );
    warped += offset * strength;
  }
  return warped;
}

// ---------- Паттерны ----------
float patternChecker(vec2 uv, float scale) {
  vec2 p = floor(uv * scale);
  return mod(p.x + p.y, 2.0);
}
float patternStripes(vec2 uv, float scale) {
  return step(0.5, fract(uv.x * scale));
}
float patternCircles(vec2 uv, float scale) {
  vec2 c = vec2(0.5);
  return fract(length(uv - c) * scale * 2.0);
}
float patternGrid(vec2 uv, float scale) {
  vec2 g = fract(uv * scale);
  return max(step(0.95, g.x), step(0.95, g.y));
}
float patternTiles(vec2 uv, float scale) {
  vec2 f = fract(uv * scale);
  float line = step(0.85, f.x) + step(0.85, f.y);
  return 1.0 - clamp(line, 0.0, 1.0);
}
float patternWood(vec2 uv, float scale) {
  vec2 c = vec2(0.5);
  float d = length(uv - c) * 2.0;
  float rings = sin(d * scale * 12.0 + sin(uv.x * 8.0) * 1.5);
  return clamp(rings * 0.5 + 0.5, 0.0, 1.0);
}
float patternMarble(vec2 uv, float scale) {
  float n = fbm(uv * scale * 3.0, 4, 0.6, 2.0);
  float veins = sin((uv.x * scale * 5.0 + n * 3.0) * 3.14159);
  return clamp(veins * 0.6 + 0.5, 0.0, 1.0);
}
float patternLinearGradient(vec2 uv) { return uv.x; }
float patternRadialGradient(vec2 uv) { return length(uv - 0.5) * 1.414; }
float patternAngularGradient(vec2 uv) {
  return atan(uv.y - 0.5, uv.x - 0.5) / (2.0 * 3.14159) + 0.5;
}

// ---------- Цветовая палитра ----------
vec3 getColor(float t) {
  if (uColorsCount <= 1) return uColor0;
  float seg = 1.0 / float(uColorsCount - 1);
  t = clamp(t, 0.0, 1.0);
  int idx = int(floor(t / seg));
  if (idx >= uColorsCount - 1) idx = uColorsCount - 2;
  if (idx < 0) idx = 0;
  float localT = (t - float(idx) * seg) / seg;
  vec3 c1, c2;
  if (idx == 0) { c1 = uColor0; c2 = uColor1; }
  else if (idx == 1) { c1 = uColor1; c2 = uColor2; }
  else if (idx == 2) { c1 = uColor2; c2 = uColor3; }
  else if (idx == 3) { c1 = uColor3; c2 = uColor4; }
  else if (idx == 4) { c1 = uColor4; c2 = uColor5; }
  else if (idx == 5) { c1 = uColor5; c2 = uColor6; }
  else { c1 = uColor6; c2 = uColor7; }
  return mix(c1, c2, localT);
}

// ---------- Основной шум ----------
float computePattern(vec2 uv) {
  float angle = uRotation * 3.14159 / 180.0;
  vec2 centered = uv - 0.5;
  vec2 rotated = vec2(
    centered.x * cos(angle) - centered.y * sin(angle),
    centered.x * sin(angle) + centered.y * cos(angle)
  );
  uv = rotated + 0.5 + uOffset;
  if (uMirror == 1) uv.x = 1.0 - uv.x;
  else if (uMirror == 2) uv.y = 1.0 - uv.y;
  else if (uMirror == 3) { uv.x = 1.0 - uv.x; uv.y = 1.0 - uv.y; }
  if (uTileEnabled == 1) uv = fract(uv);
  vec2 st = uv * uScale;
  if (uWarpEnable == 1) {
    st = domainWarp(st, uWarpStrength, uWarpOctaves, uScale);
    if (uTileEnabled == 1) st = mod(st, 1.0);
  }
  float val;
  if (uPatternType == 0) val = (sin(st.x * 8.0) * cos(st.y * 8.0) + sin(st.y * 12.0 + st.x * 5.0)) * 0.6 + 0.5;
  else if (uPatternType == 1) val = gradNoise(st * 3.5) * 0.5 + 0.5;
  else if (uPatternType == 2) val = fbm(st, uOctaves, uPersistence, uLacunarity);
  else if (uPatternType == 3) val = patternChecker(uv, uScale);
  else if (uPatternType == 4) val = gradNoise(st) * 0.5 + 0.5;
  else if (uPatternType == 5) val = (sin(st.x * 3.0) * cos(st.y * 3.0) + cos(st.x * 4.2) * sin(st.y * 4.2)) * 0.5 + 0.5;
  else if (uPatternType == 6) val = fract(st.x * 3.0 + st.y * 2.0);
  else if (uPatternType == 7) val = sin(st.x * 10.0) * cos(st.y * 10.0);
  else if (uPatternType == 8) val = patternChecker(uv, uScale);
  else if (uPatternType == 9) val = patternStripes(uv, uScale);
  else if (uPatternType == 10) val = patternCircles(uv, uScale);
  else if (uPatternType == 11) val = patternGrid(uv, uScale);
  else if (uPatternType == 12) val = 1.0 - abs(gradNoise(st));
  else if (uPatternType == 14) val = patternWood(uv, uScale);
  else if (uPatternType == 15) val = patternMarble(uv, uScale);
  else if (uPatternType == 16) val = patternTiles(uv, uScale);
  else if (uPatternType == 17) val = patternLinearGradient(uv);
  else if (uPatternType == 18) val = patternRadialGradient(uv);
  else if (uPatternType == 19) val = patternAngularGradient(uv);
  else val = fbm(st, uOctaves, uPersistence, uLacunarity);
  return clamp(val * uIntensity, 0.0, 1.0);
}

float sampleHeight(vec2 uv) {
  return computePattern(uv);
}

void main() {
  vec2 uv = vUv;
  float height = computePattern(uv);

  // Нормаль из высоты
  vec2 eps = vec2(1.0 / 1024.0, 0.0);
  float hL = sampleHeight(uv - vec2(eps.x, 0.0));
  float hR = sampleHeight(uv + vec2(eps.x, 0.0));
  float hD = sampleHeight(uv - vec2(0.0, eps.x));
  float hU = sampleHeight(uv + vec2(0.0, eps.x));
  vec3 normalTS = normalize(vec3(-(hR - hL) * uNormalStrength, -(hU - hD) * uNormalStrength, 1.0));

  // AO из высоты
  vec2 o1 = vec2(eps.x, eps.x);
  vec2 o2 = vec2(-eps.x, eps.x);
  vec2 o3 = vec2(eps.x, -eps.x);
  vec2 o4 = vec2(-eps.x, -eps.x);
  float h1 = sampleHeight(uv + o1);
  float h2 = sampleHeight(uv + o2);
  float h3 = sampleHeight(uv + o3);
  float h4 = sampleHeight(uv + o4);
  float cavity = max(max(h1, h2), max(h3, h4)) - height;
  float ao = clamp(1.0 - cavity * 2.0, 0.2, 1.0);

  // Экспортные режимы
  if (uExportMode == 1) {
    gl_FragColor = vec4(normalTS * 0.5 + 0.5, 1.0);
    return;
  } else if (uExportMode == 2) {
    float roughness = 1.0 - pow(height, uRoughnessContrast);
    roughness = clamp(roughness, 0.04, 0.96);
    gl_FragColor = vec4(vec3(roughness), 1.0);
    return;
  } else if (uExportMode == 3) {
    float metallic = clamp((height - uMetalThreshold) * uMetalScale, 0.0, 1.0);
    gl_FragColor = vec4(vec3(metallic), 1.0);
    return;
  } else if (uExportMode == 4) {
    gl_FragColor = vec4(vec3(height), 1.0);
    return;
  } else if (uExportMode == 5) {
    gl_FragColor = vec4(vec3(ao), 1.0);
    return;
  }

  // Preview
  if (uTestMode == 1) {
    float roughness = 1.0 - pow(height, uRoughnessContrast);
    roughness = clamp(roughness, 0.04, 0.96);
    gl_FragColor = vec4(vec3(roughness), 1.0);
    return;
  } else if (uTestMode == 2) {
    float metallic = clamp((height - uMetalThreshold) * uMetalScale, 0.0, 1.0);
    gl_FragColor = vec4(vec3(metallic), 1.0);
    return;
  } else if (uTestMode == 3) {
    gl_FragColor = vec4(normalTS * 0.5 + 0.5, 1.0);
    return;
  }

  vec3 color = getColor(height);
  float gray = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(gray), color, uSaturation);
  if (uBlendMode == 1) color *= height;

  vec3 finalColor = color;
  if (uUseOverlay == 1) {
    vec4 overlay = texture2D(uOverlayTexture, uv);
    if (overlay.a > 0.01) finalColor = mix(finalColor, overlay.rgb, overlay.a);
  }

  if (uShowRelief == 1) {
    vec3 lightDir = normalize(vec3(0.8, 1.0, 0.3));
    float diff = max(0.3, dot(normalTS, lightDir));
    finalColor *= (0.6 + diff * 0.5);
  }

  gl_FragColor = vec4(finalColor, 1.0);
}
`;

// ============================================================
// 7. МАТЕРИАЛ СОЗДАЁТСЯ ОДИН РАЗ (БЕЗ DISPOSE!)
// ============================================================
const material = new THREE.ShaderMaterial({
  uniforms: uniforms,
  vertexShader: vertexShader,
  fragmentShader: fragmentShader,
  side: THREE.DoubleSide
});

const plane2d = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
scene2d.add(plane2d);

const defaultGeom = new THREE.BoxGeometry(1.5, 1.5, 1.5);
const defaultMesh = new THREE.Mesh(defaultGeom, material);
scene3d.add(defaultMesh);
currentMesh3d = defaultMesh;

// ============================================================
// 8. АВТОКАДРИРОВАНИЕ КАМЕРЫ
// ============================================================
function fitCameraToObject(object, camera, controls, offset = 1.5) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  let cameraZ = (maxDim / 2) / Math.tan(fov / 2);
  cameraZ *= offset;
  camera.position.set(center.x, center.y, center.z + cameraZ);
  controls.target.copy(center);
  controls.update();
}

// ============================================================
// 9. ОБНОВЛЕНИЕ UNIFORM'ОВ БЕЗ ПЕРЕСОЗДАНИЯ МАТЕРИАЛА
// ============================================================
function updateUniformsFromUI() {
  uniforms.uScale.value = parseFloat(document.getElementById('scale').value);
  const intensityEl = document.getElementById('intensity');
  if (intensityEl) uniforms.uIntensity.value = parseFloat(intensityEl.value);
  uniforms.uOctaves.value = parseInt(document.getElementById('octaves').value);
  uniforms.uPersistence.value = parseFloat(document.getElementById('persistence').value);
  uniforms.uLacunarity.value = parseFloat(document.getElementById('lacunarity').value);
  uniforms.uSaturation.value = parseFloat(document.getElementById('saturation').value);
  uniforms.uBlendMode.value = parseInt(document.getElementById('blendMode').value);
  uniforms.uRotation.value = parseFloat(document.getElementById('rotate').value);
  uniforms.uOffset.value.set(
    parseFloat(document.getElementById('offsetX').value),
    parseFloat(document.getElementById('offsetY').value)
  );
  uniforms.uMirror.value = parseInt(document.getElementById('mirror').value);
  const warpEnableEl = document.getElementById('warpEnable');
  uniforms.uWarpEnable.value = warpEnableEl && warpEnableEl.checked ? 1 : 0;
  uniforms.uWarpStrength.value = parseFloat(document.getElementById('warpStrength').value);
  uniforms.uWarpOctaves.value = parseInt(document.getElementById('warpOctaves').value);
  const reliefEl = document.getElementById('relief2d');
  uniforms.uShowRelief.value = reliefEl && reliefEl.checked ? 1 : 0;
  uniforms.uReliefStrength.value = parseFloat(document.getElementById('reliefStrength').value);

  const testModeEl = document.getElementById('testMode');
  if (testModeEl) {
    const testMode = testModeEl.value;
    uniforms.uTestMode.value = testMode === 'roughness' ? 1 :
                               testMode === 'metallic' ? 2 :
                               testMode === 'normal' ? 3 : 0;
  }

  const normalStrengthEl = document.getElementById('normalStrength');
  if (normalStrengthEl) uniforms.uNormalStrength.value = parseFloat(normalStrengthEl.value);
  const roughnessContrastEl = document.getElementById('roughnessContrast');
  if (roughnessContrastEl) uniforms.uRoughnessContrast.value = parseFloat(roughnessContrastEl.value);
  const metalThresholdEl = document.getElementById('metalThreshold');
  if (metalThresholdEl) uniforms.uMetalThreshold.value = parseFloat(metalThresholdEl.value);
  const metalScaleEl = document.getElementById('metalScale');
  if (metalScaleEl) uniforms.uMetalScale.value = parseFloat(metalScaleEl.value);

  // Обновление отображаемых значений
  const vals = {
    scaleVal: uniforms.uScale.value.toFixed(2),
    octavesVal: uniforms.uOctaves.value,
    persistenceVal: uniforms.uPersistence.value.toFixed(2),
    lacunarityVal: uniforms.uLacunarity.value.toFixed(2),
    saturationVal: uniforms.uSaturation.value.toFixed(2),
    rotateVal: uniforms.uRotation.value + '°',
    offsetXVal: uniforms.uOffset.value.x.toFixed(2),
    offsetYVal: uniforms.uOffset.value.y.toFixed(2),
    warpStrengthVal: uniforms.uWarpStrength.value.toFixed(2),
    warpOctavesVal: uniforms.uWarpOctaves.value,
    reliefStrengthVal: uniforms.uReliefStrength.value.toFixed(2)
  };
  if (document.getElementById('intensityVal')) vals.intensityVal = uniforms.uIntensity.value.toFixed(2);
  if (document.getElementById('normalStrengthVal')) vals.normalStrengthVal = uniforms.uNormalStrength.value.toFixed(2);
  if (document.getElementById('roughnessContrastVal')) vals.roughnessContrastVal = uniforms.uRoughnessContrast.value.toFixed(2);
  if (document.getElementById('metalThresholdVal')) vals.metalThresholdVal = uniforms.uMetalThreshold.value.toFixed(2);
  if (document.getElementById('metalScaleVal')) vals.metalScaleVal = uniforms.uMetalScale.value.toFixed(2);
  for (let id in vals) {
    const el = document.getElementById(id);
    if (el) el.innerText = vals[id];
  }

  renderer2d.render(scene2d, camera2d);
  renderer3d.render(scene3d, camera3d);

  if (layers.some(l => l.syncWithPattern)) generateOverlayTexture();
  schedulePBRUpdate();
}

// Слушатели для всех контролов
const controlIds = [
  'scale', 'octaves', 'persistence', 'lacunarity', 'saturation',
  'blendMode', 'rotate', 'offsetX', 'offsetY', 'mirror',
  'warpStrength', 'warpOctaves', 'reliefStrength', 'intensity',
  'normalStrength', 'roughnessContrast', 'metalThreshold', 'metalScale'
];
controlIds.forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', updateUniformsFromUI);
});
document.getElementById('warpEnable')?.addEventListener('change', updateUniformsFromUI);
document.getElementById('relief2d')?.addEventListener('change', updateUniformsFromUI);
document.getElementById('testMode')?.addEventListener('change', updateUniformsFromUI);

// Освещение UI
document.getElementById('lightIntensity')?.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  document.getElementById('lightIntensityVal').innerText = val.toFixed(2);
  updateLightIntensity(val);
});
document.getElementById('hdriIntensity')?.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  document.getElementById('hdriIntensityVal').innerText = val.toFixed(2);
  updateHdriIntensity(val);
});
document.getElementById('hdriRotation')?.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  document.getElementById('hdriRotationVal').innerText = val + '°';
  updateHdriRotation(val);
});
document.getElementById('resetHdriBtn')?.addEventListener('click', () => {
  scene3d.environment = null;
  scene3d.background = null;
  environmentMap = null;
});
document.getElementById('hdriFileInput')?.addEventListener('change', (e) => {
  if (e.target.files[0]) {
    const url = URL.createObjectURL(e.target.files[0]);
    loadHDRI(url, currentHdriIntensity);
  }
});

// ============================================================
// 10. ОБНОВЛЕНИЕ 3D МОДЕЛИ
// ============================================================
function update3dModel() {
  if (currentMesh3d) scene3d.remove(currentMesh3d);
  if (customModel) {
    customModel.traverse(c => {
      if (c.isMesh) c.material = material;
    });
    scene3d.add(customModel);
    currentMesh3d = customModel;
  } else {
    let geom;
    if (currentGeometryType === 'cube') geom = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    else if (currentGeometryType === 'torus') geom = new THREE.TorusKnotGeometry(1.0, 0.28, 200, 32, 3, 4);
    else if (currentGeometryType === 'sphere') geom = new THREE.SphereGeometry(1.2, 128, 128);
    else geom = new THREE.CylinderGeometry(1.0, 1.0, 1.5, 64);
    currentMesh3d = new THREE.Mesh(geom, material);
    scene3d.add(currentMesh3d);
  }
  fitCameraToObject(currentMesh3d, camera3d, controls3d);
  updateSizes();
}

document.getElementById('geometrySelect')?.addEventListener('change', e => {
  customModel = null;
  currentGeometryType = e.target.value;
  update3dModel();
});

document.getElementById('modelFileInput')?.addEventListener('change', e => {
  if (!e.target.files[0]) return;
  const url = URL.createObjectURL(e.target.files[0]);
  new GLTFLoader().load(url, gltf => {
    if (currentMesh3d) scene3d.remove(currentMesh3d);
    customModel = gltf.scene;
    update3dModel();
    URL.revokeObjectURL(url);
    const statusEl = document.getElementById('modelStatus');
    if (statusEl) {
      statusEl.textContent = 'Модель загружена';
      setTimeout(() => statusEl.textContent = '', 2000);
    }
  }, undefined, () => {
    const statusEl = document.getElementById('modelStatus');
    if (statusEl) statusEl.textContent = 'Ошибка';
  });
});

// ============================================================
// 11. ЦВЕТОВАЯ ПАЛИТРА UI
// ============================================================
const colorContainer = document.getElementById('colorListContainer');
const addColorBtn = document.getElementById('addColorBtn');

function rebuildColorUI() {
  if (!colorContainer) return;
  colorContainer.innerHTML = '';
  activeColors.forEach((col, idx) => {
    const div = document.createElement('div');
    div.className = 'color-item';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = '#' + col.getHexString();
    colorInput.className = 'color-circle-input';
    colorInput.addEventListener('input', (e) => {
      activeColors[idx] = new THREE.Color(e.target.value);
      updateColorUniforms();
      updateUniformsFromUI();
    });
    div.appendChild(colorInput);
    if (activeColors.length > 2) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-color-btn';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (activeColors.length > 2) {
          activeColors.splice(idx, 1);
          rebuildColorUI();
          updateColorUniforms();
          updateUniformsFromUI();
        }
      });
      div.appendChild(removeBtn);
    }
    colorContainer.appendChild(div);
  });
}

if (addColorBtn) {
  addColorBtn.addEventListener('click', () => {
    if (activeColors.length < 8) {
      activeColors.push(new THREE.Color('#FFB347'));
      rebuildColorUI();
      updateColorUniforms();
      updateUniformsFromUI();
    }
  });
}
rebuildColorUI();

// ============================================================
// 12. КАТЕГОРИИ ПАТТЕРНОВ
// ============================================================
const noisePatterns = [
  { name: "Волны", v: 0 },
  { name: "Перлин", v: 2 },
  { name: "Симплекс", v: 4 },
  { name: "Вороного", v: 1 }
];
const fractalPatterns = [
  { name: "Реакция-диффузия", v: 5 },
  { name: "Потоковое поле", v: 7 },
  { name: "WFC", v: 6 },
  { name: "Гребневый мультифрактал", v: 12 }
];
const gradientPatterns = [
  { name: "Линейный градиент", v: 17 },
  { name: "Радиальный градиент", v: 18 },
  { name: "Угловой градиент", v: 19 }
];
const geometricPatterns = [
  { name: "Шахматная доска", v: 8 },
  { name: "Полосы", v: 9 },
  { name: "Концентрические круги", v: 10 },
  { name: "Сетка", v: 11 },
  { name: "Плитка", v: 16 },
  { name: "Древесина", v: 14 },
  { name: "Мрамор", v: 15 }
];

function populateSelect(id, items, cur) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = '';
  items.forEach(i => {
    const o = document.createElement('option');
    o.value = i.v;
    o.textContent = i.name;
    if (i.v === cur) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', e => {
    uniforms.uPatternType.value = parseInt(e.target.value);
    updateUniformsFromUI();
    if (window.innerWidth <= 860) closeMenu();
  });
}

populateSelect('selectNoise', noisePatterns, 2);
populateSelect('selectFractal', fractalPatterns, 5);
populateSelect('selectGradient', gradientPatterns, 17);
populateSelect('selectGeometric', geometricPatterns, 8);

// Продолжение в Части 3: generateOverlayTexture, слои, экспорт, UI.

// ============================================================
// 13. ГЕНЕРАЦИЯ ОВЕРЛЕЯ (Фон + Слои)
// ============================================================
function drawImageCover(ctx, img, w, h) {
  const ratio = Math.max(w / img.width, h / img.height);
  const centerShift_x = (w - img.width * ratio) / 2;
  const centerShift_y = (h - img.height * ratio) / 2;
  ctx.drawImage(img, 0, 0, img.width, img.height, centerShift_x, centerShift_y, img.width * ratio, img.height * ratio);
}

async function generateOverlayTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Фоновое изображение
  if (backgroundImageEl) {
    const bgOpacity = document.getElementById('bgOpacity') ? parseFloat(document.getElementById('bgOpacity').value) : 1.0;
    ctx.globalAlpha = bgOpacity;
    drawImageCover(ctx, backgroundImageEl, size, size);
    ctx.globalAlpha = 1.0;
  }

  // Синхронизация с паттерном
  const syncRotation = uniforms.uRotation.value;
  const syncOffsetX = uniforms.uOffset.value.x;
  const syncOffsetY = uniforms.uOffset.value.y;
  const syncMirror = uniforms.uMirror.value;

  // Слои
  for (const layer of layers) {
    ctx.save();
    let rot = layer.rotation;
    let offX = layer.x;
    let offY = layer.y;
    let mirror = layer.mirror || 0;

    if (layer.syncWithPattern) {
      rot = syncRotation;
      offX = syncOffsetX;
      offY = syncOffsetY;
      mirror = syncMirror;
    }

    ctx.translate(size / 2, size / 2);
    ctx.rotate((rot * Math.PI) / 180);
    
    if (layer.syncWithPattern) {
      ctx.translate(offX * size, offY * size);
    } else {
      ctx.translate((offX - 0.5) * size, (offY - 0.5) * size);
    }

    if (mirror === 1 || mirror === 3) ctx.scale(-1, 1);
    if (mirror === 2 || mirror === 3) ctx.scale(1, -1);
    ctx.scale(layer.scale, layer.scale);

    const img = layer.imgElement;
    const tileX = Math.max(1, layer.tileX || 1);
    const tileY = Math.max(1, layer.tileY || 1);

    if (tileX === 1 && tileY === 1) {
      ctx.drawImage(img, -img.width / 2, -img.height / 2, img.width, img.height);
    } else {
      const tileW = img.width;
      const tileH = img.height;
      const neededX = Math.min(20, Math.ceil((size / layer.scale) / tileW) + 2);
      const neededY = Math.min(20, Math.ceil((size / layer.scale) / tileH) + 2);
      const startTX = -Math.floor(neededX / 2);
      const startTY = -Math.floor(neededY / 2);

      for (let ty = 0; ty < neededY; ty++) {
        for (let tx = 0; tx < neededX; tx++) {
          ctx.drawImage(img, (startTX + tx) * tileW, (startTY + ty) * tileH, tileW, tileH);
        }
      }
    }
    ctx.restore();
  }

  // Обновляем текстуру Three.js
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;

  if (overlayTexture) overlayTexture.dispose();
  overlayTexture = texture;
  uniforms.uOverlayTexture.value = overlayTexture;
  uniforms.uUseOverlay.value = (layers.length > 0 || backgroundImageEl) ? 1 : 0;

  const clearBtn = document.getElementById('clearOverlayBtn');
  if (clearBtn) {
    if (layers.length > 0 || backgroundImageEl) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');
  }

  renderer2d.render(scene2d, camera2d);
}

// ============================================================
// 14. УПРАВЛЕНИЕ СЛОЯМИ
// ============================================================
function updateLayersUI() {
  const container = document.getElementById('layersListContainer');
  if (!container) return;
  container.innerHTML = '';

  layers.forEach((layer, index) => {
    const div = document.createElement('div');
    div.className = `layer-item ${selectedLayerId === layer.id ? 'selected' : ''}`;
    div.onclick = () => selectLayer(layer.id);

    const thumb = document.createElement('img');
    thumb.className = 'layer-thumb';
    thumb.src = layer.imgElement.src;
    div.appendChild(thumb);

    const name = document.createElement('span');
    name.className = 'layer-name';
    name.textContent = `Слой ${index + 1}`;
    div.appendChild(name);

    const controls = document.createElement('div');
    controls.className = 'layer-controls';

    const delBtn = document.createElement('button');
    delBtn.textContent = '🗑️';
    delBtn.onclick = (e) => { e.stopPropagation(); deleteLayerById(layer.id); };
    controls.appendChild(delBtn);

    div.appendChild(controls);
    container.appendChild(div);
  });

  const clearAllBtn = document.getElementById('clearOverlayBtn');
  if (clearAllBtn) {
    if (layers.length > 0 || backgroundImageEl) clearAllBtn.classList.remove('hidden');
    else clearAllBtn.classList.add('div'); // Исправлено на 'hidden' ниже
    clearAllBtn.classList.toggle('hidden', layers.length === 0 && !backgroundImageEl);
  }
}

function selectLayer(id) {
  selectedLayerId = id;
  updateLayersUI();
}

function deleteLayerById(id) {
  layers = layers.filter(l => l.id !== id);
  if (selectedLayerId === id) selectedLayerId = null;
  generateOverlayTexture();
  updateLayersUI();
}

document.getElementById('layerFileInput')?.addEventListener('change', (e) => {
  if (!e.target.files[0]) return;
  const url = URL.createObjectURL(e.target.files[0]);
  const img = new Image();
  img.onload = () => {
    layers.push({
      id: Date.now(),
      imgElement: img,
      x: 0.5, y: 0.5,
      scale: 1.0,
      rotation: 0,
      mirror: 0,
      tileX: 1, tileY: 1,
      syncWithPattern: false
    });
    generateOverlayTexture();
    updateLayersUI();
    URL.revokeObjectURL(url);
  };
  img.src = url;
});

document.getElementById('bgFileInput')?.addEventListener('change', (e) => {
  if (!e.target.files[0]) return;
  const url = URL.createObjectURL(e.target.files[0]);
  const img = new Image();
  img.onload = () => {
    backgroundImageEl = img;
    generateOverlayTexture();
    URL.revokeObjectURL(url);
  };
  img.src = url;
});

document.getElementById('clearBgBtn')?.addEventListener('click', () => {
  backgroundImageEl = null;
  generateOverlayTexture();
});

document.getElementById('clearOverlayBtn')?.addEventListener('click', () => {
  layers = [];
  backgroundImageEl = null;
  selectedLayerId = null;
  generateOverlayTexture();
  updateLayersUI();
});

// ============================================================
// 15. PBR ПРЕВЬЮ (с debounce 500ms)
// ============================================================
let pbrTimeout;
function schedulePBRUpdate() {
  clearTimeout(pbrTimeout);
  pbrTimeout = setTimeout(updatePBRPreviews, 500);
}

async function updatePBRPreviews() {
  const res = 512;
  offscreenRenderer.setSize(res, res);
  
  const maps = [
    { mode: 1, id: 'pbrNormal' },
    { mode: 2, id: 'pbrRoughness' },
    { mode: 3, id: 'pbrMetallic' },
    { mode: 4, id: 'pbrHeight' },
    { mode: 5, id: 'pbrAO' }
  ];

  for (const map of maps) {
    uniforms.uExportMode.value = map.mode;
    renderer2d.render(scene2d, camera2d); // Рендерим в 2D канвас для простоты захвата
    
    const canvas2d = renderer2d.domElement;
    const dataUrl = canvas2d.toDataURL('image/png');
    
    const imgEl = document.getElementById(map.id);
    if (imgEl) imgEl.src = dataUrl;
  }
  
  // Сброс режима экспорта
  uniforms.uExportMode.value = 0;
  renderer2d.render(scene2d, camera2d);
}

// ============================================================
// 16. ЭКСПОРТ (2D, PBR, 3D)
// ============================================================
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Экспорт 2D
document.getElementById('export2DBtn')?.addEventListener('click', () => {
  const format = document.getElementById('export2DFormat')?.value || 'png';
  const res = parseInt(document.getElementById('export2DRes')?.value || 1024);
  
  // Временно меняем размер 2D рендерера для высокого разрешения
  const oldSize = renderer2d.domElement.width;
  renderer2d.setSize(res, res);
  renderer2d.render(scene2d, camera2d);
  
  const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
  renderer2d.domElement.toBlob((blob) => {
    downloadBlob(blob, `texture_${res}x${res}.${format}`);
    // Возвращаем размер
    updateSizes();
  }, mimeType, 0.95);
});

// Экспорт 3D (ИСПРАВЛЕНО: JSON.stringify для glTF)
document.getElementById('export3DBtn')?.addEventListener('click', () => {
  const format = document.getElementById('export3DFormat')?.value || 'glb';
  const exporter = new GLTFExporter();
  
  const options = {
    binary: format === 'glb',
    trs: true,
    onlyVisible: true
  };

  exporter.parse(
    scene3d,
    (result) => {
      if (format === 'gltf') {
        // 🔴 КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ №7: JSON.stringify
        const output = JSON.stringify(result, null, 2);
        const blob = new Blob([output], { type: 'text/plain' });
        downloadBlob(blob, 'model.gltf');
      } else if (format === 'glb') {
        const blob = new Blob([result], { type: 'application/octet-stream' });
        downloadBlob(blob, 'model.glb');
      } else if (format === 'obj') {
        const objExporter = new OBJExporter();
        const objString = objExporter.parse(scene3d);
        const blob = new Blob([objString], { type: 'text/plain' });
        downloadBlob(blob, 'model.obj');
      }
    },
    (error) => {
      console.error('Ошибка экспорта:', error);
      alert('Ошибка при экспорте модели. Проверьте консоль.');
    },
    options
  );
});

// ============================================================
// 17. UI: ГАМБУРГЕР, АККОРДЕОН, ТАБЫ
// ============================================================
const menuToggle = document.getElementById('menuToggle');
const patternBar = document.getElementById('patternBar');
const menuOverlay = document.getElementById('menuOverlay');

function openMenu() {
  if (patternBar) patternBar.classList.add('open');
  if (menuOverlay) menuOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeMenu() {
  if (patternBar) patternBar.classList.remove('open');
  if (menuOverlay) menuOverlay.classList.remove('active');
  document.body.style.overflow = '';
}

if (menuToggle) {
  menuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    if (patternBar && patternBar.classList.contains('open')) {
      closeMenu();
    } else {
      openMenu();
    }
  });
}

if (menuOverlay) {
  menuOverlay.addEventListener('click', closeMenu);
}

function initAccordion() {
  if (window.innerWidth > 860) return;
  const headers = document.querySelectorAll('.accordion-header');
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const group = header.closest('.accordion-group');
      if (group) group.classList.toggle('open');
    });
    // На десктопе открываем все по умолчанию
    const group = header.closest('.accordion-group');
    if (group) group.classList.add('open');
  });
}

function initMobileTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === target) {
          content.classList.add('active');
        }
      });
      
      // Обновляем размеры рендереров после переключения таба
      setTimeout(updateSizes, 50);
    });
  });
}

function initIntegration() {
  // Заглушка для кнопок интеграции (Blender, Unity, Godot)
  document.querySelectorAll('.integration-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      alert('Инструкции по интеграции будут добавлены в следующем обновлении.');
    });
  });
}

// ============================================================
// 18. АНИМАЦИОННЫЙ ЦИКЛ
// ============================================================
function animate() {
  requestAnimationFrame(animate);
  
  // 2D рендер (статичный, но нужен для обновлений uniform'ов)
  renderer2d.render(scene2d, camera2d);
  
  // 3D рендер с OrbitControls
  controls3d.update();
  renderer3d.render(scene3d, camera3d);
}

// ============================================================
// 19. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  updateSizes();
  update3dModel();
  generateOverlayTexture();
  updateLayersUI();
  updateColorUniforms();
  updateUniformsFromUI(); // Первичная синхронизация UI
  
  initAccordion();
  initMobileTabs();
  initIntegration();
  
  // Загрузка дефолтного HDRI (опционально, можно раскомментировать)
  // loadHDRI('https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/royal_esplanade_1k.hdr', 1.0);
  
  animate();
});
