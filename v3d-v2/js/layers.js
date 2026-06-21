/* ============================================================
   LAYERS.JS  —  левая панель: список слоёв
   ============================================================ */
window.Layers = (function () {
  const list = document.getElementById('layers-list');

  App.on('objectsChanged', render);
  App.on('selectionChanged', render);
  App.on('objectUpdated', render);

  function render() {
    const { state } = App;
    list.innerHTML = '';

    if (state.objects.length === 0) {
      list.innerHTML = '<div style="padding:8px;font-size:10px;color:var(--text-2);text-align:center">Нет объектов.<br>Добавьте изображение.</div>';
      return;
    }

    // рендерим в обратном порядке (верхние слои вверху)
    [...state.objects].reverse().forEach((obj) => {
      const div = document.createElement('div');
      div.className = 'layer-item' + (obj.id === state.selectedId ? ' selected' : '');
      div.dataset.id = obj.id;

      const thumb = document.createElement('div');
      thumb.className = 'layer-thumb';

      // миниатюра: если есть изображение
      if (obj.imageURL) {
        const img = document.createElement('img');
        img.src = (obj.useBgRemove && obj.processedURL) ? obj.processedURL : obj.imageURL;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover';
        thumb.appendChild(img);
      } else {
        thumb.textContent = '🖼';
      }

      const info = document.createElement('div');
      info.className = 'layer-info';

      const nameEl = document.createElement('div');
      nameEl.className = 'layer-name';
      nameEl.textContent = obj.name;

      const timeEl = document.createElement('div');
      timeEl.className = 'layer-time';
      timeEl.textContent = `${obj.startTime.toFixed(1)}с – ${obj.endTime.toFixed(1)}с`;

      info.appendChild(nameEl);
      info.appendChild(timeEl);

      const actions = document.createElement('div');
      actions.className = 'layer-actions';

      // видимость
      const visBtn = document.createElement('button');
      visBtn.className = 'layer-btn' + (obj.visible ? ' active' : '');
      visBtn.title = obj.visible ? 'Скрыть' : 'Показать';
      visBtn.textContent = obj.visible ? '👁' : '🚫';
      visBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        App.updateObject(obj.id, { visible: !obj.visible });
        Object3D.updateVisibility(obj);
      });

      // блокировка
      const lockBtn = document.createElement('button');
      lockBtn.className = 'layer-btn' + (obj.locked ? ' active' : '');
      lockBtn.title = obj.locked ? 'Разблокировать' : 'Заблокировать';
      lockBtn.textContent = obj.locked ? '🔒' : '🔓';
      lockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        App.updateObject(obj.id, { locked: !obj.locked });
      });

      // удаление
      const delBtn = document.createElement('button');
      delBtn.className = 'layer-btn';
      delBtn.title = 'Удалить';
      delBtn.textContent = '✕';
      delBtn.style.color = 'var(--red)';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Удалить «${obj.name}»?`)) App.removeObject(obj.id);
      });

      actions.appendChild(visBtn);
      actions.appendChild(lockBtn);
      actions.appendChild(delBtn);

      div.appendChild(thumb);
      div.appendChild(info);
      div.appendChild(actions);

      // клик по слою — выбор
      div.addEventListener('click', () => {
        App.selectObject(obj.id);
        Properties.refresh();
      });

      list.appendChild(div);
    });
  }

  return { render };
})();
