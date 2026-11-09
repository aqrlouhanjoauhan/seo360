// Base64 helper
function safeBtoa(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
    return String.fromCharCode('0x' + p1);
  }));
}

const BASE_CONFIG_URL = 'https://seo360.pages.dev/dataforseo/base.json';
const API_INDEX_URL = 'https://seo360.pages.dev/dataforseo/api.json';
const COMMON_PARAMS_URL = 'https://seo360.pages.dev/dataforseo/params.json';
const BASE_API_ROOT = 'https://api.dataforseo.com/v3/';

let commonParamsPool = {}; 
let apiRegistry = [];      
let currentApiItem = null;  
let isCustomMode = false;   
let currentCustomPath = '';
let currentParamsDef = null;
let currentResponseJson = null;

let activeParamTargetRow = null;
let activeArrayTargetRow = null;

// cURL placed first by default
let currentLang = 'curl';
let includeCredentials = false;
let toastTimeout = null;

// Stack Modal State & Storage Map
window.ModalStack = [];
window._NestedDataStore = new Map();

document.addEventListener('DOMContentLoaded', async () => {
  setupGlobalEvents();
  await verifyCredentials();
  await initCommonParams();
  await initApiList();
  await initBaseConfig();
  await syncUserBalance();
});

// 1. Verify Credentials
async function verifyCredentials() {
  const creds = await chrome.storage.local.get(['api_login', 'api_password']);
  if (!creds.api_login || !creds.api_password) {
    openModal('modal-creds');
  } else {
    document.getElementById('cfg-api-login').value = creds.api_login;
    document.getElementById('cfg-api-pass').value = creds.api_password;
  }
}

// 2. Sync Balance
async function syncUserBalance(showSpinner = false) {
  const valEl = document.getElementById('top-balance-val');
  const spinnerEl = document.getElementById('top-balance-spinner');

  if (showSpinner && spinnerEl) spinnerEl.classList.remove('hidden');

  const creds = await chrome.storage.local.get(['api_login', 'api_password']);
  if (!creds.api_login || !creds.api_password) {
    if (valEl) valEl.textContent = '$0.00';
    if (spinnerEl) spinnerEl.classList.add('hidden');
    return;
  }

  try {
    const res = await fetch('https://api.dataforseo.com/v3/appendix/user_data', {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + safeBtoa(`${creds.api_login}:${creds.api_password}`),
        'Content-Type': 'application/json'
      }
    });

    const json = await res.json();
    const taskRes = json?.tasks?.[0]?.result?.[0];

    if (taskRes && taskRes.money) {
      const money = String(taskRes.money.balance !== undefined ? taskRes.money.balance : 0);
      if (valEl) valEl.textContent = `$${money}`;
      chrome.storage.session.set({ cached_user_balance: money });
    }
  } catch (err) {
    console.error('Sync balance failed:', err);
    if (valEl) valEl.textContent = '$--.----';
  } finally {
    if (spinnerEl) spinnerEl.classList.add('hidden');
  }
}

// 3. Common Params & Dynamic Fetch
async function initCommonParams() {
  const cache = await chrome.storage.session.get(['cached_params_common']);
  if (cache.cached_params_common && Object.keys(cache.cached_params_common).length > 0) {
    commonParamsPool = cache.cached_params_common;
    return;
  }
  try {
    const res = await fetch(COMMON_PARAMS_URL);
    commonParamsPool = await res.json();
    chrome.storage.session.set({ cached_params_common: commonParamsPool });
  } catch (e) {
    console.error('Failed to load params.json:', e);
  }
}

async function fetchParamDefinition(key) {
  if (!key) return null;
  const cleanKey = key.trim();
  if (commonParamsPool && commonParamsPool[cleanKey]) {
    return commonParamsPool[cleanKey];
  }
  if (currentParamsDef && currentParamsDef.params && currentParamsDef.params[cleanKey]) {
    return currentParamsDef.params[cleanKey];
  }

  await initCommonParams();
  if (commonParamsPool && commonParamsPool[cleanKey]) {
    return commonParamsPool[cleanKey];
  }
  return null;
}

// 4. API List Init
async function initApiList() {
  const container = document.getElementById('dynamic-api-container');
  const cache = await chrome.storage.session.get(['cached_api_index']);
  if (cache.cached_api_index) {
    apiRegistry = cache.cached_api_index;
  } else {
    try {
      const res = await fetch(API_INDEX_URL);
      apiRegistry = await res.json();
      chrome.storage.session.set({ cached_api_index: apiRegistry });
    } catch (e) {
      apiRegistry = [
        {
          file: "serp_google_organic_live_regular.json",
          api: "serp/google/organic/live/regular",
          desc: "Google Organic SERP Live Regular"
        }
      ];
    }
  }

  container.innerHTML = '';
  apiRegistry.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'api-card-item';
    const descText = Array.isArray(item.desc) ? item.desc.join(' ') : (item.desc || '');

    card.innerHTML = `
      <div class="api-card-desc">${descText}</div>
      <div class="api-card-sub">${item.api || item.file}</div>
    `;

    card.addEventListener('click', () => switchOfficialApi(item, card));
    container.appendChild(card);

    if (index === 0) switchOfficialApi(item, card);
  });
}

// 5. Load base.json (Sets affiliate_url & Community Links)
async function initBaseConfig() {
  const menuContainer = document.getElementById('discuss-menu');
  const homeLinkEl = document.getElementById('link-dataforseo-home');
  let config = null;

  const cache = await chrome.storage.session.get(['cached_base_config']);
  if (cache.cached_base_config) {
    config = cache.cached_base_config;
  } else {
    try {
      const res = await fetch(BASE_CONFIG_URL);
      config = await res.json();
      chrome.storage.session.set({ cached_base_config: config });
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
        a.textContent = `${item.name} ↗`;
        menuContainer.appendChild(a);
      });
    } else {
      menuContainer.innerHTML = '<span style="padding: 8px 14px; font-size: 12px; color: #888;">No links available</span>';
    }
  }
}

// 6. Switch to Official API
async function switchOfficialApi(apiItem, activeElement) {
  isCustomMode = false;
  currentApiItem = apiItem;
  
  currentResponseJson = null;
  const statusEl = document.getElementById('res-status');
  if (statusEl) {
    statusEl.textContent = 'IDLE';
    statusEl.className = 'status-tag';
  }
  const treeContainer = document.getElementById('view-tree-container');
  if (treeContainer) {
    treeContainer.innerHTML = '<div class="empty-tip">// Output payload will be displayed here after sending a request.</div>';
  }
  const exportBtn = document.getElementById('btn-export-full-json');
  if (exportBtn) exportBtn.disabled = true;
  const copyBtn = document.getElementById('btn-copy-full-json');
  if (copyBtn) copyBtn.disabled = true;

  document.querySelectorAll('.api-card-item').forEach(el => el.classList.remove('active'));
  activeElement.classList.add('active');

  document.getElementById('curr-api-path').textContent = apiItem.api;
  document.getElementById('curr-api-path').classList.remove('hidden');
  document.getElementById('custom-path-wrap').classList.add('hidden');

  const sessionKey = `cached_api_${apiItem.file}`;
  const cache = await chrome.storage.session.get([sessionKey]);

  if (cache[sessionKey]) {
    currentParamsDef = cache[sessionKey];
  } else {
    try {
      const res = await fetch(`https://seo360.pages.dev/dataforseo/${apiItem.file}`);
      currentParamsDef = await res.json();
      chrome.storage.session.set({ [sessionKey]: currentParamsDef });
    } catch (e) {
      currentParamsDef = { use_params: ["keyword", "location_code", "language_code"], params: {} };
    }
  }

  renderParamsForm(currentParamsDef);
  refreshCodeOutput();
}

// 7. Switch to Custom Mode
async function switchToCustomMode(initialPath = '', initialPayloadEntries = null) {
  isCustomMode = true;
  currentApiItem = null;
  
  currentResponseJson = null;
  const statusEl = document.getElementById('res-status');
  if (statusEl) {
    statusEl.textContent = 'IDLE';
    statusEl.className = 'status-tag';
  }
  const treeContainer = document.getElementById('view-tree-container');
  if (treeContainer) {
    treeContainer.innerHTML = '<div class="empty-tip">// Output payload will be displayed here after sending a request.</div>';
  }
  const exportBtn = document.getElementById('btn-export-full-json');
  if (exportBtn) exportBtn.disabled = true;
  const copyBtn = document.getElementById('btn-copy-full-json');
  if (copyBtn) copyBtn.disabled = true;

  document.querySelectorAll('.api-card-item').forEach(el => el.classList.remove('active'));
  document.getElementById('entry-custom-api').classList.add('active');

  const customWrap = document.getElementById('custom-path-wrap');
  const customInput = document.getElementById('custom-api-input');
  document.getElementById('curr-api-path').classList.add('hidden');
  customWrap.classList.remove('hidden');

  customInput.value = initialPath || '';
  currentCustomPath = customInput.value;

  const container = document.getElementById('params-container');
  container.innerHTML = '';

  if (initialPayloadEntries) {
    // 兼容二维数组 [ [k, v], ... ] 或普通对象 { k: v }
    const entries = Array.isArray(initialPayloadEntries) 
      ? initialPayloadEntries 
      : Object.entries(initialPayloadEntries);

    for (const [k, v] of entries) {
      const isArr = Array.isArray(v);
      const def = await fetchParamDefinition(k);
      const desc = def?.description || 'Custom parameter';
      const type = isArr ? 'array' : (def?.type || 'string');
      addParamRow(k, v, desc, true, type);
    }
  } else {
    const kwDef = await fetchParamDefinition('keyword');
    const locDef = await fetchParamDefinition('location_code');
    const langDef = await fetchParamDefinition('language_code');
    addParamRow('keyword', 'best running shoes', kwDef?.description || 'Search keyword', true, kwDef?.type || 'string');
    addParamRow('location_code', '2840', locDef?.description || 'Country code', true, locDef?.type || 'number');
    addParamRow('language_code', 'en', langDef?.description || 'Language code', true, langDef?.type || 'string');
  }

  refreshCodeOutput();
}

function cleanEndpointPath(raw) {
  return raw
    .trim()
    .replace(/^https?:\/\/api\.dataforseo\.com\/(v3\/)?/i, '')
    .replace(/^\/+/, '');
}

function getEffectiveApiPath() {
  if (isCustomMode) {
    const raw = document.getElementById('custom-api-input').value.trim();
    return cleanEndpointPath(raw);
  }
  return currentApiItem ? currentApiItem.api.replace(/^\//, '') : '';
}

// 8. Render Parameters Form
function renderParamsForm(conf) {
  const container = document.getElementById('params-container');
  container.innerHTML = '';

  if (Array.isArray(conf.use_params)) {
    conf.use_params.forEach(k => {
      const def = commonParamsPool[k] || {};
      addParamRow(k, def.default !== undefined ? def.default : '', def.description || 'Common parameter', false, def.type || 'string');
    });
  }

  if (conf.params && typeof conf.params === 'object') {
    Object.entries(conf.params).forEach(([k, v]) => {
      addParamRow(k, v.default !== undefined ? v.default : '', v.description || 'Endpoint parameter', false, v.type || 'string');
    });
  }
}

// Add Parameter Row with List (Multi) Toggle
function addParamRow(key = '', val = '', descHtml = '', isCustom = true, fieldType = 'string') {
  const container = document.getElementById('params-container');
  const row = document.createElement('div');
  row.className = 'params-row';
  row.dataset.type = fieldType;

  let initialArray = [];
  if (fieldType === 'array') {
    if (Array.isArray(val)) {
      initialArray = val;
    } else if (typeof val === 'string' && val.startsWith('[')) {
      try { initialArray = JSON.parse(val); } catch(_) { initialArray = [val]; }
    } else if (val) {
      initialArray = [String(val)];
    }
  }

  const isArrayActive = fieldType === 'array';
  const toggleCheckboxHtml = isCustom ? `
    <label class="array-toggle-label ${isArrayActive ? 'active' : ''}" title="Toggle between single value and multi-item list">
      <input type="checkbox" class="array-toggle-check" ${isArrayActive ? 'checked' : ''}>
      <span>List (Multi)</span>
    </label>
  ` : '';

  row.innerHTML = `
    <div class="col-field-box">
      <div class="field-header-row">
        <input type="text" class="field-key-input" value="${key}" placeholder="param_name" ${!isCustom ? 'readonly' : ''}>
        ${toggleCheckboxHtml}
      </div>
      <div class="field-desc-text" title="Click to view full description & options">${descHtml || 'Custom parameter'}</div>
    </div>
    <div class="col-val-wrap"></div>
    <button class="btn-del-row" title="Delete">&times;</button>
  `;

  const valWrap = row.querySelector('.col-val-wrap');
  renderValueWidget(row, valWrap, fieldType, val, initialArray);

  bindDescClickEvents(row);

  // Switch / Checkbox change event
  const toggleCheck = row.querySelector('.array-toggle-check');
  if (toggleCheck) {
    toggleCheck.addEventListener('change', (e) => {
      const isArr = e.target.checked;
      const newType = isArr ? 'array' : 'string';
      row.dataset.type = newType;

      const labelEl = row.querySelector('.array-toggle-label');
      if (labelEl) labelEl.classList.toggle('active', isArr);

      const curVal = getRowValue(row);
      let curArr = [];

      if (isArr) {
        if (Array.isArray(curVal)) {
          curArr = curVal;
        } else if (typeof curVal === 'string' && curVal.trim().startsWith('[')) {
          try { curArr = JSON.parse(curVal); } catch(_) { curArr = curVal ? [curVal] : []; }
        } else {
          curArr = curVal !== '' && curVal !== undefined ? [String(curVal)] : [];
        }
        renderValueWidget(row, valWrap, 'array', curVal, curArr);
      } else {
        let singleVal = '';
        if (Array.isArray(curVal)) {
          singleVal = curVal.length > 0 ? String(curVal[0]) : '';
        } else if (typeof curVal === 'string') {
          const trimmed = curVal.trim();
          if (trimmed.startsWith('[')) {
            try {
              const parsed = JSON.parse(trimmed);
              if (Array.isArray(parsed) && parsed.length > 0) {
                singleVal = String(parsed[0]);
              } else {
                singleVal = '';
              }
            } catch (_) {
              singleVal = trimmed.replace(/^[\[\s"']+\vert{}[\]\s"']+$/g, '');
            }
          } else {
            singleVal = curVal;
          }
        } else if (curVal !== undefined && curVal !== null) {
          singleVal = String(curVal);
        }
        renderValueWidget(row, valWrap, 'string', singleVal, []);
      }

      refreshCodeOutput();
    });
  }

  // Key lookup for auto-reading description
  const keyInput = row.querySelector('.field-key-input');
  if (isCustom) {
    const handleKeyLookup = async () => {
      const currentK = keyInput.value.trim();
      if (!currentK) return;
      const def = await fetchParamDefinition(currentK);
      if (def) {
        if (def.description) {
          const descEl = row.querySelector('.field-desc-text');
          descEl.innerHTML = def.description;
          bindDescClickEvents(row);
        }
        if (def.type === 'array' && row.dataset.type !== 'array') {
          row.dataset.type = 'array';
          if (toggleCheck) {
            toggleCheck.checked = true;
            row.querySelector('.array-toggle-label')?.classList.add('active');
          }
          const curVal = getRowValue(row);
          renderValueWidget(row, valWrap, 'array', curVal, curVal ? [String(curVal)] : []);
        }
      }
      refreshCodeOutput();
    };

    keyInput.addEventListener('blur', handleKeyLookup);
    keyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleKeyLookup();
      }
    });
  }

  keyInput.addEventListener('input', refreshCodeOutput);

  row.querySelector('.btn-del-row').onclick = () => {
    row.remove();
    refreshCodeOutput();
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
      <input type="hidden" class="field-val-input" value='${JSON.stringify(currentArray)}'>
    `;

    const arrayBtn = container.querySelector('.array-trigger-btn');
    const valInput = container.querySelector('.field-val-input');
    arrayBtn.onclick = () => {
      activeArrayTargetRow = row;
      let items = [];
      try { items = JSON.parse(valInput.value); } catch(_) { items = []; }
      const keyName = row.querySelector('.field-key-input').value.trim() || 'List';
      openArrayEditorModal(keyName, items);
    };
  } else {
    let strVal = currentVal;
    if (Array.isArray(currentVal)) {
      strVal = currentVal.length > 0 ? String(currentVal[0]) : '';
    } else if (typeof currentVal === 'string' && currentVal.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(currentVal);
        strVal = Array.isArray(parsed) && parsed.length > 0 ? String(parsed[0]) : '';
      } catch (_) {
        strVal = currentVal.replace(/^[\[\s"']+\vert{}[\]\s"']+$/g, '');
      }
    } else if (typeof currentVal === 'object' && currentVal !== null) {
      strVal = JSON.stringify(currentVal);
    }

    container.innerHTML = `<input type="text" class="field-val-input" value="${strVal}" placeholder="Value">`;
    const valInput = container.querySelector('.field-val-input');

    valInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const rows = Array.from(document.querySelectorAll('.params-row:not(.params-row-head)'));
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
    valInput.addEventListener('input', refreshCodeOutput);
  }
}

function getRowValue(row) {
  const valInput = row.querySelector('.field-val-input');
  if (!valInput) return '';
  return valInput.value;
}

function bindDescClickEvents(row) {
  const descTextEl = row.querySelector('.field-desc-text');
  const valInput = row.querySelector('.field-val-input');

  function applyCodeVal(rawCodeText) {
    const trimmed = rawCodeText.trim();
    if (row.dataset.type === 'array') {
      let currentArr = [];
      try { currentArr = JSON.parse(valInput.value); } catch(_) { currentArr = []; }
      if (!Array.isArray(currentArr)) currentArr = [];

      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            valInput.value = JSON.stringify(parsed);
            row.querySelector('.array-preview-txt').textContent = formatArrayPreview(parsed);
            return;
          }
        } catch (_) {}
      }

      const cleanItem = trimmed.replace(/^["']|["']$/g, '');
      if (cleanItem && !currentArr.includes(cleanItem)) {
        currentArr.push(cleanItem);
      }
      valInput.value = JSON.stringify(currentArr);
      row.querySelector('.array-preview-txt').textContent = formatArrayPreview(currentArr);
    } else {
      valInput.value = trimmed;
    }
  }

  descTextEl.querySelectorAll('code').forEach(cd => {
    cd.onclick = (e) => {
      e.stopPropagation();
      applyCodeVal(cd.textContent);
      refreshCodeOutput();
      triggerToast(`Inserted: ${cd.textContent}`);
    };
  });

  descTextEl.onclick = () => {
    activeParamTargetRow = row;
    const currentKey = row.querySelector('.field-key-input').value.trim() || 'Parameter';
    document.getElementById('param-detail-title').textContent = `Parameter: ${currentKey}`;

    const modalBody = document.getElementById('param-detail-body');
    modalBody.innerHTML = descTextEl.innerHTML;

    modalBody.querySelectorAll('code').forEach(modalCd => {
      modalCd.onclick = () => {
        applyCodeVal(modalCd.textContent);
        refreshCodeOutput();
        triggerToast(`Applied: ${modalCd.textContent.trim()} to ${currentKey}`);
        closeModal('modal-param-detail');
      };
    });

    openModal('modal-param-detail');
  };
}

function formatArrayPreview(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return 'Empty list (0 items)';
  const preview = arr.slice(0, 2).map(x => `"${x}"`).join(', ');
  return `${arr.length} item(s): [${preview}${arr.length > 2 ? ', ...' : ''}]`;
}

// 9. Open Array / List Editor
function openArrayEditorModal(keyName, currentItems) {
  document.getElementById('array-editor-title').textContent = `Edit List: ${keyName}`;
  const container = document.getElementById('array-items-list');
  container.innerHTML = '';
  document.getElementById('array-batch-textarea').value = '';

  if (currentItems.length > 0) {
    currentItems.forEach(item => addArrayItemInputRow(item));
  } else {
    addArrayItemInputRow('');
  }

  openModal('modal-array-editor');
}

function addArrayItemInputRow(val = '') {
  const container = document.getElementById('array-items-list');
  const row = document.createElement('div');
  row.className = 'array-item-row';
  row.innerHTML = `
    <input type="text" class="array-item-input" value="${val}" placeholder="Enter item value...">
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

// 10. Extract Payload: 支持二维数组形式保留次序
function extractPayloadEntries() {
  const entries = [];
  document.querySelectorAll('#params-container .params-row').forEach(row => {
    const k = row.querySelector('.field-key-input').value.trim();
    const rawVal = row.querySelector('.field-val-input')?.value.trim() ?? '';
    const type = row.dataset.type;

    if (k) {
      let val;
      if (type === 'array') {
        try {
          val = JSON.parse(rawVal);
        } catch (_) {
          val = rawVal ? [rawVal] : [];
        }
      } else {
        let v = rawVal;
        if ((v.startsWith('[') && v.endsWith(']')) || (v.startsWith('{') && v.endsWith('}'))) {
          try {
            v = JSON.parse(v);
          } catch (_) {}
        } else if (v === 'true') {
          v = true;
        } else if (v === 'false') {
          v = false;
        } else if (!isNaN(v) && v !== '') {
          v = Number(v);
        }
        val = v;
      }
      entries.push([k, val]);
    }
  });
  return entries;
}

function extractPayload() {
  const entries = extractPayloadEntries();
  const obj = {};
  entries.forEach(([k, v]) => {
    obj[k] = v;
  });
  return [obj];
}

// 11. Code Output with Predefined Variables
async function refreshCodeOutput() {
  const effectivePath = getEffectiveApiPath();
  const endpoint = `${BASE_API_ROOT}${effectivePath}`;
  const payload = extractPayload();
  const payloadJson = JSON.stringify(payload, null, 2);

  let loginVal = "YOUR_LOGIN";
  let passVal = "YOUR_PASSWORD";

  if (includeCredentials) {
    const creds = await chrome.storage.local.get(['api_login', 'api_password']);
    if (creds.api_login) loginVal = creds.api_login;
    if (creds.api_password) passVal = creds.api_password;
  }

  let snippet = '';

  if (currentLang === 'curl') {
    snippet = `YOUR_LOGIN="${loginVal}"
YOUR_PASSWORD="${passVal}"

curl --location --request POST '${endpoint}' \\
--user "$YOUR_LOGIN:$YOUR_PASSWORD" \\
--header 'Content-Type: application/json' \\
--data-raw '${JSON.stringify(payload)}'`;
  } else if (currentLang === 'python') {
    snippet = `YOUR_LOGIN = "${loginVal}"
YOUR_PASSWORD = "${passVal}"

import requests

url = "${endpoint}"
payload = ${JSON.stringify(payload, null, 4)}

response = requests.post(url, json=payload, auth=(YOUR_LOGIN, YOUR_PASSWORD))
print(response.json())`;
  } else if (currentLang === 'nodejs') {
    snippet = `const YOUR_LOGIN = '${loginVal}';
const YOUR_PASSWORD = '${passVal}';

const auth = Buffer.from(\`\${YOUR_LOGIN}:\${YOUR_PASSWORD}\`).toString('base64');

const response = await fetch('${endpoint}', {
  method: 'POST',
  headers: {
    'Authorization': 'Basic ' + auth,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(${payloadJson})
});

const data = await response.json();
console.log(data);`;
  } else if (currentLang === 'php') {
    snippet = `<?php
$YOUR_LOGIN = "${loginVal}";
$YOUR_PASSWORD = "${passVal}";

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, "${endpoint}");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_USERPWD, "$YOUR_LOGIN:$YOUR_PASSWORD");
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_POSTFIELDS, '${JSON.stringify(payload)}');

$response = curl_exec($ch);
curl_close($ch);
echo $response;
?>`;
  } else if (currentLang === 'go') {
    snippet = `package main

import (
\t"bytes"
\t"encoding/base64"
\t"fmt"
\t"io"
\t"net/http"
)

const YOUR_LOGIN = "${loginVal}"
const YOUR_PASSWORD = "${passVal}"

func main() {
\turl := "${endpoint}"
\tpayload := []byte(\`${JSON.stringify(payload)}\`)

\treq, _ := http.NewRequest("POST", url, bytes.NewBuffer(payload))
\treq.Header.Set("Content-Type", "application/json")
\tauth := base64.StdEncoding.EncodeToString([]byte(YOUR_LOGIN + ":" + YOUR_PASSWORD))
\treq.Header.Set("Authorization", "Basic " + auth)

\tclient := &http.Client{}
\tresp, err := client.Do(req)
\tif err != nil {
\t\tpanic(err)
\t}
\tdefer resp.Body.Close()
\tbody, _ := io.ReadAll(resp.Body)
\tfmt.Println(string(body))
}`;
  } else if (currentLang === 'java') {
    snippet = `import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Base64;

public class DataForSeoClient {
    public static final String YOUR_LOGIN = "${loginVal}";
    public static final String YOUR_PASSWORD = "${passVal}";

    public static void main(String[] args) throws Exception {
        String url = "${endpoint}";
        String payload = "${JSON.stringify(payload).replace(/"/g, '\\"')}";
        String auth = Base64.getEncoder().encodeToString((YOUR_LOGIN + ":" + YOUR_PASSWORD).getBytes());

        HttpClient client = HttpClient.newHttpClient();
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Content-Type", "application/json")
                .header("Authorization", "Basic " + auth)
                .POST(HttpRequest.BodyPublishers.ofString(payload))
                .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        System.out.println(response.body());
    }
}`;
  }

  document.getElementById('code-snippet').textContent = snippet;
}

// 12. Execute API Request
async function executeApiCall() {
  const creds = await chrome.storage.local.get(['api_login', 'api_password']);
  if (!creds.api_login || !creds.api_password) {
    openModal('modal-creds');
    return;
  }

  const effectivePath = getEffectiveApiPath();
  const endpoint = `${BASE_API_ROOT}${effectivePath}`;
  const statusEl = document.getElementById('res-status');
  const treeContainer = document.getElementById('view-tree-container');
  const sendBtn = document.getElementById('btn-send-request');
  const sendSpinner = document.getElementById('send-spinner');
  const sendBtnText = document.getElementById('send-btn-text');

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
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + safeBtoa(`${creds.api_login}:${creds.api_password}`),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(extractPayload())
    });

    const json = await res.json();
    currentResponseJson = json;

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
    renderJsonTree(json, treeContainer);

  } catch (err) {
    treeContainer.innerHTML = `<div style="color:#cf222e;padding:16px;">Network / Request Error:<br>${err.message}</div>`;
    statusEl.textContent = 'NETWORK ERR';
    statusEl.className = 'status-tag err';
  } finally {
    sendBtn.disabled = false;
    if (sendSpinner) sendSpinner.classList.add('hidden');
    if (sendBtnText) sendBtnText.textContent = 'Send Request';
  }
}

// Generate Export Filename
function generateExportFilename(nodePath = '', extension = 'json') {
  const rawApi = getEffectiveApiPath() || 'custom_api';
  const cleanApi = rawApi
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .toLowerCase();

  const ext = extension.replace(/^\./, '').toLowerCase();

  if (!nodePath || nodePath === 'root' || nodePath === 'full') {
    return `${cleanApi}.${ext}`;
  }

  const cleanNode = nodePath
    .replace(/\[(\d+)\]/g, '$1')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

  return `${cleanApi}_${cleanNode}.${ext}`;
}

// 13. Recursive JSON Tree Builder (with Copy JSON & Export JSON)
function renderJsonTree(data, container) {
  container.innerHTML = '';
  const rootNode = createTreeNode('root', data, true, 0, '');
  container.appendChild(rootNode);
}

function createTreeNode(key, value, isRoot = false, depth = 0, parentPath = '') {
  const node = document.createElement('div');
  node.className = isRoot ? 'tree-root' : 'tree-node';

  const isObject = value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);
  const currentPath = isRoot ? '' : (parentPath ? `${parentPath}_${key}` : key);

  const row = document.createElement('div');
  row.className = 'tree-row';

  if (isObject) {
    const count = isArray ? value.length : Object.keys(value).length;
    const toggle = document.createElement('span');
    toggle.className = 'tree-toggle';

    const shouldExpand = isRoot;
    toggle.textContent = shouldExpand ? '▼' : '▶';

    const keySpan = document.createElement('span');
    keySpan.className = 'tree-key';
    keySpan.textContent = key;

    const badge = document.createElement('span');
    badge.className = 'tree-badge';
    badge.textContent = isArray ? `[${count}]` : `{${count}}`;

    const actionsGroup = document.createElement('div');
    actionsGroup.className = 'tree-actions-group';

    const tableBtn = document.createElement('button');
    tableBtn.className = 'btn-tree-op btn-tree-table';
    tableBtn.textContent = '📊 Table';
    tableBtn.title = 'Render this node as an interactive Table';
    tableBtn.onclick = (e) => {
      e.stopPropagation();
      openStackModal('table', value, currentPath || key);
    };

    // Copy node JSON
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn-tree-op';
    copyBtn.textContent = 'Copy JSON';
    copyBtn.title = 'Copy raw JSON of this node to clipboard';
    copyBtn.onclick = (e) => {
      e.stopPropagation();
      copyJsonToClipboard(value);
    };

    // Export node JSON
    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn-tree-op';
    exportBtn.textContent = 'Export JSON';
    exportBtn.title = 'Export this raw JSON node for AI analysis';
    exportBtn.onclick = (e) => {
      e.stopPropagation();
      const exportFilename = generateExportFilename(currentPath || key, 'json');
      downloadJsonFile(exportFilename, value);
    };

    actionsGroup.appendChild(tableBtn);
    actionsGroup.appendChild(copyBtn);
    actionsGroup.appendChild(exportBtn);

    row.appendChild(toggle);
    row.appendChild(keySpan);
    row.appendChild(badge);
    row.appendChild(actionsGroup);
    node.appendChild(row);

    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'tree-children';
    childrenContainer.style.display = shouldExpand ? 'block' : 'none';

    if (isArray) {
      value.forEach((item, index) => {
        childrenContainer.appendChild(createTreeNode(`[${index}]`, item, false, depth + 1, currentPath));
      });
    } else {
      Object.entries(value).forEach(([childKey, childVal]) => {
        childrenContainer.appendChild(createTreeNode(childKey, childVal, false, depth + 1, currentPath));
      });
    }

    node.appendChild(childrenContainer);

    toggle.onclick = () => {
      const isHidden = childrenContainer.style.display === 'none';
      childrenContainer.style.display = isHidden ? 'block' : 'none';
      toggle.textContent = isHidden ? '▼' : '▶';
    };
  } else {
    const indentPlaceholder = document.createElement('span');
    indentPlaceholder.className = 'tree-toggle';
    indentPlaceholder.textContent = ' ';

    const keySpan = document.createElement('span');
    keySpan.className = 'tree-key';
    keySpan.textContent = key;

    const sep = document.createElement('span');
    sep.className = 'tree-sep';
    sep.textContent = ': ';

    const valSpan = document.createElement('span');
    if (typeof value === 'string') {
      valSpan.className = 'tree-val-string';
      valSpan.textContent = `"${value}"`;
    } else if (typeof value === 'number') {
      valSpan.className = 'tree-val-number';
      valSpan.textContent = value;
    } else if (typeof value === 'boolean') {
      valSpan.className = 'tree-val-bool';
      valSpan.textContent = value;
    } else {
      valSpan.className = 'tree-val-null';
      valSpan.textContent = 'null';
    }

    row.appendChild(indentPlaceholder);
    row.appendChild(keySpan);
    row.appendChild(sep);
    row.appendChild(valSpan);
    node.appendChild(row);
  }

  return node;
}

// 14. Stack Modal Engine
function renderSmartTableCell(val, fieldName, currentPath = '') {
  if (val === undefined || val === null) {
    return `<span style="color:#94a3b8;font-style:italic;">null</span>`;
  }

  const nodePath = currentPath ? `${currentPath}_${fieldName}` : fieldName;

  if (Array.isArray(val)) {
    if (val.length === 0) return `<span style="color:#94a3b8;">[]</span>`;
    
    const storeKey = 'd_' + Math.random().toString(36).substr(2, 9);
    window._NestedDataStore.set(storeKey, val);

    return `
      <span class="nested-badge badge-tree-trigger" data-action="open-tree" data-store="${storeKey}" data-name="${escapeHtml(fieldName)}" data-path="${escapeHtml(nodePath)}">
        <span>🌳 [${val.length} items]</span>
      </span>
    `;
  }

  if (typeof val === 'object') {
    const keys = Object.keys(val);
    if (keys.length === 0) return `<span style="color:#94a3b8;">{}</span>`;

    const storeKey = 'd_' + Math.random().toString(36).substr(2, 9);
    window._NestedDataStore.set(storeKey, val);

    return `
      <span class="nested-badge badge-tree-trigger" data-action="open-tree" data-store="${storeKey}" data-name="${escapeHtml(fieldName)}" data-path="${escapeHtml(nodePath)}">
        <span>🌳 {${keys.length} fields}</span>
      </span>
    `;
  }

  const str = String(val);
  if (typeof val === 'number') return `<span style="color:var(--tree-number);font-weight:600;">${val}</span>`;
  if (typeof val === 'boolean') return `<span style="color:var(--tree-bool);font-weight:600;">${val}</span>`;

  if (str.length > 50) {
    const storeKey = 'd_' + Math.random().toString(36).substr(2, 9);
    window._NestedDataStore.set(storeKey, str);
    return `
      <span style="color:var(--tree-string);cursor:pointer;" title="Click to view full text in tree" data-action="open-tree" data-store="${storeKey}" data-name="${escapeHtml(fieldName)}" data-path="${escapeHtml(nodePath)}">
        "${escapeHtml(str.substring(0, 46))}..."
      </span>
    `;
  }

  return `<span style="color:var(--tree-string);">"${escapeHtml(str)}"</span>`;
}

function openStackModal(viewMode, nodeData, nodeName = 'node') {
  const root = document.getElementById('nested-modals-root');
  const depth = window.ModalStack.length + 1;
  const zIndex = 2000 + depth * 10;

  const backdrop = document.createElement('div');
  backdrop.className = 'stack-modal-backdrop';
  backdrop.style.zIndex = zIndex;
  backdrop.id = `stack_modal_${depth}`;

  const backBtnText = depth > 1 ? '← Back' : '← Close';
  const modeTitlePrefix = viewMode === 'table' ? '📊 Table' : '🌳 Tree';

  const actionButtonsHtml = viewMode === 'table' ? `
    <button class="btn btn-outline btn-sm action-copy-csv">Copy CSV</button>
    <button class="btn btn-outline btn-sm action-export-csv">Export CSV</button>
  ` : `
    <button class="btn btn-outline btn-sm action-copy-json">Copy JSON</button>
    <button class="btn btn-outline btn-sm action-export-json">Export JSON</button>
  `;

  backdrop.innerHTML = `
    <div class="stack-modal-box">
      <div class="stack-modal-header">
        <div class="stack-head-left">
          <button class="btn-stack-back action-close-top" title="${depth > 1 ? 'Back to previous layer (Esc)' : 'Close (Esc)'}">
            ${backBtnText}
          </button>
          <div class="stack-layer-title">${modeTitlePrefix}: ${escapeHtml(nodeName)}</div>
        </div>
        <div class="stack-head-actions">
          ${actionButtonsHtml}
          <button class="close-x action-close-top" title="Close this layer (Esc)">&times;</button>
        </div>
      </div>
      <div class="stack-modal-body">
        <div class="stack-content-mount"></div>
      </div>
    </div>
  `;

  const mountPoint = backdrop.querySelector('.stack-content-mount');

  if (viewMode === 'table') {
    mountPoint.innerHTML = buildNestedTableHtml(nodeData, nodeName);
    
    mountPoint.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-action="open-tree"]');
      if (trigger) {
        e.stopPropagation();
        const storeKey = trigger.getAttribute('data-store');
        const nextPath = trigger.getAttribute('data-path') || trigger.getAttribute('data-name');
        const targetData = window._NestedDataStore.get(storeKey);
        if (targetData !== undefined) {
          openStackModal('tree', targetData, nextPath);
        }
      }
    });

    backdrop.querySelector('.action-copy-csv').addEventListener('click', () => {
      copyCsvToClipboard(nodeData);
    });

    backdrop.querySelector('.action-export-csv').addEventListener('click', () => {
      const exportCsvFilename = generateExportFilename(nodeName, 'csv');
      exportToCsv(nodeData, exportCsvFilename);
    });

  } else {
    mountPoint.className = 'modal-tree-container';
    renderJsonTree(nodeData, mountPoint);

    backdrop.querySelector('.action-copy-json').addEventListener('click', () => {
      copyJsonToClipboard(nodeData);
    });

    backdrop.querySelector('.action-export-json').addEventListener('click', () => {
      const exportJsonFilename = generateExportFilename(nodeName, 'json');
      downloadJsonFile(exportJsonFilename, nodeData);
    });
  }

  backdrop.querySelectorAll('.action-close-top').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      popModalStack();
    });
  });

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      const topEntry = window.ModalStack[window.ModalStack.length - 1];
      if (topEntry && topEntry.el === backdrop) {
        popModalStack();
      }
    }
  });

  backdrop.querySelector('.stack-modal-box').addEventListener('click', (e) => {
    e.stopPropagation();
  });

  root.appendChild(backdrop);
  document.body.style.overflow = 'hidden';

  window.ModalStack.push({
    el: backdrop,
    title: nodeName,
    data: nodeData
  });
}

function buildNestedTableHtml(rawList, parentTitle) {
  const list = Array.isArray(rawList) ? rawList : [rawList];
  if (list.length === 0) return '<div style="color:#94a3b8;padding:16px;">Empty array []</div>';

  const allHeaders = Array.from(new Set(list.flatMap(obj => {
    return (typeof obj === 'object' && obj !== null) ? Object.keys(obj) : ['value'];
  })));

  let html = `
    <div class="nested-table-wrap">
      <table class="data-grid">
        <thead>
          <tr>
            <th style="width: 48px;">#</th>
            ${allHeaders.map(h => `<th>${escapeHtml(h)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
  `;

  list.forEach((row, rowIdx) => {
    html += `<tr><td style="color:#64748b;font-family:monospace;">${rowIdx + 1}</td>`;
    allHeaders.forEach(col => {
      const val = (typeof row === 'object' && row !== null) ? row[col] : (col === 'value' ? row : undefined);
      const cellPath = `${parentTitle}_${rowIdx}`;
      html += `<td>${renderSmartTableCell(val, col, cellPath)}</td>`;
    });
    html += `</tr>`;
  });

  html += `</tbody></table></div>`;
  return html;
}

function popModalStack() {
  if (window.ModalStack.length === 0) return;
  const top = window.ModalStack.pop();
  if (top && top.el) {
    top.el.remove();
  }
  if (window.ModalStack.length === 0) {
    document.body.style.overflow = '';
  }
}

// 15. Export & Copy Handlers (JSON and CSV)
function copyJsonToClipboard(dataObj) {
  if (dataObj === undefined) return;
  const str = JSON.stringify(dataObj, null, 2);
  navigator.clipboard.writeText(str).then(() => {
    triggerToast('JSON copied to clipboard!');
  }).catch(() => {
    triggerToast('Failed to copy JSON');
  });
}

function generateCsvContent(dataList) {
  if (!dataList) return '';
  const list = Array.isArray(dataList) ? dataList : [dataList];
  if (!list.length) return '';

  const isObjectList = list.some(item => typeof item === 'object' && item !== null);
  const headers = isObjectList 
    ? Array.from(new Set(list.flatMap(obj => (typeof obj === 'object' && obj !== null) ? Object.keys(obj) : ['value'])))
    : ['value'];

  const rows = [headers.join(',')];

  list.forEach(item => {
    const row = headers.map(h => {
      let val;
      if (typeof item === 'object' && item !== null) {
        val = item[h];
      } else {
        val = h === 'value' ? item : '';
      }

      if (val === undefined || val === null) {
        val = '';
      } else if (typeof val === 'object') {
        val = JSON.stringify(val);
      } else {
        val = String(val);
      }
      val = val.replace(/"/g, '""');
      return `"${val}"`;
    });
    rows.push(row.join(','));
  });

  return rows.join('\n');
}

function copyCsvToClipboard(dataList) {
  const csvStr = generateCsvContent(dataList);
  if (!csvStr) {
    triggerToast('No data to copy as CSV');
    return;
  }
  navigator.clipboard.writeText(csvStr).then(() => {
    triggerToast('CSV copied to clipboard!');
  }).catch(() => {
    triggerToast('Failed to copy CSV');
  });
}

function downloadJsonFile(filename, dataObj, successMessage = null) {
  if (dataObj === undefined) return;
  const str = JSON.stringify(dataObj, null, 2);
  const blob = new Blob([str], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  triggerToast(successMessage || `Exported: ${filename}`);
}

function exportToCsv(dataList, fullFilename) {
  const csvContent = generateCsvContent(dataList);
  if (!csvContent) {
    triggerToast('No data to export as CSV');
    return;
  }

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fullFilename;
  a.click();
  URL.revokeObjectURL(url);
  triggerToast(`Exported: ${fullFilename}`);
}

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str);
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// 16. Setup Global Events
function setupGlobalEvents() {
  document.getElementById('btn-send-request').onclick = executeApiCall;

  document.getElementById('btn-add-field').onclick = () => {
    const newRow = addParamRow('', '', 'Custom parameter', true, 'string');
    newRow.querySelector('.field-key-input').focus();
  };

  document.getElementById('entry-custom-api').onclick = () => {
    switchToCustomMode();
  };

  const customInput = document.getElementById('custom-api-input');
  customInput.addEventListener('input', (e) => {
    currentCustomPath = e.target.value.trim();
    refreshCodeOutput();
  });

  // Paste button for custom endpoint
  const btnPasteCustom = document.getElementById('btn-paste-custom-path');
  if (btnPasteCustom) {
    btnPasteCustom.onclick = async () => {
      try {
        const text = await navigator.clipboard.readText();
        const cleaned = cleanEndpointPath(text);
        customInput.value = cleaned;
        currentCustomPath = cleaned;
        refreshCodeOutput();
        triggerToast(`Pasted endpoint: ${cleaned || 'empty'}`);
      } catch (err) {
        triggerToast('Failed to read clipboard');
      }
    };
  }

  const btnRefreshBal = document.getElementById('btn-refresh-top-balance');
  if (btnRefreshBal) {
    btnRefreshBal.onclick = () => syncUserBalance(true);
  }

  // Credentials Modal
  document.getElementById('btn-open-settings').onclick = () => openModal('modal-creds');
  document.getElementById('btn-cancel-creds').onclick = () => closeModal('modal-creds');
  document.getElementById('btn-save-creds').onclick = async () => {
    const login = document.getElementById('cfg-api-login').value.trim();
    const pass = document.getElementById('cfg-api-pass').value.trim();
    if (login && pass) {
      await chrome.storage.local.set({ api_login: login, api_password: pass });
      closeModal('modal-creds');
      refreshCodeOutput();
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

  // Copy & Export Full JSON in Main Response Area
  document.getElementById('btn-copy-full-json').onclick = () => {
    if (currentResponseJson) {
      copyJsonToClipboard(currentResponseJson);
    }
  };

  document.getElementById('btn-export-full-json').onclick = () => {
    if (currentResponseJson) {
      const filename = generateExportFilename('full', 'json');
      downloadJsonFile(filename, currentResponseJson);
    }
  };

  // Param Detail Close
  const closeParamBtn = document.getElementById('btn-close-param-detail');
  if (closeParamBtn) {
    closeParamBtn.onclick = () => closeModal('modal-param-detail');
  }

  // Array / List Modal Handlers
  document.getElementById('btn-close-array-modal').onclick = () => closeModal('modal-array-editor');
  document.getElementById('btn-cancel-array').onclick = () => closeModal('modal-array-editor');

  document.getElementById('btn-add-array-item').onclick = () => {
    const newRow = addArrayItemInputRow('');
    newRow.querySelector('.array-item-input').focus();
  };

  // 批量换行清洗与导入
  const handleBatchImportLines = () => {
    const rawTxt = document.getElementById('array-batch-textarea').value;
    if (!rawTxt) return;

    const lines = rawTxt
      .replace(/\r/g, '')
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (lines.length === 0) return;

    const existingInputs = document.querySelectorAll('#array-items-list .array-item-input');
    if (existingInputs.length === 1 && !existingInputs[0].value.trim()) {
      document.getElementById('array-items-list').innerHTML = '';
    }

    lines.forEach(item => addArrayItemInputRow(item));
    document.getElementById('array-batch-textarea').value = '';
    triggerToast(`Added ${lines.length} items`);
  };

  document.getElementById('btn-batch-import').onclick = handleBatchImportLines;

  document.getElementById('btn-save-array').onclick = () => {
    if (!activeArrayTargetRow) return;
    const items = [];
    document.querySelectorAll('#array-items-list .array-item-input').forEach(input => {
      const v = input.value.trim();
      if (v) items.push(v);
    });

    const hiddenInput = activeArrayTargetRow.querySelector('.field-val-input');
    hiddenInput.value = JSON.stringify(items);
    activeArrayTargetRow.querySelector('.array-preview-txt').textContent = formatArrayPreview(items);

    closeModal('modal-array-editor');
    refreshCodeOutput();
    triggerToast(`Updated list (${items.length} items)`);
  };

  // Code Language Selector
  document.querySelectorAll('.lang-selector .lang-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.lang-selector .lang-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentLang = btn.dataset.lang;
      refreshCodeOutput();
    };
  });

  // Credential Toggle
  document.getElementById('btn-toggle-include-creds').onclick = () => {
    includeCredentials = !includeCredentials;
    const lbl = document.getElementById('lbl-include-creds-status');
    lbl.textContent = includeCredentials ? 'ON' : 'OFF';
    lbl.style.color = includeCredentials ? '#1a7f37' : 'inherit';
    refreshCodeOutput();
    triggerToast(includeCredentials ? 'Real credentials applied to code' : 'Switched to placeholder credentials');
  };

  document.getElementById('btn-copy-code').onclick = () => {
    const code = document.getElementById('code-snippet').textContent;
    navigator.clipboard.writeText(code).then(() => triggerToast('Code copied to clipboard!'));
  };

  // Presets: Trigger Save Preset Modal with Optional Note
  document.getElementById('btn-save-favorite').onclick = () => {
    const noteInput = document.getElementById('input-preset-note');
    if (noteInput) noteInput.value = '';
    openModal('modal-save-preset');
    if (noteInput) noteInput.focus();
  };

  document.getElementById('btn-cancel-save-preset').onclick = () => {
    closeModal('modal-save-preset');
  };


    const doSavePreset = async () => {
	  const apiPath = getEffectiveApiPath();
	  const payloadEntries = extractPayloadEntries();
	  
	  let note = document.getElementById('input-preset-note')?.value.trim() || '';

	  if (!note) {
		if (currentApiItem) {
		  note = Array.isArray(currentApiItem.desc) 
			? currentApiItem.desc.join(' ') 
			: (currentApiItem.desc || currentApiItem.api);
		} else {
		  note = 'Custom API';
		}
	  }

	  const storeKey = 'global_api_presets';
	  const list = (await chrome.storage.local.get([storeKey]))[storeKey] || [];

	  const newPreset = {
		note: note,
		api: apiPath,
		payload: payloadEntries
	  };

	  const getPresetFingerprint = (item) => {
		const api = item.api || '';
		const n = item.note || '';
		const payloadStr = JSON.stringify(item.payload || []);
		return `${api}:::${n}:::${payloadStr}`;
	  };

	  const newFingerprint = getPresetFingerprint(newPreset);
	  const isDuplicate = list.some(item => getPresetFingerprint(item) === newFingerprint);

	  if (isDuplicate) {
		triggerToast('Preset already exists! Failed to save duplicate.');
		return;
	  }

	  list.unshift(newPreset);
	  await chrome.storage.local.set({ [storeKey]: list });
	  closeModal('modal-save-preset');
	  triggerToast(`Preset saved for ${apiPath || 'custom'}!`);
	};

  document.getElementById('btn-confirm-save-preset').onclick = doSavePreset;
  document.getElementById('input-preset-note').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSavePreset();
    }
  });

  // Presets: Open & Close Modal
  document.getElementById('btn-open-favorites').onclick = async () => {
    await renderFavoritesList();
    openModal('modal-favorites');
  };

  document.getElementById('btn-close-fav').onclick = () => closeModal('modal-favorites');

  // Presets: Import & Export Logic
  const storeKey = 'global_api_presets';

  document.getElementById('btn-export-presets').onclick = async () => {
    const list = (await chrome.storage.local.get([storeKey]))[storeKey] || [];
    if (!list.length) {
      triggerToast('No presets to export');
      return;
    }
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadJsonFile(`seo360_backup_${timestamp}.json`, list, `Exported ${list.length} presets`);
  };

  const fileInputEl = document.getElementById('file-import-presets');
  document.getElementById('btn-import-presets').onclick = () => {
    fileInputEl.value = '';
    fileInputEl.click();
  };

  fileInputEl.onchange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    try {
      const existingList = (await chrome.storage.local.get([storeKey]))[storeKey] || [];
      
      const getPresetFingerprint = (item) => {
        const api = item.api || '';
        const note = item.note || '';
        const payloadStr = JSON.stringify(item.payload || []);
        return `${api}:::${note}:::${payloadStr}`;
      };

      // 1. 提取所有导入文件中的数据项（仅支持标准结构）
      const rawImportedItems = [];

      for (const file of files) {
        try {
          const text = await file.text();
          let parsed = JSON.parse(text);

          if (!Array.isArray(parsed)) {
            if (typeof parsed === 'object' && parsed !== null && parsed.payload) {
              parsed = [parsed];
            } else {
              continue;
            }
          }

          parsed.forEach(item => {
            if (item && Array.isArray(item.payload)) {
              rawImportedItems.push({
                note: item.note || '',
                api: item.api || '',
                payload: item.payload
              });
            }
          });
        } catch (fileErr) {
          console.error('Error reading file:', file.name, fileErr);
        }
      }

      if (rawImportedItems.length === 0) {
        triggerToast('No valid presets found in file(s)');
        return;
      }

      // 2. 如果导入的数据是多条，先在导入集自身合并去重
      let uniqueImportedItems = [];
      if (rawImportedItems.length === 1) {
        uniqueImportedItems = rawImportedItems;
      } else {
        const internalFps = new Set();
        rawImportedItems.forEach(item => {
          const fp = getPresetFingerprint(item);
          if (!internalFps.has(fp)) {
            internalFps.add(fp);
            uniqueImportedItems.push(item);
          }
        });
      }

      // 3. 和原有的收藏列表比对去重
      const existingFingerprints = new Set(existingList.map(getPresetFingerprint));
      const itemsToPrepend = uniqueImportedItems.filter(item => {
        const fp = getPresetFingerprint(item);
        return !existingFingerprints.has(fp);
      });

      if (itemsToPrepend.length === 0) {
        triggerToast('Preset(s) already exist, skipped');
        return;
      }

      // 4. 将新数据置顶（放到最上面）并持久化保存
      const updatedList = [...itemsToPrepend, ...existingList];
      await chrome.storage.local.set({ [storeKey]: updatedList });
      await renderFavoritesList();
      triggerToast(`Imported ${itemsToPrepend.length} preset(s) to top (duplicates skipped)`);
    } catch (err) {
      console.error('Import presets error:', err);
      triggerToast('Failed to read presets file');
    }
  };

  const discussBtn = document.getElementById('btn-discuss-toggle');
  const discussMenu = document.getElementById('discuss-menu');
  discussBtn.onclick = (e) => {
    e.stopPropagation();
    discussMenu.classList.toggle('hidden');
  };
  document.addEventListener('click', () => discussMenu.classList.add('hidden'));

  // 优化：左侧 API 搜索过滤
  const apiSearchInput = document.getElementById('api-search');
  if (apiSearchInput) {
    apiSearchInput.addEventListener('input', (e) => {
      // 1. 去除首尾空白并转为小写
      const term = e.target.value.trim().toLowerCase();

      // 2. 遍历所有接口列表卡片
      document.querySelectorAll('#dynamic-api-container .api-card-item').forEach(card => {
        if (!term) {
          card.style.display = ''; // 输入为空时恢复默认显示
          return;
        }

        // 提取卡片内标题、描述和接口 path
        const descText = card.querySelector('.api-card-desc')?.textContent.toLowerCase() || '';
        const subText = card.querySelector('.api-card-sub')?.textContent.toLowerCase() || '';
        const allText = card.textContent.toLowerCase();

        // 3. 只要路径、描述或卡片文本中包含关键词即命中
        const isMatch = subText.includes(term) || descText.includes(term) || allText.includes(term);

        // 匹配成功清空 inline display 恢复原始样式，否则隐藏
        card.style.display = isMatch ? '' : 'none';
      });
    });
  }

  // Esc Key Handler
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (window.ModalStack.length > 0) {
        popModalStack();
      } else {
        closeModal('modal-creds');
        closeModal('modal-favorites');
        closeModal('modal-save-preset');
        closeModal('modal-param-detail');
        closeModal('modal-array-editor');
      }
    }
  });
}

// Render Presets List: 修正标题与路径展示逻辑
async function renderFavoritesList() {
  const storeKey = 'global_api_presets';
  const list = (await chrome.storage.local.get([storeKey]))[storeKey] || [];
  const container = document.getElementById('favorites-list-container');
  container.innerHTML = list.length ? '' : '<p style="color:#666;font-size:13px;">No saved presets found.</p>';

  list.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'fav-row';

    const matchedOfficial = apiRegistry.find(a => a.api === item.api);
    let topTitle = '';

    // 1. 上方标题判断：有备注优先显示备注；无备注时，官方接口显示描述，自定义接口显示 Custom API
    if (item.note && item.note.trim()) {
      topTitle = item.note.trim();
    } else if (matchedOfficial) {
      topTitle = Array.isArray(matchedOfficial.desc) 
        ? matchedOfficial.desc.join(' ') 
        : (matchedOfficial.desc || matchedOfficial.api);
    } else {
      topTitle = 'Custom API';
    }

    // 2. 下方固定显示接口路径
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
      const safeName = topTitle
        .replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_')
        .replace(/^_+|_+$/g, '') || 'preset';
      downloadJsonFile(`${safeName}.json`, [item], `Exported preset: ${safeName}`);
    };

    row.querySelector('.btn-load-fav').onclick = () => {
      if (matchedOfficial) {
        const cards = Array.from(document.querySelectorAll('#dynamic-api-container .api-card-item'));
        const targetCard = cards.find(c => c.textContent.includes(matchedOfficial.api));
        if (targetCard) {
          switchOfficialApi(matchedOfficial, targetCard).then(() => {
            loadPresetPayloadIntoForm(item.payload);
          });
        }
      } else {
        switchToCustomMode(item.api, item.payload);
      }
      closeModal('modal-favorites');
      triggerToast(`Loaded preset for ${item.api}`);
    };

    row.querySelector('.btn-del-fav').onclick = async (e) => {
      e.stopPropagation();
      const updatedList = list.filter((_, i) => i !== idx);
      await chrome.storage.local.set({ [storeKey]: updatedList });
      await renderFavoritesList();
      triggerToast('Preset deleted');
    };

    container.appendChild(row);
  });
}

// 严格按照 payload 顺序载入参数（支持二维数组，同时向下兼容旧格式对象）
async function loadPresetPayloadIntoForm(payloadData) {
  const container = document.getElementById('params-container');
  container.innerHTML = '';

  let entries = [];
  if (Array.isArray(payloadData)) {
    if (payloadData.length > 0 && Array.isArray(payloadData[0])) {
      entries = payloadData; // 新结构: [ ["key", "val"], ... ]
    } else if (payloadData.length > 0 && typeof payloadData[0] === 'object') {
      entries = Object.entries(payloadData[0]); // 兼容历史数据: [ { key: val } ]
    }
  } else if (typeof payloadData === 'object' && payloadData !== null) {
    entries = Object.entries(payloadData);
  }

  for (const [k, v] of entries) {
    const poolDef = await fetchParamDefinition(k) || {};
    const fieldType = poolDef.type || (Array.isArray(v) ? 'array' : 'string');
    addParamRow(k, v, poolDef.description || 'Preset parameter', !poolDef.description, fieldType);
  }
  refreshCodeOutput();
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function triggerToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => t.classList.remove('show'), 1600);
}