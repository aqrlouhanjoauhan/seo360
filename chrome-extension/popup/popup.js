document.addEventListener('DOMContentLoaded', () => {
  fetchBalance(true);

  document.getElementById('btn-refresh-balance').onclick = () => {
    fetchBalance(true);
  };

  document.getElementById('btn-open-workbench').onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('workbench/index.html') });
  };

  document.getElementById('btn-copy-tab-url').onclick = async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0] && tabs[0].url) {
      navigator.clipboard.writeText(tabs[0].url).then(() => {
        showToast('URL Copied!');
      });
    }
  };

  document.getElementById('btn-open-tutorial').onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('tutorial/index.html') });
  };
});

function safeBtoa(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
    return String.fromCharCode('0x' + p1);
  }));
}

function showToast(text) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 1500);
}

async function fetchBalance(showSpinner = false) {
  const balanceEl = document.getElementById('account-balance');
  const emailEl = document.getElementById('account-email');
  const spinnerEl = document.getElementById('balance-spinner');

  if (showSpinner && spinnerEl) spinnerEl.classList.remove('hidden');

  let creds;
  try {
    creds = await chrome.storage.local.get(['api_login', 'api_password']);
  } catch (e) {
    if (spinnerEl) spinnerEl.classList.add('hidden');
    return;
  }

  if (!creds || !creds.api_login || !creds.api_password) {
    balanceEl.textContent = '0.00';
    emailEl.textContent = 'No credentials configured';
    if (spinnerEl) spinnerEl.classList.add('hidden');
    return;
  }

  emailEl.textContent = creds.api_login;

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
      const balanceVal = String(taskRes.money.balance !== undefined ? taskRes.money.balance : 0);
      balanceEl.textContent = balanceVal;
      chrome.storage.session.set({ cached_user_balance: balanceVal });
    } else {
      balanceEl.textContent = '--.----';
    }
  } catch (err) {
    console.error('Fetch balance failed:', err);
    balanceEl.textContent = '--.----';
  } finally {
    if (spinnerEl) spinnerEl.classList.add('hidden');
  }
}