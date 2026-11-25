/**
 * ../fetch.js
 * 统一网络请求模块（供 workbench 与 popup 共同复用）
 */
(function (global) {
  'use strict';

  const CONFIG_URLS = {
    BASE_CONFIG: 'https://seo360.pages.dev/dataforseo/base.json',
    API_INDEX: 'https://seo360.pages.dev/dataforseo/api.json',
    COMMON_PARAMS: 'https://seo360.pages.dev/dataforseo/params.json',
    API_DETAIL_PREFIX: 'https://seo360.pages.dev/dataforseo/'
  };

  const DATAFORSEO_API_ROOT = 'https://api.dataforseo.com/v3/';

  // UTF-8 安全的 Base64 编码（用于 Basic Auth）
  function safeBtoa(str) {
    return btoa(
      encodeURIComponent(String(str)).replace(/%([0-9A-F]{2})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      )
    );
  }

  // 安全读取/写入 session 缓存（避免缓存异常阻断主流程）
  async function readSessionCache(keys) {
    try {
      if (global.chrome?.storage?.session) {
        return await global.chrome.storage.session.get(keys);
      }
    } catch (_) {}
    return {};
  }

  async function writeSessionCache(obj) {
    try {
      if (global.chrome?.storage?.session) {
        await global.chrome.storage.session.set(obj);
      }
    } catch (_) {}
  }

  // 清洗 API 路径，提取 v3/ 之后的真实 endpoint 路径
  function cleanEndpointPath(raw) {
    if (!raw || typeof raw !== 'string') return '';
    return raw
      .trim()
      .replace(/^https?:\/\/(api|sandbox)\.dataforseo\.com\/(v3\/)?/i, '')
      .split('?')[0]
      .split('#')[0]
      .replace(/^v3\//i, '')
      .replace(/^\/+|\/+$/g, '');
  }

  // 获取本地保存的 API 凭据
  async function getStoredCredentials() {
    const res = await global.chrome.storage.local.get(['api_login', 'api_password']);
    return {
      api_login: (res.api_login || '').trim(),
      api_password: (res.api_password || '').trim()
    };
  }

  // 拉取远程 JSON 配置文件
  async function fetchRemoteJson(url) {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-cache'
    });

    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`Config request failed (${response.status}): ${rawText.slice(0, 150)}`);
    }

    try {
      return rawText ? JSON.parse(rawText) : {};
    } catch (e) {
      throw new Error(`Invalid JSON from ${url}: ${e.message}`);
    }
  }

  // 统一请求 DataForSEO v3 接口
  async function requestDataForSeo(path, options = {}) {
    const {
      method = 'POST',
      payload = null,
      credentials = null
    } = options;

    const creds = credentials || (await getStoredCredentials());
    if (!creds.api_login || !creds.api_password) {
      const err = new Error('API credentials not configured');
      err.code = 'MISSING_CREDENTIALS';
      throw err;
    }

    const cleanPath = cleanEndpointPath(path);
    if (!cleanPath) {
      const err = new Error('API endpoint path is empty');
      err.code = 'EMPTY_ENDPOINT';
      throw err;
    }

    const upperMethod = String(method || 'POST').toUpperCase();
    const url = `${DATAFORSEO_API_ROOT}${cleanPath}`;

    const headers = {
      'Authorization': 'Basic ' + safeBtoa(`${creds.api_login}:${creds.api_password}`)
    };

    const fetchConfig = {
      method: upperMethod,
      headers,
      credentials: 'omit'
    };

    if (upperMethod !== 'GET' && upperMethod !== 'HEAD') {
      headers['Content-Type'] = 'application/json';
      if (payload !== null && payload !== undefined) {
        fetchConfig.body = typeof payload === 'string' ? payload : JSON.stringify(payload);
      }
    }

    const response = await fetch(url, fetchConfig);
    const rawText = await response.text();

    let parsedJson = null;
    let isJson = false;
    try {
      parsedJson = rawText ? JSON.parse(rawText) : {};
      isJson = true;
    } catch (_) {
      isJson = false;
    }

    if (!response.ok && !isJson) {
      const httpErr = new Error(
        `HTTP ${response.status}${response.statusText ? ' ' + response.statusText : ''}: ${rawText.slice(0, 200)}`
      );
      httpErr.httpStatus = response.status;
      httpErr.rawText = rawText;
      throw httpErr;
    }

    return {
      ok: response.ok && isJson,
      httpStatus: response.status,
      isJson,
      data: isJson ? parsedJson : { raw: rawText }
    };
  }

  // 查询账户余额（workbench 与 popup 共用）
  async function fetchUserBalance(credentials = null) {
    const result = await requestDataForSeo('appendix/user_data', {
      method: 'GET',
      credentials
    });

    const taskRes = result.data?.tasks?.[0]?.result?.[0];
    if (taskRes && taskRes.money && taskRes.money.balance !== undefined) {
      const balance = String(taskRes.money.balance);
      await writeSessionCache({ cached_user_balance: balance });
      return { balance, raw: result.data };
    }

    return { balance: null, raw: result.data };
  }

  // 调用业务接口（POST）
  async function callEndpoint(path, payload, credentials = null) {
    return await requestDataForSeo(path, {
      method: 'POST',
      payload,
      credentials
    });
  }

  global.Seo360Api = {
    CONFIG_URLS,
    DATAFORSEO_API_ROOT,
    safeBtoa,
    cleanEndpointPath,
    getStoredCredentials,
    readSessionCache,
    writeSessionCache,
    fetchRemoteJson,
    requestDataForSeo,
    fetchUserBalance,
    callEndpoint
  };
})(typeof window !== 'undefined' ? window : globalThis);