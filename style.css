* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Space Grotesk', system-ui, -apple-system, sans-serif;
  background: #fef5f8;
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  color: #1f1a1c;
}

/* --- Хедер --- */
.logo-block {
  background: #3b2a30;
  padding: 12px 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  flex-shrink: 0;
}
.menu-toggle {
  display: none;
  background: none;
  border: none;
  color: #ffdce8;
  font-size: 1.6rem;
  cursor: pointer;
  line-height: 1;
  padding: 8px;
  position: absolute;
  left: 15px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1002;
}
.logo {
  font-size: 1.7rem;
  font-weight: 700;
  background: linear-gradient(135deg, #ffdce8, #ffb7ca);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

/* --- Категории --- */
.pattern-bar {
  background: #fce9ef; padding: 10px 20px; border-bottom: 1px solid #e9cfd8;
  display: flex; justify-content: flex-start; align-items: center; flex-shrink: 0; overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  z-index: 1010;
}
.category-filters { display: flex; flex-wrap: nowrap; gap: 20px; justify-content: flex-start; align-items: center; }
.category-group { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.category-label { font-size: 0.85rem; font-weight: 600; color: #3b2a30; }
.category-select { padding: 8px 16px; border-radius: 40px; background: white; border: 1px solid #dcb7c2; font-weight: 500; font-size: 0.85rem; min-width: 130px; cursor: pointer; }

.menu-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 1005;
  display: none; backdrop-filter: blur(2px);
}
.menu-overlay.active { display: block; }

/* --- Основная сетка --- */
.main-layout { flex: 1; display: flex; flex-direction: row; gap: 1px; background: #f0e2e8; overflow: hidden; min-height: 0; }
.settings-column { flex: 0 0 420px; background: #fffafc; display: flex; flex-direction: column; overflow: hidden; z-index: 50; }
.preview-wrapper {
  flex: 1; background: #fffafc; display: flex; flex-direction: row; align-items: stretch; overflow: hidden; border-left: 1px solid #f0dfe6;
}
.texture-column { flex: 1; display: flex; flex-direction: column; min-width: 200px; }
.view3d-column { flex: 1; display: flex; flex-direction: column; min-width: 200px; }
.pbr-column { flex: 0 0 300px; display: flex; flex-direction: column; border-left: 1px solid #f0dfe6; }
.resize-handle { width: 6px; background: #f0e2e8; cursor: col-resize; flex-shrink: 0; transition: background 0.2s; }
.resize-handle:hover { background: #cf8e9e; }
.preview-header {
  background: #d9b7c2cc; backdrop-filter: blur(8px); padding: 10px;
  font-weight: 600; font-size: 0.9rem; text-align: center; flex-shrink: 0; border-bottom: 1px solid #e9cfd8;
}
.zoom-pan-container {
  flex: 1; min-height: 200px; overflow: hidden; position: relative; cursor: grab; background: transparent;
}
.zoom-pan-container:active { cursor: grabbing; }
.zoom-pan-container canvas { transform-origin: center center; transition: transform 0.1s ease-out; }
.canvas-container { position: relative; display: flex; align-items: center; justify-content: center; flex: 1; min-height: 0; overflow: hidden; background: transparent; }
canvas { display: block; outline: none; max-width: 100%; max-height: 100%; object-fit: contain; touch-action: none; }
.pbr-grid-container { padding: 12px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; }
.pbr-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; align-content: start; }
.pbr-item { text-align: center; }
.pbr-item canvas { width: 100%; border-radius: 8px; border: 1px solid #e9cfd8; background: #eee; }
.pbr-item span { display: block; margin-top: 6px; font-size: 0.75rem; font-weight: 600; color: #3b2a30; }

/* --- Настройки --- */
.settings-panel { flex: 1; overflow-y: auto; padding: 18px 16px; display: flex; flex-direction: column; gap: 20px; }
.setting-group { background: #ffeef3; border-radius: 20px; padding: 18px 20px; border: 1px solid #fad3df; box-shadow: 0 4px 12px rgba(100, 60, 70, 0.06); }
.setting-group h3 { font-size: 1rem; margin-bottom: 14px; color: #2e1e24; font-weight: 700; }
.control-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: nowrap; }
.control-row label { width: 110px; flex-shrink: 0; font-size: 0.85rem; font-weight: 600; color: #3b2a30; }
.control-row input[type="range"] { flex: 1; min-width: 0; height: 6px; background: #f0cdd8; border-radius: 6px; accent-color: #cf8e9e; cursor: pointer; }
.value-display { width: 45px; text-align: right; flex-shrink: 0; font-family: 'Space Grotesk', monospace; font-weight: 500; font-size: 0.85rem; }
.compact-select { flex: 1; min-width: 0; padding: 8px 12px; border-radius: 40px; background: white; border: 1px solid #e2b7c4; font-size: 0.85rem; font-family: inherit; }
/* Цвета */
.color-list { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; margin-bottom: 8px; }
.color-item { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 60px; }
.color-circle-input { width: 56px; height: 56px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.15); cursor: pointer; padding: 0; background: none; overflow: hidden; }
.color-circle-input::-webkit-color-swatch-wrapper { padding: 0; }
.color-circle-input::-webkit-color-swatch { border: none; border-radius: 50%; }
.remove-color-btn { width: 24px; height: 24px; font-size: 12px; font-weight: bold; color: white; background: #ef7e8a; border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; margin: 0; }

.center-btn, .file-input-btn, select, button {
  background: white;
  border: 1px solid #e2b7c4;
  border-radius: 40px !important;
  padding: 8px 16px;
  font-size: 0.85rem;
  cursor: pointer;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  transition: all 0.2s;
  font-family: inherit;
  line-height: 1.4;
}
.center-btn:hover, .file-input-btn:hover, button:hover { background: #fff0f5; border-color: #cf8e9e; }

.btn-left { margin-left: 0 !important; margin-right: auto !important; display: inline-flex !important; }

.model-row { display: flex; gap: 10px; align-items: center; flex-wrap: nowrap; margin-bottom: 8px; }
.model-row select, .model-row .file-input-btn { margin: 0; height: 36px; padding: 0 16px; }
.bg-upload-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; justify-content: flex-start; }
.layers-list { max-height: 250px; overflow-y: auto; background: #fff9fb; border-radius: 20px; padding: 8px; margin: 10px 0; border: 1px solid #fad3df; }
.layer-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; margin-bottom: 6px; background: #fff0f5; border-radius: 30px; cursor: pointer; }
.layer-item.selected { background: #ffd9e2; border-left: 4px solid #cf8e9e; }
.layer-thumb { width: 40px; height: 40px; background: #eee; border-radius: 8px; object-fit: cover; }
.layer-name { flex: 1; font-size: 0.8rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.layer-controls { display: flex; gap: 4px; }
.layer-controls button { background: none; border: none; font-size: 1.1rem; cursor: pointer; padding: 4px; width: auto; height: auto; flex-shrink: 0; margin: 0; border-radius: 50% !important; }

#addColorBtn, #savePresetBtn, #clearOverlayBtn, #clearBgBtn { background: #cf8e9e; color: white; border: none; }
#loadPresetBtn { background: #ffffff; color: #cf8e9e; border: 2px solid #cf8e9e; font-weight: 700; }
#loadPresetBtn:hover { background: #fce9ef; }
#clearOverlayBtn { background: #b46e7e; }
.hidden { display: none !important; }

/* --- Футер --- */
.global-footer {
  background: #fcf0f5; border-top: 1px solid #f0d9e2; padding: 12px 20px;
  flex-shrink: 0; display: flex; flex-direction: row; justify-content: space-between; gap: 24px;
}
.footer-item { display: flex; flex-direction: row; align-items: center; gap: 16px; flex: 1; justify-content: center; }
.footer-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center; }
.footer-label { font-weight: 700; color: #2e1e24; font-size: 0.9rem; white-space: nowrap; margin: 0; }
.export-btn {
  background: linear-gradient(115deg, #cf8e9e, #b46e7e);
  border: none; color: white; padding: 8px 18px; margin: 0; width: auto;
  display: inline-flex; border-radius: 40px !important;
}
.export-btn:hover { opacity: 0.9; }

/* ==========================================================================
МОБИЛЬНАЯ АДАПТАЦИЯ (<= 860px)
========================================================================== */
@media (max-width: 860px) {
  body {
    height: auto;
    min-height: 100vh;
    overflow-y: auto;
  }
  .menu-toggle { display: block; }
  
  .pattern-bar {
    position: fixed; left: -100%; top: 0; bottom: 0;
    width: 260px;
    flex-direction: column; align-items: flex-start;
    padding: 70px 16px 20px;
    transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 1010; box-shadow: 4px 0 20px rgba(0,0,0,0.2); overflow-y: auto; background: #fce9ef;
  }
  .pattern-bar.open { left: 0; }
  
  .category-filters, .category-group, .category-label, .category-select {
    justify-content: flex-start; align-items: flex-start; text-align: left; width: 100%; margin: 0;
  }
  .category-group { flex-direction: column; align-items: flex-start; gap: 6px; margin-bottom: 16px; }
  .category-label { text-align: left; }
  .category-select { padding: 10px 12px; min-width: unset; width: 100%; }

  .main-layout {
    flex-direction: column;
    overflow-y: visible;
    height: auto;
    gap: 0;
  }
  .settings-column {
    flex: 0 0 auto;
    max-height: 45vh;
    overflow-y: auto;
    border-bottom: 2px solid #f0dfe6;
  }
  .preview-wrapper {
    flex-direction: column;
    overflow-y: visible;
    height: auto;
    border-left: none;
  }
  .texture-column, .view3d-column, .pbr-column {
    flex: 0 0 auto;
    min-height: 320px;
    border-left: none;
    border-bottom: 1px solid #f0dfe6;
  }
  .resize-handle { display: none; }
  
  .setting-group { padding: 14px; border-radius: 16px; }
  .control-row { gap: 8px; flex-wrap: wrap; }
  .control-row label { width: 100px; font-size: 0.8rem; }
  .color-circle-input { width: 48px; height: 48px; }
  
  /* Футер — компактный, подпись слева от контролов */
  .global-footer {
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px;
  }
  .footer-item {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    background: white;
    border-radius: 20px;
    padding: 8px 12px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.05);
  }
  .footer-label {
    font-size: 0.85rem;
    margin: 0;
  }
  .footer-controls {
    flex: 1;
    justify-content: flex-end;
    gap: 6px;
  }
  .footer-item select, .footer-item .export-btn {
    padding: 6px 12px;
    font-size: 0.75rem;
  }
  .export-btn { padding: 6px 14px; }
  
  /* Убираем лишние отступы у слоёв */
  .layers-list { max-height: 180px; }
  .pbr-column { min-height: 280px; }
}

@media (max-width: 480px) {
  .settings-column { max-height: 40vh; }
  .logo { font-size: 1.4rem; }
  .footer-item { flex-direction: column; align-items: stretch; gap: 8px; }
  .footer-controls { justify-content: stretch; }
  .footer-controls select, .footer-controls button { flex: 1; }
  .footer-label { text-align: left; }
}
