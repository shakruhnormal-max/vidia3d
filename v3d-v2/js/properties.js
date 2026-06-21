/* ============================================================
   PROPERTIES.JS  —  правая панель параметров выбранного объекта
   ============================================================ */
window.Properties = (function () {
  const noSel = document.getElementById('no-selection');
  const body = document.getElementById('props-body');

  App.on('selectionChanged', refresh);
  App.on('objectTransformChanged', refresh);

  function refresh() {
    const obj = App.getSelected();
    if (!obj) {
      noSel.style.display = '';
      body.style.display = 'none';
      return;
    }
    noSel.style.display = 'none';
    body.style.display = '';
    body.innerHTML = _buildHTML(obj);
    // Обновить статус удаления фона (нельзя делать в шаблоне — сложные условия)
    const stEl = document.getElementById('p-bgremove-status');
    if (stEl) {
      if (obj.processedURL && obj.useBgRemove) {
        stEl.textContent = '✔ Фон вырезан и активен';
        stEl.style.cssText = 'font-size:9px;padding:3px 6px;border-radius:3px;background:rgba(62,207,106,0.12);color:#3ecf6a';
      } else if (obj.processedURL) {
        stEl.textContent = '✔ Фон вырезан (выключено)';
        stEl.style.cssText = 'font-size:9px;padding:3px 6px;border-radius:3px;background:rgba(240,192,91,0.12);color:#f0c05b';
      } else {
        stEl.textContent = '— Фон не удалён';
        stEl.style.cssText = 'font-size:9px;padding:3px 6px;border-radius:3px;background:var(--bg-3);color:var(--text-2)';
      }
    }
    _bindEvents(obj);
  }

  function _buildHTML(o) {
    return `
    <!-- БАЗОВЫЕ -->
    <div class="prop-section">
      <div class="prop-section-title">Основные</div>
      <div class="prop-row">
        <span class="prop-label">Имя</span>
        <input class="prop-input" type="text" id="p-name" value="${_esc(o.name)}">
      </div>
      <div class="prop-row">
        <span class="prop-label">Режим 3D</span>
        <select class="prop-input" id="p-mode">
          <option value="A" ${o.mode==='A'?'selected':''}>A — Пластина</option>
          <option value="B" ${o.mode==='B'?'selected':''}>B — По контуру</option>
        </select>
      </div>
      <div class="prop-row">
        <span class="prop-label">Толщина</span>
        <input type="range" id="p-thickness" min="1" max="500" value="${o.thickness}" style="flex:1;min-width:0">
        <input type="number" id="p-thickness-num" min="1" max="9999" value="${o.thickness}" style="width:52px;background:var(--bg-3);border:1px solid var(--border);color:var(--text-0);padding:2px 5px;border-radius:var(--radius);font-size:11px;text-align:center">
      </div>
      <div class="prop-row" style="flex-direction:column;align-items:stretch;gap:6px">
        <div style="display:flex;gap:6px;align-items:center">
          <button class="btn-sm success" id="p-bgremove-edit" style="width:100%;font-size:11px">✂ Удалить фон…</button>
        </div>
        <div id="p-bgremove-status"></div>
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-1);cursor:pointer">
          <input type="checkbox" class="prop-input" id="p-bgremove" ${o.useBgRemove ? 'checked' : ''} style="margin:0">
          Использовать вырезанное изображение
        </label>
      </div>
    </div>

    <!-- ПОЗИЦИЯ и МАСШТАБ -->
    <div class="prop-section">
      <div class="prop-section-title">Позиция и масштаб</div>
      <div class="prop-row">
        <span class="prop-label">X</span>
        <input class="prop-input" type="number" id="p-x" value="${Math.round(o.x)}" step="1">
      </div>
      <div class="prop-row">
        <span class="prop-label">Y</span>
        <input class="prop-input" type="number" id="p-y" value="${Math.round(o.y)}" step="1">
      </div>
      <div class="prop-row">
        <span class="prop-label">Масштаб</span>
        <input class="prop-input" type="range" id="p-scale" min="0.01" max="5" step="0.01" value="${o.scale}" style="flex:1">
        <span id="p-scale-val" style="font-size:10px;color:var(--text-1);min-width:32px">${o.scale.toFixed(2)}</span>
      </div>
    </div>

    <!-- ПОВОРОТ -->
    <div class="prop-section">
      <div class="prop-section-title">Начальный поворот</div>
      <div class="prop-3col" style="margin-bottom:3px">
        <input class="prop-input" type="number" id="p-rotX" value="${o.rotX}" min="0" max="360" step="1">
        <input class="prop-input" type="number" id="p-rotY" value="${o.rotY}" min="0" max="360" step="1">
        <input class="prop-input" type="number" id="p-rotZ" value="${o.rotZ}" min="0" max="360" step="1">
      </div>
      <div class="prop-3col">
        <div class="prop-sublabel">Rot X°</div>
        <div class="prop-sublabel">Rot Y°</div>
        <div class="prop-sublabel">Rot Z°</div>
      </div>
    </div>

    <!-- АВТОВРАЩЕНИЕ -->
    <div class="prop-section">
      <div class="prop-section-title">Автовращение</div>
      <div style="display:grid;grid-template-columns:22px 40px 1fr 60px;gap:4px;align-items:center;margin-bottom:4px">
        <input type="checkbox" class="prop-input" id="p-arX" ${o.autoRotX?'checked':''}>
        <span style="font-size:10px;color:var(--text-1)">Ось X</span>
        <input class="prop-input" type="range" id="p-rsX" min="1" max="720" step="1" value="${o.rotSpeedX}" style="flex:1">
        <span style="font-size:10px;color:var(--text-1);text-align:right"><span id="p-rsX-val">${o.rotSpeedX}</span>°/с</span>
      </div>
      <div style="display:grid;grid-template-columns:22px 40px 1fr 60px;gap:4px;align-items:center;margin-bottom:4px">
        <input type="checkbox" class="prop-input" id="p-arY" ${o.autoRotY?'checked':''}>
        <span style="font-size:10px;color:var(--text-1)">Ось Y</span>
        <input class="prop-input" type="range" id="p-rsY" min="1" max="720" step="1" value="${o.rotSpeedY}" style="flex:1">
        <span style="font-size:10px;color:var(--text-1);text-align:right"><span id="p-rsY-val">${o.rotSpeedY}</span>°/с</span>
      </div>
      <div style="display:grid;grid-template-columns:22px 40px 1fr 60px;gap:4px;align-items:center;margin-bottom:4px">
        <input type="checkbox" class="prop-input" id="p-arZ" ${o.autoRotZ?'checked':''}>
        <span style="font-size:10px;color:var(--text-1)">Ось Z</span>
        <input class="prop-input" type="range" id="p-rsZ" min="1" max="720" step="1" value="${o.rotSpeedZ}" style="flex:1">
        <span style="font-size:10px;color:var(--text-1);text-align:right"><span id="p-rsZ-val">${o.rotSpeedZ}</span>°/с</span>
      </div>
      <div class="prop-row">
        <span class="prop-label">Направление</span>
        <select class="prop-input" id="p-rotdir">
          <option value="1" ${o.rotDirY===1?'selected':''}>По часовой</option>
          <option value="-1" ${o.rotDirY===-1?'selected':''}>Против</option>
        </select>
      </div>
    </div>

    <!-- ПРОЗРАЧНОСТЬ -->
    <div class="prop-section">
      <div class="prop-section-title">Прозрачность</div>
      <div class="prop-row">
        <span class="prop-label">Opacity</span>
        <input class="prop-input" type="range" id="p-opacity" min="0" max="1" step="0.01" value="${o.opacity}" style="flex:1">
        <span id="p-opacity-val" style="font-size:10px;color:var(--text-1);min-width:32px">${Math.round(o.opacity*100)}%</span>
      </div>
    </div>

    <!-- ВРЕМЯ ЖИЗНИ -->
    <div class="prop-section">
      <div class="prop-section-title">Время жизни</div>
      <div class="prop-row">
        <span class="prop-label">Старт</span>
        <input class="prop-input" type="number" id="p-start" value="${o.startTime.toFixed(2)}" step="0.1" min="0">
        <span style="font-size:10px;color:var(--text-2);margin-left:2px">с</span>
      </div>
      <div class="prop-row">
        <span class="prop-label">Конец</span>
        <input class="prop-input" type="number" id="p-end" value="${o.endTime.toFixed(2)}" step="0.1" min="0">
        <span style="font-size:10px;color:var(--text-2);margin-left:2px">с</span>
      </div>
    </div>

    <!-- FADE IN -->
    <div class="prop-section">
      <div class="prop-section-title">Fade In</div>
      <div class="prop-row">
        <span class="prop-label">Начало</span>
        <input class="prop-input" type="number" id="p-fis" value="${o.fadeInStart.toFixed(2)}" step="0.1" min="0">
        <span style="font-size:10px;color:var(--text-2);margin-left:2px">с</span>
      </div>
      <div class="prop-row">
        <span class="prop-label">Конец</span>
        <input class="prop-input" type="number" id="p-fie" value="${o.fadeInEnd.toFixed(2)}" step="0.1" min="0">
        <span style="font-size:10px;color:var(--text-2);margin-left:2px">с</span>
      </div>
    </div>

    <!-- FADE OUT -->
    <div class="prop-section">
      <div class="prop-section-title">Fade Out</div>
      <div class="prop-row">
        <span class="prop-label">Начало</span>
        <input class="prop-input" type="number" id="p-fos" value="${o.fadeOutStart.toFixed(2)}" step="0.1" min="0">
        <span style="font-size:10px;color:var(--text-2);margin-left:2px">с</span>
      </div>
      <div class="prop-row">
        <span class="prop-label">Конец</span>
        <input class="prop-input" type="number" id="p-foe" value="${o.fadeOutEnd.toFixed(2)}" step="0.1" min="0">
        <span style="font-size:10px;color:var(--text-2);margin-left:2px">с</span>
      </div>
    </div>

    <!-- УДАЛИТЬ -->
    <div class="prop-section">
      <button class="btn-sm danger" id="p-delete" style="width:100%">🗑 Удалить объект</button>
    </div>
    `;
  }

  function _bindEvents(obj) {
    const id = obj.id;

    const bind = (elId, handler) => {
      const el = document.getElementById(elId);
      if (el) el.addEventListener('input', handler);
    };
    const bindChange = (elId, handler) => {
      const el = document.getElementById(elId);
      if (el) el.addEventListener('change', handler);
    };

    bind('p-name', e => App.updateObject(id, { name: e.target.value }));
    bindChange('p-mode', e => { App.updateObject(id, { mode: e.target.value }); Object3D.rebuild(obj); });

    bind('p-thickness', e => {
      const v = Math.max(1, +e.target.value);
      const num = document.getElementById('p-thickness-num');
      if (num) num.value = v;
      App.updateObject(id, { thickness: v });
      Object3D.rebuild(obj);
    });
    bind('p-thickness-num', e => {
      const v = Math.max(1, parseInt(e.target.value) || 1);
      const slider = document.getElementById('p-thickness');
      if (slider) slider.value = Math.min(v, 500);
      App.updateObject(id, { thickness: v });
      Object3D.rebuild(obj);
    });
    document.getElementById('p-thickness-num')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') e.target.blur();
    });

    bindChange('p-bgremove', e => {
      App.updateObject(id, { useBgRemove: e.target.checked });
      Object3D.rebuild(obj);
    });

    document.getElementById('p-bgremove-edit')?.addEventListener('click', async () => {
      const result = await BgRemove.open(obj);
      if (result) {
        App.updateObject(id, { processedURL: result, useBgRemove: true });
        // обновить UI без полного обновления панели
        const cbEl = document.getElementById('p-bgremove');
        if (cbEl) cbEl.checked = true;
        const stEl = document.getElementById('p-bgremove-status');
        if (stEl) {
          stEl.textContent = '✔ Фон вырезан (активно)';
          stEl.style.color = '#3ecf6a';
          stEl.style.background = 'rgba(62,207,106,0.12)';
        }
        await Object3D.rebuild(obj);
      }
    });

    bind('p-x', e => { App.updateObject(id, { x: +e.target.value }); Object3D.updateTransform(obj); });
    bind('p-y', e => { App.updateObject(id, { y: +e.target.value }); Object3D.updateTransform(obj); });

    bind('p-scale', e => {
      const v = +e.target.value;
      document.getElementById('p-scale-val').textContent = v.toFixed(2);
      App.updateObject(id, { scale: v }); Object3D.updateTransform(obj);
    });

    ['X','Y','Z'].forEach(axis => {
      bind(`p-rot${axis}`, e => {
        App.updateObject(id, { [`rot${axis}`]: +e.target.value });
        Object3D.updateTransform(obj);
      });
    });

    // автовращение
    ['X','Y','Z'].forEach(axis => {
      bindChange(`p-ar${axis}`, e => App.updateObject(id, { [`autoRot${axis}`]: e.target.checked }));
      bind(`p-rs${axis}`, e => {
        const v = +e.target.value;
        document.getElementById(`p-rs${axis}-val`).textContent = v;
        App.updateObject(id, { [`rotSpeed${axis}`]: v });
      });
    });

    bindChange('p-rotdir', e => {
      const v = +e.target.value;
      App.updateObject(id, { rotDirX: v, rotDirY: v, rotDirZ: v });
    });

    bind('p-opacity', e => {
      const v = +e.target.value;
      document.getElementById('p-opacity-val').textContent = Math.round(v*100) + '%';
      App.updateObject(id, { opacity: v });
    });

    bind('p-start', e => App.updateObject(id, { startTime: +e.target.value }));
    bind('p-end', e => App.updateObject(id, { endTime: +e.target.value }));
    bind('p-fis', e => App.updateObject(id, { fadeInStart: +e.target.value }));
    bind('p-fie', e => App.updateObject(id, { fadeInEnd: +e.target.value }));
    bind('p-fos', e => App.updateObject(id, { fadeOutStart: +e.target.value }));
    bind('p-foe', e => App.updateObject(id, { fadeOutEnd: +e.target.value }));

    document.getElementById('p-delete')?.addEventListener('click', () => {
      App.removeObject(id);
      Layers.render();
    });
  }

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  }

  return { refresh };
})();
