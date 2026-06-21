/* ============================================================
   BGREMOVE.JS — удаление фона через remove.bg API
   Если API-ключ не задан — фоллбэк на локальный цветовой ключ
   ============================================================ */
window.BgRemove = (function () {

  let _apiKey = localStorage.getItem('rembg_api_key') || '';
  let _pendingResolve = null;

  const modal      = document.getElementById('bgr-modal');
  const srcCanvas  = document.getElementById('bgr-source');
  const resCanvas  = document.getElementById('bgr-result');
  const apiKeyInp  = document.getElementById('bgr-api-key');
  const statusEl   = document.getElementById('bgr-status');
  const threshInp  = document.getElementById('bgr-threshold');
  const threshVal  = document.getElementById('bgr-threshold-val');
  const methodSel  = document.getElementById('bgr-method');

  if (apiKeyInp) apiKeyInp.value = _apiKey;

  /* ─── открыть модал ─── */
  function open(obj) {
    return new Promise((resolve) => {
      _pendingResolve = resolve;

      const img = new Image();
      img.onload = () => {
        const MAX = 600;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        srcCanvas.width  = w; srcCanvas.height  = h;
        resCanvas.width  = w; resCanvas.height  = h;
        srcCanvas._origURL = obj.imageURL;

        srcCanvas.getContext('2d').drawImage(img, 0, 0, w, h);

        // сбросить результат
        const rctx = resCanvas.getContext('2d');
        rctx.clearRect(0, 0, w, h);
        _drawCheckerboard(rctx, w, h);

        _setStatus('');
      };
      img.src = obj.imageURL;
      modal.classList.add('open');
    });
  }

  /* ─── удалить фон через remove.bg ─── */
  async function _removeViaRemoveBg(imageURL) {
    _setStatus('⏳ Отправка на remove.bg…');

    // Конвертируем dataURL → Blob
    const res  = await fetch(imageURL);
    const blob = await res.blob();

    const formData = new FormData();
    formData.append('image_file', blob, 'image.png');
    formData.append('size', 'auto');

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': _apiKey },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.errors?.[0]?.title || `HTTP ${response.status}`);
    }

    const resultBlob = await response.blob();
    return new Promise((res) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.readAsDataURL(resultBlob);
    });
  }

  /* ─── локальное удаление фона (fallback) ─── */
  function _removeLocal(ctx, w, h) {
    const method    = methodSel ? methodSel.value : 'bright';
    const threshold = threshInp ? parseInt(threshInp.value) : 30;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data      = imageData.data;

    // получаем ключевой цвет из углов
    const corners = [[0,0],[w-1,0],[0,h-1],[w-1,h-1]];
    let kr=0,kg=0,kb=0;
    corners.forEach(([x,y]) => {
      const i=(y*w+x)*4;
      kr+=data[i]; kg+=data[i+1]; kb+=data[i+2];
    });
    kr=Math.round(kr/4); kg=Math.round(kg/4); kb=Math.round(kb/4);

    for (let i = 0; i < data.length; i += 4) {
      const r=data[i], g=data[i+1], b=data[i+2];
      let remove=false;
      const lum = 0.299*r + 0.587*g + 0.114*b;

      if (method === 'color') {
        remove = (Math.abs(r-kr)+Math.abs(g-kg)+Math.abs(b-kb))/3 < threshold;
      } else if (method === 'bright') {
        remove = lum > (255 - threshold*2);
      } else if (method === 'dark') {
        remove = lum < threshold*2;
      }
      if (remove) data[i+3] = 0;
    }
    _featherAlpha(data, w, h);
    ctx.putImageData(imageData, 0, 0);
  }

  /* ─── мягкий feather краёв ─── */
  function _featherAlpha(data, w, h) {
    const alpha = new Uint8Array(w*h);
    for (let i=0;i<w*h;i++) alpha[i]=data[i*4+3];
    for (let y=1;y<h-1;y++) for (let x=1;x<w-1;x++) {
      const idx=y*w+x;
      if (alpha[idx]===255) {
        const nb=[alpha[(y-1)*w+x],alpha[(y+1)*w+x],alpha[y*w+x-1],alpha[y*w+x+1]];
        if (nb.some(a=>a===0)) data[idx*4+3]=180;
      }
    }
  }

  /* ─── нарисовать шахматный фон в canvas ─── */
  function _drawCheckerboard(ctx, w, h) {
    const T=16;
    for (let ty=0;ty<h;ty+=T) for (let tx=0;tx<w;tx+=T) {
      ctx.fillStyle=((Math.floor(tx/T)+Math.floor(ty/T))%2===0)?'#555':'#333';
      ctx.fillRect(tx,ty,T,T);
    }
  }

  /* ─── установить статус ─── */
  function _setStatus(msg, isErr=false) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.color = isErr ? '#f05b5b' : '#a0a0aa';
  }

  /* ─── показать результат в resCanvas ─── */
  function _showResult(dataURL) {
    const img=new Image();
    img.onload=()=>{
      const rctx=resCanvas.getContext('2d');
      rctx.clearRect(0,0,resCanvas.width,resCanvas.height);
      _drawCheckerboard(rctx,resCanvas.width,resCanvas.height);
      // рисуем результат поверх шахматки
      rctx.drawImage(img,0,0,resCanvas.width,resCanvas.height);
      resCanvas._resultDataURL = dataURL; // сохраняем чистый PNG
    };
    img.src=dataURL;
  }

  /* ─── кнопка «Авто (remove.bg)» ─── */
  document.getElementById('bgr-auto-btn')?.addEventListener('click', async () => {
    const key = apiKeyInp ? apiKeyInp.value.trim() : '';
    if (!key) {
      _setStatus('⚠ Введите API-ключ remove.bg', true);
      return;
    }
    _apiKey = key;
    localStorage.setItem('rembg_api_key', key);

    try {
      const origURL = srcCanvas._origURL;
      if (!origURL) return;
      const resultURL = await _removeViaRemoveBg(origURL);
      _showResult(resultURL);
      _setStatus('✔ Фон удалён через remove.bg');
    } catch(e) {
      _setStatus('✖ Ошибка remove.bg: ' + e.message, true);
    }
  });

  /* ─── кнопка «Предпросмотр» (локальный метод) ─── */
  document.getElementById('bgr-preview-btn')?.addEventListener('click', () => {
    const w=srcCanvas.width, h=srcCanvas.height;
    const tmp=document.createElement('canvas');
    tmp.width=w; tmp.height=h;
    const tctx=tmp.getContext('2d');
    tctx.drawImage(srcCanvas,0,0);
    _removeLocal(tctx,w,h);

    const dataURL = tmp.toDataURL('image/png');
    _showResult(dataURL);
    _setStatus('Предпросмотр (локальный метод)');
  });

  /* ─── клик на источник — выбор цвета ─── */
  srcCanvas?.addEventListener('click', (e)=>{
    const rect=srcCanvas.getBoundingClientRect();
    const sx=(e.clientX-rect.left)*srcCanvas.width/rect.width;
    const sy=(e.clientY-rect.top)*srcCanvas.height/rect.height;
    const px=srcCanvas.getContext('2d').getImageData(Math.floor(sx),Math.floor(sy),1,1).data;
    if (methodSel) methodSel.value='color';
    // сохраняем выбранный цвет в data-атрибут для локального метода
    srcCanvas.dataset.kr=px[0]; srcCanvas.dataset.kg=px[1]; srcCanvas.dataset.kb=px[2];
    _setStatus(`Цвет выбран: rgb(${px[0]},${px[1]},${px[2]})`);
  });

  threshInp?.addEventListener('input', ()=>{
    if(threshVal) threshVal.textContent=threshInp.value;
  });

  /* ─── Применить ─── */
  document.getElementById('bgr-apply-btn')?.addEventListener('click', ()=>{
    if (!_pendingResolve) return;
    const dataURL = resCanvas._resultDataURL;
    if (!dataURL) {
      _setStatus('⚠ Сначала выполните удаление фона', true);
      return;
    }
    _pendingResolve(dataURL);
    _pendingResolve = null;
    modal.classList.remove('open');
  });

  /* ─── Отмена ─── */
  document.getElementById('bgr-cancel-btn')?.addEventListener('click', ()=>{
    if (_pendingResolve) _pendingResolve(null);
    _pendingResolve=null;
    modal.classList.remove('open');
  });

  /* ─── Авто без UI (при загрузке изображения) ─── */
  async function removeAuto(imageURL) {
    if (_apiKey) {
      try { return await _removeViaRemoveBg(imageURL); } catch {}
    }
    // fallback: вернуть оригинал
    return imageURL;
  }

  return { open, removeAuto };
})();
