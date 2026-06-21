/* ============================================================
   OBJECT3D.JS — единый 3D-меш через ExtrudeGeometry
   Режим A: прямоугольная пластина (Box)  — DoubleSide текстура
   Режим B: экструзия по alpha-контуру    — ЕДИНЫЙ связный меш
   ============================================================ */
window.Object3D = (function () {
  const { state } = App;

  /* ════════════════════════════════════════
     УТИЛИТЫ
  ════════════════════════════════════════ */

  function _loadTex(url) {
    return new Promise(res => {
      const l = new THREE.TextureLoader();
      l.load(url, tex => {
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = 4;
        res(tex);
      });
    });
  }

  /* Читает пиксели с уменьшением */
  function _readPixels(img, maxSide = 384) {
    const sc = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w  = Math.max(4, Math.round(img.width  * sc));
    const h  = Math.max(4, Math.round(img.height * sc));
    const c  = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return { data: c.getContext('2d').getImageData(0, 0, w, h).data, w, h };
  }

  /* Трассировка контура Moore neighbourhood */
  function _traceContour(solid, w, h, sx, sy) {
    const dx8 = [1,1,0,-1,-1,-1, 0, 1];
    const dy8 = [0,1,1, 1, 0,-1,-1,-1];
    const pts  = [];
    let x = sx, y = sy, dir = 0;
    const visited = new Set();
    const MAX = w * h * 2;

    for (let step = 0; step < MAX; step++) {
      const k = y * w + x;
      if (visited.has(k) && x === sx && y === sy && pts.length > 6) break;
      visited.add(k);
      pts.push({ x, y });
      const startDir = (dir + 6) % 8;
      let found = false;
      for (let i = 0; i < 8; i++) {
        const d  = (startDir + i) % 8;
        const nx = x + dx8[d], ny = y + dy8[d];
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && solid[ny * w + nx]) {
          x = nx; y = ny; dir = d; found = true; break;
        }
      }
      if (!found) break;
    }
    return pts;
  }

  /* RDP упрощение */
  function _rdp(pts, eps) {
    if (pts.length <= 2) return pts;
    const a = pts[0], b = pts[pts.length - 1];
    let maxD = 0, idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const dx = b.x - a.x, dy = b.y - a.y;
      let d;
      if (!dx && !dy) { d = Math.hypot(pts[i].x - a.x, pts[i].y - a.y); }
      else {
        const t = ((pts[i].x - a.x) * dx + (pts[i].y - a.y) * dy) / (dx*dx + dy*dy);
        d = Math.hypot(pts[i].x - (a.x + t*dx), pts[i].y - (a.y + t*dy));
      }
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps) {
      const L = _rdp(pts.slice(0, idx + 1), eps);
      const R = _rdp(pts.slice(idx), eps);
      return [...L.slice(0, -1), ...R];
    }
    return [a, b];
  }

  /* Пиксель → Three.js XY */
  function _px2w(px, py, pw, ph, objW, objH) {
    return {
      x:  (px / pw - 0.5) * objW,
      y: -(py / ph - 0.5) * objH,
    };
  }

  /* Строит THREE.Shape по alpha-маске */
  function _buildShape(img, objW, objH) {
    try {
      const { data, w, h } = _readPixels(img, 384);
      const ALPHA = 15;
      const solid = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) solid[i] = data[i * 4 + 3] > ALPHA ? 1 : 0;

      let sx = -1, sy = -1;
      outer: for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          if (solid[y * w + x]) { sx = x; sy = y; break outer; }
      if (sx < 0) return null;

      const raw  = _traceContour(solid, w, h, sx, sy);
      if (!raw || raw.length < 6) return null;

      const eps  = Math.max(w, h) * 0.015;
      const simp = _rdp(raw, eps);
      if (simp.length < 3) return null;

      const shape = new THREE.Shape();
      const p0 = _px2w(simp[0].x, simp[0].y, w, h, objW, objH);
      shape.moveTo(p0.x, p0.y);
      for (let i = 1; i < simp.length; i++) {
        const p = _px2w(simp[i].x, simp[i].y, w, h, objW, objH);
        shape.lineTo(p.x, p.y);
      }
      shape.closePath();
      return shape;
    } catch (e) {
      console.warn('[Object3D] buildShape failed:', e);
      return null;
    }
  }

  /* Средний цвет краёв (для боковин) */
  function _edgeColor(tex) {
    try {
      const img = tex.image;
      const c   = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const pw = img.width - 1, ph = img.height - 1;
      const mx = pw >> 1, my = ph >> 1;
      const s  = (x, y) => { const d = ctx.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; };
      const pts = [s(0,0),s(pw,0),s(0,ph),s(pw,ph),s(mx,0),s(0,my),s(pw,my),s(mx,ph)];
      const avg = pts.reduce((a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]], [0,0,0]);
      return new THREE.Color(avg[0]/pts.length/255, avg[1]/pts.length/255, avg[2]/pts.length/255);
    } catch { return new THREE.Color(0x666666); }
  }

  /* ════════════════════════════════════════
     UV-маппинг для ExtrudeGeometry
     Three.js ExtrudeGeometry: group 0 = лицо/зад, group 1 = боковины
  ════════════════════════════════════════ */
  function _setExtrudeUV(geo, objW, objH) {
    // ExtrudeGeometry хранит позиции и UV в одном BufferGeometry
    // Группа 0 (индексы 0..N-1) — лицевая + задняя грани (ShapeGeometry)
    // Группа 1 (индексы N..)    — боковины
    // UV для лицевой/задней: нормализуем XY позицию → [0..1]
    const pos = geo.attributes.position;
    const uv  = geo.attributes.uv;
    if (!uv) return;

    // Находим группы
    const groups = geo.groups;
    if (!groups || groups.length < 2) {
      // Нет групп — просто пересчитаем все UV по XY
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i);
        uv.setXY(i, x / objW + 0.5, y / objH + 0.5);
      }
      uv.needsUpdate = true;
      return;
    }

    // Группа 0 — лицо+зад: UV по XY
    const g0 = groups[0];
    // Нам нужно перебрать индексы и установить UV для каждого уникального вертекса
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      const x = pos.getX(i), y = pos.getY(i);
      // лицевая грань (z ≈ depth) и задняя (z ≈ 0) — UV одинаковый
      uv.setXY(i, x / objW + 0.5, y / objH + 0.5);
    }
    uv.needsUpdate = true;
  }

  /* ════════════════════════════════════════
     ОСНОВНАЯ ФУНКЦИЯ: buildMesh
  ════════════════════════════════════════ */
  async function buildMesh(obj) {
    if (obj._mesh && state.scene) {
      state.scene.remove(obj._mesh);
      obj._mesh = null;
    }

    const url = (obj.useBgRemove && obj.processedURL) ? obj.processedURL : obj.imageURL;
    if (!url) return null;

    const tex   = await _loadTex(url);
    obj._texture = tex;

    const imgW = tex.image.width;
    const imgH = tex.image.height;
    const asp  = imgW / imgH;
    const objH = 1;
    const objW = asp;
    const depth = Math.max(0.001, (obj.thickness / Math.max(imgW, imgH)) * objH * 5);

    const group = new THREE.Group();
    const ec    = _edgeColor(tex);

    if (obj.mode === 'A') {
      /* ──────────────────────────────────────
         Режим A: прямоугольная пластина
         BoxGeometry, DoubleSide на лице/зади
      ────────────────────────────────────── */
      const geo     = new THREE.BoxGeometry(objW, objH, depth);
      const matFace = new THREE.MeshLambertMaterial({
        map: tex, transparent: true, alphaTest: 0.05,
        side: THREE.DoubleSide,
      });
      const matSide = new THREE.MeshLambertMaterial({ color: ec });
      // BoxGeometry groups: right,left,top,bottom,front,back
      group.add(new THREE.Mesh(geo, [matSide, matSide, matSide, matSide, matFace, matFace]));

    } else {
      /* ──────────────────────────────────────
         Режим B: ExtrudeGeometry — ЕДИНЫЙ МЕШ
         shape по alpha-контуру + экструзия
      ────────────────────────────────────── */
      const shape = _buildShape(tex.image, objW, objH);

      if (shape) {
        const extrudeSettings = {
          depth,
          bevelEnabled: false,
          steps: 1,
        };

        const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);

        // Пересчитываем UV лицевой/задней граней под текстуру
        _setExtrudeUV(geo, objW, objH);

        // Два материала: 0 = лицо+зад (текстура), 1 = бок (цвет)
        const matFace = new THREE.MeshLambertMaterial({
          map: tex, transparent: true, alphaTest: 0.05,
          side: THREE.DoubleSide,
        });
        const matSide = new THREE.MeshLambertMaterial({
          color: ec, side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geo, [matFace, matSide]);
        // ExtrudeGeometry выдаёт форму в XY, центрируем по Z
        mesh.position.z = -depth / 2;
        group.add(mesh);

      } else {
        /* фолбэк: DoubleSide плоскость */
        const geo  = new THREE.PlaneGeometry(objW, objH);
        const mat  = new THREE.MeshLambertMaterial({
          map: tex, transparent: true, alphaTest: 0.05,
          side: THREE.DoubleSide,
        });
        group.add(new THREE.Mesh(geo, mat));
      }
    }

    _applyTransform(group, obj);
    if (state.scene) state.scene.add(group);
    obj._mesh = group;
    return group;
  }

  /* ════════════════════════════════════════
     ТРАНСФОРМАЦИИ И АНИМАЦИЯ
  ════════════════════════════════════════ */

  function _applyTransform(mesh, obj) {
    const vw = App.state.videoWidth  || 1280;
    const vh = App.state.videoHeight || 720;
    mesh.position.x = (obj.x / vw - 0.5) * 2 * (vw / vh);
    mesh.position.y = -(obj.y / vh - 0.5) * 2;
    mesh.position.z = 0;
    mesh.scale.setScalar(obj.scale);
    mesh.rotation.set(
      THREE.MathUtils.degToRad(obj.rotX),
      THREE.MathUtils.degToRad(obj.rotY),
      THREE.MathUtils.degToRad(obj.rotZ),
    );
  }

  function updateTransform(obj) {
    if (obj._mesh) _applyTransform(obj._mesh, obj);
  }

  function updateOpacity(obj, opacity) {
    if (!obj._mesh) return;
    obj._mesh.traverse(c => {
      if (!c.isMesh) return;
      (Array.isArray(c.material) ? c.material : [c.material])
        .forEach(m => { m.opacity = opacity; m.transparent = true; });
    });
  }

  function updateVisibility(obj) {
    if (obj._mesh) obj._mesh.visible = obj.visible;
  }

  function animateTick(obj, dt) {
    if (!obj._mesh) return;
    const t = App.state.currentTime;
    let op = obj.opacity;
    if (t < obj.startTime || t > obj.endTime) { obj._mesh.visible = false; return; }
    obj._mesh.visible = obj.visible;

    if (obj.fadeInEnd > obj.fadeInStart && t >= obj.fadeInStart && t <= obj.fadeInEnd)
      op *= Math.min(1, (t - obj.fadeInStart) / (obj.fadeInEnd - obj.fadeInStart));
    else if (t < obj.fadeInEnd) op = 0;

    if (obj.fadeOutEnd > obj.fadeOutStart && t >= obj.fadeOutStart && t <= obj.fadeOutEnd)
      op *= Math.max(0, 1 - (t - obj.fadeOutStart) / (obj.fadeOutEnd - obj.fadeOutStart));
    else if (t > obj.fadeOutStart && obj.fadeOutEnd > obj.fadeOutStart) op = 0;

    updateOpacity(obj, Math.max(0, Math.min(1, op)));

    if (obj.autoRotX) obj._mesh.rotation.x += THREE.MathUtils.degToRad(obj.rotSpeedX * obj.rotDirX * dt);
    if (obj.autoRotY) obj._mesh.rotation.y += THREE.MathUtils.degToRad(obj.rotSpeedY * obj.rotDirY * dt);
    if (obj.autoRotZ) obj._mesh.rotation.z += THREE.MathUtils.degToRad(obj.rotSpeedZ * obj.rotDirZ * dt);
  }

  async function rebuild(obj) { await buildMesh(obj); }

  return { buildMesh, updateTransform, updateOpacity, updateVisibility, animateTick, rebuild };
})();
