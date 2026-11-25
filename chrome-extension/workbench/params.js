/**
 * params.js
 * 参数表单渲染、类型转换、数组编辑器与预设（Presets）管理模块
 */
(function (global) {
  'use strict';

  const PRESET_STORE_KEY = 'global_api_presets';

  let commonParamsPool = {};
  let activeParamTargetRow = null;
  let activeArrayTargetRow = null;

  // 尝试解析字符串为 JSON（支持数组/对象，兼容中英文智能引号）
  function tryParseJsonValue(rawStr) {
    if (typeof rawStr !== 'string') return { success: false, value: rawStr };
    const trimmed = rawStr.trim();
    if (!trimmed) return { success: false, value: rawStr };

    const looksLikeJson =
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('{') && trimmed.endsWith('}'));
    if (!looksLikeJson) return { success: false, value: rawStr };

    try {
      return { success: true, value: JSON.parse(trimmed) };
    } catch (_) {
      const normalized = trimmed
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, '"');
      try {
        return { success: true, value: JSON.parse(normalized) };
      } catch (__) {
        return { success: false, value: rawStr };
      }
    }
  }

  // 严格转为数组：若已是数组直接用；若能解析为数组则用解析结果；否则不乱解析，整值作为第 1 项
  function coerceToArrayStrict(rawVal) {
    if (Array.isArray(rawVal)) {
      return rawVal;
    }
    if (rawVal === undefined || rawVal === null || rawVal === '') {
      return [];
    }
    if (typeof rawVal === 'string') {
      const parsed = tryParseJsonValue(rawVal);
      if (parsed.success && Array.isArray(parsed.value)) {
        return parsed.value;
      }
      return [rawVal];
    }
    return [String(rawVal)];
  }

  // 将单个数组元素转为输入框展示字符串
  function formatSingleItemForInput(item) {
    if (item === undefined || item === null) return '';
    if (typeof item === 'object') return JSON.stringify(item);
    return String(item);
  }

  // 多值转单值（string 模式）：仅 1 个元素时取第 1 个值；多个或空数组时保留完整标准数组 JSON
  function convertToSingleValue(rawVal) {
    if (Array.isArray(rawVal)) {
      return rawVal.length === 1 ? formatSingleItemForInput(rawVal[0]) : JSON.stringify(rawVal);
    }
    if (rawVal === undefined || rawVal === null) {
      return '';
    }
    if (typeof rawVal === 'string') {
      const parsedRes = tryParseJsonValue(rawVal);
      if (parsedRes.success && Array.isArray(parsedRes.value)) {
        return parsedRes.value.length === 1
          ? formatSingleItemForInput(parsedRes.value[0])
          : JSON.stringify(parsedRes.value);
      }
      return rawVal;
    }
    return String(rawVal);
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str);
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function notifyCodeChange() {
    if (typeof global.refreshCodeOutput === 'function') {
      global.refreshCodeOutput();
    }
  }

  // 初始化通用参数池
  async function initCommonParams() {
    const cache = await chrome.storage.session.get(['cached_params_common']);
    if (cache.cached_params_common && Object.keys(cache.cached_params_common).length > 0) {
      commonParamsPool = cache.cached_params_common;
      return commonParamsPool;
    }
    try {
      commonParamsPool = await global.Seo360Api.fetchRemoteJson(global.Seo360Api.CONFIG_URLS.COMMON_PARAMS);
      await chrome.storage.session.set({ cached_params_common: commonParamsPool });
    } catch (e) {
      console.error('Failed to load params.json:', e);
    }
    return commonParamsPool;
  }

  // 查询单个参数定义
  async function fetchParamDefinition(key, currentParamsDef = null) {
    if (!key) return null;
    const cleanKey = key.trim();
    if (commonParamsPool && commonParamsPool[cleanKey]) {
      return commonParamsPool[cleanKey];
    }
    if (currentParamsDef && currentParamsDef.params && currentParamsDef.params[cleanKey]) {
      return currentParamsDef.params[cleanKey];
    }

    if (Object.keys(commonParamsPool).length === 0) {
      await initCommonParams();
      if (commonParamsPool && commonParamsPool[cleanKey]) {
        return commonParamsPool[cleanKey];
      }
    }
    return null;
  }

  // 渲染官方接口默认参数表单
  function renderParamsForm(conf) {
    const container = document.getElementById('params-container');
    container.innerHTML = '';

    if (Array.isArray(conf.use_params)) {
      conf.use_params.forEach(k => {
        const def = commonParamsPool[k] || {};
        addParamRow(
          k,
          def.default !== undefined ? def.default : '',
          def.description || 'Common parameter',
          false,
          def.type || 'string'
        );
      });
    }

    if (conf.params && typeof conf.params === 'object') {
      Object.entries(conf.params).forEach(([k, v]) => {
        addParamRow(
          k,
          v.default !== undefined ? v.default : '',
          v.description || 'Endpoint parameter',
          false,
          v.type || 'string'
        );
      });
    }
  }

  // 添加收藏包专属第一项 note（名称锁定不可改，不可删除，不计入 API 请求体）
  function addPresetNoteRow(noteVal = '') {
    const container = document.getElementById('params-container');
    container.querySelector('.preset-note-row')?.remove();

    const row = document.createElement('div');
    row.className = 'params-row preset-note-row';
    row.dataset.isPresetNote = 'true';
    row.dataset.type = 'string';

    row.innerHTML = `
      <div class="col-field-box">
        <div class="field-header-row">
          <span class="preset-note-key-badge">note</span>
          <span class="preset-note-tag">Preset Meta · Locked</span>
        </div>
        <div class="field-desc-text" title="Preset note cannot be deleted or renamed; not sent to API">Preset note (cannot be deleted or renamed; excluded from API request)</div>
      </div>
      <div class="col-val-wrap">
        <input type="text" class="field-val-input preset-note-input" value="${escapeHtml(noteVal || '')}" placeholder="Enter preset note...">
      </div>
      <button type="button" class="btn-del-row is-locked" disabled title="First item note cannot be deleted">&times;</button>
    `;

    const noteInput = row.querySelector('.preset-note-input');
    noteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const nextInput = container.querySelector('.params-row:not(.preset-note-row) .field-val-input');
        if (nextInput && nextInput.type !== 'hidden') {
          nextInput.focus();
        }
      }
    });

    container.prepend(row);
    return row;
  }

  function getPresetNoteValue() {
    const input = document.querySelector('#params-container .preset-note-row .preset-note-input');
    return input ? input.value.trim() : '';
  }

  // 添加单行参数
  function addParamRow(key = '', val = '', descHtml = '', isCustom = true, fieldType = 'string') {
    const container = document.getElementById('params-container');
    const row = document.createElement('div');
    row.className = 'params-row';
    row.dataset.type = fieldType;

    const initialArray = fieldType === 'array' ? coerceToArrayStrict(val) : [];
    const isArrayActive = fieldType === 'array';

    const toggleCheckboxHtml = isCustom
      ? `
        <label class="array-toggle-label ${isArrayActive ? 'active' : ''}" title="Toggle between single value and multi-item list">
          <input type="checkbox" class="array-toggle-check" ${isArrayActive ? 'checked' : ''}>
          <span>List (Multi)</span>
        </label>
      `
      : '';

    row.innerHTML = `
      <div class="col-field-box">
        <div class="field-header-row">
          <input type="text" class="field-key-input" value="${escapeHtml(key)}" placeholder="param_name" ${!isCustom ? 'readonly' : ''}>
          ${toggleCheckboxHtml}
        </div>
        <div class="field-desc-text" title="Click to view full description & options">${descHtml || 'Custom parameter'}</div>
      </div>
      <div class="col-val-wrap"></div>
      <button type="button" class="btn-del-row" title="Delete">&times;</button>
    `;

    const valWrap = row.querySelector('.col-val-wrap');
    renderValueWidget(row, valWrap, fieldType, val, initialArray);
    bindDescClickEvents(row);

    // 切换 Single / List (Multi)
    const toggleCheck = row.querySelector('.array-toggle-check');
    if (toggleCheck) {
      toggleCheck.addEventListener('change', (e) => {
        const isArr = e.target.checked;
        const newType = isArr ? 'array' : 'string';
        row.dataset.type = newType;

        const labelEl = row.querySelector('.array-toggle-label');
        if (labelEl) labelEl.classList.toggle('active', isArr);

        const curVal = getRowValue(row);
        if (isArr) {
          const curArr = coerceToArrayStrict(curVal);
          renderValueWidget(row, valWrap, 'array', curVal, curArr);
        } else {
          const singleVal = convertToSingleValue(curVal);
          renderValueWidget(row, valWrap, 'string', singleVal, []);
        }

        notifyCodeChange();
      });
    }

    // 自定义参数名实时匹配说明与类型
    const keyInput = row.querySelector('.field-key-input');
    if (isCustom) {
      const handleKeyLookup = async () => {
        const currentK = keyInput.value.trim();
        const descEl = row.querySelector('.field-desc-text');

        const switchBackToSingle = () => {
          if (row.dataset.type === 'array') {
            row.dataset.type = 'string';
            if (toggleCheck) {
              toggleCheck.checked = false;
              row.querySelector('.array-toggle-label')?.classList.remove('active');
            }
            const curVal = getRowValue(row);
            const singleVal = convertToSingleValue(curVal);
            renderValueWidget(row, valWrap, 'string', singleVal, []);
          }
        };

        if (!currentK) {
          descEl.textContent = 'Custom parameter';
          switchBackToSingle();
          notifyCodeChange();
          return;
        }

        const def = await fetchParamDefinition(currentK, global.WorkbenchState?.currentParamsDef);
        if (def && def.description) {
          descEl.innerHTML = def.description;
          bindDescClickEvents(row);
        } else {
          descEl.textContent = 'Custom parameter';
        }

        if (def && def.type === 'array') {
          if (row.dataset.type !== 'array') {
            row.dataset.type = 'array';
            if (toggleCheck) {
              toggleCheck.checked = true;
              row.querySelector('.array-toggle-label')?.classList.add('active');
            }
            const curVal = getRowValue(row);
            const initArr = coerceToArrayStrict(curVal);
            renderValueWidget(row, valWrap, 'array', curVal, initArr);
          }
        } else {
          switchBackToSingle();
        }

        notifyCodeChange();
      };

      keyInput.addEventListener('input', handleKeyLookup);
      keyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleKeyLookup();
      });
    } else {
      keyInput.addEventListener('input', notifyCodeChange);
    }

    row.querySelector('.btn-del-row').onclick = () => {
      if (row.dataset.isPresetNote === 'true') {
        global.triggerToast?.('First item "note" cannot be deleted');
        return;
      }
      row.remove();
      notifyCodeChange();
    };

    container.appendChild(row);
    return row;
  }

  function renderValueWidget(row, container, type, currentVal = '', currentArray = []) {
    if (type === 'array') {
      container.innerHTML = `
        <button type="button" class="array-trigger-btn">
          <span class="array-preview-txt">${formatArrayPreview(currentArray)}</span>
          <span class="array-edit-tag">Edit List ↗</span>
        </button>
        <input type="hidden" class="field-val-input" value='${escapeHtml(JSON.stringify(currentArray))}'>
      `;

      const arrayBtn = container.querySelector('.array-trigger-btn');
      const valInput = container.querySelector('.field-val-input');
      arrayBtn.onclick = () => {
        activeArrayTargetRow = row;
        let items = [];
        try {
          const parsed = JSON.parse(valInput.value);
          items = Array.isArray(parsed) ? parsed : coerceToArrayStrict(valInput.value);
        } catch (_) {
          items = coerceToArrayStrict(valInput.value);
        }
        const keyName = row.querySelector('.field-key-input').value.trim() || 'List';
        openArrayEditorModal(keyName, items);
      };
    } else {
      let strVal = '';
      if (Array.isArray(currentVal) || (typeof currentVal === 'object' && currentVal !== null)) {
        strVal = JSON.stringify(currentVal);
      } else if (currentVal === undefined || currentVal === null) {
        strVal = '';
      } else {
        strVal = String(currentVal);
      }

      container.innerHTML = `<input type="text" class="field-val-input" value="${escapeHtml(strVal)}" placeholder="Value">`;
      const valInput = container.querySelector('.field-val-input');

      valInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const rows = Array.from(document.querySelectorAll('#params-container .params-row:not(.preset-note-row)'));
          const idx = rows.indexOf(row);
          if (idx < rows.length - 1) {
            const nextInput = rows[idx + 1].querySelector('.field-val-input');
            if (nextInput && nextInput.type !== 'hidden') nextInput.focus();
          } else {
            const newRow = addParamRow('', '', 'Custom parameter', true, 'string');
            newRow.querySelector('.field-key-input').focus();
          }
        }
      });
      valInput.addEventListener('input', notifyCodeChange);
    }
  }

  function getRowValue(row) {
    const valInput = row.querySelector('.field-val-input');
    return valInput ? valInput.value : '';
  }

  function bindDescClickEvents(row) {
    const descTextEl = row.querySelector('.field-desc-text');

    function applyCodeVal(rawCodeText) {
      const valInput = row.querySelector('.field-val-input');
      if (!valInput) return;
      const trimmed = rawCodeText.trim();

      if (row.dataset.type === 'array') {
        const currentArr = coerceToArrayStrict(valInput.value);
        const parsedRes = tryParseJsonValue(trimmed);
        if (parsedRes.success && Array.isArray(parsedRes.value)) {
          valInput.value = JSON.stringify(parsedRes.value);
          row.querySelector('.array-preview-txt').textContent = formatArrayPreview(parsedRes.value);
          return;
        }

        const cleanItem = trimmed.replace(/^["']|["']$/g, '').trim();
        if (cleanItem && !currentArr.includes(cleanItem)) {
          currentArr.push(cleanItem);
        }
        valInput.value = JSON.stringify(currentArr);
        row.querySelector('.array-preview-txt').textContent = formatArrayPreview(currentArr);
      } else {
        const parsedRes = tryParseJsonValue(trimmed);
        valInput.value = parsedRes.success ? JSON.stringify(parsedRes.value) : trimmed;
      }
    }

    descTextEl.querySelectorAll('code').forEach(cd => {
      cd.onclick = (e) => {
        e.stopPropagation();
        applyCodeVal(cd.textContent);
        notifyCodeChange();
        global.triggerToast?.(`Inserted: ${cd.textContent.trim()}`);
      };
    });

    descTextEl.onclick = () => {
      if (row.dataset.isPresetNote === 'true') return;
      activeParamTargetRow = row;
      const currentKey = row.querySelector('.field-key-input')?.value.trim() || 'Parameter';
      document.getElementById('param-detail-title').textContent = `Parameter: ${currentKey}`;

      const modalBody = document.getElementById('param-detail-body');
      modalBody.innerHTML = descTextEl.innerHTML;

      modalBody.querySelectorAll('code').forEach(modalCd => {
        modalCd.onclick = () => {
          applyCodeVal(modalCd.textContent);
          notifyCodeChange();
          global.triggerToast?.(`Applied: ${modalCd.textContent.trim()} to ${currentKey}`);
          global.closeModal?.('modal-param-detail');
        };
      });

      global.openModal?.('modal-param-detail');
    };
  }

  function formatArrayPreview(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return 'Empty list (0 items)';
    const preview = arr.slice(0, 2).map(x => `"${x}"`).join(', ');
    return `${arr.length} item(s): [${preview}${arr.length > 2 ? ', ...' : ''}]`;
  }

  // 数组弹窗编辑器
  function openArrayEditorModal(keyName, currentItems) {
    document.getElementById('array-editor-title').textContent = `Edit List: ${keyName}`;
    const container = document.getElementById('array-items-list');
    container.innerHTML = '';
    document.getElementById('array-batch-textarea').value = '';

    const items = Array.isArray(currentItems) ? currentItems : coerceToArrayStrict(currentItems);
    if (items.length > 0) {
      items.forEach(item => addArrayItemInputRow(item));
    } else {
      addArrayItemInputRow('');
    }

    global.openModal?.('modal-array-editor');
  }

  function addArrayItemInputRow(val = '') {
    const container = document.getElementById('array-items-list');
    const row = document.createElement('div');
    row.className = 'array-item-row';
    const displayVal = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val);
    row.innerHTML = `
      <input type="text" class="array-item-input" value="${escapeHtml(displayVal)}" placeholder="Enter item value...">
      <button type="button" class="btn-del-array-item" title="Delete">&times;</button>
    `;

    const input = row.querySelector('.array-item-input');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const newRow = addArrayItemInputRow('');
        newRow.querySelector('.array-item-input').focus();
      }
    });

    row.querySelector('.btn-del-array-item').onclick = () => row.remove();
    container.appendChild(row);
    return row;
  }

  // 批量换行导入（每行自动去首尾空白，过滤空行）
  function handleBatchImportLines() {
    const rawTxt = document.getElementById('array-batch-textarea').value;
    if (!rawTxt) return;

    const lines = rawTxt
      .replace(/\r/g, '')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) return;

    const existingInputs = document.querySelectorAll('#array-items-list .array-item-input');
    if (existingInputs.length === 1 && !existingInputs[0].value.trim()) {
      document.getElementById('array-items-list').innerHTML = '';
    }

    lines.forEach(item => addArrayItemInputRow(item));
    document.getElementById('array-batch-textarea').value = '';
    global.triggerToast?.(`Added ${lines.length} items`);
  }

  // 保存数组弹窗修改
  function saveArrayModalChanges() {
    if (!activeArrayTargetRow) return;
    const items = [];
    document.querySelectorAll('#array-items-list .array-item-input').forEach(input => {
      const trimmed = input.value.trim();
      if (trimmed !== '') {
        const parsed = tryParseJsonValue(trimmed);
        items.push(parsed.success ? parsed.value : trimmed);
      }
    });

    const hiddenInput = activeArrayTargetRow.querySelector('.field-val-input');
    hiddenInput.value = JSON.stringify(items);
    activeArrayTargetRow.querySelector('.array-preview-txt').textContent = formatArrayPreview(items);

    global.closeModal?.('modal-array-editor');
    notifyCodeChange();
    global.triggerToast?.(`Updated list (${items.length} items)`);
  }

  // 提取实际 API 参数键值对（排除收藏包元信息 note 行）
  function extractPayloadEntries() {
    const entries = [];
    document.querySelectorAll('#params-container .params-row:not(.preset-note-row)').forEach(row => {
      const keyInput = row.querySelector('.field-key-input');
      if (!keyInput) return;
      const k = keyInput.value.trim();
      const rawVal = row.querySelector('.field-val-input')?.value ?? '';
      const type = row.dataset.type;

      if (k) {
        let val;
        if (type === 'array') {
          val = coerceToArrayStrict(rawVal);
        } else {
          const trimmed = rawVal.trim();
          const jsonParsed = tryParseJsonValue(trimmed);
          if (jsonParsed.success) {
            val = jsonParsed.value;
          } else if (trimmed === 'true') {
            val = true;
          } else if (trimmed === 'false') {
            val = false;
          } else if (trimmed !== '' && !Number.isNaN(Number(trimmed)) && !/^0\d+/.test(trimmed)) {
            val = Number(trimmed);
          } else {
            val = trimmed;
          }
        }
        entries.push([k, val]);
      }
    });
    return entries;
  }

  // 提取标准 DataForSEO 请求体数组 [ { ... } ]
  function extractPayload() {
    const entries = extractPayloadEntries();
    const obj = {};
    entries.forEach(([k, v]) => {
      obj[k] = v;
    });
    return [obj];
  }

  // 标准化单个预设对象，确保仅在 note、api、payload 完全一致时指纹才相同
  function normalizePresetItem(item) {
    return {
      note: typeof item?.note === 'string' ? item.note : String(item?.note ?? ''),
      api: typeof item?.api === 'string' ? item.api : String(item?.api ?? ''),
      payload: Array.isArray(item?.payload) ? item.payload : []
    };
  }

  // 预设精确指纹计算（任意一点差别都会产生不同指纹）
  function getPresetFingerprint(item) {
    const normalized = normalizePresetItem(item);
    return JSON.stringify({
      note: normalized.note,
      api: normalized.api,
      payload: normalized.payload
    });
  }

  // 直接覆盖保存当前已加载的收藏包（校验 api 与 API 参数，缺失则报错不保存）
  async function overwriteLoadedPreset(apiPath) {
    const activePresetIdx = global.WorkbenchState?.activePresetIndex;
    if (typeof activePresetIdx !== 'number' || activePresetIdx < 0) {
      return false;
    }

    if (!apiPath || !apiPath.trim()) {
      global.triggerToast?.('Error: API endpoint is missing. Preset not saved.');
      document.getElementById('custom-api-input')?.focus();
      return true;
    }

    const payloadEntries = extractPayloadEntries();
    if (!payloadEntries.length) {
      global.triggerToast?.('Error: No API parameters detected. Preset not saved.');
      return true;
    }

    const list = (await chrome.storage.local.get([PRESET_STORE_KEY]))[PRESET_STORE_KEY] || [];
    if (!list[activePresetIdx]) {
      global.triggerToast?.('Error: Original preset not found. Preset not saved.');
      return true;
    }

    const noteVal = getPresetNoteValue();
    list[activePresetIdx] = {
      ...list[activePresetIdx],
      note: noteVal,
      api: apiPath.trim(),
      payload: payloadEntries
    };

    await chrome.storage.local.set({ [PRESET_STORE_KEY]: list });
    global.triggerToast?.(`Overwritten preset: ${noteVal || apiPath.trim()}`);
    return true;
  }

  // 保存当前参数为新预设（非加载收藏包状态时走原流程）
  async function saveCurrentPreset(apiPath, currentApiItem = null) {
    if (!apiPath) {
      global.triggerToast?.('Please enter an API endpoint path first!');
      global.closeModal?.('modal-save-preset');
      document.getElementById('custom-api-input')?.focus();
      return;
    }

    const payloadEntries = extractPayloadEntries();
    let note = document.getElementById('input-preset-note')?.value.trim() || '';

    if (!note) {
      if (currentApiItem) {
        note = Array.isArray(currentApiItem.desc)
          ? currentApiItem.desc.join(' ')
          : currentApiItem.desc || currentApiItem.api;
      } else {
        note = 'Custom API';
      }
    }

    const list = (await chrome.storage.local.get([PRESET_STORE_KEY]))[PRESET_STORE_KEY] || [];
    const newPreset = normalizePresetItem({ note, api: apiPath, payload: payloadEntries });
    const newFingerprint = getPresetFingerprint(newPreset);

    if (list.some(item => getPresetFingerprint(item) === newFingerprint)) {
      global.triggerToast?.('Preset already exists! Failed to save duplicate.');
      return;
    }

    list.unshift(newPreset);
    await chrome.storage.local.set({ [PRESET_STORE_KEY]: list });
    global.closeModal?.('modal-save-preset');
    global.triggerToast?.(`Preset saved for ${apiPath}!`);
  }

  // 导出全部预设
  async function exportAllPresets() {
    const list = (await chrome.storage.local.get([PRESET_STORE_KEY]))[PRESET_STORE_KEY] || [];
    if (!list.length) {
      global.triggerToast?.('No presets to export');
      return;
    }
    const timestamp = new Date().toISOString().slice(0, 10);
    global.Seo360Response?.downloadJsonFile(
      `seo360_backup_${timestamp}.json`,
      list,
      `Exported ${list.length} presets`
    );
  }

  // 导入预设文件（支持多选/单选；先合并去重，再与原列表比对，仅剔除完全相同的项，新项置顶）
  async function importPresetsFromFiles(files, apiRegistry = []) {
    if (!files || !files.length) return;
    try {
      const existingRaw = (await chrome.storage.local.get([PRESET_STORE_KEY]))[PRESET_STORE_KEY] || [];
      const existingList = existingRaw.map(normalizePresetItem);
      const rawImportedItems = [];

      for (const file of files) {
        try {
          const text = await file.text();
          let parsed = JSON.parse(text);

          if (!Array.isArray(parsed)) {
            if (typeof parsed === 'object' && parsed !== null && Array.isArray(parsed.payload)) {
              parsed = [parsed];
            } else {
              continue;
            }
          }

          parsed.forEach(item => {
            if (item && Array.isArray(item.payload)) {
              rawImportedItems.push(normalizePresetItem(item));
            }
          });
        } catch (fileErr) {
          console.error('Error reading file:', file.name, fileErr);
        }
      }

      if (rawImportedItems.length === 0) {
        global.triggerToast?.('No valid presets found in file(s)');
        return;
      }

      // 1. 本次导入批次内部先合并去重（保留首次出现的顺序）
      const batchSeen = new Set();
      const mergedBatch = [];
      for (const item of rawImportedItems) {
        const fp = getPresetFingerprint(item);
        if (!batchSeen.has(fp)) {
          batchSeen.add(fp);
          mergedBatch.push(item);
        }
      }

      // 2. 与原有收藏包比对：仅剔除完全一模一样的条目，有任意差别则保留并置顶
      const existingFingerprints = new Set(existingList.map(getPresetFingerprint));
      const itemsToPrepend = mergedBatch.filter(item => !existingFingerprints.has(getPresetFingerprint(item)));

      if (itemsToPrepend.length === 0) {
        global.triggerToast?.('Identical preset(s) already exist, skipped');
        return;
      }

      const updatedList = [...itemsToPrepend, ...existingList];
      await chrome.storage.local.set({ [PRESET_STORE_KEY]: updatedList });

      const searchTerm = document.getElementById('preset-search')?.value || '';
      await renderFavoritesList(apiRegistry, searchTerm);
      global.triggerToast?.(`Imported ${itemsToPrepend.length} new preset(s) to top`);
    } catch (err) {
      console.error('Import presets error:', err);
      global.triggerToast?.('Failed to read presets file');
    }
  }

  // 渲染收藏预设列表（支持按 note 和 api 模糊搜索）
  async function renderFavoritesList(apiRegistry = [], searchTerm = '') {
    const list = (await chrome.storage.local.get([PRESET_STORE_KEY]))[PRESET_STORE_KEY] || [];
    const container = document.getElementById('favorites-list-container');
    const term = String(searchTerm || '').trim().toLowerCase();

    const matchedEntries = list
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => {
        if (!term) return true;
        const noteStr = String(item.note || '').toLowerCase();
        const apiStr = String(item.api || '').toLowerCase();
        return noteStr.includes(term) || apiStr.includes(term);
      });

    if (!list.length) {
      container.innerHTML = '<p style="color:#666;font-size:13px;">No saved presets found.</p>';
      return;
    }

    if (!matchedEntries.length) {
      container.innerHTML = '<p style="color:#666;font-size:13px;">No matching presets found.</p>';
      return;
    }

    container.innerHTML = '';

    matchedEntries.forEach(({ item, idx }) => {
      const row = document.createElement('div');
      row.className = 'fav-row';

      const matchedOfficial = apiRegistry.find(a => a.api === item.api);
      let topTitle = '';

      if (item.note && item.note.trim()) {
        topTitle = item.note.trim();
      } else if (matchedOfficial) {
        topTitle = Array.isArray(matchedOfficial.desc)
          ? matchedOfficial.desc.join(' ')
          : matchedOfficial.desc || matchedOfficial.api;
      } else {
        topTitle = 'Custom API';
      }

      const bottomPath = item.api || '';

      row.innerHTML = `
        <div>
          <div class="fav-title-text">${escapeHtml(topTitle)}</div>
          <div class="fav-path-sub">${escapeHtml(bottomPath)}</div>
        </div>
        <div class="fav-row-actions">
          <button class="btn btn-outline btn-sm btn-export-single-fav" title="Export this preset">📤</button>
          <button class="btn btn-outline btn-sm btn-load-fav">Load</button>
          <button class="btn-del-fav" title="Delete preset">🗑</button>
        </div>
      `;

      row.querySelector('.btn-export-single-fav').onclick = (e) => {
        e.stopPropagation();
        const safeName =
          topTitle.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_').replace(/^_+|_+$/g, '') || 'preset';
        global.Seo360Response?.downloadJsonFile(`${safeName}.json`, [item], `Exported preset: ${safeName}`);
      };

      row.querySelector('.btn-load-fav').onclick = async () => {
        if (global.WorkbenchState) {
          global.WorkbenchState.activePresetIndex = idx;
        }
        if (typeof global.switchToCustomMode === 'function') {
          await global.switchToCustomMode(item.api, item.payload, {
            isPresetLoad: true,
            note: item.note || ''
          });
        }
        global.closeModal?.('modal-favorites');
        global.triggerToast?.(`Loaded preset: ${topTitle}`);
      };

      row.querySelector('.btn-del-fav').onclick = async (e) => {
        e.stopPropagation();
        const updatedList = list.filter((_, i) => i !== idx);
        await chrome.storage.local.set({ [PRESET_STORE_KEY]: updatedList });
        if (global.WorkbenchState && global.WorkbenchState.activePresetIndex === idx) {
          global.WorkbenchState.activePresetIndex = null;
        }
        const curSearch = document.getElementById('preset-search')?.value || '';
        await renderFavoritesList(apiRegistry, curSearch);
        global.triggerToast?.('Preset deleted');
      };

      container.appendChild(row);
    });
  }

  // 按顺序载入预设参数（可选在最前方挂载 locked note 行）
  async function loadPresetPayloadIntoForm(payloadData, options = {}) {
    const container = document.getElementById('params-container');
    container.innerHTML = '';

    if (options.includeNoteRow) {
      addPresetNoteRow(options.note || '');
    }

    let entries = [];
    if (Array.isArray(payloadData)) {
      if (payloadData.length > 0 && Array.isArray(payloadData[0])) {
        entries = payloadData;
      } else if (payloadData.length > 0 && typeof payloadData[0] === 'object') {
        entries = Object.entries(payloadData[0]);
      }
    } else if (typeof payloadData === 'object' && payloadData !== null) {
      entries = Object.entries(payloadData);
    }

    for (const [k, v] of entries) {
      if (options.includeNoteRow && k === 'note') continue;
      const poolDef = (await fetchParamDefinition(k)) || {};
      const fieldType = poolDef.type || (Array.isArray(v) ? 'array' : 'string');
      addParamRow(k, v, poolDef.description || 'Preset parameter', !poolDef.description, fieldType);
    }
    notifyCodeChange();
  }

  global.Seo360Params = {
    tryParseJsonValue,
    initCommonParams,
    fetchParamDefinition,
    renderParamsForm,
    addPresetNoteRow,
    getPresetNoteValue,
    addParamRow,
    addArrayItemInputRow,
    extractPayloadEntries,
    extractPayload,
    handleBatchImportLines,
    saveArrayModalChanges,
    overwriteLoadedPreset,
    saveCurrentPreset,
    exportAllPresets,
    importPresetsFromFiles,
    renderFavoritesList,
    loadPresetPayloadIntoForm
  };
})(window);