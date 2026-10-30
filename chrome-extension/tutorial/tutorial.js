const BASE_CONFIG_URL = 'https://seo360.pages.dev/dataforseo/base.json';
const YOUTUBE_TUTORIAL_URL = 'https://www.youtube.com/watch?v=VWBR6FRwKdw';
let referralUrl = '';

document.addEventListener('DOMContentLoaded', () => {
  // 1. 读取 session 级临时缓存（关闭浏览器自动清空）
  chrome.storage.session.get(['cached_referral_url'], (res) => {
    if (res.cached_referral_url) {
      referralUrl = res.cached_referral_url;
    } else {
      // 本次浏览器会话尚未缓存，拉取并写入 session
      fetch(BASE_CONFIG_URL)
        .then(response => response.json())
        .then(data => {
          const remoteUrl = data.dataforseo || data.affiliate_url;
          if (remoteUrl) {
            referralUrl = remoteUrl;
            chrome.storage.session.set({ cached_referral_url: remoteUrl });
          }
        })
        .catch(err => {
          console.error('Failed to fetch base.json:', err);
        });
    }
  });

  // 2. 步骤 1：直达 DataForSEO
  document.getElementById('btn-portal-action').onclick = () => {
    if (referralUrl) {
      chrome.tabs.create({ url: referralUrl });
    } else {
      alert('Loading configuration, please try again in a moment...');
    }
  };

  // 3. 步骤 2：截图点击放大 (Lightbox 模态查看)
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

  // 4. 步骤 3：直达控制台
  document.getElementById('btn-open-console').onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('workbench/index.html') });
  };

  // 5. 备用视频直达 YouTube
  const videoCard = document.getElementById('video-card-link');
  if (videoCard) {
    videoCard.onclick = () => {
      chrome.tabs.create({ url: YOUTUBE_TUTORIAL_URL });
    };
  }
});