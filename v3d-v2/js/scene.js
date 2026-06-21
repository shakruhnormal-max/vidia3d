/* ============================================================
   SCENE.JS  —  Three.js рендер-луп
   Видео рендерится как фоновый plane, объекты поверх
   ============================================================ */
window.Scene = (function () {
  const { state } = App;

  let renderer, scene, camera, clock;
  let videoMesh, videoTex;
  let animFrameId = null;
  let dragging = null; // { obj, startX, startY, objX, objY }

  const canvas = document.getElementById('main-canvas');

  /* ---- инициализация ---- */
  function init() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setClearColor(0x0a0a0a, 1);

    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    camera.position.z = 5;

    // освещение
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(2, 4, 5);
    scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0x8899ff, 0.4);
    dir2.position.set(-3, -2, 3);
    scene.add(dir2);

    clock = new THREE.Clock();

    // сохраняем в state
    state.scene = scene;
    state.camera = camera;
    state.renderer = renderer;
    state.clock = clock;

    _bindDrag();
    _bindResize();
    _loop();
  }

  /* ---- создать/обновить видео-плоскость ---- */
  function setVideoSource(videoEl) {
    if (videoMesh) { scene.remove(videoMesh); videoMesh = null; }
    if (videoTex) { videoTex.dispose(); videoTex = null; }

    videoTex = new THREE.VideoTexture(videoEl);
    videoTex.minFilter = THREE.LinearFilter;
    videoTex.magFilter = THREE.LinearFilter;
    state.videoTexture = videoTex;

    const aspect = videoEl.videoWidth / videoEl.videoHeight;
    const geo = new THREE.PlaneGeometry(2 * aspect, 2);

    // масштабируем камеру под видео
    _fitCamera(aspect);

    const mat = new THREE.MeshBasicMaterial({ map: videoTex });
    videoMesh = new THREE.Mesh(geo, mat);
    videoMesh.position.z = -1;
    scene.add(videoMesh);
  }

  /* ---- подстройка камеры под aspect ratio видео ---- */
  function _fitCamera(aspect) {
    const canvasAspect = canvas.clientWidth / canvas.clientHeight;
    if (aspect > canvasAspect) {
      // видео шире — ограничиваем по ширине
      camera.left = -aspect;
      camera.right = aspect;
      camera.top = aspect / canvasAspect;
      camera.bottom = -aspect / canvasAspect;
    } else {
      camera.left = -canvasAspect;
      camera.right = canvasAspect;
      camera.top = 1;
      camera.bottom = -1;
    }
    camera.updateProjectionMatrix();
  }

  /* ---- рендер-луп ---- */
  function _loop() {
    animFrameId = requestAnimationFrame(_loop);
    const dt = clock.getDelta();

    // обновить видео-текстуру
    if (videoTex) videoTex.needsUpdate = true;

    // синхронизировать время
    if (state.video && !state.video.paused) {
      state.currentTime = state.video.currentTime;
      App.emit('timeUpdate', state.currentTime);
    }

    // анимировать объекты
    state.objects.forEach(obj => {
      Object3D.animateTick(obj, dt);
    });

    renderer.render(scene, camera);
  }

  /* ---- drag & drop объектов по сцене ---- */
  function _bindDrag() {
    canvas.addEventListener('mousedown', (e) => {
      const obj = App.getSelected();
      if (!obj || obj.locked) return;
      dragging = {
        obj,
        startX: e.clientX,
        startY: e.clientY,
        origX: obj.x,
        origY: obj.y,
      };
      canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = state.videoWidth / rect.width;
      const scaleY = state.videoHeight / rect.height;
      const dx = (e.clientX - dragging.startX) * scaleX;
      const dy = (e.clientY - dragging.startY) * scaleY;
      const newX = dragging.origX + dx;
      const newY = dragging.origY + dy;
      App.updateObject(dragging.obj.id, { x: newX, y: newY });
      Object3D.updateTransform(dragging.obj);
      App.emit('objectTransformChanged', dragging.obj.id);
    });

    window.addEventListener('mouseup', () => {
      if (dragging) {
        dragging = null;
        canvas.style.cursor = 'default';
        Properties.refresh();
      }
    });
  }

  /* ---- ресайз ---- */
  function _bindResize() {
    const obs = new ResizeObserver(() => _onResize());
    obs.observe(canvas.parentElement);
  }

  function _onResize() {
    const wrap = canvas.parentElement;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    renderer.setSize(w, h);

    if (state.videoLoaded) {
      _fitCamera(state.videoWidth / state.videoHeight);
    }
  }

  /* ---- утилита: захват кадра в blob для экспорта ---- */
  function captureFrame() {
    renderer.render(scene, camera);
    return canvas.toDataURL('image/jpeg', 0.92);
  }

  /* ---- утилита: получить OffscreenCanvas-копию для экспорта ---- */
  function getRendererCanvas() {
    return renderer.domElement;
  }

  return { init, setVideoSource, captureFrame, getRendererCanvas };
})();
