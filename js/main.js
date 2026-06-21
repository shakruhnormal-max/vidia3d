/* ============================================================
   MAIN.JS  —  точка входа, связывает все модули
   ============================================================ */
(function () {
  const { state } = App;

  /* ========== ИНИЦИАЛИЗАЦИЯ ========== */
  Scene.init();

  /* ========== ВИДЕО ЗАГРУЗКА ========== */
  const videoEl = document.createElement('video');
  videoEl.crossOrigin = 'anonymous';
  videoEl.playsInline = true;
  videoEl.preload = 'auto';
  state.video = videoEl;

  function loadVideoFile(file) {
    const url = URL.createObjectURL(file);
    videoEl.src = url;
    videoEl.load();

    videoEl.addEventListener('loadedmetadata', () => {
      state.videoDuration = videoEl.duration;
      state.videoWidth = videoEl.videoWidth || 1280;
      state.videoHeight = videoEl.videoHeight || 720;
      state.videoLoaded = true;
      state.currentTime = 0;

      // скрыть drop-hint
      document.getElementById('drop-hint').classList.add('hidden');
      document.getElementById('video-drop-zone').style.display = 'none';

      // обновить seek bar
      document.getElementById('seek-bar').max = 1000;
      document.getElementById('seek-bar').value = 0;

      // передать видео в сцену
      Scene.setVideoSource(videoEl);

      // обновить таймлайн
      Timeline.render();

      _updateTimeDisplay();
    }, { once: true });

    videoEl.addEventListener('error', (e) => {
      console.error('Video error:', e, videoEl.error);
      alert('Не удалось загрузить видеофайл. Убедитесь, что формат поддерживается (MP4/WebM/MOV).');
    });
  }

  /* ========== ИЗОБРАЖЕНИЕ → ОБЪЕКТ ========== */
  async function loadImageFile(file) {
    const url = await _fileToDataURL(file);

    const obj = App.createObject({
      name: file.name.replace(/\.[^.]+$/, ''),
      imageURL: url,
      startTime: 0,
      endTime: state.videoDuration || 10,
      fadeInStart: 0,
      fadeInEnd: 0,
      fadeOutStart: state.videoDuration || 10,
      fadeOutEnd: state.videoDuration || 10,
      x: state.videoWidth / 2,
      y: state.videoHeight / 2,
    });

    App.addObject(obj);
    App.selectObject(obj.id);

    await Object3D.buildMesh(obj);
    Object3D.updateTransform(obj);

    Layers.render();
    Properties.refresh();
    Timeline.render();
  }

  function _fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* ========== ПЛЕЕР ========== */
  const playBtn = document.getElementById('play-btn');
  const seekBar = document.getElementById('seek-bar');

  playBtn.addEventListener('click', () => {
    if (!state.videoLoaded) return;
    if (videoEl.paused) {
      videoEl.play();
      state.playing = true;
      playBtn.textContent = '⏸';
    } else {
      videoEl.pause();
      state.playing = false;
      playBtn.textContent = '▶';
    }
  });

  seekBar.addEventListener('input', () => {
    if (!state.videoLoaded) return;
    const t = (parseInt(seekBar.value) / 1000) * state.videoDuration;
    videoEl.currentTime = t;
    state.currentTime = t;
    _updateTimeDisplay();
    Timeline.render();
  });

  videoEl.addEventListener('timeupdate', () => {
    state.currentTime = videoEl.currentTime;
    _updateTimeDisplay();
    if (state.videoDuration > 0) {
      seekBar.value = Math.round((videoEl.currentTime / state.videoDuration) * 1000);
    }
  });

  videoEl.addEventListener('ended', () => {
    state.playing = false;
    playBtn.textContent = '▶';
  });

  App.on('timeUpdate', () => {
    _updateTimeDisplay();
    if (state.videoDuration > 0) {
      seekBar.value = Math.round((state.currentTime / state.videoDuration) * 1000);
    }
  });

  function _updateTimeDisplay() {
    const cur = _fmtTime(state.currentTime);
    const dur = _fmtTime(state.videoDuration);
    document.getElementById('time-display').textContent = `${cur} / ${dur}`;
  }

  function _fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${m}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
  }

  /* ========== КНОПКИ ТОПБАРА ========== */
  document.getElementById('load-video-btn').addEventListener('click', () => {
    document.getElementById('file-video').click();
  });
  document.getElementById('file-video').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) loadVideoFile(f);
    e.target.value = '';
  });

  document.getElementById('load-image-btn').addEventListener('click', () => {
    document.getElementById('file-image').click();
  });
  document.getElementById('add-obj-btn').addEventListener('click', () => {
    document.getElementById('file-image').click();
  });
  document.getElementById('file-image').addEventListener('change', async e => {
    for (const f of e.target.files) await loadImageFile(f);
    e.target.value = '';
  });

  /* ========== СОХРАНЕНИЕ / ЗАГРУЗКА ПРОЕКТА ========== */
  document.getElementById('save-project-btn').addEventListener('click', () => {
    const json = JSON.stringify(App.toJSON(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  });

  document.getElementById('load-project-btn').addEventListener('click', () => {
    document.getElementById('file-project').click();
  });
  document.getElementById('file-project').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      const data = JSON.parse(text);
      App.fromJSON(data);
      // пересобрать меши
      for (const obj of App.state.objects) {
        if (obj.imageURL) {
          await Object3D.buildMesh(obj);
          Object3D.updateTransform(obj);
        }
      }
      Layers.render();
      Properties.refresh();
      Timeline.render();
    } catch (err) {
      alert('Ошибка загрузки проекта: ' + err.message);
    }
    e.target.value = '';
  });

  /* ========== DRAG & DROP НА ХОЛСТ ========== */
  const canvasWrap = document.getElementById('canvas-wrap');

  canvasWrap.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  canvasWrap.addEventListener('drop', async e => {
    e.preventDefault();
    for (const file of e.dataTransfer.files) {
      if (file.type.startsWith('video/')) {
        loadVideoFile(file);
      } else if (file.type.startsWith('image/')) {
        await loadImageFile(file);
      }
    }
  });

  /* ========== DRAG & DROP на видео-дроп зону ========== */
  const dropZone = document.getElementById('video-drop-zone');

  dropZone.addEventListener('click', () => document.getElementById('file-video').click());

  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('video/')) loadVideoFile(f);
  });

  /* ========== ГОРЯЧИЕ КЛАВИШИ ========== */
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.code === 'Space') {
      e.preventDefault();
      playBtn.click();
    }
    if (e.code === 'Delete' || e.code === 'Backspace') {
      const obj = App.getSelected();
      if (obj && confirm(`Удалить «${obj.name}»?`)) App.removeObject(obj.id);
    }
    // стрелки для позиции выбранного объекта
    const sel = App.getSelected();
    if (sel && !sel.locked) {
      const step = e.shiftKey ? 10 : 1;
      if (e.code === 'ArrowLeft')  { App.updateObject(sel.id, { x: sel.x - step }); Object3D.updateTransform(sel); Properties.refresh(); }
      if (e.code === 'ArrowRight') { App.updateObject(sel.id, { x: sel.x + step }); Object3D.updateTransform(sel); Properties.refresh(); }
      if (e.code === 'ArrowUp')    { App.updateObject(sel.id, { y: sel.y - step }); Object3D.updateTransform(sel); Properties.refresh(); }
      if (e.code === 'ArrowDown')  { App.updateObject(sel.id, { y: sel.y + step }); Object3D.updateTransform(sel); Properties.refresh(); }
    }
  });

  console.log('[3D Overlay Editor] Инициализация завершена ✓');
})();
