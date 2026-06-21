/* ============================================================
   EXPORT.JS  —  MP4 (MediaRecorder/VP8) + GIF (gif.js)
   + выбор диапазона: весь таймлайн или кастомный отрезок

   Почему не ffmpeg.wasm:
   ffmpeg.wasm@0.11 требует SharedArrayBuffer, который браузеры
   блокируют без заголовков COOP/COEP (недоступны при file://).
   Решение: рендерим кадры на offscreen canvas, скармливаем
   captureStream() → MediaRecorder → WebM/MP4 (зависит от браузера).
   Chrome пишет WebM(VP8/VP9), Safari — MP4(H.264). Файл скачивается
   с расширением .mp4 — большинство плееров открывают его нормально.
   ============================================================ */
window.Export = (function () {

  /* ── DOM ── */
  const modal     = document.getElementById('export-modal');
  const pbar      = document.getElementById('export-pbar');
  const statusEl  = document.getElementById('export-status');
  const progressW = document.getElementById('export-progress');

  /* ── Состояние ── */
  let _aborted = false;

  /* ══════════════════════════════════════════════
     ОТКРЫТИЕ МОДАЛКИ
  ══════════════════════════════════════════════ */
  document.getElementById('export-btn').addEventListener('click', () => {
    if (!App.state.videoLoaded) { alert('Сначала загрузите видео.'); return; }
    _syncRangeUI();
    progressW.style.display = 'none';
    pbar.value = 0;
    statusEl.textContent = '';
    _aborted = false;
    modal.classList.add('open');
  });

  function _syncRangeUI() {
    const dur = App.state.videoDuration || 0;
    const s = document.getElementById('exp-range-start');
    const e = document.getElementById('exp-range-end');
    s.value = '0'; s.max = dur.toFixed(2);
    e.value = dur.toFixed(2); e.max = dur.toFixed(2);
    _onRangeModeChange();
  }

  function _onRangeModeChange() {
    const mode = document.querySelector('input[name="exp-range"]:checked').value;
    document.getElementById('exp-custom-range').style.display =
      mode === 'custom' ? 'flex' : 'none';
  }
  document.querySelectorAll('input[name="exp-range"]').forEach(r =>
    r.addEventListener('change', _onRangeModeChange)
  );

  /* ══════════════════════════════════════════════
     ОТМЕНА
  ══════════════════════════════════════════════ */
  document.getElementById('exp-cancel-btn').addEventListener('click', () => {
    _aborted = true;
    modal.classList.remove('open');
  });

  /* ══════════════════════════════════════════════
     СТАРТ
  ══════════════════════════════════════════════ */
  document.getElementById('exp-start-btn').addEventListener('click', async () => {
    _aborted = false;
    const startBtn = document.getElementById('exp-start-btn');
    startBtn.disabled = true;
    progressW.style.display = '';
    pbar.value = 0;
    statusEl.textContent = 'Инициализация…';

    try {
      const fmt = document.getElementById('exp-format').value;
      if (fmt === 'gif') await _exportGIF();
      else               await _exportVideo(); // MP4/WebM через MediaRecorder
    } catch (e) {
      if (!_aborted) {
        console.error('[Export]', e);
        statusEl.textContent = '❌ Ошибка: ' + e.message;
      }
    } finally {
      startBtn.disabled = false;
    }
  });

  /* ══════════════════════════════════════════════
     ПАРАМЕТРЫ
  ══════════════════════════════════════════════ */
  function _getParams() {
    const fps  = parseInt(document.getElementById('exp-fps').value)  || 30;
    const resH = parseInt(document.getElementById('exp-res').value)  || 1080;
    const dur  = App.state.videoDuration || 0;
    const mode = document.querySelector('input[name="exp-range"]:checked').value;

    let startT = 0, endT = dur;
    if (mode === 'custom') {
      startT = Math.max(0,   parseFloat(document.getElementById('exp-range-start').value) || 0);
      endT   = Math.min(dur, parseFloat(document.getElementById('exp-range-end').value)   || dur);
      if (endT <= startT) endT = startT + 0.1;
    }

    const exportW = Math.round(resH * (App.state.videoWidth / App.state.videoHeight));
    return { fps, resH, exportW, exportH: resH, startT, endT };
  }

  /* ══════════════════════════════════════════════
     ПОКАДРОВЫЙ РЕНДЕР → offscreen canvas
     Рисуем кадры на отдельный 2D canvas (не Three.js),
     потому что Three.js canvas мог уже потерять контекст.
     preserveDrawingBuffer=true в scene.js позволяет читать пиксели.
  ══════════════════════════════════════════════ */
  async function _renderFramesToCanvas(params, offCvs, onProgress) {
    const { fps, exportW, exportH, startT, endT } = params;
    const { state } = App;
    const video = state.video;
    const offCtx = offCvs.getContext('2d');

    /* Пауза */
    video.pause();
    state.playing = false;
    const playBtn = document.getElementById('play-btn');
    if (playBtn) playBtn.textContent = '▶';

    /* Запоминаем исходный размер Three.js рендерера */
    const origW = state.renderer.domElement.width;
    const origH = state.renderer.domElement.height;
    state.renderer.setSize(exportW, exportH);

    /* Перемотка на startT */
    state.currentTime = startT;
    await _seekVideo(video, startT);
    state.objects.forEach(obj => Object3D.animateTick(obj, 0));
    if (state.videoTexture) state.videoTexture.needsUpdate = true;
    state.renderer.render(state.scene, state.camera);

    const frameCount = Math.ceil((endT - startT) * fps);
    const frameDt    = 1 / fps;

    for (let f = 0; f < frameCount; f++) {
      if (_aborted) break;

      const t = startT + f * frameDt;
      state.currentTime = t;
      await _seekVideo(video, t);

      state.objects.forEach(obj => Object3D.animateTick(obj, frameDt));
      if (state.videoTexture) state.videoTexture.needsUpdate = true;
      state.renderer.render(state.scene, state.camera);

      /* Копируем пиксели из Three.js canvas на offscreen */
      offCtx.drawImage(state.renderer.domElement, 0, 0, exportW, exportH);

      onProgress(f + 1, frameCount);
      if (f % 10 === 0) await _sleep(0);
    }

    state.renderer.setSize(origW, origH);
    return frameCount;
  }

  /* ══════════════════════════════════════════════
     ЭКСПОРТ ВИДЕО (MP4/WebM через MediaRecorder)
  ══════════════════════════════════════════════ */
  async function _exportVideo() {
    const params = _getParams();
    const { fps, exportW, exportH, startT, endT } = params;
    const duration = (endT - startT).toFixed(1);

    /* Offscreen canvas — он будет источником для captureStream */
    const offCvs = document.createElement('canvas');
    offCvs.width  = exportW;
    offCvs.height = exportH;

    /* Выбираем лучший поддерживаемый кодек */
    const candidates = [
      'video/mp4;codecs=avc1',          // Safari → настоящий MP4
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    let mimeType = candidates.find(m => MediaRecorder.isTypeSupported(m)) || '';
    if (!mimeType) throw new Error('MediaRecorder не поддерживается в этом браузере');

    const isMP4 = mimeType.startsWith('video/mp4');
    const ext   = isMP4 ? 'mp4' : 'mp4'; // всегда .mp4 — большинство плееров откроет

    statusEl.textContent = `Кодек: ${mimeType}`;

    /* Стартуем запись */
    const stream  = offCvs.captureStream(fps);
    const chunks  = [];
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 10_000_000 });
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    const donePromise = new Promise(res => { recorder.onstop = res; });
    recorder.start(100);

    /* Рендерим кадры */
    await _renderFramesToCanvas(params, offCvs, (cur, total) => {
      pbar.value = Math.round((cur / total) * 95);
      statusEl.textContent = `🎬 Рендеринг… ${cur} / ${total} кадров`;
    });

    recorder.stop();
    await donePromise;

    if (_aborted) { statusEl.textContent = 'Отменено.'; return; }

    pbar.value = 99;
    statusEl.textContent = '📦 Сохранение…';

    const blob = new Blob(chunks, { type: mimeType });
    _downloadBlob(blob, `export-${Date.now()}.${ext}`);

    pbar.value = 100;
    statusEl.textContent = `✅ Готово! Файл сохранён (${duration}с, ${(blob.size/1024/1024).toFixed(1)} МБ)`;
  }

  /* ══════════════════════════════════════════════
     ЭКСПОРТ GIF
  ══════════════════════════════════════════════ */
  async function _exportGIF() {
    const params  = _getParams();
    const { startT, endT } = params;
    const duration = (endT - startT).toFixed(1);

    /* GIF: ограничиваем размер и fps */
    const gifFPS = Math.min(params.fps, 15);
    const gifH   = Math.min(params.exportH, 480);
    const gifW   = Math.round(gifH * (App.state.videoWidth / App.state.videoHeight));
    const gifParams = { ...params, fps: gifFPS, exportW: gifW, exportH: gifH };

    statusEl.textContent = `🎬 Рендеринг кадров для GIF… (${duration}с, ${gifW}×${gifH}, ${gifFPS}fps)`;

    const offCvs = document.createElement('canvas');
    offCvs.width  = gifW;
    offCvs.height = gifH;
    const offCtx = offCvs.getContext('2d');

    /* Загружаем gif.js */
    await _loadScript(
      'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.js',
      () => window.GIF
    );

    const gif = new GIF({
      workers: 2,
      quality: 8,
      width:   gifW,
      height:  gifH,
      workerScript: 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js',
    });

    const { state } = App;
    const video = state.video;
    video.pause();
    state.playing = false;
    const playBtn = document.getElementById('play-btn');
    if (playBtn) playBtn.textContent = '▶';

    const origW = state.renderer.domElement.width;
    const origH = state.renderer.domElement.height;
    state.renderer.setSize(gifW, gifH);

    state.currentTime = gifParams.startT;
    await _seekVideo(video, gifParams.startT);
    state.objects.forEach(obj => Object3D.animateTick(obj, 0));
    if (state.videoTexture) state.videoTexture.needsUpdate = true;
    state.renderer.render(state.scene, state.camera);

    const frameCount = Math.ceil((gifParams.endT - gifParams.startT) * gifFPS);
    const frameDt    = 1 / gifFPS;
    const delay      = Math.round(1000 / gifFPS);

    for (let f = 0; f < frameCount; f++) {
      if (_aborted) break;

      const t = gifParams.startT + f * frameDt;
      state.currentTime = t;
      await _seekVideo(video, t);

      state.objects.forEach(obj => Object3D.animateTick(obj, frameDt));
      if (state.videoTexture) state.videoTexture.needsUpdate = true;
      state.renderer.render(state.scene, state.camera);

      offCtx.drawImage(state.renderer.domElement, 0, 0, gifW, gifH);
      gif.addFrame(offCtx, { copy: true, delay });

      pbar.value = Math.round((f / frameCount) * 70);
      statusEl.textContent = `🎬 Рендеринг… ${f + 1} / ${frameCount} кадров`;
      if (f % 10 === 0) await _sleep(0);
    }

    state.renderer.setSize(origW, origH);

    if (_aborted) { statusEl.textContent = 'Отменено.'; return; }

    statusEl.textContent = '🖼 Кодирование GIF…';
    pbar.value = 72;

    await new Promise((res, rej) => {
      gif.on('finished', blob => {
        _downloadBlob(blob, `export-${Date.now()}.gif`);
        pbar.value = 100;
        statusEl.textContent = `✅ GIF сохранён (${duration}с, ${(blob.size/1024/1024).toFixed(1)} МБ)`;
        res();
      });
      gif.on('progress', p => {
        pbar.value = 72 + Math.round(p * 28);
        statusEl.textContent = `🔧 Кодирование GIF… ${Math.round(p * 100)}%`;
      });
      gif.on('abort', rej);
      gif.render();
    });
  }

  /* ══════════════════════════════════════════════
     УТИЛИТЫ
  ══════════════════════════════════════════════ */
  function _seekVideo(video, t) {
    return new Promise(resolve => {
      if (Math.abs(video.currentTime - t) < 0.008) { resolve(); return; }
      const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
      video.addEventListener('seeked', onSeeked);
      video.currentTime = t;
      setTimeout(resolve, 600);
    });
  }

  function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  function _loadScript(src, checkFn) {
    return new Promise((res, rej) => {
      if (checkFn && checkFn()) { res(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => res();
      s.onerror = () => rej(new Error('Не удалось загрузить: ' + src));
      document.head.appendChild(s);
    });
  }

  return {};
})();
