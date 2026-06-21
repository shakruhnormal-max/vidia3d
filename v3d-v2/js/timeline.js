/* ============================================================
   TIMELINE.JS  —  canvas-based таймлайн
   ============================================================ */
window.Timeline = (function () {
  const { state } = App;

  const wrap = document.getElementById('timeline-canvas-wrap');
  const canvas = document.getElementById('timeline-canvas');
  const ctx = canvas.getContext('2d');

  const TRACK_H = 24;
  const HEADER_H = 22;
  const LABEL_W = 110;
  const COLORS = [
    '#5b6af0','#3ecf6a','#f0c05b','#f05b5b','#5bbef0',
    '#c05bf0','#f07a5b','#5bf0c0','#f05ba8','#a8f05b',
  ];

  let pxPerSec = 80;  // масштаб: пикселей на секунду
  let scrollX = 0;
  let draggingPlayhead = false;
  let draggingTrack = null; // {objId, edge:'start'|'end'|'move', startX, origStart, origEnd}

  /* ---- изменить масштаб ---- */
  document.getElementById('tl-zoom-in').addEventListener('click', () => {
    pxPerSec = Math.min(400, pxPerSec * 1.4);
    render();
  });
  document.getElementById('tl-zoom-out').addEventListener('click', () => {
    pxPerSec = Math.max(10, pxPerSec / 1.4);
    render();
  });

  /* ---- подписки ---- */
  App.on('objectsChanged', () => render());
  App.on('objectUpdated', () => render());
  App.on('timeUpdate', () => render());

  /* ---- ресайз ---- */
  const obs = new ResizeObserver(_resize);
  obs.observe(wrap);

  function _resize() {
    canvas.width = wrap.clientWidth;
    canvas.height = wrap.clientHeight;
    render();
  }

  /* ---- главный рендер ---- */
  function render() {
    const W = canvas.width, H = canvas.height;
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);

    const dur = state.videoDuration || 60;

    // фон
    ctx.fillStyle = '#161618';
    ctx.fillRect(0, 0, W, H);

    // зона треков (правее лейблов)
    const tw = W - LABEL_W; // ширина зоны треков

    // клип — не рисуем за пределами
    ctx.save();

    // === ШКАЛА ВРЕМЕНИ ===
    ctx.fillStyle = '#1e1e21';
    ctx.fillRect(LABEL_W, 0, tw, HEADER_H);
    ctx.strokeStyle = '#3a3a40';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LABEL_W, HEADER_H);
    ctx.lineTo(W, HEADER_H);
    ctx.stroke();

    _drawRuler(tw, dur);

    // === ВИДЕО-ТРЕК ===
    const videoY = HEADER_H;
    ctx.fillStyle = '#1e1e21';
    ctx.fillRect(0, videoY, LABEL_W, TRACK_H);
    ctx.fillStyle = '#28282d';
    ctx.fillRect(LABEL_W, videoY, tw, TRACK_H);

    ctx.fillStyle = '#a0a0aa';
    ctx.font = '10px system-ui';
    ctx.textBaseline = 'middle';
    ctx.fillText('📹 Видео', 6, videoY + TRACK_H / 2);

    if (state.videoDuration > 0) {
      const barW = Math.min(dur * pxPerSec, tw);
      ctx.fillStyle = '#333358';
      ctx.fillRect(LABEL_W - scrollX, videoY + 3, barW, TRACK_H - 6);
      // border
      ctx.strokeStyle = '#5b6af066';
      ctx.lineWidth = 1;
      ctx.strokeRect(LABEL_W - scrollX + 0.5, videoY + 3.5, barW - 1, TRACK_H - 7);
    }

    // разделитель
    ctx.strokeStyle = '#3a3a40';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, videoY + TRACK_H);
    ctx.lineTo(W, videoY + TRACK_H);
    ctx.stroke();

    // === ТРЕКИ ОБЪЕКТОВ ===
    state.objects.forEach((obj, i) => {
      const trackY = HEADER_H + TRACK_H + i * TRACK_H;
      if (trackY + TRACK_H > H) return;

      // лейбл
      ctx.fillStyle = i % 2 === 0 ? '#1a1a1c' : '#1e1e21';
      ctx.fillRect(0, trackY, LABEL_W, TRACK_H);
      const col = COLORS[i % COLORS.length];
      ctx.fillStyle = col;
      ctx.fillRect(0, trackY + TRACK_H/2 - 5, 3, 10);

      ctx.fillStyle = obj.visible ? '#c8c8d0' : '#606068';
      ctx.font = '10px system-ui';
      ctx.textBaseline = 'middle';
      const label = obj.name.length > 13 ? obj.name.slice(0, 12) + '…' : obj.name;
      ctx.fillText(label, 8, trackY + TRACK_H / 2);

      // фон дорожки
      ctx.fillStyle = i % 2 === 0 ? '#1c1c1e' : '#202024';
      ctx.fillRect(LABEL_W, trackY, tw, TRACK_H);

      if (!obj.visible) { _drawTrackSeparator(trackY, W, TRACK_H); return; }

      // бар объекта
      const x0 = LABEL_W + obj.startTime * pxPerSec - scrollX;
      const x1 = LABEL_W + obj.endTime * pxPerSec - scrollX;
      const bw = Math.max(4, x1 - x0);

      // clip треков к зоне tw
      ctx.save();
      ctx.rect(LABEL_W, trackY, tw, TRACK_H);
      ctx.clip();

      // тело бара
      ctx.fillStyle = col + '55';
      ctx.fillRect(x0, trackY + 2, bw, TRACK_H - 4);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x0 + 0.5, trackY + 2.5, bw - 1, TRACK_H - 5);

      // fade in зона
      if (obj.fadeInEnd > obj.fadeInStart) {
        const fx0 = LABEL_W + obj.fadeInStart * pxPerSec - scrollX;
        const fx1 = LABEL_W + obj.fadeInEnd * pxPerSec - scrollX;
        ctx.fillStyle = '#ffffff22';
        ctx.beginPath();
        ctx.moveTo(fx0, trackY + TRACK_H - 2);
        ctx.lineTo(fx1, trackY + 2);
        ctx.lineTo(fx0, trackY + 2);
        ctx.closePath();
        ctx.fill();
      }

      // fade out зона
      if (obj.fadeOutEnd > obj.fadeOutStart) {
        const fxs = LABEL_W + obj.fadeOutStart * pxPerSec - scrollX;
        const fxe = LABEL_W + obj.fadeOutEnd * pxPerSec - scrollX;
        ctx.fillStyle = '#ffffff22';
        ctx.beginPath();
        ctx.moveTo(fxs, trackY + 2);
        ctx.lineTo(fxe, trackY + TRACK_H - 2);
        ctx.lineTo(fxe, trackY + 2);
        ctx.closePath();
        ctx.fill();
      }

      // ручки drag start/end
      const handleW = 5;
      ctx.fillStyle = col;
      ctx.fillRect(x0, trackY + 2, handleW, TRACK_H - 4);
      ctx.fillRect(x1 - handleW, trackY + 2, handleW, TRACK_H - 4);

      // имя
      ctx.fillStyle = col;
      ctx.font = '9px system-ui';
      ctx.textBaseline = 'middle';
      if (bw > 30) ctx.fillText(label, x0 + 8, trackY + TRACK_H / 2);

      ctx.restore();

      // выделение активного трека
      if (App.state.selectedId === obj.id) {
        ctx.strokeStyle = '#fff4';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, trackY + 0.5, W - 1, TRACK_H - 1);
      }

      _drawTrackSeparator(trackY, W, TRACK_H);
    });

    // === PLAYHEAD ===
    if (state.videoDuration > 0) {
      const px = LABEL_W + state.currentTime * pxPerSec - scrollX;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, H);
      ctx.stroke();

      // треугольник-маркер
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(px - 6, 0);
      ctx.lineTo(px + 6, 0);
      ctx.lineTo(px, 10);
      ctx.closePath();
      ctx.fill();
    }

    // вертикальный сепаратор лейблов
    ctx.strokeStyle = '#3a3a40';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LABEL_W, 0);
    ctx.lineTo(LABEL_W, H);
    ctx.stroke();

    ctx.restore();
  }

  function _drawTrackSeparator(y, W, th) {
    ctx.strokeStyle = '#3a3a4044';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + th);
    ctx.lineTo(W, y + th);
    ctx.stroke();
  }

  function _drawRuler(tw, dur) {
    // интервал меток
    let step = 1;
    if (pxPerSec < 15) step = 10;
    else if (pxPerSec < 40) step = 5;
    else if (pxPerSec < 80) step = 2;

    ctx.fillStyle = '#606068';
    ctx.font = '9px system-ui';
    ctx.textBaseline = 'top';

    for (let t = 0; t <= dur + step; t += step) {
      const px = LABEL_W + t * pxPerSec - scrollX;
      if (px < LABEL_W || px > LABEL_W + tw) continue;

      ctx.strokeStyle = '#3a3a40';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, HEADER_H);
      ctx.stroke();

      const label = _formatTime(t);
      ctx.fillText(label, px + 2, 3);
    }

    // мелкие деления
    const subStep = step / 4;
    if (subStep * pxPerSec > 4) {
      for (let t = 0; t <= dur; t += subStep) {
        if (t % step === 0) continue;
        const px = LABEL_W + t * pxPerSec - scrollX;
        if (px < LABEL_W || px > LABEL_W + tw) continue;
        ctx.strokeStyle = '#3a3a4066';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, HEADER_H - 5);
        ctx.lineTo(px, HEADER_H);
        ctx.stroke();
      }
    }
  }

  function _formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /* ---- события мыши на таймлайне ---- */
  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // клик на шкалу
    if (my < HEADER_H) {
      draggingPlayhead = true;
      _seekTo(mx);
      return;
    }

    // определить трек
    const trackIdx = Math.floor((my - HEADER_H - TRACK_H) / TRACK_H);
    if (trackIdx < 0 || trackIdx >= state.objects.length) {
      draggingPlayhead = true;
      _seekTo(mx);
      return;
    }

    const obj = state.objects[trackIdx];
    App.selectObject(obj.id);
    Layers.render();

    const x0 = LABEL_W + obj.startTime * pxPerSec - scrollX;
    const x1 = LABEL_W + obj.endTime * pxPerSec - scrollX;
    const SNAP = 6;

    let edge = 'move';
    if (Math.abs(mx - x0) < SNAP) edge = 'start';
    else if (Math.abs(mx - x1) < SNAP) edge = 'end';

    draggingTrack = {
      objId: obj.id, edge,
      startX: mx,
      origStart: obj.startTime,
      origEnd: obj.endTime,
    };
  });

  window.addEventListener('mousemove', (e) => {
    if (draggingPlayhead) {
      const rect = canvas.getBoundingClientRect();
      _seekTo(e.clientX - rect.left);
      return;
    }
    if (!draggingTrack) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const dx = (mx - draggingTrack.startX) / pxPerSec;
    const dur = state.videoDuration || 60;
    const obj = state.objects.find(o => o.id === draggingTrack.objId);
    if (!obj) return;

    if (draggingTrack.edge === 'start') {
      const ns = Math.max(0, Math.min(draggingTrack.origStart + dx, obj.endTime - 0.1));
      App.updateObject(obj.id, { startTime: ns, fadeInStart: ns, fadeOutEnd: obj.endTime });
    } else if (draggingTrack.edge === 'end') {
      const ne = Math.max(obj.startTime + 0.1, Math.min(draggingTrack.origEnd + dx, dur));
      App.updateObject(obj.id, { endTime: ne, fadeOutStart: ne * 0.9, fadeOutEnd: ne });
    } else {
      const len = draggingTrack.origEnd - draggingTrack.origStart;
      const ns = Math.max(0, Math.min(draggingTrack.origStart + dx, dur - len));
      const ne = ns + len;
      App.updateObject(obj.id, { startTime: ns, endTime: ne, fadeInStart: ns, fadeInEnd: ns, fadeOutStart: ne, fadeOutEnd: ne });
    }
    Properties.refresh();
    render();
  });

  window.addEventListener('mouseup', () => {
    draggingPlayhead = false;
    draggingTrack = null;
  });

  // скролл для горизонтального прокрута
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    scrollX = Math.max(0, scrollX + e.deltaX + e.deltaY * 0.5);
    render();
  }, { passive: false });

  function _seekTo(canvasX) {
    const t = Math.max(0, Math.min(
      (canvasX - LABEL_W + scrollX) / pxPerSec,
      state.videoDuration
    ));
    if (state.video) {
      state.video.currentTime = t;
      state.currentTime = t;
    }
    render();
  }

  // первый рендер после инициализации DOM
  requestAnimationFrame(() => {
    _resize();
  });

  return { render };
})();
