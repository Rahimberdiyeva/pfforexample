// --- Экспорт 3D с полным набором PBR карт ---
document.getElementById('exportModelBtn')?.addEventListener('click', async () => {
  const format = document.getElementById('exportModelFormat').value;
  try {
    // Запекаем все текстуры в максимальном качестве
    const baseColorBlob = await captureBaseColorTexture(4096);
    const normalBlob = await renderPBRMap(4096, 'normal');
    const roughnessBlob = await renderPBRMap(4096, 'roughness');
    const metallicBlob = await renderPBRMap(4096, 'metallic');
    const aoBlob = await renderPBRMap(4096, 'ao');
    const heightBlob = await renderPBRMap(4096, 'height');

    // Функция загрузки текстуры из Blob
    const loadTexture = (blob) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(new THREE.CanvasTexture(img));
      img.src = URL.createObjectURL(blob);
    });
    const baseColorTex = await loadTexture(baseColorBlob);
    const normalTex = await loadTexture(normalBlob);
    const roughnessTex = await loadTexture(roughnessBlob);
    const metallicTex = await loadTexture(metallicBlob);
    const aoTex = await loadTexture(aoBlob);
    const heightTex = await loadTexture(heightBlob);

    // Настройка текстур
    [baseColorTex, normalTex, roughnessTex, metallicTex, aoTex, heightTex].forEach(tex => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1, 1);
    });

    // Создаём стандартный материал для экспорта
    const exportMaterial = new THREE.MeshStandardMaterial({
      map: baseColorTex,
      normalMap: normalTex,
      roughnessMap: roughnessTex,
      metalnessMap: metallicTex,
      aoMap: aoTex,
      displacementMap: heightTex,
      roughness: 0.5,
      metalness: 0.5,
      side: THREE.DoubleSide
    });

    // Экспортируем именно ту модель, которая сейчас отображается в 3D-превью
    const exportScene = new THREE.Scene();
    let modelToExport;
    if (customModel) {
      // Клонируем пользовательскую модель, сохраняя её трансформацию
      const cloned = customModel.clone();
      cloned.traverse(c => { if (c.isMesh) c.material = exportMaterial; });
      modelToExport = cloned;
    } else {
      // Для стандартных геометрий создаём новый меш с экспортным материалом
      let geom;
      if (currentGeometryType === 'cube') geom = new THREE.BoxGeometry(1.5, 1.5, 1.5);
      else if (currentGeometryType === 'torus') geom = new THREE.TorusKnotGeometry(1.0, 0.28, 200, 32, 3, 4);
      else if (currentGeometryType === 'sphere') geom = new THREE.SphereGeometry(1.2, 128, 128);
      else geom = new THREE.CylinderGeometry(1.0, 1.0, 1.5, 64);
      modelToExport = new THREE.Mesh(geom, exportMaterial);
    }
    exportScene.add(modelToExport);

    // Добавляем минимальное освещение, чтобы материалы в экспортированной модели выглядели корректно
    const exportLight = new THREE.DirectionalLight(0xffffff, 1.0);
    exportLight.position.set(1, 2, 1);
    exportScene.add(exportLight);

    // Экспорт в зависимости от формата
    const exporter = new GLTFExporter();
    if (format === 'glb') {
      exporter.parse(exportScene, (result) => {
        if (typeof result === 'string') {
          console.error('GLTFExporter error (string):', result);
          alert('Ошибка экспорта GLB: ' + result.substring(0, 200));
          return;
        }
        const blob = new Blob([result], { type: 'application/octet-stream' });
        downloadBlob(blob, 'model.glb');
      }, { binary: true, trs: true, onlyVisible: true });
    } else if (format === 'gltf') {
      exporter.parse(exportScene, (result) => {
        const jsonStr = JSON.stringify(result, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        downloadBlob(blob, 'model.gltf');
      }, { binary: false, trs: true, onlyVisible: true });
    } else if (format === 'obj') {
      const objExporter = new OBJExporter();
      const obj = objExporter.parse(exportScene);
      const mtl = `newmtl material0\nmap_Kd texture.png\nmap_Ks texture.png\nmap_Bump normal.png\nmap_d roughness.png\nmap_Pr metallic.png\n`;
      const zip = new JSZip();
      zip.file('model.obj', obj);
      zip.file('model.mtl', mtl);
      zip.file('texture.png', baseColorBlob);
      zip.file('normal.png', normalBlob);
      zip.file('roughness.png', roughnessBlob);
      zip.file('metallic.png', metallicBlob);
      zip.file('ao.png', aoBlob);
      zip.file('height.png', heightBlob);
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(zipBlob, 'model_obj.zip');
    }
  } catch (e) {
    console.error('Export error:', e);
    alert('Ошибка экспорта 3D: ' + e.message);
  }
});

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Интеграция (без Godot) ---
document.getElementById('integrationDownloadBtn')?.addEventListener('click', () => {
  const engine = document.getElementById('integrationSelect').value;
  let url = engine === 'blender' ? 'https://github.com/PatternForge/blender-addon/releases/latest/download/patternforge_blender.zip' : 'https://github.com/PatternForge/unity-package/releases/latest/download/PatternForge.unitypackage';
  if (url) {
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.target = '_blank';
    a.click();
  } else {
    alert('Скачивание временно недоступно');
  }
});

// --- Гамбургер-меню ---
const menuToggle = document.getElementById('menuToggle');
const patternBar = document.getElementById('patternBar');
const menuOverlay = document.getElementById('menuOverlay');
function openMenu() {
  patternBar.classList.add('open');
  menuOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeMenu() {
  patternBar.classList.remove('open');
  menuOverlay.classList.remove('active');
  document.body.style.overflow = '';
}
menuToggle?.addEventListener('click', e => {
  e.stopPropagation();
  if (patternBar.classList.contains('open')) closeMenu();
  else openMenu();
});
menuOverlay?.addEventListener('click', closeMenu);

// --- Аккордеон (только для мобильных) ---
function initAccordion() {
  if (window.innerWidth > 860) return;
  const headers = document.querySelectorAll('.accordion-header');
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const group = header.closest('.accordion-group');
      group.classList.toggle('open');
      renderAll();
    });
  });
}

// --- Мобильные табы ---
function initMobileTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  const contents = {
    texture: document.getElementById('tab-texture'),
    view3d: document.getElementById('tab-view3d'),
    pbr: document.getElementById('tab-pbr')
  };
  if (!tabs.length) return;
  const activateTab = target => {
    tabs.forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${target}"]`).classList.add('active');
    Object.values(contents).forEach(content => content?.classList.remove('active'));
    if (target === 'texture') contents.texture?.classList.add('active');
    if (target === 'view3d') contents.view3d?.classList.add('active');
    if (target === 'pbr') contents.pbr?.classList.add('active');
    setTimeout(() => {
      updateSizes();
      renderAll();
    }, 50);
  };
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      activateTab(target);
    });
  });
  if (!document.querySelector('.tab-content.active')) activateTab('texture');
  window.addEventListener('resize', () => {
    if (window.innerWidth <= 860) {
      const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
      if (activeTab) activateTab(activeTab);
    }
  });
}

// --- Пресеты ---
const savePresetBtn = document.getElementById('savePresetBtn');
const loadPresetInput = document.getElementById('loadPresetInput');
const loadPresetBtn = document.getElementById('loadPresetBtn');
function getCurrentPreset() {
  return {
    colors: activeColors.map(c => c.getHexString()),
    uniforms: {
      scale: uniforms.uScale.value,
      octaves: uniforms.uOctaves.value,
      persistence: uniforms.uPersistence.value,
      lacunarity: uniforms.uLacunarity.value,
      saturation: uniforms.uSaturation.value,
      blendMode: uniforms.uBlendMode.value,
      rotation: uniforms.uRotation.value,
      offsetX: uniforms.uOffset.value.x,
      offsetY: uniforms.uOffset.value.y,
      mirror: uniforms.uMirror.value,
      warpEnable: uniforms.uWarpEnable.value,
      warpStrength: uniforms.uWarpStrength.value,
      warpOctaves: uniforms.uWarpOctaves.value,
      reliefStrength: uniforms.uReliefStrength.value,
      intensity: uniforms.uIntensity.value,
      normalStrength: uniforms.uNormalStrength.value,
      roughnessContrast: uniforms.uRoughnessContrast.value,
      metalThreshold: uniforms.uMetalThreshold.value,
      metalScale: uniforms.uMetalScale.value
    },
    patternType: uniforms.uPatternType.value
  };
}
function applyPreset(p) {
  if (!p.colors) return;
  activeColors = p.colors.map(h => new THREE.Color('#' + h));
  rebuildColorUI();
  updateColorUniforms();
  if (p.uniforms) {
    Object.keys(p.uniforms).forEach(k => {
      const el = document.getElementById(k);
      if (el) el.value = p.uniforms[k];
    });
    updateUniformsFromUI();
  }
  if (p.patternType !== undefined) uniforms.uPatternType.value = p.patternType;
  updateUniformsFromUI();
  renderAll();
}
savePresetBtn?.addEventListener('click', () => {
  const p = getCurrentPreset();
  const blob = new Blob([JSON.stringify(p)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `preset_${Date.now()}.json`;
  a.click();
});
loadPresetBtn?.addEventListener('click', () => loadPresetInput.click());
loadPresetInput?.addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    try {
      applyPreset(JSON.parse(ev.target.result));
    } catch (e) {
      alert('Ошибка загрузки пресета');
    }
  };
  r.readAsText(f);
});

// --- Зум и панорамирование 2D ---
const zoomPanContainer = document.getElementById('zoomPanContainer');
let zoomScale = 1;
let panX = 0, panY = 0;
let isPanning2d = false;
let startPanX = 0, startPanY = 0;
function updateZoomPan() {
  if (container2d.firstChild) {
    container2d.firstChild.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
  }
}
zoomPanContainer?.addEventListener('wheel', e => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  zoomScale = Math.min(Math.max(0.5, zoomScale + delta), 4);
  updateZoomPan();
}, { passive: false });
zoomPanContainer?.addEventListener('mousedown', e => {
  isPanning2d = true;
  startPanX = e.clientX - panX;
  startPanY = e.clientY - panY;
  zoomPanContainer.style.cursor = 'grabbing';
});
window.addEventListener('mousemove', e => {
  if (!isPanning2d) return;
  panX = e.clientX - startPanX;
  panY = e.clientY - startPanY;
  updateZoomPan();
});
window.addEventListener('mouseup', () => {
  isPanning2d = false;
  if (zoomPanContainer) zoomPanContainer.style.cursor = 'grab';
});
zoomPanContainer?.addEventListener('dblclick', () => {
  zoomScale = 1;
  panX = 0;
  panY = 0;
  updateZoomPan();
});

// --- Запуск ---
update3dModel();
generateOverlayTexture();
initAccordion();
initMobileTabs();
renderAll();
