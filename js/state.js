/* ============================================================
   STATE.JS  —  единый источник истины
   ============================================================ */
window.App = (function () {
  let _nextId = 1;

  const state = {
    video: null,          // HTMLVideoElement
    videoDuration: 0,
    videoWidth: 1280,
    videoHeight: 720,
    videoLoaded: false,

    objects: [],          // массив ObjectDef
    selectedId: null,

    playing: false,
    currentTime: 0,

    // Three.js объекты (заполняются в scene.js)
    scene: null,
    camera: null,
    renderer: null,
    videoTexture: null,
    clock: null,
  };

  /* ---------- ObjectDef ---------- */
  function createObject(opts = {}) {
    const id = _nextId++;
    return {
      id,
      name: opts.name || `Объект ${id}`,
      visible: true,
      locked: false,

      // источник
      imageURL: opts.imageURL || null,      // data URL оригинала
      processedURL: opts.processedURL || null, // после удаления фона

      // 3D
      mode: 'A',          // 'A' | 'B'
      thickness: 20,
      useBgRemove: false,

      // трансформации
      x: 0, y: 0,
      scale: 1.0,
      rotX: 0, rotY: 0, rotZ: 0,

      // автовращение
      autoRotX: false, autoRotY: true, autoRotZ: false,
      rotSpeedX: 45, rotSpeedY: 90, rotSpeedZ: 45,
      rotDirX: 1, rotDirY: 1, rotDirZ: 1,   // 1 = по часовой, -1 = против

      // прозрачность
      opacity: 1.0,

      // время жизни
      startTime: 0,
      endTime: 10,

      // fade in
      fadeInStart: 0,
      fadeInEnd: 0,

      // fade out
      fadeOutStart: 10,
      fadeOutEnd: 10,

      // Three.js mesh (не сериализуется)
      _mesh: null,
      _texture: null,
    };
  }

  /* ---------- публичный API ---------- */
  return {
    state,
    createObject,

    addObject(obj) {
      state.objects.push(obj);
      this.emit('objectsChanged');
    },

    removeObject(id) {
      const idx = state.objects.findIndex(o => o.id === id);
      if (idx === -1) return;
      const obj = state.objects[idx];
      if (obj._mesh && state.scene) state.scene.remove(obj._mesh);
      state.objects.splice(idx, 1);
      if (state.selectedId === id) state.selectedId = null;
      this.emit('objectsChanged');
      this.emit('selectionChanged');
    },

    selectObject(id) {
      state.selectedId = id;
      this.emit('selectionChanged');
    },

    getSelected() {
      return state.objects.find(o => o.id === state.selectedId) || null;
    },

    updateObject(id, patch) {
      const obj = state.objects.find(o => o.id === id);
      if (!obj) return;
      Object.assign(obj, patch);
      this.emit('objectUpdated', id);
    },

    /* ---------- события ---------- */
    _listeners: {},
    on(event, fn) {
      (this._listeners[event] = this._listeners[event] || []).push(fn);
    },
    off(event, fn) {
      if (!this._listeners[event]) return;
      this._listeners[event] = this._listeners[event].filter(f => f !== fn);
    },
    emit(event, data) {
      (this._listeners[event] || []).forEach(fn => fn(data));
    },

    /* ---------- сериализация ---------- */
    toJSON() {
      const skip = ['_mesh', '_texture'];
      return {
        version: 1,
        videoDuration: state.videoDuration,
        videoWidth: state.videoWidth,
        videoHeight: state.videoHeight,
        objects: state.objects.map(o => {
          const plain = {};
          for (const k in o) if (!skip.includes(k)) plain[k] = o[k];
          return plain;
        }),
      };
    },

    fromJSON(data) {
      if (!data || data.version !== 1) return false;
      state.objects.forEach(o => {
        if (o._mesh && state.scene) state.scene.remove(o._mesh);
      });
      state.objects = [];
      state.selectedId = null;
      if (Array.isArray(data.objects)) {
        data.objects.forEach(plain => {
          const obj = this.createObject(plain);
          Object.assign(obj, plain);
          obj._mesh = null; obj._texture = null;
          state.objects.push(obj);
        });
        _nextId = Math.max(...state.objects.map(o => o.id), 0) + 1;
      }
      this.emit('objectsChanged');
      this.emit('selectionChanged');
      return true;
    },
  };
})();
