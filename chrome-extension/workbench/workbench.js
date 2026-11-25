/**
 * workbench.js
 * 主工作台入口控制器：协调网络层、参数层、响应层与代码生成层，并在重新请求/切换/页面卸载时全量释放内存
 */
(function (global) {
  'use strict';

  const state = {
    apiRegistry: [],
    currentApiItem: null,
    isCustomMode: false,
    currentCustomPath: '',
    currentParamsDef: null,
    currentResponseJson: null,
    activePresetIndex: null
  };

  global.WorkbenchState = state;

  let toastTimeout = null;

  document.addEventListener('DOMContentLoaded', async () => {
    setupGlobalEvents();
    await verifyCredentials();
    await global.Seo360Params.initCommonParams();
    await initApiList();
    await initBaseConfig();
    await syncUserBalance();
  });

  // 1. 校验本地 API 凭据
  async function verifyCredentials() {
    const creds = await global.Seo360Api.getStoredCredentials();
    if (!creds.api_login || !creds.api_password) {
      openModal('modal-creds');
    } else {
      document.getElementById('cfg-api-login').value = creds.api_login;
      document.getElementById('cfg-api-pass').value = creds.api_password;
    }
  }

  // 2. 同步账户余额
  async function syncUserBalance(showSpinner = false) {
    const valEl = document.getElementById('top-balance-val');
    const spinnerEl = document.getElementById('top-balance-spinner');

    if (showSpinner && spinnerEl) spinnerEl.classList.remove('hidden');

    try {
      const { balance } = await global.Seo360Api.fetchUserBalance();
      if (balance !== null && valEl) {
        valEl.textContent = `$${balance}`;
      }
    } catch (err) {
      if (err.code === 'MISSING_CREDENTIALS') {
        if (valEl) valEl.textContent = '$0.00';
      } else {
        console.error('Sync balance failed:', err);
        if (valEl) valEl.textContent = '$--.----';
      }
    } finally {
      if (spinnerEl) spinnerEl.classList.add('hidden');
    }
  }

  // 3. 初始化左侧 API 列表
  async function initApiList() {
    const container = document.getElementById('dynamic-api-container');
    const cache = await chrome.storage.session.get(['cached_api_index']);

    if (cache.cached_api_index) {
      state.apiRegistry = cache.cached_api_index;
    } else {
      try {
        state.apiRegistry = await global.Seo360Api.fetchRemoteJson(global.Seo360Api.CONFIG_URLS.API_INDEX);
        await chrome.storage.session.set({ cached_api_index: state.apiRegistry });
      } catch (_) {
        state.apiRegistry = [
          {
            file: 'serp_google_organic_live_regular.json',
            api: 'serp/google/organic/live/regular',
            desc: 'Google Organic SERP Live Regular'
          }
        ];
      }
    }

    container.innerHTML = '';
    state.apiRegistry.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'api-card-item';
      const descText = Array.isArray(item.desc) ? item.desc.join(' ') : item.desc || '';

      const descDiv = document.createElement('div');
      descDiv.className = 'api-card-desc';
      descDiv.textContent = descText;

      const subDiv = document.createElement('div');
      subDiv.className = 'api-card-sub';
      subDiv.textContent = item.api || item.file;

      card.appendChild(descDiv);
      card.appendChild(subDiv);

      card.addEventListener('click', () => switchOfficialApi(item, card));
      container.appendChild(card);

      if (index === 0) switchOfficialApi(item, card);
    });
  }

  // 4. 加载基础配置（联盟链接与社群入口）
  async function initBaseConfig() {
    const menuContainer = document.getElementById('discuss-menu');
    const homeLinkEl = document.getElementById('link-dataforseo-home');
    let config = null;

    const cache = await chrome.storage.session.get(['cached_base_config']);
    if (cache.cached_base_config) {
      config = cache.cached_base_config;
    } else {
      try {
        config = await global.Seo360Api.fetchRemoteJson(global.Seo360Api.CONFIG_URLS.BASE_CONFIG);
        await chrome.storage.session.set({ cached_base_config: config });
      } catch (err) {
        console.error('Failed to load base.json:', err);
      }
    }

    if (config) {
      if (homeLinkEl && config.affiliate_url) {
        homeLinkEl.href = config.affiliate_url;
      }

      const links = config.community_links || [];
      menuContainer.innerHTML = '';
      if (links.length > 0) {
        links.forEach(item => {
          const a = document.createElement('a');
          a.href = item.url;
          a.target = '_blank';
          a.textContent = `${item.name}`;
          menuContainer.appendChild(a);
        });
      } else {
        menuContainer.innerHTML =
          '<span style="padding: 8px 14px; font-size: 12px; color: #888;">No links available</span>';
      }
    }
  }

  // 统一重置响应展示区状态（彻底释放旧树、弹窗栈与缓存数据内存）
  function resetResponseView() {
    state.currentResponseJson = null;
    global.Seo360Response?.destroyAll();

    const statusEl = document.getElementById('res-status');
    if (statusEl) {
      statusEl.textContent = 'IDLE';
      statusEl.className = 'status-tag';
    }
    const treeContainer = document.getElementById('view-tree-container');
    if (treeContainer) {
      treeContainer.innerHTML =
        '<div class="empty-tip">// Output payload will be displayed here after sending a request.</div>';
    }
    const exportBtn = document.getElementById('btn-export-full-json');
    if (exportBtn) exportBtn.disabled = true;
    const copyBtn = document.getElementById('btn-copy-full-json');
    if (copyBtn) copyBtn.disabled = true;
  }

  // 5. 切换到官方预设 API（退出已加载收藏包编辑态）
  async function switchOfficialApi(apiItem, activeElement) {
    state.isCustomMode = false;
    state.activePresetIndex = null;
    state.currentApiItem = apiItem;
    resetResponseView();

    document.querySelectorAll('.api-card-item').forEach(el => el.classList.remove('active'));
    activeElement.classList.add('active');

    document.getElementById('curr-api-path').textContent = apiItem.api;
    document.getElementById('curr-api-path').classList.remove('hidden');
    document.getElementById('custom-path-wrap').classList.add('hidden');

    const sessionKey = `cached_api_${apiItem.file}`;
    const cache = await chrome.storage.session.get([sessionKey]);

    if (cache[sessionKey]) {
      state.currentParamsDef = cache[sessionKey];
    } else {
      try {
        state.currentParamsDef = await global.Seo360Api.fetchRemoteJson(
          `${global.Seo360Api.CONFIG_URLS.API_DETAIL_PREFIX}${apiItem.file}`
        );
        await chrome.storage.session.set({ [sessionKey]: state.currentParamsDef });
      } catch (_) {
        state.currentParamsDef = {
          use_params: ['keyword', 'location_code', 'language_code'],
          params: {}
        };
      }
    }

    global.Seo360Params.renderParamsForm(state.currentParamsDef);
    global.Seo360Codegen.refreshCodeOutput();
  }

  // 6. 切换到自定义 Endpoint 模式（支持加载收藏包并挂载第一项 locked note）
  async function switchToCustomMode(initialPath = '', initialPayloadEntries = null, presetMeta = null) {
    const isPresetLoad = Boolean(presetMeta && presetMeta.isPresetLoad);
    if (!isPresetLoad) {
      state.activePresetIndex = null;
    }

    state.isCustomMode = true;
    state.currentApiItem = null;
    resetResponseView();

    document.querySelectorAll('.api-card-item').forEach(el => el.classList.remove('active'));
    document.getElementById('entry-custom-api').classList.add('active');

    const customWrap = document.getElementById('custom-path-wrap');
    const customInput = document.getElementById('custom-api-input');
    document.getElementById('curr-api-path').classList.add('hidden');
    customWrap.classList.remove('hidden');

    customInput.value = initialPath || '';
    state.currentCustomPath = customInput.value;

    const container = document.getElementById('params-container');
    container.innerHTML = '';

    if (initialPayloadEntries) {
      if (isPresetLoad) {
        global.Seo360Params.addPresetNoteRow(presetMeta.note || '');
      }

      const entries = Array.isArray(initialPayloadEntries)
        ? initialPayloadEntries
        : Object.entries(initialPayloadEntries);

      for (const [k, v] of entries) {
        if (isPresetLoad && k === 'note') continue;
        const def = await global.Seo360Params.fetchParamDefinition(k);
        const desc = def?.description || 'Custom parameter';
        const isNested = Array.isArray(v) && v.some(item => typeof item === 'object' && item !== null);
        const type = isNested ? 'string' : Array.isArray(v) ? 'array' : def?.type || 'string';
        global.Seo360Params.addParamRow(k, v, desc, true, type);
      }
    } else {
      const kwDef = await global.Seo360Params.fetchParamDefinition('keyword');
      const locDef = await global.Seo360Params.fetchParamDefinition('location_code');
      const langDef = await global.Seo360Params.fetchParamDefinition('language_code');
      global.Seo360Params.addParamRow('keyword', 'best running shoes', kwDef?.description || 'Search keyword', true, kwDef?.type || 'string');
      global.Seo360Params.addParamRow('location_code', '2840', locDef?.description || 'Country code', true, locDef?.type || 'number');
      global.Seo360Params.addParamRow('language_code', 'en', langDef?.description || 'Language code', true, langDef?.type || 'string');
    }

    global.Seo360Codegen.refreshCodeOutput();
  }

  function getEffectiveApiPath() {
    if (state.isCustomMode) {
      const raw = document.getElementById('custom-api-input').value.trim();
      return global.Seo360Api.cleanEndpointPath(raw);
    }
    return state.currentApiItem ? state.currentApiItem.api.replace(/^\//, '') : '';
  }

  // 7. 发起 API 测试请求
  async function executeApiCall() {
    const creds = await global.Seo360Api.getStoredCredentials();
    if (!creds.api_login || !creds.api_password) {
      openModal('modal-creds');
      return;
    }

    const effectivePath = getEffectiveApiPath();
    if (!effectivePath) {
      triggerToast('Please enter an API endpoint path first!');
      document.getElementById('custom-api-input')?.focus();
      return;
    }

    const statusEl = document.getElementById('res-status');
    const treeContainer = document.getElementById('view-tree-container');
    const sendBtn = document.getElementById('btn-send-request');
    const sendSpinner = document.getElementById('send-spinner');
    const sendBtnText = document.getElementById('send-btn-text');

    state.currentResponseJson = null;
    global.Seo360Response?.destroyAll();
    document.getElementById('btn-export-full-json').disabled = true;
    document.getElementById('btn-copy-full-json').disabled = true;

    sendBtn.disabled = true;
    if (sendSpinner) sendSpinner.classList.remove('hidden');
    if (sendBtnText) sendBtnText.textContent = 'Sending...';

    statusEl.textContent = 'RUNNING';
    statusEl.className = 'status-tag running';

    treeContainer.innerHTML = `
      <div class="tree-skeleton" style="padding: 16px;">
        <div class="skeleton-line" style="width: 35%;"></div>
        <div class="skeleton-line" style="width: 65%;"></div>
        <div class="skeleton-line" style="width: 50%;"></div>
        <div class="skeleton-line" style="width: 80%;"></div>
      </div>
    `;

    try {
      const payload = global.Seo360Params.extractPayload();
      const { data: json } = await global.Seo360Api.callEndpoint(effectivePath, payload, creds);
      state.currentResponseJson = json;

      if (json.status_code === 20000) {
        statusEl.textContent = `20000 OK ($${json.cost || 0})`;
        statusEl.className = 'status-tag ok';
        triggerToast('Request succeeded!');
        syncUserBalance();
      } else {
        statusEl.textContent = `ERR ${json.status_code || ''}`;
        statusEl.className = 'status-tag err';
      }

      document.getElementById('btn-export-full-json').disabled = false;
      document.getElementById('btn-copy-full-json').disabled = false;
      global.Seo360Response.renderJsonTree(json, treeContainer);
    } catch (err) {
      const errDiv = document.createElement('div');
      errDiv.style.cssText = 'color:#cf222e;padding:16px;white-space:pre-wrap;';
      errDiv.textContent = `Network / Request Error:\n${err.message}`;
      treeContainer.innerHTML = '';
      treeContainer.appendChild(errDiv);

      statusEl.textContent = err.httpStatus ? `HTTP ${err.httpStatus}` : 'NETWORK ERR';
      statusEl.className = 'status-tag err';
    } finally {
      sendBtn.disabled = false;
      if (sendSpinner) sendSpinner.classList.add('hidden');
      if (sendBtnText) sendBtnText.textContent = 'Send Request';
    }
  }

  // 8. 绑定全局交互事件
  function setupGlobalEvents() {
    document.getElementById('btn-send-request').onclick = executeApiCall;

    document.getElementById('btn-add-field').onclick = () => {
      const newRow = global.Seo360Params.addParamRow('', '', 'Custom parameter', true, 'string');
      newRow.querySelector('.field-key-input').focus();
    };

    document.getElementById('entry-custom-api').onclick = () => {
      switchToCustomMode();
    };

    const customInput = document.getElementById('custom-api-input');
    customInput.addEventListener('input', (e) => {
      const cleaned = global.Seo360Api.cleanEndpointPath(e.target.value);
      if (e.target.value !== cleaned) {
        e.target.value = cleaned;
      }
      state.currentCustomPath = cleaned;
      global.Seo360Codegen.refreshCodeOutput();
    });

    const btnPasteCustom = document.getElementById('btn-paste-custom-path');
    if (btnPasteCustom) {
      btnPasteCustom.onclick = async () => {
        try {
          const text = await navigator.clipboard.readText();
          const cleaned = global.Seo360Api.cleanEndpointPath(text);
          customInput.value = cleaned;
          state.currentCustomPath = cleaned;
          global.Seo360Codegen.refreshCodeOutput();
          triggerToast(`Pasted endpoint: ${cleaned || 'empty'}`);
        } catch (_) {
          triggerToast('Failed to read clipboard');
        }
      };
    }

    const btnRefreshBal = document.getElementById('btn-refresh-top-balance');
    if (btnRefreshBal) {
      btnRefreshBal.onclick = () => syncUserBalance(true);
    }

    // 凭据设置弹窗
    document.getElementById('btn-open-settings').onclick = () => openModal('modal-creds');
    document.getElementById('btn-cancel-creds').onclick = () => closeModal('modal-creds');
    document.getElementById('btn-save-creds').onclick = async () => {
      const login = document.getElementById('cfg-api-login').value.trim();
      const pass = document.getElementById('cfg-api-pass').value.trim();
      if (login && pass) {
        await chrome.storage.local.set({ api_login: login, api_password: pass });
        closeModal('modal-creds');
        global.Seo360Codegen.refreshCodeOutput();
        syncUserBalance(true);
        triggerToast('Credentials saved successfully!');
      } else {
        triggerToast('Please provide both login and password');
      }
    };

    document.getElementById('link-goto-guide').onclick = (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('tutorial/index.html') });
    };

    // 完整响应 JSON 复制与导出
    document.getElementById('btn-copy-full-json').onclick = () => {
      if (state.currentResponseJson) {
        global.Seo360Response.copyJsonToClipboard(state.currentResponseJson);
      }
    };

    document.getElementById('btn-export-full-json').onclick = () => {
      if (state.currentResponseJson) {
        const filename = global.Seo360Response.generateExportFilename('full', 'json');
        global.Seo360Response.downloadJsonFile(filename, state.currentResponseJson);
      }
    };

    // 参数详情弹窗关闭
    const closeParamBtn = document.getElementById('btn-close-param-detail');
    if (closeParamBtn) {
      closeParamBtn.onclick = () => closeModal('modal-param-detail');
    }

    // 数组编辑器弹窗事件
    document.getElementById('btn-close-array-modal').onclick = () => closeModal('modal-array-editor');
    document.getElementById('btn-cancel-array').onclick = () => closeModal('modal-array-editor');
    document.getElementById('btn-add-array-item').onclick = () => {
      const newRow = global.Seo360Params.addArrayItemInputRow('');
      newRow.querySelector('.array-item-input').focus();
    };
    document.getElementById('btn-batch-import').onclick = () => global.Seo360Params.handleBatchImportLines();
    document.getElementById('btn-save-array').onclick = () => global.Seo360Params.saveArrayModalChanges();

    // 代码生成器语言切换与凭据显隐
    document.querySelectorAll('.lang-selector .lang-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.lang-selector .lang-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        global.Seo360Codegen.setLanguage(btn.dataset.lang);
        global.Seo360Codegen.refreshCodeOutput();
      };
    });

    document.getElementById('btn-toggle-include-creds').onclick = () => {
      const isIncluded = global.Seo360Codegen.toggleCredentials();
      const lbl = document.getElementById('lbl-include-creds-status');
      lbl.textContent = isIncluded ? 'ON' : 'OFF';
      lbl.style.color = isIncluded ? '#1a7f37' : 'inherit';
      global.Seo360Codegen.refreshCodeOutput();
      triggerToast(isIncluded ? 'Real credentials applied to code' : 'Switched to placeholder credentials');
    };

    document.getElementById('btn-copy-code').onclick = () => {
      const code = document.getElementById('code-snippet').textContent;
      navigator.clipboard.writeText(code).then(() => triggerToast('Code copied to clipboard!'));
    };

    // 收藏预设保存、打开、导入、导出
    document.getElementById('btn-save-favorite').onclick = async () => {
      const apiPath = getEffectiveApiPath();

      // 若当前是从收藏包加载的编辑状态，直接覆盖原收藏包
      if (typeof state.activePresetIndex === 'number' && state.activePresetIndex >= 0) {
        await global.Seo360Params.overwriteLoadedPreset(apiPath);
        return;
      }

      if (!apiPath) {
        triggerToast('Please enter an API endpoint path first!');
        document.getElementById('custom-api-input')?.focus();
        return;
      }
      const noteInput = document.getElementById('input-preset-note');
      if (noteInput) noteInput.value = '';
      openModal('modal-save-preset');
      if (noteInput) noteInput.focus();
    };

    document.getElementById('btn-cancel-save-preset').onclick = () => closeModal('modal-save-preset');
    document.getElementById('btn-confirm-save-preset').onclick = () =>
      global.Seo360Params.saveCurrentPreset(getEffectiveApiPath(), state.currentApiItem);
    document.getElementById('input-preset-note').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        global.Seo360Params.saveCurrentPreset(getEffectiveApiPath(), state.currentApiItem);
      }
    });

    const presetSearchInput = document.getElementById('preset-search');
    if (presetSearchInput) {
      presetSearchInput.addEventListener('input', async (e) => {
        await global.Seo360Params.renderFavoritesList(state.apiRegistry, e.target.value);
      });
    }

    document.getElementById('btn-open-favorites').onclick = async () => {
      if (presetSearchInput) presetSearchInput.value = '';
      await global.Seo360Params.renderFavoritesList(state.apiRegistry, '');
      openModal('modal-favorites');
      presetSearchInput?.focus();
    };
    document.getElementById('btn-close-fav').onclick = () => closeModal('modal-favorites');
    document.getElementById('btn-export-presets').onclick = () => global.Seo360Params.exportAllPresets();

    const fileInputEl = document.getElementById('file-import-presets');
    document.getElementById('btn-import-presets').onclick = () => {
      fileInputEl.value = '';
      fileInputEl.click();
    };
    fileInputEl.onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      await global.Seo360Params.importPresetsFromFiles(files, state.apiRegistry);
    };

    // 顶部社群菜单
    const discussBtn = document.getElementById('btn-discuss-toggle');
    const discussMenu = document.getElementById('discuss-menu');
    discussBtn.onclick = (e) => {
      e.stopPropagation();
      discussMenu.classList.toggle('hidden');
    };
    document.addEventListener('click', () => discussMenu.classList.add('hidden'));

    // 左侧 API 搜索过滤
    const apiSearchInput = document.getElementById('api-search');
    if (apiSearchInput) {
      apiSearchInput.addEventListener('input', (e) => {
        const term = e.target.value.trim().toLowerCase();
        document.querySelectorAll('#dynamic-api-container .api-card-item').forEach(card => {
          if (!term) {
            card.style.display = '';
            return;
          }
          const descText = card.querySelector('.api-card-desc')?.textContent.toLowerCase() || '';
          const subText = card.querySelector('.api-card-sub')?.textContent.toLowerCase() || '';
          const allText = card.textContent.toLowerCase();
          card.style.display = subText.includes(term) || descText.includes(term) || allText.includes(term) ? '' : 'none';
        });
      });
    }

    // Esc 逐层关闭弹窗
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (global.ModalStack && global.ModalStack.length > 0) {
          global.Seo360Response.popModalStack();
        } else {
          closeModal('modal-creds');
          closeModal('modal-favorites');
          closeModal('modal-save-preset');
          closeModal('modal-param-detail');
          closeModal('modal-array-editor');
        }
      }
    });

    // 关闭或刷新网页时强制销毁所有 DOM 缓存与大对象引用
    const releaseOnUnload = () => {
      state.currentResponseJson = null;
      state.currentParamsDef = null;
      state.apiRegistry = [];
      global.Seo360Response?.destroyAll();
    };
    window.addEventListener('pagehide', releaseOnUnload);
    window.addEventListener('beforeunload', releaseOnUnload);
	
	// 所有文本类输入框失焦时自动去除首尾空白字符（不影响输入过程中的中间空格）
    document.addEventListener(
      'blur',
      (e) => {
        const el = e.target;
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
        if (el.readOnly || el.disabled) return;
        const textTypes = ['text', 'search', 'url', 'email', 'password', 'textarea'];
        const isTextInput =
          el.tagName === 'TEXTAREA' || textTypes.includes((el.type || 'text').toLowerCase());
        if (!isTextInput) return;

        const trimmed = el.value.trim();
        if (el.value !== trimmed) {
          el.value = trimmed;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      },
      true
    );
  }

  function openModal(id) {
    document.getElementById(id)?.classList.remove('hidden');
  }

  function closeModal(id) {
    document.getElementById(id)?.classList.add('hidden');
  }

  function triggerToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => t.classList.remove('show'), 1600);
  }

  // 挂载跨模块公共方法
  global.getEffectiveApiPath = getEffectiveApiPath;
  global.switchOfficialApi = switchOfficialApi;
  global.switchToCustomMode = switchToCustomMode;
  global.openModal = openModal;
  global.closeModal = closeModal;
  global.triggerToast = triggerToast;
})(window);