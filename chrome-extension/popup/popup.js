/**
 * popup.js
 * 扩展弹窗交互逻辑（复用 ../fetch.js 中的 Seo360Api）
 */
(function () {
  'use strict';

  let toastTimer = null;

  document.addEventListener('DOMContentLoaded', async () => {
    bindPopupEvents();
    await hydrateCachedBalance();
    await fetchBalance(true);
  });

  function bindPopupEvents() {
    const refreshBtn = document.getElementById('btn-refresh-balance');
    if (refreshBtn) {
      refreshBtn.onclick = () => fetchBalance(true);
    }

    const openWorkbenchBtn = document.getElementById('btn-open-workbench');
    if (openWorkbenchBtn) {
      openWorkbenchBtn.onclick = () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('workbench/index.html') });
      };
    }

	//废弃功能
	const copyUrlBtn = document.getElementById('btn-copy-tab-url');
    if (copyUrlBtn) {
      copyUrlBtn.onclick = async () => {
        try {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          const url = tabs?.[0]?.url;
          if (!url) {
            showToast('No active tab URL');
            return;
          }
          await navigator.clipboard.writeText(url);
          showToast('URL Copied!');
        } catch (err) {
          console.error('Copy URL failed:', err);
          showToast('Copy failed');
        }
      };
    }

	const openMcpBtn = document.getElementById('btn-mcp');
    if (openMcpBtn) {
      openMcpBtn.onclick = () => {
        chrome.tabs.create({ url: window.open('https://www.npmjs.com/package/seo360-mcp/') });
      };
    }

    const openAIBtn = document.getElementById('btn-open-ai');
    if (openAIBtn) {
      openAIBtn.onclick = () => {
        chrome.tabs.create({ url: window.open('https://chat.dataforseo.com/') });
      };
    }
  }

  function showToast(text) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = text;
    t.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.add('hidden');
      toastTimer = null;
    }, 1500);
  }

  // 优先展示缓存余额，提升弹窗打开速度
  async function hydrateCachedBalance() {
    const balanceEl = document.getElementById('account-balance');
    const emailEl = document.getElementById('account-email');
    if (!balanceEl || !emailEl || !window.Seo360Api) return;

    try {
      const [creds, sessionCache] = await Promise.all([
        window.Seo360Api.getStoredCredentials(),
        window.Seo360Api.readSessionCache(['cached_user_balance'])
      ]);

      if (creds.api_login) {
        emailEl.textContent = creds.api_login;
      }
      if (sessionCache.cached_user_balance !== undefined && creds.api_login && creds.api_password) {
        balanceEl.textContent = String(sessionCache.cached_user_balance);
      }
    } catch (_) {}
  }

  // 复用 Seo360Api 查询并刷新账户余额
  async function fetchBalance(showSpinner = false) {
    const balanceEl = document.getElementById('account-balance');
    const emailEl = document.getElementById('account-email');
    const spinnerEl = document.getElementById('balance-spinner');

    if (!window.Seo360Api) {
      console.error('Seo360Api not loaded. Check script order in popup.html.');
      if (balanceEl) balanceEl.textContent = '--.----';
      return;
    }

    if (showSpinner && spinnerEl) spinnerEl.classList.remove('hidden');

    let creds;
    try {
      creds = await window.Seo360Api.getStoredCredentials();
    } catch (e) {
      console.error('Read credentials failed:', e);
      if (spinnerEl) spinnerEl.classList.add('hidden');
      return;
    }

    if (!creds.api_login || !creds.api_password) {
      if (balanceEl) balanceEl.textContent = '0.00';
      if (emailEl) emailEl.textContent = 'No credentials configured';
      if (spinnerEl) spinnerEl.classList.add('hidden');
      return;
    }

    if (emailEl) emailEl.textContent = creds.api_login;

    try {
      const { balance } = await window.Seo360Api.fetchUserBalance(creds);
      if (balanceEl) {
        balanceEl.textContent = balance !== null ? balance : '--.----';
      }
    } catch (err) {
      console.error('Fetch balance failed:', err);
      if (balanceEl) balanceEl.textContent = '--.----';
    } finally {
      if (spinnerEl) spinnerEl.classList.add('hidden');
    }
  }
})();