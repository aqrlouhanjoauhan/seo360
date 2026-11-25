/**
 * response.js
 * 响应 JSON 懒加载树形渲染、嵌套表格弹窗（Stack Modal）与全量内存销毁模块
 */
(function (global) {
  'use strict';

  global.ModalStack = [];
  global._NestedDataStore = new Map();

  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str);
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 生成导出文件名
  function generateExportFilename(nodePath = '', extension = 'json') {
    const rawApi =
      (typeof global.getEffectiveApiPath === 'function' ? global.getEffectiveApiPath() : '') || 'custom_api';
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

  // 渲染根节点 JSON 树（先销毁旧树 DOM，再按需懒渲染首层）
  function renderJsonTree(data, container) {
    if (!container) return;
    container.innerHTML = '';
    const rootNode = createTreeNode('root', data, true, 0, '');
    container.appendChild(rootNode);
  }

  // 填充某个对象/数组节点的直接子级（仅在展开时调用）
  function populateChildren(childrenContainer, value, depth, currentPath) {
    const frag = document.createDocumentFragment();
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        frag.appendChild(createTreeNode(`[${i}]`, value[i], false, depth + 1, currentPath));
      }
    } else {
      const entries = Object.entries(value);
      for (let i = 0; i < entries.length; i++) {
        const [childKey, childVal] = entries[i];
        frag.appendChild(createTreeNode(childKey, childVal, false, depth + 1, currentPath));
      }
    }
    childrenContainer.appendChild(frag);
  }

  function createTreeNode(key, value, isRoot = false, depth = 0, parentPath = '') {
    const node = document.createElement('div');
    node.className = isRoot ? 'tree-root' : 'tree-node';

    const isObject = value !== null && typeof value === 'object';
    const isArray = Array.isArray(value);
    const currentPath = isRoot ? '' : parentPath ? `${parentPath}_${key}` : key;

    const row = document.createElement('div');
    row.className = 'tree-row';

    if (isObject) {
      const count = isArray ? value.length : Object.keys(value).length;
      const toggle = document.createElement('span');
      toggle.className = 'tree-toggle';

      let isExpanded = isRoot;
      toggle.textContent = isExpanded ? '▼' : '▶';

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

      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn-tree-op';
      copyBtn.textContent = 'Copy JSON';
      copyBtn.title = 'Copy raw JSON of this node to clipboard';
      copyBtn.onclick = (e) => {
        e.stopPropagation();
        copyJsonToClipboard(value);
      };

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

      // 仅根节点默认渲染第一层；其余折叠节点完全不生成子 DOM
      if (isExpanded && count > 0) {
        childrenContainer.style.display = 'block';
        populateChildren(childrenContainer, value, depth, currentPath);
      } else {
        childrenContainer.style.display = 'none';
      }

      node.appendChild(childrenContainer);

      toggle.onclick = () => {
        if (count === 0) return;
        isExpanded = !isExpanded;
        if (isExpanded) {
          // 展开时才懒加载子级 DOM
          childrenContainer.innerHTML = '';
          populateChildren(childrenContainer, value, depth, currentPath);
          childrenContainer.style.display = 'block';
          toggle.textContent = '▼';
        } else {
          // 收起时立即销毁子级 DOM，释放内存
          childrenContainer.style.display = 'none';
          childrenContainer.innerHTML = '';
          toggle.textContent = '▶';
        }
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

  // 智能单元格渲染
  function renderSmartTableCell(val, fieldName, currentPath = '') {
    if (val === undefined || val === null) {
      return `<span style="color:#94a3b8;font-style:italic;">null</span>`;
    }

    const nodePath = currentPath ? `${currentPath}_${fieldName}` : fieldName;

    if (Array.isArray(val)) {
      if (val.length === 0) return `<span style="color:#94a3b8;">[]</span>`;

      const storeKey = 'd_' + Math.random().toString(36).slice(2, 11);
      global._NestedDataStore.set(storeKey, val);

      return `
        <span class="nested-badge badge-tree-trigger" data-action="open-tree" data-store="${storeKey}" data-name="${escapeHtml(fieldName)}" data-path="${escapeHtml(nodePath)}">
          <span>🌳 [${val.length} items]</span>
        </span>
      `;
    }

    if (typeof val === 'object') {
      const keys = Object.keys(val);
      if (keys.length === 0) return `<span style="color:#94a3b8;">{}</span>`;

      const storeKey = 'd_' + Math.random().toString(36).slice(2, 11);
      global._NestedDataStore.set(storeKey, val);

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
      const storeKey = 'd_' + Math.random().toString(36).slice(2, 11);
      global._NestedDataStore.set(storeKey, str);
      return `
        <span style="color:var(--tree-string);cursor:pointer;" title="Click to view full text in tree" data-action="open-tree" data-store="${storeKey}" data-name="${escapeHtml(fieldName)}" data-path="${escapeHtml(nodePath)}">
          "${escapeHtml(str.substring(0, 46))}..."
        </span>
      `;
    }

    return `<span style="color:var(--tree-string);">"${escapeHtml(str)}"</span>`;
  }

  // 打开多层栈弹窗（Table / Tree）
  function openStackModal(viewMode, nodeData, nodeName = 'node') {
    const root = document.getElementById('nested-modals-root');
    const depth = global.ModalStack.length + 1;
    const zIndex = 2000 + depth * 10;

    const backdrop = document.createElement('div');
    backdrop.className = 'stack-modal-backdrop';
    backdrop.style.zIndex = zIndex;
    backdrop.id = `stack_modal_${depth}`;

    const backBtnText = depth > 1 ? '← Back' : '← Close';
    const modeTitlePrefix = viewMode === 'table' ? '📊 Table' : '🌳 Tree';

    const actionButtonsHtml =
      viewMode === 'table'
        ? `
          <button class="btn btn-outline btn-sm action-copy-csv">Copy CSV</button>
          <button class="btn btn-outline btn-sm action-export-csv">Export CSV</button>
        `
        : `
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
          const targetData = global._NestedDataStore.get(storeKey);
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
        const topEntry = global.ModalStack[global.ModalStack.length - 1];
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

    global.ModalStack.push({
      el: backdrop,
      title: nodeName,
      data: nodeData
    });
  }

  function buildNestedTableHtml(rawList, parentTitle) {
    const list = Array.isArray(rawList) ? rawList : [rawList];
    if (list.length === 0) return '<div style="color:#94a3b8;padding:16px;">Empty array []</div>';

    const allHeaders = Array.from(
      new Set(
        list.flatMap(obj => (typeof obj === 'object' && obj !== null ? Object.keys(obj) : ['value']))
      )
    );

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
        const val = typeof row === 'object' && row !== null ? row[col] : col === 'value' ? row : undefined;
        const cellPath = `${parentTitle}_${rowIdx}`;
        html += `<td>${renderSmartTableCell(val, col, cellPath)}</td>`;
      });
      html += `</tr>`;
    });

    html += `</tbody></table></div>`;
    return html;
  }

  function popModalStack() {
    if (global.ModalStack.length === 0) return;
    const top = global.ModalStack.pop();
    if (top) {
      if (top.el) {
        top.el.innerHTML = '';
        top.el.remove();
      }
      top.el = null;
      top.data = null;
    }
    if (global.ModalStack.length === 0) {
      document.body.style.overflow = '';
      global._NestedDataStore.clear();
    }
  }

  // 彻底销毁所有响应树 DOM、弹窗栈与缓存数据（重新请求 / 切换接口 / 关闭页面时调用）
  function destroyAll() {
    while (global.ModalStack.length > 0) {
      popModalStack();
    }
    global._NestedDataStore.clear();

    const modalsRoot = document.getElementById('nested-modals-root');
    if (modalsRoot) {
      modalsRoot.innerHTML = '';
    }

    const treeContainer = document.getElementById('view-tree-container');
    if (treeContainer) {
      treeContainer.innerHTML = '';
    }

    document.body.style.overflow = '';
  }

  // JSON & CSV 导出/复制工具
  function copyJsonToClipboard(dataObj) {
    if (dataObj === undefined) return;
    const str = JSON.stringify(dataObj, null, 2);
    navigator.clipboard
      .writeText(str)
      .then(() => global.triggerToast?.('JSON copied to clipboard!'))
      .catch(() => global.triggerToast?.('Failed to copy JSON'));
  }

  function generateCsvContent(dataList) {
    if (!dataList) return '';
    const list = Array.isArray(dataList) ? dataList : [dataList];
    if (!list.length) return '';

    const isObjectList = list.some(item => typeof item === 'object' && item !== null);
    const headers = isObjectList
      ? Array.from(new Set(list.flatMap(obj => (typeof obj === 'object' && obj !== null ? Object.keys(obj) : ['value']))))
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
      global.triggerToast?.('No data to copy as CSV');
      return;
    }
    navigator.clipboard
      .writeText(csvStr)
      .then(() => global.triggerToast?.('CSV copied to clipboard!'))
      .catch(() => global.triggerToast?.('Failed to copy CSV'));
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
    global.triggerToast?.(successMessage || `Exported: ${filename}`);
  }

  function exportToCsv(dataList, fullFilename) {
    const csvContent = generateCsvContent(dataList);
    if (!csvContent) {
      global.triggerToast?.('No data to export as CSV');
      return;
    }

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fullFilename;
    a.click();
    URL.revokeObjectURL(url);
    global.triggerToast?.(`Exported: ${fullFilename}`);
  }

  global.Seo360Response = {
    generateExportFilename,
    renderJsonTree,
    openStackModal,
    popModalStack,
    destroyAll,
    copyJsonToClipboard,
    copyCsvToClipboard,
    downloadJsonFile,
    exportToCsv
  };
})(window);