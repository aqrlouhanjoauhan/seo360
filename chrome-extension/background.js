chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // 首次安装，自动弹出快速上手教程
    chrome.tabs.create({
      url: chrome.runtime.getURL('tutorial/index.html')
    });
  }
});