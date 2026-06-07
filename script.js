import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';

const container2d = document.getElementById('canvas2d');
const container3d = document.getElementById('canvas3d');
const scene2d = new THREE.Scene();
const camera2d = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera2d.position.z = 1;
const renderer2d = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
renderer2d.setClearColor(0x000000, 0);
const scene3d = new THREE.Scene();
const camera3d = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
camera3d.position.set(2, 1.5, 2.5);
const renderer3d = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer3d.physicallyCorrectLights = true;
renderer3d.outputColorSpace = THREE.SRGBColorSpace;
renderer3d.toneMapping = THREE.ACESFilmicToneMapping;
renderer3d.toneMappingExposure = 1.0;

container2d.appendChild(renderer2d.domElement);
container3d.appendChild(renderer3d.domElement);

const offscreenRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
offscreenRenderer.setSize(1024, 1024);

// Освещение
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene3d.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
directionalLight.position.set(3, 5, 2);
directionalLight.castShadow = true;
scene3d.add(directionalLight);
function updateLightIntensity(v) { directionalLight.intensity = v; }

let currentMesh3d = null, currentGeometryType = 'cube', customModel = null, overlayTexture = null;
let backgroundImageEl = null;
let activeColors = [new THREE.Color('#FF6B8B'), new THREE.Color('#4CC9F0'), new THREE.Color('#F9C74F'), new THREE.Color('#9B5DE5')];
let layers = [];
let selectedLayerId = null;
let isDraggingLayer = false;
let dragStart = {};

// Uniforms
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
  uNormalStrength: { value: 1.0 }, uRoughnessContrast: { value: 1.5 },
  uMetalThreshold: { value: 0.4 }, uMetalScale: { value: 2.0 }
};

function updateColorUniforms() {
  const last = activeColors[activeColors.length-1] || new THREE.Color(1,1,1);
  for (let i=0;i<8;i++) {
    const c = i < activeColors.length ? activeColors[i] : last;
    uniforms[`uColor${i}`].value.set(c.r, c.g, c.b);
  }
  uniforms.uColorsCount.value = activeColors.length;
}
updateColorUniforms();

// --- Шейдер ---
const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_PointSize = 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const fragmentShader = `
precision highp float;
uniform float uScale;
uniform float uIntensity;
uniform int uPatternType;
uniform vec3 uColor0,uColor1,uColor2,uColor3,uColor4,uColor5,uColor6,uColor7;
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

float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); }
vec2 hash(vec2 p) { p = fract(p * vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(vec2(p.x*p.y, p.y*p.x))*2.0-1.0; }
float perlinNoise(vec2 st) {
  vec2 i = floor(st); vec2 f = fract(st); vec2 u = f*f*(3.0-2.0*f);
  vec2 grad00 = hash(i); vec2 grad10 = hash(i+vec2(1,0)); vec2 grad01 = hash(i+vec2(0,1)); vec2 grad11 = hash(i+vec2(1,1));
  float dot00 = dot(grad00, f); float dot10 = dot(grad10, f-vec2(1,0));
  float dot01 = dot(grad01, f-vec2(0,1)); float dot11 = dot(grad11, f-vec2(1,1));
  return mix(mix(dot00, dot10, u.x), mix(dot01, dot11, u.x), u.y)*0.5+0.5;
}
float fbm(vec2 st, int oct, float pers, float lac) {
  float val=0., amp=0.5, freq=2.0;
  for(int i=0;i<6;i++) if(i>=oct) break; else { val += amp*(perlinNoise(st*freq)*2.0-1.0); amp*=pers; freq*=lac; }
  return val*0.5+0.5;
}
float worley(vec2 uv) {
  vec2 p = floor(uv); vec2 f = fract(uv); float res=1.0;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++) { vec2 b=vec2(i,j); vec2 r = b - f + random(p+b); res = min(res, dot(r,r)); }
  return sqrt(res);
}
float truchet(vec2 uv) { uv = fract(uv*3.0)-0.5; float angle = sin(uv.x*10.0)*cos(uv.y*10.0); return step(length(uv), 0.4+0.2*sin(angle*20.0)); }
vec2 domainWarp(vec2 uv, float str, int oct) {
  vec2 warped=uv;
  for(int i=0;i<5;i++) if(i>=oct) break; else warped += str*vec2(sin(warped.y*3.14159*2.0*float(i+1)), cos(warped.x*3.14159*2.0*float(i+1)));
  return warped;
}
float reactionDiffusion(vec2 uv) { vec2 p=uv*4.0; float a=sin(p.x*3.0)*cos(p.y*3.0), b=cos(p.x*4.2)*sin(p.y*4.2); return clamp(a*0.5+b*0.5+0.5,0.,1.); }
float flowField(vec2 uv) { vec2 q=uv*3.0; float angle=sin(q.y*0.7)*cos(q.x*0.5); uv+=vec2(cos(angle), sin(angle))*0.1; return smoothstep(-0.3,0.7, sin(uv.x*10.0)*cos(uv.y*10.0)); }
float wfcPattern(vec2 uv) { vec2 tile=floor(uv*8.0); float h=random(tile); int rule=int(floor(h*6.0)); vec2 sub=fract(uv*8.0);
  if(rule==0) return step(0.5,sub.x)*step(0.5,sub.y);
  else if(rule==1) return step(0.5,sub.x+sub.y);
  else if(rule==2) return step(0.5,sub.x-sub.y+0.5);
  else if(rule==3) return sin(sub.x*3.14159*4.0)*0.5+0.5;
  else if(rule==4) return (sub.x>0.25&&sub.x<0.75&&sub.y>0.25&&sub.y<0.75)?1.0:0.0;
  else return fract(sub.x*3.0+sub.y*2.0);
}
float ridgedMF(vec2 uv, int oct, float pers, float lac) {
  float val=0.,amp=0.5,freq=2.0;
  for(int i=0;i<6;i++) if(i>=oct) break; else { float n=perlinNoise(uv*freq)*2.0-1.0; n=1.0-abs(n); val+=amp*n; amp*=pers; freq*=lac; }
  return clamp(val,0.,1.);
}
float checker(vec2 uv, float freq) { vec2 p = floor(uv*freq); return mod(p.x+p.y,2.0); }
float stripes(vec2 uv, float freq) { return step(0.5, fract(uv.x*freq)); }
float circles(vec2 uv, float freq) { vec2 c=vec2(0.5); return fract(length(uv-c)*freq*2.0); }
float grid(vec2 uv, float freq) { vec2 g=fract(uv*freq); return max(step(0.92,g.x), step(0.92,g.y)); }
float tiles(vec2 uv, float freq) { vec2 f=fract(uv*freq); float line=step(0.75,f.x)+step(0.75,f.y); return clamp(1.0-line,0.,1.); }
float wood(vec2 uv, float freq) { vec2 c=vec2(0.5); float dist=length(uv-c)*2.0; return clamp(sin(dist*freq*12.0+sin(uv.x*8.0)*1.5)*0.5+0.5,0.,1.); }
float marble(vec2 uv, float freq) { float noise=fbm(uv*freq*3.0,4,0.6,2.0); return clamp(sin((uv.x*freq*5.0+noise*3.0)*3.14159)*0.6+0.5,0.,1.); }
float linearGradient(vec2 uv) { return uv.x; }
float radialGradient(vec2 uv) { return length(uv-0.5)*1.414; }
float angularGradient(vec2 uv) { return atan(uv.y-0.5, uv.x-0.5)/(2.0*3.14159)+0.5; }

vec3 getColor(float t) {
  if(uColorsCount<=1) return uColor0;
  float seg = 1.0/float(uColorsCount-1);
  int idx = int(floor(clamp(t,0.,1.)/seg));
  if(idx<0) idx=0; if(idx>=uColorsCount-1) idx=uColorsCount-2;
  float local = (clamp(t,0.,1.) - float(idx)*seg)/seg;
  vec3 c1,c2;
  if(idx==0){ c1=uColor0; c2=uColor1; }
  else if(idx==1){ c1=uColor1; c2=uColor2; }
  else if(idx==2){ c1=uColor2; c2=uColor3; }
  else if(idx==3){ c1=uColor3; c2=uColor4; }
  else if(idx==4){ c1=uColor4; c2=uColor5; }
  else if(idx==5){ c1=uColor5; c2=uColor6; }
  else { c1=uColor6; c2=uColor7; }
  return mix(c1,c2,local);
}

float computePattern(vec2 uv) {
  float angle = uRotation*3.14159/180.0;
  vec2 centered = uv-0.5;
  vec2 rotated = vec2(centered.x*cos(angle)-centered.y*sin(angle), centered.x*sin(angle)+centered.y*cos(angle));
  uv = rotated+0.5+uOffset;
  if(uMirror==1) uv.x=1.0-uv.x;
  else if(uMirror==2) uv.y=1.0-uv.y;
  else if(uMirror==3) { uv.x=1.0-uv.x; uv.y=1.0-uv.y; }
  if(uTileEnabled==1) uv=fract(uv);
  vec2 st = uv * uScale;
  if(uWarpEnable==1) st = domainWarp(st, uWarpStrength, uWarpOctaves);
  float val;
  if(uPatternType==0) { float w1=sin(st.x*8.0)*cos(st.y*8.0); float w2=sin(st.y*12.0+st.x*5.0); val=(w1+w2)*0.6+0.5; }
  else if(uPatternType==1) { val=worley(st*3.5); val=pow(val*1.2,0.8); }
  else if(uPatternType==2) val=fbm(st, uOctaves, uPersistence, uLacunarity);
  else if(uPatternType==4) val=random(st);
  else if(uPatternType==5) val=reactionDiffusion(st);
  else if(uPatternType==6) val=wfcPattern(st);
  else if(uPatternType==7) val=flowField(st);
  else if(uPatternType==12) val=ridgedMF(st, uOctaves, uPersistence, uLacunarity);
  else if(uPatternType==8) val=checker(st,4.0);
  else if(uPatternType==9) val=stripes(st,6.0);
  else if(uPatternType==10) val=circles(st,3.0);
  else if(uPatternType==11) val=grid(st,6.0);
  else if(uPatternType==14) val=wood(st,0.8);
  else if(uPatternType==15) val=marble(st,1.2);
  else if(uPatternType==16) val=tiles(st,5.0);
  else if(uPatternType==17) val=linearGradient(uv);
  else if(uPatternType==18) val=radialGradient(uv);
  else if(uPatternType==19) val=angularGradient(uv);
  else if(uPatternType==3) val=truchet(st*3.0);
  else val=fbm(st, uOctaves, uPersistence, uLacunarity);
  return clamp(val*uIntensity, 0.,1.);
}

void main() {
  float pattern = computePattern(vUv);
  float height = pattern;
  vec2 texel = vec2(1.0)/512.0;
  float hL = computePattern(vUv-vec2(texel.x,0.));
  float hR = computePattern(vUv+vec2(texel.x,0.));
  float hD = computePattern(vUv-vec2(0.,texel.y));
  float hU = computePattern(vUv+vec2(0.,texel.y));
  vec3 grad = vec3(hR-hL, hU-hD, 0.);
  vec3 normalTS = normalize(vec3(-grad.x*uNormalStrength*2.0, -grad.y*uNormalStrength*2.0, 1.0));
  float ao = clamp(1.0 - (max(max(hR,hL), max(hU,hD))-height)*2.0, 0.2, 1.0);
  
  if(uExportMode==1) { gl_FragColor=vec4(normalTS*0.5+0.5,1.0); return; }
  if(uExportMode==2) { float r=1.0-pow(pattern, uRoughnessContrast); gl_FragColor=vec4(r,r,r,1.0); return; }
  if(uExportMode==3) { float m=clamp((pattern-uMetalThreshold)*uMetalScale,0.,1.); gl_FragColor=vec4(m,m,m,1.0); return; }
  if(uExportMode==4) { gl_FragColor=vec4(height,height,height,1.0); return; }
  if(uExportMode==5) { gl_FragColor=vec4(ao,ao,ao,1.0); return; }
  
  if(uTestMode==1) { float r=1.0-pow(pattern, uRoughnessContrast); gl_FragColor=vec4(r,r,r,1.0); return; }
  if(uTestMode==2) { float m=clamp((pattern-uMetalThreshold)*uMetalScale,0.,1.); gl_FragColor=vec4(m,m,m,1.0); return; }
  if(uTestMode==3) { gl_FragColor=vec4(normalTS*0.5+0.5,1.0); return; }
  
  vec3 color = getColor(pattern);
  float gray = dot(color, vec3(0.299,0.587,0.114));
  color = mix(vec3(gray), color, uSaturation);
  if(uBlendMode==1) color *= pattern;
  vec3 finalColor = color;
  if(uUseOverlay==1) {
    vec4 overlay = texture2D(uOverlayTexture, vUv);
    if(overlay.a>0.01) finalColor = mix(finalColor, overlay.rgb, overlay.a);
  }
  if(uShowRelief==1) {
    vec3 normal = normalize(vec3(-grad.x*uReliefStrength, -grad.y*uReliefStrength, 1.0));
    float diff = max(0.3, dot(normal, normalize(vec3(0.8,1.0,0.3))));
    finalColor *= (0.6+diff*0.5);
  }
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

let material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, side: THREE.DoubleSide });
let plane2d = new THREE.Mesh(new THREE.PlaneGeometry(2,2), material);
scene2d.add(plane2d);
let defaultGeom = new THREE.BoxGeometry(1.5,1.5,1.5);
let defaultMesh = new THREE.Mesh(defaultGeom, material);
scene3d.add(defaultMesh);
currentMesh3d = defaultMesh;

