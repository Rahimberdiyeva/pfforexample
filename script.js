import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';

// --- ИНИЦИАЛИЗАЦИЯ ---
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

const offscreenRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });

function updateSizes() {
    const rect2d = container2d.parentElement.getBoundingClientRect();
    let size2d = Math.min(rect2d.width, rect2d.height);
    if (size2d <= 0) size2d = 256;
    renderer2d.setSize(size2d, size2d);
    const w3 = container3d.clientWidth, h3 = container3d.clientHeight;
    if (w3 && h3) { renderer3d.setSize(w3, h3); camera3d.aspect = w3 / h3; camera3d.updateProjectionMatrix(); }
}
new ResizeObserver(() => updateSizes()).observe(container3d);
new ResizeObserver(() => updateSizes()).observe(container2d.parentElement);
window.addEventListener('resize', updateSizes);
updateSizes();

const controls3d = new OrbitControls(camera3d, renderer3d.domElement);
controls3d.enableDamping = true; controls3d.enableZoom = true; controls3d.target.set(0, 0, 0);

scene3d.add(new THREE.AmbientLight(0xffffff, 0.5));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.2); keyLight.position.set(5, 5, 5); scene3d.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffffff, 0.6); fillLight.position.set(-3, 2, 4); scene3d.add(fillLight);
const backLight = new THREE.DirectionalLight(0xffffff, 0.5); backLight.position.set(0, 2, -5); scene3d.add(backLight);

let currentMesh3d = null, currentGeometryType = 'cube', customModel = null, overlayTexture = null, backgroundImageEl = null;
let activeColors = [ new THREE.Color('#FF6B8B'), new THREE.Color('#4CC9F0'), new THREE.Color('#F9C74F'), new THREE.Color('#9B5DE5') ];
let layers = [], selectedLayerId = null, isDraggingLayer = false, dragStart = { x: 0, y: 0, layerX: 0, layerY: 0 };
let overlayDirty = true; // флаг для оптимизации

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
    uExportMode: { value: 0 }, uTexelSize: { value: new THREE.Vector2(1/1024, 1/1024) },
    uNormalStrength: { value: 1.0 }, uRoughnessContrast: { value: 1.5 }, uMetalThreshold: { value: 0.4 }, uMetalScale: { value: 2.0 }
};

function updateColorUniforms() {
    const lastColor = activeColors.length ? activeColors[activeColors.length-1] : new THREE.Color(1,1,1);
    for (let i=0; i<8; i++) { const c = i < activeColors.length ? activeColors[i] : lastColor; uniforms[`uColor${i}`].value.set(c.r, c.g, c.b); }
    uniforms.uColorsCount.value = activeColors.length;
}
updateColorUniforms();

const vertexShader = `
varying vec2 vUv; varying vec3 vWorldPosition; varying vec3 vNormalW; uniform float uTile3DScale; 
void main() { vUv = uv * uTile3DScale; vec4 worldPos = modelMatrix * vec4(position, 1.0); vWorldPosition = worldPos.xyz; vNormalW = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * worldPos; }`;

const fragmentShader = `
precision highp float;
uniform float uScale; uniform float uIntensity; uniform int uPatternType;
uniform vec3 uColor0,uColor1,uColor2,uColor3,uColor4,uColor5,uColor6,uColor7; uniform int uColorsCount;
uniform float uSaturation; uniform int uBlendMode; uniform float uRotation; uniform vec2 uOffset; uniform int uMirror;
uniform int uOctaves; uniform float uPersistence; uniform float uLacunarity; uniform int uTileEnabled;
uniform sampler2D uOverlayTexture; uniform int uUseOverlay; uniform int uWarpEnable; uniform float uWarpStrength;
uniform int uWarpOctaves; uniform int uShowRelief; uniform float uReliefStrength; uniform int uExportMode;
uniform vec2 uTexelSize; uniform float uNormalStrength; uniform float uRoughnessContrast;
uniform float uMetalThreshold; uniform float uMetalScale;
varying vec2 vUv; varying vec3 vWorldPosition; varying vec3 vNormalW;

float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); }
vec2 hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(vec2(p.x * p.y, p.y * p.x)) * 2.0 - 1.0; }
float perlinNoise(vec2 st) { vec2 i = floor(st); vec2 f = fract(st); vec2 u = f * f * (3.0 - 2.0 * f); vec2 grad00 = hash(i); vec2 grad10 = hash(i + vec2(1.0, 0.0)); vec2 grad01 = hash(i + vec2(0.0, 1.0)); vec2 grad11 = hash(i + vec2(1.0, 1.0)); float dot00 = dot(grad00, f); float dot10 = dot(grad10, f - vec2(1.0, 0.0)); float dot01 = dot(grad01, f - vec2(0.0, 1.0)); float dot11 = dot(grad11, f - vec2(1.0, 1.0)); return mix(mix(dot00, dot10, u.x), mix(dot01, dot11, u.x), u.y) * 0.5 + 0.5; }
float fbmPerlin(vec2 st, int oct, float pers, float lac) { float val = 0.0, amp = 0.5, freq = 2.0; for(int i=0; i<6; i++) { if(i >= oct) break; val += amp * (perlinNoise(st * freq) * 2.0 - 1.0); amp *= pers; freq *= lac; } return val * 0.5 + 0.5; }
float worley(vec2 uv) { vec2 p = floor(uv); vec2 f = fract(uv); float res = 1.0; for(int j=-1; j<=1; j++) for(int i=-1; i<=1; i++) { vec2 b = vec2(float(i), float(j)); vec2 r = b - f + random(p + b); res = min(res, dot(r,r)); } return sqrt(res); }
float truchetPattern(vec2 uv, float t) { uv = fract(uv * 3.0) - 0.5; float angle = sin(t + uv.x * 10.0) * cos(t + uv.y * 10.0); return step(length(uv), 0.4 + 0.2 * sin(angle * 20.0 + t)); }
vec2 domainWarp(vec2 uv, float strength, int octaves) { vec2 warped = uv; for(int i=0; i<octaves; i++) { warped += strength * vec2(sin(warped.y * 3.14159 * 2.0 * float(i+1)), cos(warped.x * 3.14159 * 2.0 * float(i+1))); } return warped; }
float reactionDiffusion(vec2 uv) { vec2 p = uv * 4.0; float a = sin(p.x * 3.0) * cos(p.y * 3.0); float b = cos(p.x * 4.2) * sin(p.y * 4.2); return clamp(a * 0.5 + b * 0.5 + 0.5, 0.0, 1.0); }
float flowField(vec2 uv) { vec2 q = uv * 3.0; float angle = sin(q.y * 0.7) * cos(q.x * 0.5); vec2 gradient = vec2(cos(angle), sin(angle)); uv += gradient * 0.1; float field = sin(uv.x * 10.0) * cos(uv.y * 10.0); return smoothstep(-0.3, 0.7, field); }
float wfcPattern(vec2 uv) { vec2 tile = floor(uv * 8.0); float hashVal = random(tile); int rule = int(floor(hashVal * 6.0)); vec2 sub = fract(uv * 8.0); if(rule == 0) return step(0.5, sub.x) * step(0.5, sub.y); else if(rule == 1) return step(0.5, sub.x + sub.y); else if(rule == 2) return step(0.5, sub.x - sub.y + 0.5); else if(rule == 3) return sin(sub.x * 3.14159 * 4.0) * 0.5 + 0.5; else if(rule == 4) return (sub.x > 0.25 && sub.x < 0.75 && sub.y > 0.25 && sub.y < 0.75) ? 1.0 : 0.0; else return fract(sub.x * 3.0 + sub.y * 2.0); }
float ridgedMF(vec2 uv, int oct, float pers, float lac) { float val = 0.0, amp = 0.5, freq = 2.0; for(int i=0; i<6; i++) { if(i >= oct) break; float n = perlinNoise(uv * freq) * 2.0 - 1.0; n = 1.0 - abs(n); val += amp * n; amp *= pers; freq *= lac; } return clamp(val, 0.0, 1.0); }
float checker(vec2 uv, float freq) { vec2 p = floor(uv * freq); return mod(p.x + p.y, 2.0); }
float stripes(vec2 uv, float freq) { return step(0.5, fract(uv.x * freq)); }
float circles(vec2 uv, float freq) { vec2 center = vec2(0.5, 0.5); float radius = length(uv - center) * freq; return fract(radius * 2.0); }
float grid(vec2 uv, float freq) { vec2 g = fract(uv * freq); return max(step(0.92, g.x), step(0.92, g.y)); }
float tiles(vec2 uv, float freq) { vec2 f = fract(uv * freq); float line = step(0.75, f.x) + step(0.75, f.y); return clamp(1.0 - line, 0.0, 1.0); }
float wood(vec2 uv, float freq) { vec2 center = vec2(0.5, 0.5); float dist = length(uv - center) * 2.0; float rings = sin(dist * freq * 12.0 + sin(uv.x * 8.0) * 1.5); return clamp(rings * 0.5 + 0.5, 0.0, 1.0); }
float marble(vec2 uv, float freq) { float noise = fbmPerlin(uv * freq * 3.0, 4, 0.6, 2.0); float veins = sin((uv.x * freq * 5.0 + noise * 3.0) * 3.14159); return clamp(veins * 0.6 + 0.5, 0.0, 1.0); }
float linearGradient(vec2 uv) { return uv.x; }
float radialGradient(vec2 uv) { return length(uv - 0.5) * 1.414; }
float angularGradient(vec2 uv) { return atan(uv.y - 0.5, uv.x - 0.5) / (2.0 * 3.14159) + 0.5; }
vec3 getColor(float t) { if (uColorsCount <= 1) return uColor0; float seg = 1.0 / float(uColorsCount - 1); float clampedT = clamp(t, 0.0, 1.0); int baseIdx = int(floor(clampedT / seg)); if (baseIdx < 0) baseIdx = 0; if (baseIdx >= uColorsCount - 1) { if (uColorsCount == 2) return uColor1; if (uColorsCount == 3) return uColor2; if (uColorsCount == 4) return uColor3; if (uColorsCount == 5) return uColor4; if (uColorsCount == 6) return uColor5; if (uColorsCount == 7) return uColor6; return uColor7; } float localT = (clampedT - float(baseIdx) * seg) / seg; vec3 c1 = uColor0, c2 = uColor1; if (baseIdx == 0) { c1 = uColor0; c2 = uColor1; } else if (baseIdx == 1) { c1 = uColor1; c2 = uColor2; } else if (baseIdx == 2) { c1 = uColor2; c2 = uColor3; } else if (baseIdx == 3) { c1 = uColor3; c2 = uColor4; } else if (baseIdx == 4) { c1 = uColor4; c2 = uColor5; } else if (baseIdx == 5) { c1 = uColor5; c2 = uColor6; } else if (baseIdx == 6) { c1 = uColor6; c2 = uColor7; } return mix(c1, c2, localT); }

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
    if(uPatternType == 0) { float w1 = sin(st.x * 8.0) * cos(st.y * 8.0); float w2 = sin(st.y * 12.0 + st.x * 5.0); return (w1 + w2) * 0.6 + 0.5; }
    if(uPatternType == 1) return pow(worley(st * 3.5) * 1.2, 0.8);
    if(uPatternType == 2) return fbmPerlin(st, uOctaves, uPersistence, uLacunarity);
    if(uPatternType == 4) return random(st);
    if(uPatternType == 5) return reactionDiffusion(st);
    if(uPatternType == 6) return wfcPattern(st);
    if(uPatternType == 7) return flowField(st);
    if(uPatternType == 12) return ridgedMF(st, uOctaves, uPersistence, uLacunarity);
    if(uPatternType == 8) return checker(st, 4.0);
    if(uPatternType == 9) return stripes(st, 6.0);
    if(uPatternType == 10) return circles(st, 3.0);
    if(uPatternType == 11) return grid(st, 6.0);
    if(uPatternType == 14) return wood(st, 0.8);
    if(uPatternType == 15) return marble(st, 1.2);
    if(uPatternType == 16) return tiles(st, 5.0);
    if(uPatternType == 17) return linearGradient(uv);
    if(uPatternType == 18) return radialGradient(uv);
    if(uPatternType == 19) return angularGradient(uv);
    if(uPatternType == 3) return truchetPattern(st * 3.0, 0.0) * 0.8 + 0.2;
    return fbmPerlin(st, uOctaves, uPersistence, uLacunarity);
}

void main() {
    if (uExportMode == 0) {
        float patternValue = computePattern(vUv);
        vec3 color = getColor(patternValue);
        float gray = dot(color, vec3(0.299, 0.587, 0.114));
        color = mix(vec3(gray), color, uSaturation);
        if(uBlendMode == 1) color = color * patternValue;
        vec3 finalColor = color;
        if(uUseOverlay == 1) { vec4 overlayRGBA = texture2D(uOverlayTexture, vUv); if (overlayRGBA.a > 0.01) finalColor = mix(finalColor, overlayRGBA.rgb, overlayRGBA.a); }
        if (uShowRelief == 1) { vec3 grad = vec3(dFdx(patternValue), dFdy(patternValue), 0.0); vec3 normal = normalize(vec3(-grad.x * uReliefStrength, -grad.y * uReliefStrength, 1.0)); vec3 lightDir = normalize(vec3(0.8, 1.0, 0.3)); float diff = max(0.3, dot(normal, lightDir)); finalColor = finalColor * (0.6 + diff * 0.5); }
        gl_FragColor = vec4(finalColor, 1.0);
    } else if (uExportMode == 1) {
        vec2 uv = vUv; float h = computePattern(uv); float hL = computePattern(uv - vec2(uTexelSize.x, 0.0)); float hR = computePattern(uv + vec2(uTexelSize.x, 0.0)); float hD = computePattern(uv - vec2(0.0, uTexelSize.y)); float hU = computePattern(uv + vec2(0.0, uTexelSize.y)); vec3 grad = vec3(hR - hL, hU - hD, 0.0); vec3 normalTS = normalize(vec3(-grad.x * uNormalStrength, -grad.y * uNormalStrength, 1.0)); gl_FragColor = vec4(normalTS * 0.5 + 0.5, 1.0);
    } else if (uExportMode == 2) { float h = computePattern(vUv); float roughness = 1.0 - pow(h, uRoughnessContrast); roughness = clamp(roughness, 0.04, 0.96); gl_FragColor = vec4(roughness, roughness, roughness, 1.0);
    } else if (uExportMode == 3) { float h = computePattern(vUv); float metallic = clamp((h - uMetalThreshold) * uMetalScale, 0.0, 1.0); gl_FragColor = vec4(metallic, metallic, metallic, 1.0);
    } else if (uExportMode == 4) { float h = computePattern(vUv); gl_FragColor = vec4(h, h, h, 1.0);
    } else if (uExportMode == 5) { vec2 uv = vUv; float h = computePattern(uv); float hL = computePattern(uv - vec2(uTexelSize.x, 0.0)); float hR = computePattern(uv + vec2(uTexelSize.x, 0.0)); float hD = computePattern(uv - vec2(0.0, uTexelSize.y)); float hU = computePattern(uv + vec2(0.0, uTexelSize.y)); float laplacian = (hL + hR + hD + hU - 4.0 * h) * 0.25; float ao = clamp(0.5 + h * 0.5 - laplacian * 0.8, 0.2, 1.0); gl_FragColor = vec4(ao, ao, ao, 1.0);
    } else gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0);
}`;

let currentMaterial, plane2d;
function createMaterial() { return new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, side: THREE.DoubleSide }); }
function updateMaterial() { if (currentMaterial) currentMaterial.dispose(); currentMaterial = createMaterial(); if (plane2d) plane2d.material = currentMaterial; if (currentMesh3d) { if (customModel) customModel.traverse(c => { if (c.isMesh) c.material = currentMaterial; }); else currentMesh3d.material = currentMaterial; } schedulePBRUpdate(); }
plane2d = new THREE.Mesh(new THREE.PlaneGeometry(2,2), createMaterial()); scene2d.add(plane2d); currentMaterial = plane2d.material;

const colorContainer = document.getElementById('colorListContainer');
function rebuildColorUI() {
    colorContainer.innerHTML = '';
    activeColors.forEach((col, idx) => {
        const div = document.createElement('div'); div.className = 'color-item';
        const colorInput = document.createElement('input'); colorInput.type = 'color'; colorInput.value = '#' + col.getHexString(); colorInput.className = 'color-circle-input';
        colorInput.addEventListener('input', (e) => { activeColors[idx] = new THREE.Color(e.target.value); updateColorUniforms(); updateMaterial(); });
        div.appendChild(colorInput);
        if (activeColors.length > 2) { const removeBtn = document.createElement('button'); removeBtn.className = 'remove-color-btn'; removeBtn.textContent = '✕'; removeBtn.addEventListener('click', () => { if (activeColors.length > 2) { activeColors.splice(idx,1); rebuildColorUI(); updateColorUniforms(); updateMaterial(); } }); div.appendChild(removeBtn); }
        colorContainer.appendChild(div);
    });
}
document.getElementById('addColorBtn').addEventListener('click', () => { if (activeColors.length < 8) { activeColors.push(new THREE.Color('#FFB347')); rebuildColorUI(); updateColorUniforms(); updateMaterial(); } });
rebuildColorUI();

function updateUniformsFromUI() {
    uniforms.uScale.value = parseFloat(document.getElementById('scale').value);
    uniforms.uIntensity.value = parseFloat(document.getElementById('intensity').value);
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
    uniforms.uTile3DScale.value = parseFloat(document.getElementById('tile3dScale').value);
    uniforms.uNormalStrength.value = parseFloat(document.getElementById('normalStrength').value);
    uniforms.uRoughnessContrast.value = parseFloat(document.getElementById('roughnessContrast').value);
    uniforms.uMetalThreshold.value = parseFloat(document.getElementById('metalThreshold').value);
    uniforms.uMetalScale.value = parseFloat(document.getElementById('metalScale').value);
    const ids = ['scale','octaves','persistence','lacunarity','saturation','rotate','offsetX','offsetY','warpStrength','warpOctaves','reliefStrength','intensity','tile3dScale','normalStrength','roughnessContrast','metalThreshold','metalScale'];
    ids.forEach(id => { const el = document.getElementById(id+'Val'); if(el) el.innerText = parseFloat(document.getElementById(id).value).toFixed(2); });
    document.getElementById('rotateVal').innerText = uniforms.uRotation.value + '°';
    overlayDirty = true;
    schedulePBRUpdate();
    generateOverlayTexture();
}
['scale','octaves','persistence','lacunarity','saturation','blendMode','rotate','offsetX','offsetY','mirror','warpStrength','warpOctaves','reliefStrength','intensity','tile3dScale','normalStrength','roughnessContrast','metalThreshold','metalScale'].forEach(id => { const el = document.getElementById(id); if(el) el.addEventListener('input', updateUniformsFromUI); });
document.getElementById('warpEnable')?.addEventListener('change', updateUniformsFromUI);
document.getElementById('relief2d')?.addEventListener('change', updateUniformsFromUI);
document.getElementById('bgOpacity')?.addEventListener('input', (e) => { document.getElementById('bgOpacityVal').innerText = parseFloat(e.target.value).toFixed(2); overlayDirty = true; generateOverlayTexture(); });

const noisePatterns = [{name:"Волны",v:0},{name:"Перлин",v:2},{name:"Симплекс",v:4},{name:"Вороного",v:1}];
const fractalPatterns = [{name:"Реакция-диффузия",v:5},{name:"Потоковое поле",v:7},{name:"WFC",v:6},{name:"Гребневый мультифрактал",v:12}];
const gradientPatterns = [{name:"Линейный градиент",v:17},{name:"Радиальный градиент",v:18},{name:"Угловой градиент",v:19}];
const geometricPatterns = [{name:"Шахматная доска",v:8},{name:"Полосы",v:9},{name:"Концентрические круги",v:10},{name:"Сетка",v:11},{name:"Плитка",v:16},{name:"Древесина",v:14},{name:"Мрамор",v:15},{name:"Truchet",v:3}];
function populateSelect(id, items) { const sel = document.getElementById(id); sel.innerHTML = ''; items.forEach(i => { const o = document.createElement('option'); o.value=i.v; o.textContent=i.name; if(i.v===uniforms.uPatternType.value) o.selected=true; sel.appendChild(o); }); sel.addEventListener('change', e => { uniforms.uPatternType.value = parseInt(e.target.value); updateUniformsFromUI(); }); }
populateSelect('selectNoise', noisePatterns); populateSelect('selectFractal', fractalPatterns); populateSelect('selectGradient', gradientPatterns); populateSelect('selectGeometric', geometricPatterns);

function createGeometry(type) { if(type==='cube') return new THREE.BoxGeometry(1.2,1.2,1.2); if(type==='torus') return new THREE.TorusKnotGeometry(0.85,0.22,200,32,3,4); if(type==='sphere') return new THREE.SphereGeometry(0.9,128,128); return new THREE.CylinderGeometry(0.8,0.8,1.2,64); }
function update3dModel() { if(currentMesh3d) scene3d.remove(currentMesh3d); if(customModel) { customModel.traverse(c=>{if(c.isMesh) c.material = currentMaterial;}); scene3d.add(customModel); currentMesh3d=customModel; } else { const m = new THREE.Mesh(createGeometry(currentGeometryType), currentMaterial); scene3d.add(m); currentMesh3d=m; } const box = new THREE.Box3().setFromObject(currentMesh3d); controls3d.target.copy(box.getCenter(new THREE.Vector3())); controls3d.update(); updateSizes(); }
document.getElementById('geometrySelect').addEventListener('change', e => { customModel=null; currentGeometryType=e.target.value; update3dModel(); });
document.getElementById('modelFileInput').addEventListener('change', e => { if(!e.target.files[0]) return; const url = URL.createObjectURL(e.target.files[0]); new GLTFLoader().load(url, gltf => { if(currentMesh3d) scene3d.remove(currentMesh3d); customModel = gltf.scene; const box = new THREE.Box3().setFromObject(customModel); const size = box.getSize(new THREE.Vector3()).length(); const scl = 1.2 / size; customModel.scale.set(scl,scl,scl); customModel.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(scl)); update3dModel(); URL.revokeObjectURL(url); document.getElementById('modelStatus').textContent='Модель загружена'; setTimeout(()=>document.getElementById('modelStatus').textContent='',2000); }, undefined, () => document.getElementById('modelStatus').textContent='Ошибка загрузки'); });
update3dModel();

document.getElementById('bgImageInput').addEventListener('change', e => { if(e.target.files[0]) { const img = new Image(); img.onload = () => { backgroundImageEl = img; overlayDirty = true; generateOverlayTexture(); }; img.src = URL.createObjectURL(e.target.files[0]); document.getElementById('clearBgBtn').classList.remove('hidden'); } });
document.getElementById('clearBgBtn').addEventListener('click', () => { backgroundImageEl = null; document.getElementById('clearBgBtn').classList.add('hidden'); overlayDirty = true; generateOverlayTexture(); });

async function generateOverlayTexture() {
    if (!overlayDirty) return;
    const size = 1024; const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size; const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,size,size); ctx.imageSmoothingEnabled = true;
    if(backgroundImageEl) { ctx.globalAlpha = parseFloat(document.getElementById('bgOpacity').value); drawImageCover(ctx, backgroundImageEl, size, size); ctx.globalAlpha = 1.0; }
    const syncRot = uniforms.uRotation.value, syncOffX = uniforms.uOffset.value.x, syncOffY = uniforms.uOffset.value.y, syncMirror = uniforms.uMirror.value;
    for(const layer of layers) {
        ctx.save(); let rot = layer.rotation, offX = layer.x, offY = layer.y, mirror = layer.mirror || 0;
        if(layer.syncWithPattern) { rot = syncRot; offX = syncOffX; offY = syncOffY; mirror = syncMirror; }
        ctx.translate(size/2, size/2); ctx.rotate(rot * Math.PI/180);
        if(layer.syncWithPattern) ctx.translate(offX * size, offY * size);
        else ctx.translate((offX - 0.5) * size, (offY - 0.5) * size);
        if(mirror === 1 || mirror === 3) ctx.scale(-1,1); if(mirror === 2 || mirror === 3) ctx.scale(1,-1);
        ctx.scale(layer.scale, layer.scale); const img = layer.imgElement, w = img.width, h = img.height, tileX = Math.max(1, layer.tileX||1), tileY = Math.max(1, layer.tileY||1);
        if(tileX===1 && tileY===1) ctx.drawImage(img, -w/2, -h/2, w, h);
        else { const tileW = w, tileH = h; const neededX = Math.min(20, Math.ceil((size/layer.scale)/tileW)+2), neededY = Math.min(20, Math.ceil((size/layer.scale)/tileH)+2); const startTX = -Math.floor(neededX/2), startTY = -Math.floor(neededY/2); for(let ty=0; ty<neededY; ty++) for(let tx=0; tx<neededX; tx++) ctx.drawImage(img, (startTX+tx)*tileW, (startTY+ty)*tileH, tileW, tileH); }
        ctx.restore();
    }
    const texture = new THREE.CanvasTexture(canvas); texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping; texture.needsUpdate = true;
    if(overlayTexture) overlayTexture.dispose?.(); overlayTexture = texture; uniforms.uOverlayTexture.value = overlayTexture; uniforms.uUseOverlay.value = (layers.length>0 || backgroundImageEl) ? 1 : 0;
    document.getElementById('clearOverlayBtn').classList.toggle('hidden', layers.length===0);
    overlayDirty = false;
}
function drawImageCover(ctx, img, w, h) { const ratio = Math.max(w/img.width, h/img.height); const cx = (w - img.width*ratio)/2, cy = (h - img.height*ratio)/2; ctx.drawImage(img, 0, 0, img.width, img.height, cx, cy, img.width*ratio, img.height*ratio); }

const overlayLayersDiv = document.getElementById('overlayLayersList');
function updateLayersUI() { if(!overlayLayersDiv) return; overlayLayersDiv.innerHTML = ''; layers.forEach(layer => { const div = document.createElement('div'); div.className = `layer-item ${selectedLayerId === layer.id ? 'selected' : ''}`; const thumb = document.createElement('img'); thumb.className = 'layer-thumb'; thumb.src = layer.imgElement.src; const nameSpan = document.createElement('span'); nameSpan.className = 'layer-name'; nameSpan.textContent = layer.name; const delBtn = document.createElement('button'); delBtn.textContent = '🗑'; delBtn.onclick = (e) => { e.stopPropagation(); layers = layers.filter(l => l.id !== layer.id); if(selectedLayerId === layer.id) selectedLayerId = null; overlayDirty = true; generateOverlayTexture(); updateLayersUI(); }; div.appendChild(thumb); div.appendChild(nameSpan); div.appendChild(delBtn); div.addEventListener('click', (e) => { if(!e.target.closest('button')) { selectedLayerId = layer.id; updateLayersUI(); if(document.getElementById('layerOpacity')) document.getElementById('layerOpacity').value = layer.opacity; } }); overlayLayersDiv.appendChild(div); }); }
document.getElementById('multiTextureInput').addEventListener('change', async (e) => { if(e.target.files.length) { for(const file of e.target.files) { const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = URL.createObjectURL(file); }); layers.push({ id: Date.now()+Math.random(), imgElement: img, name: file.name, x:0.5, y:0.5, scale:0.4, rotation:0, mirror:0, opacity:1.0, syncWithPattern:false, tileX:1, tileY:1 }); selectedLayerId = layers[layers.length-1].id; } overlayDirty = true; generateOverlayTexture(); updateLayersUI(); } e.target.value=''; });
document.getElementById('clearOverlayBtn').addEventListener('click', () => { layers = []; selectedLayerId = null; overlayDirty = true; generateOverlayTexture(); updateLayersUI(); });
document.getElementById('layerOpacity')?.addEventListener('input', (e) => { if(selectedLayerId) { const layer = layers.find(l => l.id === selectedLayerId); if(layer) { layer.opacity = parseFloat(e.target.value); document.getElementById('layerOpacityVal').innerText = layer.opacity.toFixed(2); } } });
updateLayersUI();

function getCurrentPreset() { return { colors: activeColors.map(c=>c.getHexString()), uniforms: { scale:uniforms.uScale.value, octaves:uniforms.uOctaves.value, persistence:uniforms.uPersistence.value, lacunarity:uniforms.uLacunarity.value, saturation:uniforms.uSaturation.value, blendMode:uniforms.uBlendMode.value, rotation:uniforms.uRotation.value, offsetX:uniforms.uOffset.value.x, offsetY:uniforms.uOffset.value.y, mirror:uniforms.uMirror.value, warpEnable:uniforms.uWarpEnable.value, warpStrength:uniforms.uWarpStrength.value, warpOctaves:uniforms.uWarpOctaves.value, reliefStrength:uniforms.uReliefStrength.value, intensity:uniforms.uIntensity.value, tile3dScale:uniforms.uTile3DScale.value, normalStrength:uniforms.uNormalStrength.value, roughnessContrast:uniforms.uRoughnessContrast.value, metalThreshold:uniforms.uMetalThreshold.value, metalScale:uniforms.uMetalScale.value }, patternType:uniforms.uPatternType.value }; }
function applyPreset(p) { if(p.colors) { activeColors = p.colors.map(h=>new THREE.Color('#'+h)); rebuildColorUI(); updateColorUniforms(); } if(p.uniforms) { Object.keys(p.uniforms).forEach(k => { const el = document.getElementById(k); if(el) el.value = p.uniforms[k]; }); updateUniformsFromUI(); } if(p.patternType !== undefined) uniforms.uPatternType.value = p.patternType; updateMaterial(); overlayDirty = true; generateOverlayTexture(); }
document.getElementById('savePresetBtn').onclick = () => { const p = getCurrentPreset(); const blob = new Blob([JSON.stringify(p)], {type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`preset_${Date.now()}.json`; a.click(); };
document.getElementById('loadPresetBtn').onclick = () => document.getElementById('loadPresetInput').click();
document.getElementById('loadPresetInput').onchange = e => { const f = e.target.files[0]; if(!f) return; const r = new FileReader(); r.onload = ev => { try { applyPreset(JSON.parse(ev.target.result)); } catch(e) { alert('Ошибка загрузки пресета'); } }; r.readAsText(f); };

async function captureFinalTexture(resolution = 1024) {
    const tuni = {};
    for (const key in uniforms) { if (uniforms[key].value instanceof THREE.Vector2) tuni[key] = { value: uniforms[key].value.clone() }; else if (uniforms[key].value instanceof THREE.Vector3) tuni[key] = { value: uniforms[key].value.clone() }; else tuni[key] = { value: uniforms[key].value }; }
    tuni.uExportMode = { value: 0 };
    tuni.uUseOverlay = { value: (layers.length>0 || backgroundImageEl) ? 1 : 0 };
    tuni.uOverlayTexture = { value: overlayTexture };
    tuni.uShowRelief = { value: document.getElementById('relief2d').checked ? 1 : 0 };
    const sc = new THREE.Scene(); const cam = new THREE.OrthographicCamera(-1,1,1,-1,0.1,10); cam.position.z=1;
    const mat = new THREE.ShaderMaterial({ uniforms: tuni, vertexShader, fragmentShader });
    sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), mat));
    offscreenRenderer.setSize(resolution, resolution);
    offscreenRenderer.render(sc, cam);
    const blob = await new Promise(r => offscreenRenderer.domElement.toBlob(r, 'image/png'));
    mat.dispose();
    return blob;
}

async function renderPBRMap(res, type) {
    const modeMap = { 'basecolor':0, 'normal':1, 'roughness':2, 'metallic':3, 'height':4, 'ao':5 };
    const tuni = {};
    for (const key in uniforms) { if (uniforms[key].value instanceof THREE.Vector2) tuni[key] = { value: uniforms[key].value.clone() }; else if (uniforms[key].value instanceof THREE.Vector3) tuni[key] = { value: uniforms[key].value.clone() }; else tuni[key] = { value: uniforms[key].value }; }
    tuni.uUseOverlay = { value: 0 }; tuni.uShowRelief = { value: 0 };
    tuni.uExportMode = { value: modeMap[type] !== undefined ? modeMap[type] : 0 };
    tuni.uTexelSize = { value: new THREE.Vector2(1/res, 1/res) };
    const sc = new THREE.Scene(); const cam = new THREE.OrthographicCamera(-1,1,1,-1,0.1,10); cam.position.z=1;
    const mat = new THREE.ShaderMaterial({ uniforms: tuni, vertexShader, fragmentShader });
    sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), mat));
    offscreenRenderer.setSize(res, res);
    offscreenRenderer.render(sc, cam);
    const blob = await new Promise(r => offscreenRenderer.domElement.toBlob(r, 'image/png'));
    mat.dispose();
    return blob;
}

let pbrReady = false;
async function updatePBRPreviews() {
    if (!pbrReady) return;
    const pbrGrid = document.getElementById('pbrGrid'); if(!pbrGrid) return;
    if(pbrGrid.children.length === 0) { ['basecolor','normal','roughness','metallic','height','ao'].forEach((type,i) => { const div = document.createElement('div'); div.className = 'pbr-item'; const canvas = document.createElement('canvas'); canvas.width=128; canvas.height=128; const span = document.createElement('span'); span.textContent = {basecolor:'Base Color', normal:'Normal', roughness:'Roughness', metallic:'Metallic', height:'Height', ao:'AO'}[type]; div.appendChild(canvas); div.appendChild(span); pbrGrid.appendChild(div); }); }
    const maps = ['basecolor','normal','roughness','metallic','height','ao'];
    for(let i=0;i<maps.length;i++) { const blob = await renderPBRMap(256, maps[i]); const img = new Image(); img.onload = () => { const ctx = pbrGrid.children[i].querySelector('canvas').getContext('2d'); ctx.drawImage(img,0,0,128,128); }; img.src = URL.createObjectURL(blob); }
}
let pbrTimeout; function schedulePBRUpdate() { if (!pbrReady) return; clearTimeout(pbrTimeout); pbrTimeout = setTimeout(updatePBRPreviews, 500); }

// Включаем PBR-превью только при первом переключении на вкладку PBR или через 2 секунды после загрузки
let pbrActivated = false;
function enablePBR() { if (!pbrActivated) { pbrActivated = true; pbrReady = true; updatePBRPreviews(); } }
document.querySelector('.tab-btn[data-tab="pbr"]')?.addEventListener('click', enablePBR);
setTimeout(() => { if (!pbrActivated) enablePBR(); }, 2000);

document.getElementById('export2DBtn').addEventListener('click', async () => {
    const format = document.getElementById('export2DFormat').value; const res = parseInt(document.getElementById('exportResolution').value);
    if(format === 'pbr') {
        const zip = new JSZip();
        zip.file("basecolor.png", await renderPBRMap(res, 'basecolor'));
        zip.file("normal.png", await renderPBRMap(res, 'normal'));
        zip.file("roughness.png", await renderPBRMap(res, 'roughness'));
        zip.file("height.png", await renderPBRMap(res, 'height'));
        zip.file("ao.png", await renderPBRMap(res, 'ao'));
        zip.file("metallic.png", await renderPBRMap(res, 'metallic'));
        const blob = await zip.generateAsync({type:"blob"}); downloadBlob(blob, `pbr_${res}.zip`);
    } else if(format === 'svg') {
        const imgData = renderer2d.domElement.toDataURL('image/png');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${res}" height="${res}" viewBox="0 0 ${res} ${res}"><image width="${res}" height="${res}" href="${imgData}"/></svg>`;
        downloadBlob(new Blob([svg], {type:'image/svg+xml'}), `texture.svg`);
    } else { const exportCanvas = document.createElement('canvas'); exportCanvas.width=res; exportCanvas.height=res; exportCanvas.getContext('2d').drawImage(renderer2d.domElement,0,0,res,res); exportCanvas.toBlob(blob => downloadBlob(blob, `texture.${format}`), format==='jpg'?'image/jpeg':'image/png',0.95); }
});
function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }

document.getElementById('exportModelBtn').addEventListener('click', async () => {
    const format = document.getElementById('exportModelFormat').value;
    try {
        const textureBlob = await captureFinalTexture(2048);
        const img = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = URL.createObjectURL(textureBlob); });
        const tex = new THREE.CanvasTexture(img); tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1,1);
        const material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.1 });
        let exportScene = new THREE.Scene(); exportScene.add(new THREE.AmbientLight(0xffffff, 0.6)); exportScene.add(new THREE.DirectionalLight(0xffffff, 1));
        if(customModel) { const cloned = customModel.clone(); cloned.traverse(c => { if(c.isMesh) c.material = material; }); exportScene.add(cloned); }
        else exportScene.add(new THREE.Mesh(createGeometry(currentGeometryType), material));
        if(format === 'glb') new GLTFExporter().parse(exportScene, result => downloadBlob(new Blob([result], {type:'application/octet-stream'}), 'model.glb'), {binary:true});
        else if(format === 'gltf') new GLTFExporter().parse(exportScene, result => { const jsonStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2); downloadBlob(new Blob([jsonStr], {type:'application/json'}), 'model.gltf'); }, {binary:false});
        else if(format === 'obj') {
            const obj = new OBJExporter().parse(exportScene);
            const mtl = `newmtl material0\nmap_Kd texture.png\n`;
            const zip = new JSZip(); zip.file("model.obj", obj); zip.file("model.mtl", mtl); zip.file("texture.png", textureBlob);
            downloadBlob(await zip.generateAsync({type:"blob"}), 'model_obj.zip');
        }
    } catch(e) { alert("Ошибка экспорта 3D: " + e.message); }
});

document.getElementById('integrationDownloadBtn').addEventListener('click', () => {
    const engine = document.getElementById('integrationSelect').value;
    let url = engine === 'blender' ? 'https://github.com/PatternForge/blender-addon/releases/latest/download/patternforge_blender.zip' : 'https://github.com/PatternForge/unity-package/releases/latest/download/PatternForge.unitypackage';
    if(url) { const a = document.createElement('a'); a.href = url; a.download = ''; a.target = '_blank'; a.click(); }
    else alert('Скачивание временно недоступно');
});

function animate() { renderer2d.render(scene2d, camera2d); renderer3d.render(scene3d, camera3d); requestAnimationFrame(animate); }
animate();

if(window.innerWidth <= 860) { document.querySelector('.main-layout').style.display = 'flex'; document.querySelector('.main-layout').style.flexDirection = 'column'; document.querySelector('.settings-column').style.order = '2'; document.querySelector('.preview-wrapper').style.order = '1'; }
window.addEventListener('resize', () => { if(window.innerWidth <= 860) { document.querySelector('.main-layout').style.flexDirection = 'column'; document.querySelector('.settings-column').style.order = '2'; document.querySelector('.preview-wrapper').style.order = '1'; } else { document.querySelector('.main-layout').style.flexDirection = 'row'; document.querySelector('.settings-column').style.order = ''; document.querySelector('.preview-wrapper').style.order = ''; } });
document.getElementById('menuToggle').addEventListener('click', () => { document.getElementById('patternBar').classList.toggle('open'); document.getElementById('menuOverlay').classList.toggle('active'); });
document.getElementById('menuOverlay').addEventListener('click', () => { document.getElementById('patternBar').classList.remove('open'); document.getElementById('menuOverlay').classList.remove('active'); });

generateOverlayTexture();
updateUniformsFromUI();
