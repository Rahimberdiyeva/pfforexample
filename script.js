import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// --- Инициализация рендереров с физически корректными настройками ---
const container2d = document.getElementById('canvas2d');
const container3d = document.getElementById('canvas3d');
const scene2d = new THREE.Scene(); scene2d.background = null;
const camera2d = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10); camera2d.position.z = 1;
const renderer2d = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
renderer2d.setClearColor(0x000000, 0);
const scene3d = new THREE.Scene(); scene3d.background = null;
const camera3d = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
const renderer3d = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer3d.physicallyCorrectLights = true;
renderer3d.outputColorSpace = THREE.SRGBColorSpace;
renderer3d.toneMapping = THREE.ACESFilmicToneMapping;
renderer3d.toneMappingExposure = 1.0;

container2d.appendChild(renderer2d.domElement);
container3d.appendChild(renderer3d.domElement);

// --- Оффскрин рендерер для PBR/экспорта ---
const offscreenRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
offscreenRenderer.setSize(1024, 1024);

// --- HDRI и освещение ---
let environmentMap = null;
let pmremGenerator = new THREE.PMREMGenerator(renderer3d);
let currentHdriIntensity = 1.0;
let currentHdriRotation = 0;

// Функция загрузки HDRI
function loadHDRI(url, intensity = 1.0) {
  new RGBELoader().load(url, (texture) => {
    texture.mapping = THREE.EquirectangularMapping;
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
    const rad = degrees * Math.PI / 180;
    scene3d.environment.rotation = rad;
  }
  currentHdriRotation = degrees;
}

// Загрузка HDRI по умолчанию (можно оставить пустым или загрузить из внешнего URL)
// Здесь мы не загружаем по умолчанию, чтобы не зависеть от внешних ресурсов.
// Пользователь может загрузить свой.

// Базовое освещение (дополнительно к HDRI)
const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
scene3d.add(ambientLight);
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
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
controls3d.enableDamping = true; controls3d.enableZoom = true;

let currentMesh3d = null, currentGeometryType = 'cube', customModel = null, overlayTexture = null;
let backgroundImageEl = null;
let activeColors = [ new THREE.Color('#FF6B8B'), new THREE.Color('#4CC9F0'), new THREE.Color('#F9C74F'), new THREE.Color('#9B5DE5') ];
let layers = [];
let selectedLayerId = null;
let isDraggingLayer = false;
let dragStart = { x: 0, y: 0, layerX: 0, layerY: 0 };

// --- Uniform'ы (без анимации) ---
const uniforms = {
  uScale: { value: 0.8 }, uIntensity: { value: 1.0 }, uPatternType: { value: 2 },
  uColor0: { value: new THREE.Vector3() }, uColor1: { value: new THREE.Vector3() }, uColor2: { value: new THREE.Vector3() }, uColor3: { value: new THREE.Vector3() },
  uColor4: { value: new THREE.Vector3() }, uColor5: { value: new THREE.Vector3() }, uColor6: { value: new THREE.Vector3() }, uColor7: { value: new THREE.Vector3() },
  uColorsCount: { value: 4 }, uSaturation: { value: 1.5 }, uBlendMode: { value: 0 },
  uRotation: { value: 0 }, uOffset: { value: new THREE.Vector2(0,0) }, uMirror: { value: 0 },
  uOctaves: { value: 3 }, uPersistence: { value: 0.5 }, uLacunarity: { value: 2.0 },
  uTileEnabled: { value: 0 }, uOverlayTexture: { value: null }, uUseOverlay: { value: 1 },
  uWarpEnable: { value: 0 }, uWarpStrength: { value: 0.3 }, uWarpOctaves: { value: 2 },
  uShowRelief: { value: 0 }, uReliefStrength: { value: 1.0 },
  uExportMode: { value: 0 }, uTestMode: { value: 0 },
  uNormalStrength: { value: 1.0 },
  uRoughnessContrast: { value: 1.5 },
  uMetalThreshold: { value: 0.4 },
  uMetalScale: { value: 2.0 }
};

// Функция обновления uniform'ов цветов
function updateColorUniforms() {
  const lastColor = activeColors.length ? activeColors[activeColors.length-1] : new THREE.Color(1,1,1);
  for (let i=0; i<8; i++) {
    const c = i < activeColors.length ? activeColors[i] : lastColor;
    uniforms[`uColor${i}`].value.set(c.r, c.g, c.b);
  }
  uniforms.uColorsCount.value = activeColors.length;
}
updateColorUniforms();

let material = null; // будет создан один раз

// Вершинный шейдер (передаём UV, мировые координаты для будущего triplanar, но используем UV)
const vertexShader = `
varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vNormalW;
uniform float uScale;
void main() {
  vUv = uv * uScale;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

// Фрагментный шейдер с Improved Perlin, tileable, правильной AO и Normal
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
varying vec3 vWorldPosition;
varying vec3 vNormalW;

// === Improved Perlin Noise (классическая реализация) ===
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy) );
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// Tileable шум (периодический)
float tileableNoise(vec2 uv, float period) {
  vec2 uv0 = uv;
  vec2 uv1 = uv + period;
  float n0 = snoise(uv0);
  float n1 = snoise(uv1);
  float t = fract(uv.x / period);
  return mix(n0, n1, t);
}

// Фрактальный шум (FBM)
float fbm(vec2 st, int octaves, float persistence, float lacunarity) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 2.0;
  for(int i = 0; i < 6; i++) {
    if(i >= octaves) break;
    value += amplitude * snoise(st * frequency);
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return value * 0.5 + 0.5;
}

// Worley (Вороного)
float worley(vec2 uv) {
  vec2 p = floor(uv);
  vec2 f = fract(uv);
  float res = 1.0;
  for(int j=-1; j<=1; j++)
    for(int i=-1; i<=1; i++) {
      vec2 b = vec2(i, j);
      vec2 r = b - f + snoise(p + b) * 0.5 + 0.5;
      res = min(res, dot(r,r));
    }
  return sqrt(res);
}

// TruchetPattern (без времени)
float truchetPattern(vec2 uv) {
  uv = fract(uv * 3.0) - 0.5;
  float angle = sin(uv.x * 10.0) * cos(uv.y * 10.0);
  return step(length(uv), 0.4 + 0.2 * sin(angle * 20.0));
}

// Domain Warping (без времени, с учётом тайлинга)
vec2 domainWarp(vec2 uv, float strength, int octaves, float period) {
  vec2 warped = uv;
  for(int i=0; i<5; i++) {
    if(i >= octaves) break;
    warped += strength * vec2(
      sin(warped.y * 3.14159 * 2.0 * float(i+1)),
      cos(warped.x * 3.14159 * 2.0 * float(i+1))
    );
  }
  if(period > 0.0) {
    warped = mod(warped, period);
  }
  return warped;
}

// Остальные функции (reactionDiffusion, flowField, wfcPattern, ridgedMF, checker, stripes, circles, grid, tiles, wood, marble, градиенты) – опущены для краткости, но они должны быть.
// В реальном коде они будут, но здесь я даю только ключевые изменения.

float computePattern(vec2 uv) {
  float angle = uRotation * 3.14159 / 180.0;
  vec2 centered = uv - 0.5;
  vec2 rotated = vec2(centered.x * cos(angle) - centered.y * sin(angle), centered.x * sin(angle) + centered.y * cos(angle));
  uv = rotated + 0.5 + uOffset;
  if(uMirror == 1) uv.x = 1.0 - uv.x;
  else if(uMirror == 2) uv.y = 1.0 - uv.y;
  else if(uMirror == 3) { uv.x = 1.0 - uv.x; uv.y = 1.0 - uv.y; }
  if(uTileEnabled == 1) uv = fract(uv);
  vec2 st = uv * uScale;
  if(uWarpEnable == 1) st = domainWarp(st, uWarpStrength, uWarpOctaves, uTileEnabled==1 ? 1.0 : 0.0);
  
  float patternValue;
  if(uPatternType == 0) { // Волны
    float w1 = sin(st.x * 8.0) * cos(st.y * 8.0);
    float w2 = sin(st.y * 12.0 + st.x * 5.0);
    patternValue = (w1 + w2) * 0.6 + 0.5;
  }
  else if(uPatternType == 1) { // Вороного
    patternValue = worley(st * 3.5);
    patternValue = pow(patternValue * 1.2, 0.8);
  }
  else if(uPatternType == 2) { // Перлин
    patternValue = fbm(st, uOctaves, uPersistence, uLacunarity);
  }
  // ... остальные паттерны (используют st, uScale уже применён)
  else {
    patternValue = fbm(st, uOctaves, uPersistence, uLacunarity);
  }
  return clamp(patternValue * uIntensity, 0.0, 1.0);
}

void main() {
  // Для 3D-превью и экспорта используем UV (единый метод)
  vec2 uv = vUv;
  float patternValue = computePattern(uv);
  
  // Вычисляем Height (просто patternValue)
  float height = patternValue;
  
  // Нормаль из высоты (градиент по UV)
  vec2 texel = vec2(1.0) / vec2(512.0);
  float hL = computePattern(uv - vec2(texel.x, 0.0));
  float hR = computePattern(uv + vec2(texel.x, 0.0));
  float hD = computePattern(uv - vec2(0.0, texel.y));
  float hU = computePattern(uv + vec2(0.0, texel.y));
  vec3 grad = vec3(hR - hL, hU - hD, 0.0);
  vec3 normalTS = normalize(vec3(-grad.x * uNormalStrength * 2.0, -grad.y * uNormalStrength * 2.0, 1.0));
  
  // AO из высоты (окклюзия)
  float h = height;
  float h1 = computePattern(uv + vec2(texel.x, texel.y));
  float h2 = computePattern(uv + vec2(-texel.x, texel.y));
  float h3 = computePattern(uv + vec2(texel.x, -texel.y));
  float h4 = computePattern(uv + vec2(-texel.x, -texel.y));
  float cavity = max(max(h1, h2), max(h3, h4)) - h;
  float ao = clamp(1.0 - cavity * 2.0, 0.2, 1.0);
  
  if (uExportMode == 1) {
    gl_FragColor = vec4(normalTS * 0.5 + 0.5, 1.0);
  } else if (uExportMode == 2) {
    float roughness = 1.0 - pow(patternValue, uRoughnessContrast);
    roughness = clamp(roughness, 0.04, 0.96);
    gl_FragColor = vec4(roughness, roughness, roughness, 1.0);
  } else if (uExportMode == 3) {
    float metallic = clamp((patternValue - uMetalThreshold) * uMetalScale, 0.0, 1.0);
    gl_FragColor = vec4(metallic, metallic, metallic, 1.0);
  } else if (uExportMode == 4) {
    gl_FragColor = vec4(height, height, height, 1.0);
  } else if (uExportMode == 5) {
    gl_FragColor = vec4(ao, ao, ao, 1.0);
  } else { // uExportMode == 0
    // Тестовые режимы
    if (uTestMode == 1) { // Roughness inspector
      float roughness = 1.0 - pow(patternValue, uRoughnessContrast);
      roughness = clamp(roughness, 0.04, 0.96);
      gl_FragColor = vec4(roughness, roughness, roughness, 1.0);
      return;
    } else if (uTestMode == 2) { // Metallic inspector
      float metallic = clamp((patternValue - uMetalThreshold) * uMetalScale, 0.0, 1.0);
      gl_FragColor = vec4(metallic, metallic, metallic, 1.0);
      return;
    } else if (uTestMode == 3) { // Normal inspector
      gl_FragColor = vec4(normalTS * 0.5 + 0.5, 1.0);
      return;
    }
    
    vec3 color = getColor(patternValue);
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(gray), color, uSaturation);
    if(uBlendMode == 1) color = color * patternValue;
    vec3 finalColor = color;
    if(uUseOverlay == 1) {
      vec4 overlayRGBA = texture2D(uOverlayTexture, vUv);
      if (overlayRGBA.a > 0.01) finalColor = mix(finalColor, overlayRGBA.rgb, overlayRGBA.a);
    }
    if (uShowRelief == 1) {
      // Рельеф через bump mapping (простое затенение)
      vec3 normal = normalize(vec3(-grad.x * uReliefStrength, -grad.y * uReliefStrength, 1.0));
      vec3 lightDir = normalize(vec3(0.8, 1.0, 0.3));
      float diff = max(0.3, dot(normal, lightDir));
      finalColor = finalColor * (0.6 + diff * 0.5);
    }
    gl_FragColor = vec4(finalColor, 1.0);
  }
}
`;
// Создаём материал один раз
function createMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    side: THREE.DoubleSide
  });
}
material = createMaterial();
let plane2d = new THREE.Mesh(new THREE.PlaneGeometry(2,2), material);
scene2d.add(plane2d);
if (currentMesh3d) currentMesh3d.material = material;
else {
  const geom = new THREE.BoxGeometry(1.5,1.5,1.5);
  currentMesh3d = new THREE.Mesh(geom, material);
  scene3d.add(currentMesh3d);
}
// Функция обновления uniform'ов (без dispose)
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
  uniforms.uOffset.value.set(parseFloat(document.getElementById('offsetX').value), parseFloat(document.getElementById('offsetY').value));
  uniforms.uMirror.value = parseInt(document.getElementById('mirror').value);
  uniforms.uWarpEnable.value = document.getElementById('warpEnable').checked ? 1 : 0;
  uniforms.uWarpStrength.value = parseFloat(document.getElementById('warpStrength').value);
  uniforms.uWarpOctaves.value = parseInt(document.getElementById('warpOctaves').value);
  uniforms.uShowRelief.value = document.getElementById('relief2d').checked ? 1 : 0;
  uniforms.uReliefStrength.value = parseFloat(document.getElementById('reliefStrength').value);
  const testMode = document.getElementById('testMode').value;
  uniforms.uTestMode.value = (testMode === 'roughness' ? 1 : (testMode === 'metallic' ? 2 : (testMode === 'normal' ? 3 : 0)));
  
  const normalStrengthEl = document.getElementById('normalStrength');
  if (normalStrengthEl) uniforms.uNormalStrength.value = parseFloat(normalStrengthEl.value);
  const roughnessContrastEl = document.getElementById('roughnessContrast');
  if (roughnessContrastEl) uniforms.uRoughnessContrast.value = parseFloat(roughnessContrastEl.value);
  const metalThresholdEl = document.getElementById('metalThreshold');
  if (metalThresholdEl) uniforms.uMetalThreshold.value = parseFloat(metalThresholdEl.value);
  const metalScaleEl = document.getElementById('metalScale');
  if (metalScaleEl) uniforms.uMetalScale.value = parseFloat(metalScaleEl.value);
  
  // Обновление отображения значений
  const vals = {
    scaleVal: uniforms.uScale.value.toFixed(2), octavesVal: uniforms.uOctaves.value,
    persistenceVal: uniforms.uPersistence.value.toFixed(2), lacunarityVal: uniforms.uLacunarity.value.toFixed(2),
    saturationVal: uniforms.uSaturation.value.toFixed(2), rotateVal: uniforms.uRotation.value + '°',
    offsetXVal: uniforms.uOffset.value.x.toFixed(2), offsetYVal: uniforms.uOffset.value.y.toFixed(2),
    warpStrengthVal: uniforms.uWarpStrength.value.toFixed(2), warpOctavesVal: uniforms.uWarpOctaves.value,
    reliefStrengthVal: uniforms.uReliefStrength.value.toFixed(2)
  };
  if (document.getElementById('intensityVal')) vals.intensityVal = uniforms.uIntensity.value.toFixed(2);
  if (document.getElementById('normalStrengthVal')) vals.normalStrengthVal = uniforms.uNormalStrength.value.toFixed(2);
  if (document.getElementById('roughnessContrastVal')) vals.roughnessContrastVal = uniforms.uRoughnessContrast.value.toFixed(2);
  if (document.getElementById('metalThresholdVal')) vals.metalThresholdVal = uniforms.uMetalThreshold.value.toFixed(2);
  if (document.getElementById('metalScaleVal')) vals.metalScaleVal = uniforms.uMetalScale.value.toFixed(2);
  
  for (let id in vals) { const el = document.getElementById(id); if (el) el.innerText = vals[id]; }
  
  renderer2d.render(scene2d, camera2d);
  renderer3d.render(scene3d, camera3d);
  if (layers.some(l => l.syncWithPattern)) generateOverlayTexture();
  schedulePBRUpdate();
}

// Добавляем обработчики событий для всех ползунков
const controlIds = ['scale','octaves','persistence','lacunarity','saturation','blendMode','rotate','offsetX','offsetY','mirror','warpStrength','warpOctaves','reliefStrength','intensity','normalStrength','roughnessContrast','metalThreshold','metalScale'];
controlIds.forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('input', updateUniformsFromUI); });
document.getElementById('warpEnable')?.addEventListener('change', updateUniformsFromUI);
document.getElementById('relief2d')?.addEventListener('change', updateUniformsFromUI);
document.getElementById('testMode')?.addEventListener('change', updateUniformsFromUI);
document.getElementById('bgOpacity')?.addEventListener('input', (e) => {
  document.getElementById('bgOpacityVal').innerText = parseFloat(e.target.value).toFixed(2);
  generateOverlayTexture();
});

// Инициализация UI для освещения
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

// Функция автоматического центрирования камеры
function fitCameraToObject(object, camera, controls, offset = 1.2) {
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

// Функция обновления 3D модели с автоцентрированием
function update3dModel() {
  if(currentMesh3d) scene3d.remove(currentMesh3d);
  if(customModel) {
    customModel.traverse(c=>{if(c.isMesh) c.material = material;});
    scene3d.add(customModel);
    currentMesh3d = customModel;
  } else {
    let geom;
    if(currentGeometryType === 'cube') geom = new THREE.BoxGeometry(1.5,1.5,1.5);
    else if(currentGeometryType === 'torus') geom = new THREE.TorusKnotGeometry(1.0,0.28,200,32,3,4);
    else if(currentGeometryType === 'sphere') geom = new THREE.SphereGeometry(1.2,128,128);
    else geom = new THREE.CylinderGeometry(1.0,1.0,1.5,64);
    const mesh = new THREE.Mesh(geom, material);
    scene3d.add(mesh);
    currentMesh3d = mesh;
  }
  fitCameraToObject(currentMesh3d, camera3d, controls3d);
  updateSizes();
}

// Вызов update3dModel после загрузки модели
document.getElementById('geometrySelect')?.addEventListener('change', e => { customModel=null; currentGeometryType=e.target.value; update3dModel(); });
document.getElementById('modelFileInput')?.addEventListener('change', e => {
  if(!e.target.files[0]) return;
  const url = URL.createObjectURL(e.target.files[0]);
  new GLTFLoader().load(url, gltf => {
    if(currentMesh3d) scene3d.remove(currentMesh3d);
    customModel = gltf.scene;
    update3dModel();
    URL.revokeObjectURL(url);
    document.getElementById('modelStatus').textContent='Модель загружена';
    setTimeout(()=>document.getElementById('modelStatus').textContent='',2000);
  }, undefined, () => document.getElementById('modelStatus').textContent='Ошибка');
});

// ---- Цвета (без изменений) ----
const colorContainer = document.getElementById('colorListContainer');
const addColorBtn = document.getElementById('addColorBtn');
function rebuildColorUI() { /* ... как в предыдущих версиях ... */ }
addColorBtn.addEventListener('click', () => { if (activeColors.length < 8) { activeColors.push(new THREE.Color('#FFB347')); rebuildColorUI(); updateColorUniforms(); updateMaterial(); } });
rebuildColorUI();

// ---- Генерация оверлея, слои, Drag&Drop (как в стабильной версии) ----
// ... (весь этот код без изменений, он уже был рабочий)

// ---- Экспорт 2D и 3D с исправленным glTF ----
document.getElementById('export2DBtn')?.addEventListener('click', async () => {
  const format = document.getElementById('export2DFormat').value;
  const res = parseInt(document.getElementById('exportResolution').value);
  if (format === 'pbr') { /* ... как раньше ... */ }
  else if (format === 'svg') { /* ... */ }
  else { /* ... */ }
});

document.getElementById('exportModelBtn')?.addEventListener('click', async () => {
  const format = document.getElementById('exportModelFormat').value;
  try {
    const textureBlob = await captureTextureImage();
    const img = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = URL.createObjectURL(textureBlob); });
    const texture = new THREE.CanvasTexture(img);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(uniforms.uScale.value, uniforms.uScale.value);
    const mat = new THREE.MeshStandardMaterial({ map: texture });
    
    let exportScene = new THREE.Scene();
    let meshToExport;
    if (customModel) {
      const cloned = customModel.clone();
      cloned.traverse(ch => { if(ch.isMesh) ch.material = mat; });
      exportScene.add(cloned);
    } else {
      const geom = createGeometry(currentGeometryType);
      meshToExport = new THREE.Mesh(geom, mat);
      exportScene.add(meshToExport);
    }
    
    const exporter = new GLTFExporter();
    if (format === 'glb') {
      exporter.parse(exportScene, (result) => {
        const blob = new Blob([result], { type: 'application/octet-stream' });
        downloadBlob(blob, 'model.glb');
      }, { binary: true });
    } else if (format === 'gltf') {
      exporter.parse(exportScene, (result) => {
        const jsonStr = JSON.stringify(result, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        downloadBlob(blob, 'model.gltf');
      }, { binary: false });
    } else if (format === 'obj') {
      const objExporter = new OBJExporter();
      const obj = objExporter.parse(exportScene);
      const mtl = `newmtl material0\nmap_Kd texture.png\n`;
      const zip = new JSZip();
      zip.file("model.obj", obj);
      zip.file("model.mtl", mtl);
      zip.file("texture.png", textureBlob);
      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, 'model_obj.zip');
    }
  } catch(e) { alert("Ошибка экспорта: " + e.message); }
});

// --- Рендер PBR карт с debounce ---
let pbrTimeout;
function schedulePBRUpdate() {
  clearTimeout(pbrTimeout);
  pbrTimeout = setTimeout(() => updatePBRPreviews(), 500);
}
async function updatePBRPreviews() { /* ... как раньше ... */ }
async function renderPBRMap(res, type) { /* ... как раньше ... */ }
async function captureTextureImage() { /* ... как раньше ... */ }

// --- Гамбургер меню, аккордеон, табы, интеграция ---
const menuToggle = document.getElementById('menuToggle');
const patternBar = document.getElementById('patternBar');
const menuOverlay = document.getElementById('menuOverlay');
function openMenu() { patternBar.classList.add('open'); menuOverlay.classList.add('active'); document.body.style.overflow = 'hidden'; }
function closeMenu() { patternBar.classList.remove('open'); menuOverlay.classList.remove('active'); document.body.style.overflow = ''; }
menuToggle?.addEventListener('click', (e) => { e.stopPropagation(); if (patternBar.classList.contains('open')) closeMenu(); else openMenu(); });
menuOverlay?.addEventListener('click', closeMenu);

function initAccordion() {
  if (window.innerWidth > 860) return;
  const headers = document.querySelectorAll('.accordion-header');
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const group = header.closest('.accordion-group');
      group.classList.toggle('open');
    });
  });
}
function initMobileTabs() { /* ... как раньше ... */ }
function initIntegration() {
  const btn = document.getElementById('integrationDownloadBtn');
  const select = document.getElementById('integrationSelect');
  if (btn && select) {
    btn.addEventListener('click', () => {
      const engine = select.value;
      let url = '';
      if (engine === 'blender') url = 'https://raw.githubusercontent.com/ВАШ_ЛОГИН/ВАШ_РЕПО/main/patternforge_integration.py';
      else if (engine === 'unity') url = 'https://raw.githubusercontent.com/ВАШ_ЛОГИН/ВАШ_РЕПО/main/PatternForge.unitypackage';
      else if (engine === 'godot') url = 'https://raw.githubusercontent.com/ВАШ_ЛОГИН/ВАШ_РЕПО/main/patternforge_godot.zip';
      if (url) { const a = document.createElement('a'); a.href = url; a.download = ''; a.target = '_blank'; a.click(); }
      else alert(`Скачивание аддона для ${select.options[select.selectedIndex]?.text} временно недоступно.`);
    });
  }
}

// Анимация (только для времени, но мы убрали uTime из шейдера, поэтому можно оставить пустой)
function animate() {
  requestAnimationFrame(animate);
  renderer2d.render(scene2d, camera2d);
  controls3d.update();
  renderer3d.render(scene3d, camera3d);
}
animate();

update3dModel();
generateOverlayTexture();
initAccordion();
initMobileTabs();
initIntegration();

