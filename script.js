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

const offscreenRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
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

function ensureUIControls() {
  const paramsGroup = document.querySelector('.accordion-group:first-child .accordion-content');
  if (!paramsGroup) return;
  if (!document.getElementById('intensity')) {
    const row = document.createElement('div'); row.className = 'control-row';
    row.innerHTML = `<label>Интенсивность</label><input type="range" id="intensity" min="0" max="2" step="0.01" value="1.0"><span class="value-display" id="intensityVal">1.00</span>`;
    paramsGroup.appendChild(row);
    document.getElementById('intensity').addEventListener('input', () => { updateUniformsFromUI(); schedulePBRUpdate(); });
  }
  if (!document.getElementById('tile3dScale')) {
    const row = document.createElement('div'); row.className = 'control-row';
    row.innerHTML = `<label>Масштаб 3D</label><input type="range" id="tile3dScale" min="0.2" max="5" step="0.02" value="1.0"><span class="value-display" id="tile3dScaleVal">1.00</span>`;
    paramsGroup.appendChild(row);
    document.getElementById('tile3dScale').addEventListener('input', () => { updateUniformsFromUI(); schedulePBRUpdate(); });
  }
}

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
  uTime: { value: 0 }, uOverlayScale: { value: 1.0 }, uExportMode: { value: 0 }
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
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(blob);
  }
}


const vertexShader = `
varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vNormalW;
uniform float uTile3DScale;
void main() {
  vUv = uv * uTile3DScale;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
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
uniform float uTime;
uniform int uExportMode;
varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vNormalW;

float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}
vec2 hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(vec2(p.x * p.y, p.y * p.x)) * 2.0 - 1.0;
}
float perlinNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 grad00 = hash(i);
  vec2 grad10 = hash(i + vec2(1.0, 0.0));
  vec2 grad01 = hash(i + vec2(0.0, 1.0));
  vec2 grad11 = hash(i + vec2(1.0, 1.0));
  float dot00 = dot(grad00, f);
  float dot10 = dot(grad10, f - vec2(1.0, 0.0));
  float dot01 = dot(grad01, f - vec2(0.0, 1.0));
  float dot11 = dot(grad11, f - vec2(1.0, 1.0));
  return mix(mix(dot00, dot10, u.x), mix(dot01, dot11, u.x), u.y) * 0.5 + 0.5;
}
float fbmPerlin(vec2 st, int oct, float pers, float lac) {
  float val = 0.0, amp = 0.5, freq = 2.0;
  for(int i=0; i < 6; i++) {
    if(i >= oct) break;
    val += amp * (perlinNoise(st * freq) * 2.0 - 1.0);
    amp *= pers;
    freq *= lac;
  }
  return val * 0.5 + 0.5;
}
float worley(vec2 uv) {
  vec2 p = floor(uv);
  vec2 f = fract(uv);
  float res = 1.0;
  for(int j=-1; j <= 1; j++)
    for(int i=-1; i <= 1; i++) {
      vec2 b = vec2(float(i), float(j));
      vec2 r = b - f + random(p + b);
      res = min(res, dot(r,r));
    }
  return sqrt(res);
}
float truchetPattern(vec2 uv, float t) {
  uv = fract(uv * 3.0) - 0.5;
  float angle = sin(t + uv.x * 10.0) * cos(t + uv.y * 10.0);
  return step(length(uv), 0.4 + 0.2 * sin(angle * 20.0 + t));
}
vec2 domainWarp(vec2 uv, float strength, int octaves) {
  vec2 warped = uv;
  for(int i=0; i < 5; i++) {
    if(i >= octaves) break;
    warped += strength * vec2(sin(warped.y * 3.14159 * 2.0 * float(i+1) + uTime), cos(warped.x * 3.14159 * 2.0 * float(i+1) + uTime));
  }
  return warped;
}
float reactionDiffusion(vec2 uv) {
  vec2 p = uv * 4.0;
  float a = sin(p.x * 3.0) * cos(p.y * 3.0);
  float b = cos(p.x * 4.2) * sin(p.y * 4.2);
  return clamp(a * 0.5 + b * 0.5 + 0.5, 0.0, 1.0);
}
float flowField(vec2 uv) {
  vec2 q = uv * 3.0;
  float angle = sin(q.y * 0.7) * cos(q.x * 0.5);
  vec2 gradient = vec2(cos(angle), sin(angle));
  uv += gradient * 0.1;
  float field = sin(uv.x * 10.0) * cos(uv.y * 10.0);
  return smoothstep(-0.3, 0.7, field);
}
float wfcPattern(vec2 uv) {
  vec2 tile = floor(uv * 8.0);
  float hashVal = random(tile);
  int rule = int(floor(hashVal * 6.0));
  float pattern = 0.0;
  vec2 sub = fract(uv * 8.0);
  if(rule == 0) pattern = step(0.5, sub.x) * step(0.5, sub.y);
  else if(rule == 1) pattern = step(0.5, sub.x + sub.y);
  else if(rule == 2) pattern = step(0.5, sub.x - sub.y + 0.5);
  else if(rule == 3) pattern = sin(sub.x * 3.14159 * 4.0) * 0.5 + 0.5;
  else if(rule == 4) pattern = (sub.x > 0.25 && sub.x < 0.75 && sub.y > 0.25 && sub.y < 0.75) ? 1.0 : 0.0;
  else pattern = fract(sub.x * 3.0 + sub.y * 2.0);
  return pattern;
}
float ridgedMF(vec2 uv, int oct, float pers, float lac) {
  float val = 0.0, amp = 0.5, freq = 2.0;
  for(int i=0; i < 6; i++) {
    if(i >= oct) break;
    float n = perlinNoise(uv * freq) * 2.0 - 1.0;
    n = 1.0 - abs(n);
    val += amp * n;
    amp *= pers;
    freq *= lac;
  }
  return clamp(val, 0.0, 1.0);
}
float checker(vec2 uv, float freq) {
  vec2 p = floor(uv * freq);
  return mod(p.x + p.y, 2.0);
}
float stripes(vec2 uv, float freq) {
  return step(0.5, fract(uv.x * freq));
}
float circles(vec2 uv, float freq) {
  vec2 center = vec2(0.5, 0.5);
  float radius = length(uv - center) * freq;
  return fract(radius * 2.0);
}
float grid(vec2 uv, float freq) {
  vec2 g = fract(uv * freq);
  return max(step(0.92, g.x), step(0.92, g.y));
}
float tiles(vec2 uv, float freq) {
  vec2 f = fract(uv * freq);
  float line = step(0.75, f.x) + step(0.75, f.y);
  return clamp(1.0 - line, 0.0, 1.0);
}
float wood(vec2 uv, float freq) {
  vec2 center = vec2(0.5, 0.5);
  float dist = length(uv - center) * 2.0;
  float rings = sin(dist * freq * 12.0 + sin(uv.x * 8.0) * 1.5);
  return clamp(rings * 0.5 + 0.5, 0.0, 1.0);
}
float marble(vec2 uv, float freq) {
  float noise = fbmPerlin(uv * freq * 3.0, 4, 0.6, 2.0);
  float veins = sin((uv.x * freq * 5.0 + noise * 3.0) * 3.14159);
  return clamp(veins * 0.6 + 0.5, 0.0, 1.0);
}
float linearGradient(vec2 uv) { return uv.x; }
float radialGradient(vec2 uv) { return length(uv - 0.5) * 1.414; }
float angularGradient(vec2 uv) { return atan(uv.y - 0.5, uv.x - 0.5) / (2.0 * 3.14159) + 0.5; }

vec3 getColor(float t) {
  if (uColorsCount <= 1) return uColor0;
  float seg = 1.0 / float(uColorsCount - 1);
  float clampedT = clamp(t, 0.0, 1.0);
  int baseIdx = int(floor(clampedT / seg));
  if (baseIdx < 0) baseIdx = 0;
  if (baseIdx >= uColorsCount - 1) {
    if (uColorsCount == 2) return uColor1;
    else if (uColorsCount == 3) return uColor2;
    else if (uColorsCount == 4) return uColor3;
    else if (uColorsCount == 5) return uColor4;
    else if (uColorsCount == 6) return uColor5;
    else if (uColorsCount == 7) return uColor6;
    else return uColor7;
  }
  float localT = (clampedT - float(baseIdx) * seg) / seg;
  vec3 c1 = uColor0;
  vec3 c2 = uColor1;
  if (baseIdx == 0) { c1 = uColor0; c2 = uColor1; }
  else if (baseIdx == 1) { c1 = uColor1; c2 = uColor2; }
  else if (baseIdx == 2) { c1 = uColor2; c2 = uColor3; }
  else if (baseIdx == 3) { c1 = uColor3; c2 = uColor4; }
  else if (baseIdx == 4) { c1 = uColor4; c2 = uColor5; }
  else if (baseIdx == 5) { c1 = uColor5; c2 = uColor6; }
  else if (baseIdx == 6) { c1 = uColor6; c2 = uColor7; }
  return mix(c1, c2, localT);
}

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
  if(uWarpEnable == 1) st = domainWarp(st, uWarpStrength, uWarpOctaves);
  float patternValue;
  if(uPatternType == 0) { 
    float w1 = sin(st.x * 8.0) * cos(st.y * 8.0);
    float w2 = sin(st.y * 12.0 + st.x * 5.0);
    patternValue = (w1 + w2) * 0.6 + 0.5;
  }
  else if(uPatternType == 1) { 
    patternValue = worley(st * 3.5);
    patternValue = pow(patternValue * 1.2, 0.8);
  }
  else if(uPatternType == 2) { patternValue = fbmPerlin(st, uOctaves, uPersistence, uLacunarity); }
  else if(uPatternType == 4) { patternValue = random(st); }
  else if(uPatternType == 5) { patternValue = reactionDiffusion(st); }
  else if(uPatternType == 6) { patternValue = wfcPattern(st); }
  else if(uPatternType == 7) { patternValue = flowField(st); }
  else if(uPatternType == 12) { patternValue = ridgedMF(st, uOctaves, uPersistence, uLacunarity); }
  else if(uPatternType == 8) { patternValue = checker(st, 4.0); }
  else if(uPatternType == 9) { patternValue = stripes(st, 6.0); }
  else if(uPatternType == 10) { patternValue = circles(st, 3.0); }
  else if(uPatternType == 11) { patternValue = grid(st, 6.0); }
  else if(uPatternType == 14) { patternValue = wood(st, 0.8); }
  else if(uPatternType == 15) { patternValue = marble(st, 1.2); }
  else if(uPatternType == 16) { patternValue = tiles(st, 5.0); }
  else if(uPatternType == 17) { patternValue = linearGradient(uv); }
  else if(uPatternType == 18) { patternValue = radialGradient(uv); }
  else if(uPatternType == 19) { patternValue = angularGradient(uv); }
  else if(uPatternType == 3) { patternValue = truchetPattern(st * 3.0, uTime); patternValue = patternValue * 0.8 + 0.2; }
  else { patternValue = fbmPerlin(st, uOctaves, uPersistence, uLacunarity); }
  return clamp(patternValue * uIntensity, 0.0, 1.0);
}

void main() {
  vec3 blend = abs(vNormalW);
  blend = pow(blend, vec3(2.0));
  blend /= (blend.x + blend.y + blend.z);
  vec2 uvX = vWorldPosition.yz;
  vec2 uvY = vWorldPosition.xz;
  vec2 uvZ = vWorldPosition.xy;
  float triScale = 0.8;
  uvX *= triScale;
  uvY *= triScale;
  uvZ *= triScale;
  float patX = computePattern(uvX);
  float patY = computePattern(uvY);
  float patZ = computePattern(uvZ);
  float patternValue = patX * blend.x + patY * blend.y + patZ * blend.z;
  
  if (uExportMode == 0) {
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
      vec3 grad = vec3(dFdx(patternValue), dFdy(patternValue), 0.0);
      vec3 normal = normalize(vec3(-grad.x * uReliefStrength, -grad.y * uReliefStrength, 1.0));
      vec3 lightDir = normalize(vec3(0.8, 1.0, 0.3));
      float diff = max(0.3, dot(normal, lightDir));
      finalColor = finalColor * (0.6 + diff * 0.5);
    }
    gl_FragColor = vec4(finalColor, 1.0);
  } else if (uExportMode == 1) {
    vec3 grad = vec3(dFdx(patternValue), dFdy(patternValue), 0.0);
    vec3 normalTS = normalize(vec3(-grad.x, -grad.y, 1.0));
    gl_FragColor = vec4(normalTS * 0.5 + 0.5, 1.0);
  } else if (uExportMode == 2) {
    float roughness = 0.2 + 0.8 * (1.0 - patternValue);
    roughness = clamp(roughness, 0.0, 1.0);
    gl_FragColor = vec4(roughness, roughness, roughness, 1.0);
  } else if (uExportMode == 3) {
    float metallic = smoothstep(0.3, 0.7, patternValue);
    gl_FragColor = vec4(metallic, metallic, metallic, 1.0);
  } else if (uExportMode == 4) {
    gl_FragColor = vec4(patternValue, patternValue, patternValue, 1.0);
  } else if (uExportMode == 5) {
    vec3 grad = vec3(dFdx(patternValue), dFdy(patternValue), 0.0);
    float intensity = length(grad);
    float ao = clamp(0.5 + patternValue * 0.5 - intensity * 0.8, 0.2, 1.0);
    gl_FragColor = vec4(ao, ao, ao, 1.0);
  } else {
    gl_FragColor = vec4(0.5, 0.5, 1.0, 1.0);
  }
}
`;
