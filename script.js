import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';

const container2d = document.getElementById('canvas2d');
const container3d = document.getElementById('canvas3d');

const scene2d = new THREE.Scene(); scene2d.background = null;
const camera2d = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10); camera2d.position.z = 1;
const renderer2d = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
renderer2d.setClearColor(0x000000, 0);

const scene3d = new THREE.Scene(); scene3d.background = new THREE.Color(0x888888);
const camera3d = new THREE.PerspectiveCamera(45, 1, 0.1, 1000); camera3d.position.set(2.2, 1.6, 2.8);
const renderer3d = new THREE.WebGLRenderer({ antialias: true });

container2d.appendChild(renderer2d.domElement);
container3d.appendChild(renderer3d.domElement);

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

scene3d.add(new THREE.AmbientLight(0xffffff, 0.6));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.0); keyLight.position.set(5, 5, 5); scene3d.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffffff, 0.4); fillLight.position.set(-5, 0, 5); scene3d.add(fillLight);
const rimLight = new THREE.DirectionalLight(0xffffff, 0.8); rimLight.position.set(0, 5, -5); scene3d.add(rimLight);

let currentMesh3d = null, currentGeometryType = 'cube', customModel = null, overlayTexture = null;
let backgroundImageEl = null;
let activeColors = [ new THREE.Color('#FF6B8B'), new THREE.Color('#4CC9F0'), new THREE.Color('#F9C74F'), new THREE.Color('#9B5DE5') ];

let layers = [];
let selectedLayerId = null;
let isDraggingLayer = false;
let dragStart = { x: 0, y: 0, layerX: 0, layerY: 0 };
let lastScale = 3.00;

const uniforms = {
    uScale: { value: 3.00 }, uIntensity: { value: 1.13 }, uPatternType: { value: 0 },
    uColor0: { value: new THREE.Vector3() }, uColor1: { value: new THREE.Vector3() }, uColor2: { value: new THREE.Vector3() }, uColor3: { value: new THREE.Vector3() },
    uColor4: { value: new THREE.Vector3() }, uColor5: { value: new THREE.Vector3() }, uColor6: { value: new THREE.Vector3() }, uColor7: { value: new THREE.Vector3() },
    uColorsCount: { value: 4 }, uSaturation: { value: 1.5 }, uBlendMode: { value: 0 },
    uRotation: { value: 0 }, uOffset: { value: new THREE.Vector2(0, 0) }, uMirror: { value: 0 },
    uOctaves: { value: 4 }, uPersistence: { value: 0.53 }, uLacunarity: { value: 2.10 },
    uTileEnabled: { value: 1 }, uOverlayTexture: { value: null }, uUseOverlay: { value: 1 },
    uWarpEnable: { value: 0 }, uWarpStrength: { value: 0.3 }, uWarpOctaves: { value: 2 },
    uShowRelief: { value: 0 }, uReliefStrength: { value: 1.12 }, uTile3DScale: { value: 2.80 },
    uTime: { value: 0 }, uOverlayScale: { value: 1.0 },
    uExportMode: { value: 0 }
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

const vertexShader = `
varying vec2 vUv; varying vec3 vWorldPosition; varying vec3 vNormalW; uniform float uTile3DScale; 
void main() { 
    vUv = uv * uTile3DScale; 
    vec4 worldPos = modelMatrix * vec4(position, 1.0); 
    vWorldPosition = worldPos.xyz; 
    vNormalW = normalize(mat3(modelMatrix) * normal); 
    gl_Position = projectionMatrix * viewMatrix * worldPos; 
}`;

const fragmentShader = `
precision highp float;
uniform float uScale; uniform float uIntensity; uniform int uPatternType;
uniform vec3 uColor0; uniform vec3 uColor1; uniform vec3 uColor2; uniform vec3 uColor3;
uniform vec3 uColor4; uniform vec3 uColor5; uniform vec3 uColor6; uniform vec3 uColor7;
uniform int uColorsCount; uniform float uSaturation; uniform int uBlendMode;
uniform float uRotation; uniform vec2 uOffset; uniform int uMirror;
uniform int uOctaves; uniform float uPersistence; uniform float uLacunarity; uniform int uTileEnabled;
uniform sampler2D uOverlayTexture; uniform int uUseOverlay;
uniform int uWarpEnable; uniform float uWarpStrength; uniform int uWarpOctaves;
uniform int uShowRelief; uniform float uReliefStrength;
uniform float uTime; uniform int uExportMode;
varying vec2 vUv; varying vec3 vWorldPosition; varying vec3 vNormalW;

float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123); }
vec2 hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(vec2(p.x * p.y, p.y * p.x)) * 2.0 - 1.0; }
float perlinNoise(vec2 st) {
    vec2 i = floor(st); vec2 f = fract(st); vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 grad00 = hash(i); vec2 grad10 = hash(i + vec2(1.0, 0.0));
    vec2 grad01 = hash(i + vec2(0.0, 1.0)); vec2 grad11 = hash(i + vec2(1.0, 1.0));
    float dot00 = dot(grad00, f); float dot10 = dot(grad10, f - vec2(1.0, 0.0));
    float dot01 = dot(grad01, f - vec2(0.0, 1.0)); float dot11 = dot(grad11, f - vec2(1.0, 1.0));
    return mix(mix(dot00, dot10, u.x), mix(dot01, dot11, u.x), u.y) * 0.5 + 0.5;
}
float fbmPerlin(vec2 st, int oct, float pers, float lac) {
    float val = 0.0, amp = 0.5, freq = 2.0;
    for(int i = 0; i < 6; i++) { if(i >= oct) break; val += amp * (perlinNoise(st * freq) * 2.0 - 1.0); amp *= pers; freq *= lac; }
    return val * 0.5 + 0.5;
}
float worley(vec2 uv) {
    vec2 p = floor(uv); vec2 f = fract(uv); float res = 1.0;
    for(int j = -1; j <= 1; j++) for(int i = -1; i <= 1; i++) {
        vec2 b = vec2(float(i), float(j)); vec2 r = b - f + random(p + b);
        res = min(res, dot(r, r));
    } return sqrt(res);
}
float truchetPattern(vec2 uv, float t) { uv = fract(uv * 3.0) - 0.5; float angle = sin(t + uv.x * 10.0) * cos(t + uv.y * 10.0); return step(length(uv), 0.4 + 0.2 * sin(angle * 20.0 + t)); }
vec2 domainWarp(vec2 uv, float strength, int octaves) {
    vec2 warped = uv;
    for(int i = 0; i < 5; i++) { if(i >= octaves) break; warped += strength * vec2(sin(warped.y * 3.14159 * 2.0 * float(i + 1) + uTime), cos(warped.x * 3.14159 * 2.0 * float(i + 1) + uTime)); }
    return warped;
}
float reactionDiffusion(vec2 uv) { vec2 p = uv * 4.0; float a = sin(p.x * 3.0) * cos(p.y * 3.0); float b = cos(p.x * 4.2) * sin(p.y * 4.2); return clamp(a * 0.5 + b * 0.5 + 0.5, 0.0, 1.0); }
float flowField(vec2 uv) { vec2 q = uv * 3.0; float angle = sin(q.y * 0.7) * cos(q.x * 0.5); vec2 gradient = vec2(cos(angle), sin(angle)); uv += gradient * 0.1; float field = sin(uv.x * 10.0) * cos(uv.y * 10.0); return smoothstep(-0.3, 0.7, field); }
float wfcPattern(vec2 uv) { vec2 tile = floor(uv * 8.0); float hashVal = random(tile); int rule = int(floor(hashVal * 6.0)); float pattern = 0.0; vec2 sub = fract(uv * 8.0); if(rule == 0) pattern = step(0.5, sub.x) * step(0.5, sub.y); else if(rule == 1) pattern = step(0.5, sub.x + sub.y); else if(rule == 2) pattern = step(0.5, sub.x - sub.y + 0.5); else if(rule == 3) pattern = sin(sub.x * 3.14159 * 4.0) * 0.5 + 0.5; else if(rule == 4) pattern = (sub.x > 0.25 && sub.x < 0.75 && sub.y > 0.25 && sub.y < 0.75) ? 1.0 : 0.0; else pattern = fract(sub.x * 3.0 + sub.y * 2.0); return pattern; }
float ridgedMF(vec2 uv, int oct, float pers, float lac) { float val = 0.0, amp = 0.5, freq = 2.0; for(int i = 0; i < 6; i++) { if(i >= oct) break; float n = perlinNoise(uv * freq) * 2.0 - 1.0; n = 1.0 - abs(n); val += amp * n; amp *= pers; freq *= lac; } return clamp(val, 0.0, 1.0); }
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

vec3 getColor(float t) {
    if (uColorsCount <= 1) return uColor0;
    else {
        float seg = 1.0 / float(uColorsCount - 1);
        int baseIdx = int(floor(t / seg));
        if (baseIdx >= uColorsCount - 1) {
            if (uColorsCount == 2) return uColor1; else if (uColorsCount == 3) return uColor2;
            else if (uColorsCount == 4) return uColor3; else if (uColorsCount == 5) return uColor4;
            else if (uColorsCount == 6) return uColor5; else if (uColorsCount == 7) return uColor6;
            else return uColor7;
        }
        float localT = (t - float(baseIdx) * seg) / seg;
        vec3 c1, c2;
        if (baseIdx == 0) { c1 = uColor0; c2 = uColor1; } else if (baseIdx == 1) { c1 = uColor1; c2 = uColor2; }
        else if (baseIdx == 2) { c1 = uColor2; c2 = uColor3; } else if (baseIdx == 3) { c1 = uColor3; c2 = uColor4; }
        else if (baseIdx == 4) { c1 = uColor4; c2 = uColor5; } else if (baseIdx == 5) { c1 = uColor5; c2 = uColor6; }
        else { c1 = uColor6; c2 = uColor7; }
        return mix(c1, c2, localT);
    }
}

float computePattern(vec2 uv) {
    float angle = uRotation * 3.14159 / 180.0;
    vec2 centered = uv - 0.5;
    vec2 rotated = vec2(centered.x * cos(angle) - centered.y * sin(angle), centered.x * sin(angle) + centered.y * cos(angle));
    uv = rotated + 0.5 + uOffset;
    if(uMirror == 1) uv.x = 1.0 - uv.x; 
    else if(uMirror == 2) uv.y = 1.0 - uv.y; 
    else if(uMirror == 3) { uv.x = 1.0 - uv.x; uv.y = 1.0 - uv.y; }
    
    vec2 st = uv * uScale;
    if (uTileEnabled == 1) st = fract(st);
    
    if(uWarpEnable == 1) st = domainWarp(st, uWarpStrength, uWarpOctaves);
    
    float patternValue;
    if(uPatternType == 0) { float w1 = sin(st.x * 8.0) * cos(st.y * 8.0); float w2 = sin(st.y * 12.0 + st.x * 5.0); patternValue = (w1 + w2) * 0.6 + 0.5; }
    else if(uPatternType == 1) { patternValue = worley(st * 3.5); patternValue = pow(patternValue * 1.2, 0.8); }
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
    vec3 blend = abs(vNormalW); blend = pow(blend, vec3(2.0)); blend /= (blend.x + blend.y + blend.z);
    vec2 uvX = vWorldPosition.yz, uvY = vWorldPosition.xz, uvZ = vWorldPosition.xy;
    float triScale = 0.8; uvX *= triScale; uvY *= triScale; uvZ *= triScale;
    float patX = computePattern(uvX), patY = computePattern(uvY), patZ = computePattern(uvZ);
    float patternValue = patX * blend.x + patY * blend.y + patZ * blend.z;
    
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

    if (uExportMode == 1) { vec3 grad = vec3(dFdx(patternValue), dFdy(patternValue), 0.0); finalColor = normalize(vec3(-grad.x * 2.0, -grad.y * 2.0, 1.0)) * 0.5 + 0.5; } 
    else if (uExportMode == 2) { finalColor = vec3(patternValue); } 
    else if (uExportMode == 3) { finalColor = vec3(patternValue); } 
    else if (uExportMode == 4) { finalColor = vec3(patternValue); } 
    else if (uExportMode == 5) { finalColor = vec3(1.0 - patternValue); }

    gl_FragColor = vec4(finalColor, 1.0);
}
`;

let currentMaterial = null;
function createMaterial() {
    const mat = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, side: THREE.DoubleSide });
    if (uniforms.uOverlayTexture.value) {
        uniforms.uOverlayTexture.value.wrapS = THREE.RepeatWrapping;
        uniforms.uOverlayTexture.value.wrapT = THREE.RepeatWrapping;
    }
    return mat;
}

function updateMaterial() {
    if (currentMaterial) currentMaterial.dispose();
    currentMaterial = createMaterial();
    if (plane2d) plane2d.material = currentMaterial;
    if (currentMesh3d) {
        if (customModel) customModel.traverse(c => { if (c.isMesh) c.material = currentMaterial; });
        else currentMesh3d.material = currentMaterial;
    }
}

let plane2d = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), createMaterial());
scene2d.add(plane2d);
currentMaterial = plane2d.material;

const colorContainer = document.getElementById('colorListContainer');
const addColorBtn = document.getElementById('addColorBtn');
function rebuildColorUI() {
    colorContainer.innerHTML = '';
    activeColors.forEach((col, idx) => {
        const div = document.createElement('div'); div.className = 'color-item';
        const colorInput = document.createElement('input'); colorInput.type = 'color'; colorInput.value = '#' + col.getHexString(); colorInput.className = 'color-circle-input';
        colorInput.addEventListener('input', (e) => { activeColors[idx] = new THREE.Color(e.target.value); updateColorUniforms(); updateMaterial(); });
        div.appendChild(colorInput);
        if (activeColors.length > 2) {
            const removeBtn = document.createElement('button'); removeBtn.className = 'remove-color-btn'; removeBtn.textContent = '✕';
            removeBtn.addEventListener('click', (e) => { e.stopPropagation(); if (activeColors.length > 2) { activeColors.splice(idx, 1); rebuildColorUI(); updateColorUniforms(); updateMaterial(); } });
            div.appendChild(removeBtn);
        }
        colorContainer.appendChild(div);
    });
}
addColorBtn.addEventListener('click', () => { if (activeColors.length < 8) { activeColors.push(new THREE.Color('#FFB347')); rebuildColorUI(); updateColorUniforms(); updateMaterial(); } });
rebuildColorUI();

function updateUniformsFromUI() {
    let newScale = parseFloat(document.getElementById('scale').value);
    uniforms.uScale.value = newScale;
    
    const intensityEl = document.getElementById('intensity');
    if (intensityEl) uniforms.uIntensity.value = parseFloat(intensityEl.value);
    
    const octavesEl = document.getElementById('octaves'); if (octavesEl) uniforms.uOctaves.value = parseInt(octavesEl.value);
    const persistenceEl = document.getElementById('persistence'); if (persistenceEl) uniforms.uPersistence.value = parseFloat(persistenceEl.value);
    const lacunarityEl = document.getElementById('lacunarity'); if (lacunarityEl) uniforms.uLacunarity.value = parseFloat(lacunarityEl.value);
    const saturationEl = document.getElementById('saturation'); if (saturationEl) uniforms.uSaturation.value = parseFloat(saturationEl.value);
    const blendModeEl = document.getElementById('blendMode'); if (blendModeEl) uniforms.uBlendMode.value = parseInt(blendModeEl.value);
    const rotateEl = document.getElementById('rotate'); if (rotateEl) uniforms.uRotation.value = parseFloat(rotateEl.value);
    const offsetXEl = document.getElementById('offsetX'); const offsetYEl = document.getElementById('offsetY');
    if (offsetXEl && offsetYEl) uniforms.uOffset.value.set(parseFloat(offsetXEl.value), parseFloat(offsetYEl.value));
    const mirrorEl = document.getElementById('mirror'); if (mirrorEl) uniforms.uMirror.value = parseInt(mirrorEl.value);
    const warpEnableEl = document.getElementById('warpEnable'); if (warpEnableEl) uniforms.uWarpEnable.value = warpEnableEl.checked ? 1 : 0;
    const warpStrengthEl = document.getElementById('warpStrength'); if (warpStrengthEl) uniforms.uWarpStrength.value = parseFloat(warpStrengthEl.value);
    const warpOctavesEl = document.getElementById('warpOctaves'); if (warpOctavesEl) uniforms.uWarpOctaves.value = parseInt(warpOctavesEl.value);
    const relief2dEl = document.getElementById('relief2d'); if (relief2dEl) uniforms.uShowRelief.value = relief2dEl.checked ? 1 : 0;
    const reliefStrengthEl = document.getElementById('reliefStrength'); if (reliefStrengthEl) uniforms.uReliefStrength.value = parseFloat(reliefStrengthEl.value);
    
    const tile3dEl = document.getElementById('tile3dScale');
    if (tile3dEl) uniforms.uTile3DScale.value = parseFloat(tile3dEl.value);

    const isSync = document.getElementById('syncTexturePattern')?.checked;
    if (isSync && lastScale !== 0 && lastScale !== newScale) {
        const ratio = newScale / lastScale;
        layers.forEach(layer => {
            layer.tileX = Math.max(1, Math.round((layer.tileX || 1) * ratio));
            layer.tileY = Math.max(1, Math.round((layer.tileY || 1) * ratio));
        });
        updateLayersUI();
    }
    lastScale = newScale;

    const metallicEl = document.getElementById('metallic');
    const metallicVal = metallicEl ? parseFloat(metallicEl.value).toFixed(2) : '0.56';
    
    const vals = {
        scaleVal: uniforms.uScale.value.toFixed(2), octavesVal: uniforms.uOctaves.value,
        persistenceVal: uniforms.uPersistence.value.toFixed(2), lacunarityVal: uniforms.uLacunarity.value.toFixed(2),
        saturationVal: uniforms.uSaturation.value.toFixed(2), rotateVal: uniforms.uRotation.value + '°',
        offsetXVal: uniforms.uOffset.value.x.toFixed(2), offsetYVal: uniforms.uOffset.value.y.toFixed(2),
        warpStrengthVal: uniforms.uWarpStrength.value.toFixed(2), warpOctavesVal: uniforms.uWarpOctaves.value,
        reliefStrengthVal: uniforms.uReliefStrength.value.toFixed(2), metallicVal: metallicVal
    };
    if (document.getElementById('intensityVal')) vals.intensityVal = uniforms.uIntensity.value.toFixed(2);
    if (document.getElementById('tile3dScaleVal')) vals.tile3dScaleVal = uniforms.uTile3DScale.value.toFixed(2);
    
    for (let id in vals) { const el = document.getElementById(id); if (el) el.innerText = vals[id]; }

    renderer2d.render(scene2d, camera2d);
    renderer3d.render(scene3d, camera3d);
    generateOverlayTexture();
}

const controlIds = ['scale', 'octaves', 'persistence', 'lacunarity', 'saturation', 'blendMode', 'rotate', 'offsetX', 'offsetY', 'mirror', 'warpStrength', 'warpOctaves', 'reliefStrength', 'metallic', 'intensity', 'tile3dScale'];
controlIds.forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('input', updateUniformsFromUI); });
document.getElementById('warpEnable')?.addEventListener('change', updateUniformsFromUI);
document.getElementById('relief2d')?.addEventListener('change', updateUniformsFromUI);
document.getElementById('syncTexturePattern')?.addEventListener('change', updateUniformsFromUI);

updateUniformsFromUI();

const noisePatterns = [{name: "Перлин", v:2}, {name: "Симплекс", v:4}, {name: "Вороного (Worley)", v:1}, {name: "Волны", v:0}];
const fractalPatterns = [{name: "Реакция-диффузия", v:5}, {name: "Потоковое поле", v:7}, {name: "WFC (коллапс волн)", v:6}, {name: "Гребневый мультифрактал", v:12}];
const gradientPatterns = [{name: "Линейный градиент", v:17}, {name: "Радиальный градиент", v:18}, {name: "Угловой градиент", v:19}];
const geometricPatterns = [{name: "Шахматная доска", v:8}, {name: "Полосы", v:9}, {name: "Концентрические круги", v:10}, {name: "Сетка", v:11}, {name: "Плитка", v:16}, {name: "Древесина", v:14}, {name: "Мрамор", v:15}, {name: "Truchet", v:3}];

function populateSelect(id, items, cur) {
    const sel = document.getElementById(id); if (!sel) return; sel.innerHTML = '';
    items.forEach(i => { const o = document.createElement('option'); o.value = i.v; o.textContent = i.name; if(i.v === cur) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', e => { uniforms.uPatternType.value = parseInt(e.target.value); updateUniformsFromUI(); });
}
populateSelect('selectNoise', noisePatterns, uniforms.uPatternType.value);
populateSelect('selectFractal', fractalPatterns, uniforms.uPatternType.value);
populateSelect('selectGradient', gradientPatterns, uniforms.uPatternType.value);
populateSelect('selectGeometric', geometricPatterns, uniforms.uPatternType.value);

const savePresetBtn = document.getElementById('savePresetBtn');
const loadPresetInput = document.getElementById('loadPresetInput');
const loadPresetBtn = document.getElementById('loadPresetBtn');
function getCurrentPreset() {
    return { colors: activeColors.map(c => c.getHexString()), uniforms: { scale:uniforms.uScale.value, octaves:uniforms.uOctaves.value, persistence:uniforms.uPersistence.value, lacunarity:uniforms.uLacunarity.value, saturation:uniforms.uSaturation.value, blendMode:uniforms.uBlendMode.value, rotation:uniforms.uRotation.value, offsetX:uniforms.uOffset.value.x, offsetY:uniforms.uOffset.value.y, mirror:uniforms.uMirror.value, warpEnable:uniforms.uWarpEnable.value, warpStrength:uniforms.uWarpStrength.value, warpOctaves:uniforms.uWarpOctaves.value, reliefStrength:uniforms.uReliefStrength.value, intensity:uniforms.uIntensity.value, tile3dScale:uniforms.uTile3DScale.value }, patternType:uniforms.uPatternType.value };
}
function applyPreset(p) {
    if (!p.colors) return;
    activeColors = p.colors.map(h => new THREE.Color('#'+h)); rebuildColorUI(); updateColorUniforms();
    if (p.uniforms) { Object.keys(p.uniforms).forEach(k => { const el = document.getElementById(k); if(el) el.value = p.uniforms[k]; }); updateUniformsFromUI(); }
    if (p.patternType !== undefined) uniforms.uPatternType.value = p.patternType;
    updateMaterial();
}
savePresetBtn.onclick = () => { const p = getCurrentPreset(); const blob = new Blob([JSON.stringify(p)], {type:'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `preset_${Date.now()}.json`; a.click(); };
loadPresetBtn.onclick = () => loadPresetInput.click();
loadPresetInput.onchange = e => { const f = e.target.files[0]; if(!f) return; const r = new FileReader(); r.onload = ev => { try { applyPreset(JSON.parse(ev.target.result)); } catch(e) { alert('Ошибка'); } }; r.readAsText(f); };

function createGeometry(type) {
    if(type === 'cube') return new THREE.BoxGeometry(1.2, 1.2, 1.2);
    if(type === 'torus') return new THREE.TorusKnotGeometry(0.85, 0.22, 200, 32, 3, 4);
    if(type === 'sphere') return new THREE.SphereGeometry(0.9, 128, 128);
    return new THREE.CylinderGeometry(0.8, 0.8, 1.2, 64);
}
function update3dModel() {
    if(currentMesh3d) scene3d.remove(currentMesh3d);
    if(customModel) { customModel.traverse(c => { if(c.isMesh) c.material = currentMaterial; }); scene3d.add(customModel); currentMesh3d = customModel; }
    else { const m = new THREE.Mesh(createGeometry(currentGeometryType), currentMaterial); scene3d.add(m); currentMesh3d = m; }
    const box = new THREE.Box3().setFromObject(currentMesh3d); controls3d.target.copy(box.getCenter(new THREE.Vector3())); controls3d.update(); updateSizes();
}
document.getElementById('geometrySelect')?.addEventListener('change', e => { customModel = null; currentGeometryType = e.target.value; update3dModel(); });
document.getElementById('modelFileInput')?.addEventListener('change', e => {
    if(!e.target.files[0]) return;
    const url = URL.createObjectURL(e.target.files[0]);
    new GLTFLoader().load(url, gltf => {
        if(currentMesh3d) scene3d.remove(currentMesh3d);
        customModel = gltf.scene; const box = new THREE.Box3().setFromObject(customModel); const size = box.getSize(new THREE.Vector3()).length();
        const scl = 1.2 / size; customModel.scale.set(scl, scl, scl); customModel.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(scl));
        update3dModel(); URL.revokeObjectURL(url); 
        document.getElementById('modelStatus').textContent = 'Модель загружена'; setTimeout(() => document.getElementById('modelStatus').textContent = '', 2000);
    }, undefined, () => document.getElementById('modelStatus').textContent = 'Ошибка');
});

document.getElementById('bgImageInput')?.addEventListener('change', e => {
    if (e.target.files[0]) {
        const img = new Image(); img.onload = () => { backgroundImageEl = img; generateOverlayTexture(); }; img.src = URL.createObjectURL(e.target.files[0]);
        document.getElementById('clearBgBtn')?.classList.remove('hidden');
    }
});
document.getElementById('clearBgBtn')?.addEventListener('click', () => { backgroundImageEl = null; document.getElementById('clearBgBtn')?.classList.add('hidden'); generateOverlayTexture(); });
document.getElementById('bgOpacity')?.addEventListener('input', () => generateOverlayTexture());

async function generateOverlayTexture() {
    const size = 1024;
    const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    
    if (backgroundImageEl) {
        const bgOpacity = document.getElementById('bgOpacity') ? parseFloat(document.getElementById('bgOpacity').value) : 1.0;
        ctx.globalAlpha = bgOpacity; 
        const ratio = Math.max(size / backgroundImageEl.width, size / backgroundImageEl.height);
        ctx.drawImage(backgroundImageEl, 0, 0, backgroundImageEl.width, backgroundImageEl.height, (size - backgroundImageEl.width * ratio) / 2, (size - backgroundImageEl.height * ratio) / 2, backgroundImageEl.width * ratio, backgroundImageEl.height * ratio);
        ctx.globalAlpha = 1.0;
    }

    const syncRotation = uniforms.uRotation.value, syncOffsetX = uniforms.uOffset.value.x, syncOffsetY = uniforms.uOffset.value.y, syncMirror = uniforms.uMirror.value;
    
    for (const layer of layers) {
        ctx.save();
        let rot = layer.rotation;
        let offX = layer.offsetX !== undefined ? layer.offsetX : layer.x;
        let offY = layer.offsetY !== undefined ? layer.offsetY : layer.y;
        let mirror = layer.mirror || 0;
        let layerScale = layer.patternScale !== undefined ? layer.patternScale : layer.scale;
        let tileX = Math.max(1, layer.tileX || 1);
        let tileY = Math.max(1, layer.tileY || 1);
        
        if (layer.syncWithPattern) {
            rot = syncRotation; offX = 0.5 + syncOffsetX; offY = 0.5 + syncOffsetY; mirror = syncMirror;
            layerScale = 1.0 / uniforms.uScale.value; 
            tileX = Math.max(1, Math.round(uniforms.uScale.value * 2)); 
            tileY = Math.max(1, Math.round(uniforms.uScale.value * 2));
        }

        ctx.globalAlpha = layer.opacity;
        ctx.translate(size / 2, size / 2); ctx.rotate(rot * Math.PI / 180); ctx.translate((offX - 0.5) * size, (offY - 0.5) * size);
        if (mirror === 1 || mirror === 3) ctx.scale(-1, 1);
        if (mirror === 2 || mirror === 3) ctx.scale(1, -1);
        ctx.scale(layerScale, layerScale);

        const img = layer.imgElement, imgW = img.width, imgH = img.height;
        if (tileX === 1 && tileY === 1) ctx.drawImage(img, -imgW / 2, -imgH / 2, imgW, imgH);
        else {
            const neededX = Math.min(64, Math.ceil((size / layerScale) / imgW) + 2);
            const neededY = Math.min(64, Math.ceil((size / layerScale) / imgH) + 2);
            const startTX = -Math.floor(neededX / 2), startTY = -Math.floor(neededY / 2);
            for (let ty = 0; ty < neededY; ty++) {
                for (let tx = 0; tx < neededX; tx++) {
                    ctx.drawImage(img, (startTX + tx) * imgW, (startTY + ty) * imgH, imgW, imgH);
                }
            }
        }
        ctx.restore();
    }

    ctx.drawImage(canvas, 0, 0, 16, size, size, 0, 16, size);
    ctx.drawImage(canvas, size - 16, 0, 16, size, 0, 0, 16, size);
    ctx.drawImage(canvas, 0, 0, size, 16, 0, size, size, 16);
    ctx.drawImage(canvas, 0, size - 16, size, 16, 0, 0, size, 16);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping; 
    texture.wrapT = THREE.RepeatWrapping; 
    texture.needsUpdate = true;
    if (overlayTexture) overlayTexture.dispose?.();
    overlayTexture = texture;
    uniforms.uOverlayTexture.value = overlayTexture;
    uniforms.uUseOverlay.value = (layers.length > 0 || backgroundImageEl) ? 1 : 0;
    renderer2d.render(scene2d, camera2d);
}

const overlayLayersDiv = document.getElementById('overlayLayersList');
const layerOpacitySlider = document.getElementById('layerOpacity');
const layerOpacityVal = document.getElementById('layerOpacityVal');

function updateLayersUI() {
    if (!overlayLayersDiv) return;
    overlayLayersDiv.innerHTML = '';
    layers.forEach(layer => {
        const div = document.createElement('div'); div.className = `layer-item ${selectedLayerId === layer.id ? 'selected' : ''}`; div.dataset.id = layer.id;
        
        const header = document.createElement('div'); header.className = 'layer-header';
        const thumb = document.createElement('img'); thumb.className = 'layer-thumb'; thumb.src = layer.imgElement.src;
        const nameSpan = document.createElement('span'); nameSpan.className = 'layer-name'; nameSpan.textContent = layer.name;
        const controls = document.createElement('div'); controls.className = 'layer-controls';
        const delBtn = document.createElement('button'); delBtn.textContent = '🗑'; delBtn.onclick = (e) => { e.stopPropagation(); deleteLayerById(layer.id); };
        controls.appendChild(delBtn);
        header.appendChild(thumb); header.appendChild(nameSpan); header.appendChild(controls);
        div.appendChild(header);

        const extraDiv = document.createElement('div'); extraDiv.className = 'layer-extra-controls';
        
        extraDiv.innerHTML += `<span>Альфа:</span><input type="range" min="0" max="1" step="0.01" value="${layer.opacity}"><span>${layer.opacity.toFixed(2)}</span>`;
        extraDiv.querySelector('input').addEventListener('input', (e) => { layer.opacity = parseFloat(e.target.value); extraDiv.querySelector('span:last-child').innerText = layer.opacity.toFixed(2); generateOverlayTexture(); });

        const pScale = layer.patternScale !== undefined ? layer.patternScale : layer.scale;
        extraDiv.innerHTML += `<span>Масштаб:</span><input type="range" min="0.1" max="5" step="0.1" value="${pScale}"><span>${pScale.toFixed(1)}</span>`;
        const pScaleInput = extraDiv.querySelectorAll('input')[1];
        pScaleInput.addEventListener('input', (e) => { layer.patternScale = parseFloat(e.target.value); pScaleInput.nextElementSibling.innerText = layer.patternScale.toFixed(1); generateOverlayTexture(); });

        const offX = layer.offsetX !== undefined ? layer.offsetX : 0.5;
        const offY = layer.offsetY !== undefined ? layer.offsetY : 0.5;
        extraDiv.innerHTML += `<span>Сдвиг X:</span><input type="range" min="0" max="1" step="0.01" value="${offX}">`;
        extraDiv.innerHTML += `<span>Y:</span><input type="range" min="0" max="1" step="0.01" value="${offY}">`;
        const offXInput = extraDiv.querySelectorAll('input')[2];
        const offYInput = extraDiv.querySelectorAll('input')[3];
        offXInput.addEventListener('input', (e) => { layer.offsetX = parseFloat(e.target.value); generateOverlayTexture(); });
        offYInput.addEventListener('input', (e) => { layer.offsetY = parseFloat(e.target.value); generateOverlayTexture(); });

        const isSync = document.getElementById('syncTexturePattern')?.checked;
        if (!isSync || !layer.syncWithPattern) {
            extraDiv.innerHTML += `<span>Повт X:</span><input type="number" min="1" max="64" step="1" value="${layer.tileX || 1}">`;
            extraDiv.innerHTML += `<span>Y:</span><input type="number" min="1" max="64" step="1" value="${layer.tileY || 1}">`;
            const tXInput = extraDiv.querySelectorAll('input')[4];
            const tYInput = extraDiv.querySelectorAll('input')[5];
            tXInput.addEventListener('change', () => { layer.tileX = Math.max(1, Math.min(64, parseInt(tXInput.value) || 1)); generateOverlayTexture(); });
            tYInput.addEventListener('change', () => { layer.tileY = Math.max(1, Math.min(64, parseInt(tYInput.value) || 1)); generateOverlayTexture(); });
        }

        div.appendChild(extraDiv);
        div.addEventListener('click', (e) => { if (!e.target.closest('.layer-controls') && !e.target.closest('input')) selectLayer(layer.id); });
        overlayLayersDiv.appendChild(div);
    });
    
    if (selectedLayerId && layerOpacitySlider) {
        const layer = layers.find(l => l.id === selectedLayerId);
        if (layer) { layerOpacitySlider.value = layer.opacity; if (layerOpacityVal) layerOpacityVal.innerText = layer.opacity.toFixed(2); }
    }
}

function selectLayer(id) { selectedLayerId = id; updateLayersUI(); }
function deleteLayerById(id) {
    const idx = layers.findIndex(l => l.id === id);
    if (idx !== -1) { layers.splice(idx, 1); if (selectedLayerId === id) selectedLayerId = null; generateOverlayTexture(); updateLayersUI(); }
}
document.getElementById('clearOverlayBtn')?.addEventListener('click', () => { layers = []; selectedLayerId = null; generateOverlayTexture(); updateLayersUI(); });
if (layerOpacitySlider) {
    layerOpacitySlider.addEventListener('input', () => {
        if (selectedLayerId) {
            const layer = layers.find(l => l.id === selectedLayerId);
            if (layer) { layer.opacity = parseFloat(layerOpacitySlider.value); if (layerOpacityVal) layerOpacityVal.innerText = layer.opacity.toFixed(2); generateOverlayTexture(); updateLayersUI(); }
        }
    });
}

async function loadFilesAsLayers(files) {
    for (const file of files) {
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
        layers.push({ id: Math.random().toString(36) + Date.now(), imgElement: img, name: file.name, x: 0.5, y: 0.5, offsetX: 0.5, offsetY: 0.5, scale: 0.4, patternScale: 0.4, rotation: 0, mirror: 0, opacity: 1.0, syncWithPattern: document.getElementById('syncTexturePattern')?.checked || false, tileX: 1, tileY: 1, width: img.width, height: img.height });
        selectLayer(layers[layers.length - 1].id);
    }
    generateOverlayTexture(); updateLayersUI();
}
document.getElementById('multiTextureInput')?.addEventListener('change', async (e) => { if (e.target.files.length) await loadFilesAsLayers(Array.from(e.target.files)); e.target.value = ''; });

const canvas2dElem = renderer2d.domElement;
canvas2dElem.style.cursor = 'crosshair';
canvas2dElem.addEventListener('dragover', (e) => { e.preventDefault(); canvas2dElem.style.border = '2px dashed #4CC9F0'; });
canvas2dElem.addEventListener('dragleave', () => { canvas2dElem.style.border = 'none'; });
canvas2dElem.addEventListener('drop', async (e) => { e.preventDefault(); canvas2dElem.style.border = 'none'; const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')); if (files.length) await loadFilesAsLayers(files); });

function findLayerUnderPointer(uv) {
    for (let i = layers.length - 1; i >= 0; i--) {
        const l = layers[i];
        if ((l.tileX > 1 || l.tileY > 1 || l.syncWithPattern) && selectedLayerId === l.id) return l;
        let dx = uv.x - (l.offsetX !== undefined ? l.offsetX : l.x), dy = uv.y - (l.offsetY !== undefined ? l.offsetY : l.y);
        const ang = -l.rotation * Math.PI / 180, cos = Math.cos(ang), sin = Math.sin(ang);
        const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
        const halfW = (l.width / 1024) * (l.patternScale || l.scale) * 0.5, halfH = (l.height / 1024) * (l.patternScale || l.scale) * 0.5;
        if (Math.abs(lx) <= halfW && Math.abs(ly) <= halfH) return l;
    }
    return null;
}
function getCanvasCoords(e) {
    const rect = canvas2dElem.getBoundingClientRect();
    const scaleX = canvas2dElem.width / rect.width, scaleY = canvas2dElem.height / rect.height;
    let clientX = e.touches ? e.touches[0].clientX : e.clientX, clientY = e.touches ? e.touches[0].clientY : e.clientY;
    let canvasX = Math.min(Math.max(0, (clientX - rect.left) * scaleX), canvas2dElem.width);
    let canvasY = Math.min(Math.max(0, (clientY - rect.top) * scaleY), canvas2dElem.height);
    return { x: canvasX / canvas2dElem.width, y: canvasY / canvas2dElem.height };
}
canvas2dElem.addEventListener('mousedown', (e) => {
    e.preventDefault(); const uv = getCanvasCoords(e); const layer = findLayerUnderPointer(uv);
    if (layer) { selectLayer(layer.id); isDraggingLayer = true; dragStart = { x: uv.x, y: uv.y, layerX: layer.offsetX !== undefined ? layer.offsetX : layer.x, layerY: layer.offsetY !== undefined ? layer.offsetY : layer.y }; canvas2dElem.style.cursor = 'grabbing'; }
    else selectLayer(null);
});
window.addEventListener('mousemove', (e) => {
    if (!isDraggingLayer || selectedLayerId === null) return;
    const uv = getCanvasCoords(e); const layer = layers.find(l => l.id === selectedLayerId);
    if (layer && !layer.syncWithPattern) { 
        layer.offsetX = Math.min(Math.max(0, dragStart.layerX + (uv.x - dragStart.x)), 1); 
        layer.offsetY = Math.min(Math.max(0, dragStart.layerY + (uv.y - dragStart.y)), 1); 
        generateOverlayTexture(); updateLayersUI(); 
    }
});
window.addEventListener('mouseup', () => { isDraggingLayer = false; canvas2dElem.style.cursor = 'crosshair'; });
canvas2dElem.addEventListener('wheel', (e) => {
    e.preventDefault(); if (selectedLayerId === null) return;
    const layer = layers.find(l => l.id === selectedLayerId); if (!layer || layer.syncWithPattern) return;
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    if (e.ctrlKey) { layer.rotation = (layer.rotation + delta * 20) % 360; }
    else { layer.patternScale = Math.min(Math.max(0.1, (layer.patternScale || layer.scale) + delta), 5.0); }
    generateOverlayTexture(); updateLayersUI();
});

document.getElementById('export2DBtn')?.addEventListener('click', async () => {
    const format = document.getElementById('export2DFormat').value, res = parseInt(document.getElementById('exportResolution').value);
    if (format === 'pbr') {
        const zip = new JSZip();
        zip.file("basecolor.png", await renderPBRMap(res, 'basecolor'));
        zip.file("normal.png", await renderPBRMap(res, 'normal'));
        zip.file("roughness.png", await renderPBRMap(res, 'roughness'));
        zip.file("height.png", await renderPBRMap(res, 'height'));
        zip.file("ao.png", await renderPBRMap(res, 'ao'));
        zip.file("metallic.png", await renderPBRMap(res, 'metallic'));
        downloadBlob(await zip.generateAsync({type: "blob"}), `pbr_${res}.zip`);
    } else if (format === 'svg') {
        const imgData = renderer2d.domElement.toDataURL('image/png');
        downloadBlob(new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="${res}" height="${res}" viewBox="0 0 ${res} ${res}"><image width="${res}" height="${res}" href="${imgData}"/></svg>`], {type:'image/svg+xml'}), `texture.svg`);
    } else {
        const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
        const exportCanvas = document.createElement('canvas'); exportCanvas.width = res; exportCanvas.height = res;
        exportCanvas.getContext('2d').drawImage(renderer2d.domElement, 0, 0, res, res);
        exportCanvas.toBlob(blob => downloadBlob(blob, `texture.${format}`), mime, 0.95);
    }
});
renderer2d.domElement.addEventListener('dblclick', () => document.getElementById('export2DBtn')?.click());

document.getElementById('exportModelBtn')?.addEventListener('click', async () => {
    const format = document.getElementById('exportModelFormat').value;
    try {
        const textureBlob = await captureTextureImage();
        const img = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = URL.createObjectURL(textureBlob); });
        const texture = new THREE.CanvasTexture(img); texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
        const mat = new THREE.MeshStandardMaterial({ map: texture });
        let exportScene = new THREE.Scene();
        if (customModel) { const c = customModel.clone(); c.traverse(ch => { if(ch.isMesh) ch.material = mat; }); exportScene.add(c); }
        else exportScene.add(new THREE.Mesh(createGeometry(currentGeometryType), mat));
        
        if (format === 'glb') new GLTFExporter().parse(exportScene, result => downloadBlob(new Blob([result], {type:'application/octet-stream'}), 'model.glb'), {binary:true});
        else if (format === 'gltf') new GLTFExporter().parse(exportScene, result => downloadBlob(new Blob([JSON.stringify(result)], {type:'application/json'}), 'model.gltf'));
        else if (format === 'obj') {
            const obj = new OBJExporter().parse(exportScene);
            const zip = new JSZip(); zip.file("model.obj", obj); zip.file("model.mtl", `newmtl material0\nmap_Kd texture.png\n`); zip.file("texture.png", textureBlob);
            downloadBlob(await zip.generateAsync({type: "blob"}), 'model_obj.zip');
        }
    } catch(e) { alert("Ошибка экспорта: " + e.message); }
});
renderer3d.domElement.addEventListener('dblclick', () => document.getElementById('exportModelBtn')?.click());

function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }

function cloneUniforms(src) { const dst = {}; for (const key in src) dst[key] = { value: src[key].value }; return dst; }

async function renderPBRMap(res, type) {
    const modeMap = { 'basecolor': 0, 'normal': 1, 'roughness': 2, 'metallic': 3, 'height': 4, 'ao': 5 };
    const tuni = cloneUniforms(uniforms); tuni.uUseOverlay = { value: 0 }; tuni.uShowRelief = { value: 0 }; tuni.uExportMode = { value: modeMap[type] !== undefined ? modeMap[type] : 0 };
    const sc = new THREE.Scene(); const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10); cam.position.z = 1;
    const mat = new THREE.ShaderMaterial({ uniforms: tuni, vertexShader, fragmentShader });
    sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true, alpha: false });
    renderer
