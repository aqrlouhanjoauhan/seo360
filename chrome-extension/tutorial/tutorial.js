const BASE_CONFIG_URL = 'https://seo360.pages.dev/dataforseo/base.json';
const YOUTUBE_TUTORIAL_URL = 'https://www.youtube.com/watch?v=VWBR6FRwKdw';

document.addEventListener('DOMContentLoaded', () => {
  const portalLink = document.getElementById('btn-portal-action');

  const applyReferralUrl = (url) => {
    if (portalLink && url) {
      portalLink.href = url;
    }
  };

  // 1. 读取 session 缓存（同时兼容主控制台的 cached_base_config）
  chrome.storage.session.get(['cached_referral_url', 'cached_base_config'], (res) => {
    const cachedUrl = res.cached_referral_url || res.cached_base_config?.affiliate_url;
    if (cachedUrl) {
      applyReferralUrl(cachedUrl);
    } else {
      // 尚未缓存时拉取 base.json 并动态更新 <a> 标签的 href
      fetch(BASE_CONFIG_URL)
        .then(response => response.json())
        .then(data => {
          const remoteUrl = data.dataforseo || data.affiliate_url;
          if (remoteUrl) {
            applyReferralUrl(remoteUrl);
            chrome.storage.session.set({ cached_referral_url: remoteUrl });
          }
        })
        .catch(err => {
          console.error('Failed to fetch base.json:', err);
        });
    }
  });

  // 2. 步骤 2：截图点击放大 (Lightbox 模态查看)
  const imgTrigger = document.getElementById('img-trigger');
  const lightboxModal = document.getElementById('lightbox-modal');
  const btnCloseLightbox = document.getElementById('btn-close-lightbox');

  if (imgTrigger && lightboxModal) {
    imgTrigger.onclick = () => {
      lightboxModal.classList.remove('hidden');
    };

    const closeLightbox = () => lightboxModal.classList.add('hidden');
    if (btnCloseLightbox) btnCloseLightbox.onclick = closeLightbox;
    const backdrop = lightboxModal.querySelector('.lightbox-backdrop');
    if (backdrop) backdrop.onclick = closeLightbox;
  }

  // 3. 步骤 3：直达控制台
  const openConsoleBtn = document.getElementById('btn-open-console');
  if (openConsoleBtn) {
    openConsoleBtn.onclick = () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('workbench/index.html') });
    };
  }

  // 4. 备用视频直达 YouTube
  const videoCard = document.getElementById('video-card-link');
  if (videoCard) {
    videoCard.onclick = () => {
      chrome.tabs.create({ url: YOUTUBE_TUTORIAL_URL });
    };
  }
});