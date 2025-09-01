import { ICONS } from './icons.js';

document.addEventListener('DOMContentLoaded', function () {
  const quickLinksContainer = document.getElementById('quick-links');
  const MAX_DISPLAY = 30;


  let quickLinkToDelete = null;

  function faviconURL(u) {
    const url = new URL(chrome.runtime.getURL("/_favicon/"));
    url.searchParams.set("pageUrl", u);
    url.searchParams.set("size", "32");
    url.searchParams.set("cache", "1");
    return url.toString();
  }

  function getSiteName(title, url) {
    const MAX_WIDTH_EN = 16;
    const MAX_WIDTH_CN = 14;
    const MAX_WIDTH_MIXED = 15;

    function getVisualWidth(str) {
      return str.split('').reduce((width, char) => {
        return width + (/[\u4e00-\u9fa5]/.test(char) ? 2 : 1);
      }, 0);
    }

    function cleanTitle(title) {
      if (!title || typeof title !== 'string') return '';


      title = title.replace(/\s*[-|·:]\s*.*$/, '');


      title = title.replace(/\s*(官方网站|首页|网|网站|官网)$/, '');


      if (title.length > 20) {
        const parts = title.split(/\s+/);
        title = parts.length > 1 ? parts.slice(0, 2).join(' ') : title.substring(0, 20);
      }


      const cleanedTitle = title.trim();
      if (cleanedTitle === '') {
        return title;
      }

      return cleanedTitle;
    }

    title = cleanTitle(title);


    if (title && title.trim() !== '') {
      const visualWidth = getVisualWidth(title);
      const chineseCharCount = (title.match(/[\u4e00-\u9fa5]/g) || []).length;
      const chineseRatio = chineseCharCount / title.length;

      let maxWidth;
      if (chineseRatio === 0) {
        maxWidth = MAX_WIDTH_EN;
      } else if (chineseRatio === 1) {
        maxWidth = MAX_WIDTH_CN;
      } else {
        maxWidth = Math.round(MAX_WIDTH_MIXED * (1 - chineseRatio) + MAX_WIDTH_CN * chineseRatio / 2);
      }

      if (visualWidth > maxWidth) {
        let truncated = '';
        let currentWidth = 0;
        for (let char of title) {
          const charWidth = /[\u4e00-\u9fa5]/.test(char) ? 2 : 1;
          if (currentWidth + charWidth > maxWidth) break;
          truncated += char;
          currentWidth += charWidth;
        }
        return truncated;
      }
      return title;
    } else {

      try {
        const hostname = new URL(url).hostname;
        let name = hostname.replace(/^www\./, '').split('.')[0];
        name = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/-/g, ' ');
        return getVisualWidth(name) > MAX_WIDTH_EN ? name.substring(0, MAX_WIDTH_EN) : name;
      } catch (error) {
        return 'Unknown Site';
      }
    }
  }


  function getFixedShortcuts() {
    return new Promise((resolve) => {
      chrome.storage.sync.get('fixedShortcuts', (result) => {
        resolve(result.fixedShortcuts || []);
      });
    });
  }


  function updateFixedShortcut(updatedSite, oldUrl) {
    chrome.storage.sync.get('fixedShortcuts', (result) => {
      let fixedShortcuts = result.fixedShortcuts || [];
      const index = fixedShortcuts.findIndex(s => s.url === oldUrl);
      if (index !== -1) {
        fixedShortcuts[index] = updatedSite;
      } else {
        fixedShortcuts.push(updatedSite);
      }
      chrome.storage.sync.set({ fixedShortcuts }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving updated shortcut:', chrome.runtime.lastError);
        } else {
          refreshQuickLink(updatedSite, oldUrl);
          setTimeout(() => generateQuickLinks(), 0);
        }
      });
    });
  }


  function sortHistoryItems(items) {
    const now = new Date().getTime();
    const DAY_IN_MS = 24 * 60 * 60 * 1000;
    const MONTH_IN_MS = 30 * DAY_IN_MS;
    const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;


    const domainVisits = new Map();


    items.forEach(item => {
      const url = new URL(item.url);
      const domain = url.hostname;
      const path = url.pathname + url.search;

      if (!domainVisits.has(domain)) {
        domainVisits.set(domain, {
          totalCount: 0,
          lastVisit: 0,
          mainPage: null,
          lastSubPage: null,
          subPages: new Map()
        });
      }

      const domainInfo = domainVisits.get(domain);
      domainInfo.totalCount += 1;

      if (item.lastVisitTime > domainInfo.lastVisit) {
        domainInfo.lastVisit = item.lastVisitTime;
      }


      updateDomainPageInfo(domainInfo, item);
    });


    return Array.from(domainVisits.entries())
      .map(([domain, info]) => {

        const representativeItem = info.mainPage || info.lastSubPage;

        if (!representativeItem) return null;

        return {
          domain: domain,
          url: representativeItem.url,
          title: representativeItem.title,
          lastVisitTime: info.lastVisit,
          visitCount: info.totalCount
        };
      })
      .filter(item => item !== null)
      .sort((a, b) => {
        const recencyScoreA = Math.exp(-(now - a.lastVisitTime) / WEEK_IN_MS);
        const recencyScoreB = Math.exp(-(now - b.lastVisitTime) / WEEK_IN_MS);
        const frequencyScoreA = Math.log(a.visitCount + 1);
        const frequencyScoreB = Math.log(b.visitCount + 1);
        const scoreA = recencyScoreA * 0.45 + frequencyScoreA * 0.55;
        const scoreB = recencyScoreB * 0.45 + frequencyScoreB * 0.55;
        return scoreB - scoreA;
      });
  }


  const quickLinksCache = {
    data: null,
    timestamp: 0,
    maxAge: 5 * 60 * 1000,

    isValid() {
      return this.data && (Date.now() - this.timestamp < this.maxAge);
    },

    set(data) {
      this.data = data;
      this.timestamp = Date.now();

      localStorage.setItem('quickLinksCache', JSON.stringify({
        data: data,
        timestamp: this.timestamp
      }));
    },

    load() {
      const cached = localStorage.getItem('quickLinksCache');
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        this.data = data;
        this.timestamp = timestamp;
      }
    }
  };


  async function generateQuickLinks() {

    if (quickLinksCache.isValid()) {
      renderQuickLinks(quickLinksCache.data);



      updateQuickLinksCache();
      return;
    }


    const fixedShortcuts = await getFixedShortcuts();
    const fixedUrls = new Set(fixedShortcuts.map(shortcut => shortcut.url));
    const blacklist = await getBlacklist();


    const searchEngineDomains = [
      'kimi.moonshot.cn',
      'www.doubao.com',
      'chatgpt.com',
      'felo.ai',
      'metaso.cn',
      'www.google.com',
      'cn.bing.com',
      'www.baidu.com',
      'www.sogou.com',
      'www.so.com',
      'www.360.cn',
      'chrome-extension://amkgcblhdallfcijnbmjahooalabjaao'
    ];


    for (const domain of searchEngineDomains) {
      if (!blacklist.includes(domain)) {
        await addToBlacklist(domain);
      }
    }


    const updatedBlacklist = await getBlacklist();

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    chrome.history.search({
      text: '',
      startTime: oneMonthAgo.getTime(),
      maxResults: 1000
    }, function (historyItems) {
      const sortedHistory = sortHistoryItems(historyItems);
      const uniqueDomains = new Set();
      const allShortcuts = [];


      fixedShortcuts.forEach(shortcut => {
        const domain = new URL(shortcut.url).hostname;
        if (!updatedBlacklist.includes(domain)) {
          allShortcuts.push(shortcut);
          uniqueDomains.add(domain);
        }
      });


      for (const item of sortedHistory) {
        const domain = new URL(item.url).hostname;
        if (!fixedUrls.has(item.url) && !uniqueDomains.has(domain) && allShortcuts.length < MAX_DISPLAY && !updatedBlacklist.includes(domain)) {
          uniqueDomains.add(domain);
          allShortcuts.push({
            name: getSiteName(item.title, item.url),
            url: item.url,
            favicon: faviconURL(item.url),
            fixed: false
          });
        }
      }

      renderQuickLinks(allShortcuts);

    });
  }


  async function updateQuickLinksCache() {
    const fixedShortcuts = await getFixedShortcuts();
    const fixedUrls = new Set(fixedShortcuts.map(shortcut => shortcut.url));
    const blacklist = await getBlacklist();


    const updatedBlacklist = await getBlacklist();

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    chrome.history.search({
      text: '',
      startTime: oneMonthAgo.getTime(),
      maxResults: 1000
    }, function (historyItems) {
      const sortedHistory = sortHistoryItems(historyItems);
      const uniqueDomains = new Set();
      const allShortcuts = [];


      fixedShortcuts.forEach(shortcut => {
        const domain = new URL(shortcut.url).hostname;
        if (!updatedBlacklist.includes(domain)) {
          allShortcuts.push(shortcut);
          uniqueDomains.add(domain);
        }
      });


      for (const item of sortedHistory) {
        const domain = new URL(item.url).hostname;
        if (!fixedUrls.has(item.url) && !uniqueDomains.has(domain) && allShortcuts.length < MAX_DISPLAY && !updatedBlacklist.includes(domain)) {
          uniqueDomains.add(domain);
          allShortcuts.push({
            name: getSiteName(item.title, item.url),
            url: item.url,
            favicon: faviconURL(item.url),
            fixed: false
          });
        }
      }


      quickLinksCache.set(allShortcuts);
    });
  }


  function renderQuickLinks(shortcuts) {
    const quickLinksContainer = document.getElementById('quick-links');
    const fragment = document.createDocumentFragment();

    quickLinksContainer.innerHTML = '';


    shortcuts.forEach((site) => {
      const linkItem = document.createElement('div');
      linkItem.className = 'quick-link-item-container';
      linkItem.dataset.url = site.url;

      const link = document.createElement('a');
      link.href = site.url;
      link.className = 'quick-link-item';


      link.addEventListener('click', async function (event) {
        event.preventDefault();

        try {

          const isSidePanel = window.location.pathname.endsWith('sidepanel.html');

          console.log('[Quick Link Click] Starting...', {
            url: site.url,
            currentUrl: window.location.href,
            isSidePanel: isSidePanel
          });

          if (isSidePanel) {
            console.log('[Quick Link Click] Opening in Side Panel mode');

            chrome.storage.sync.get(['sidepanelOpenInNewTab', 'sidepanelOpenInSidepanel'], (result) => {

              const openInNewTab = result.sidepanelOpenInNewTab !== false;
              const openInSidepanel = result.sidepanelOpenInSidepanel === true;

              console.log('[Quick Link Click] Side Panel settings:', {
                openInNewTab: openInNewTab,
                openInSidepanel: openInSidepanel
              });

              if (openInSidepanel) {

                console.log('[Quick Link Click] Opening in Side Panel iframe');

                try {

                  if (typeof SidePanelManager === 'undefined') {

                    console.log('[Quick Link Click] SidePanelManager not defined, using fallback method');
                    const sidePanelContent = document.getElementById('side-panel-content');
                    const sidePanelIframe = document.getElementById('side-panel-iframe');

                    if (sidePanelContent && sidePanelIframe) {
                      sidePanelContent.style.display = 'block';
                      sidePanelIframe.src = site.url;


                      let backButton = document.querySelector('.back-to-links');
                      if (!backButton) {
                        backButton = document.createElement('div');
                        backButton.className = 'back-to-links';
                        backButton.innerHTML = '<span class="material-icons">arrow_back</span>';
                        document.body.appendChild(backButton);


                        backButton.addEventListener('click', () => {
                          sidePanelContent.style.display = 'none';
                          backButton.style.display = 'none';
                        });
                      }


                      backButton.style.display = 'flex';
                    } else {
                      console.error('[Quick Link Click] Side panel elements not found, falling back to new tab');
                      chrome.tabs.create({
                        url: site.url,
                        active: true
                      });
                    }
                  } else if (window.sidePanelManager) {
                    window.sidePanelManager.loadUrl(site.url);
                  } else {

                    window.sidePanelManager = new SidePanelManager();
                    window.sidePanelManager.loadUrl(site.url);
                  }
                } catch (error) {
                  console.error('[Quick Link Click] Error using SidePanelManager:', error);

                  chrome.tabs.create({
                    url: site.url,
                    active: true
                  });
                }
              } else if (openInNewTab) {

                chrome.tabs.create({
                  url: site.url,
                  active: true
                }).then(tab => {
                  console.log('[Quick Link Click] Tab created successfully:', tab);
                }).catch(error => {
                  console.error('[Quick Link Click] Failed to create tab:', error);
                });
              }
            });
          } else {
            console.log('[Quick Link Click] Opening in Main Window mode');

            chrome.storage.sync.get(['openInNewTab'], (result) => {
              console.log('[Quick Link Click] Settings check:', {
                openInNewTab: result.openInNewTab
              });
              if (result.openInNewTab !== false) {
                window.open(site.url, '_blank');
              } else {
                window.location.href = site.url;
              }
            });
          }
        } catch (error) {
          console.error('[Quick Link Click] Error:', error);
        }
      });

      const img = document.createElement('img');
      img.src = site.favicon;
      img.alt = `${site.name} Favicon`;
      img.loading = 'lazy';
      img.addEventListener('error', function () {
        this.src = '../images/placeholder-icon.svg';
      });

      link.appendChild(img);

      const span = document.createElement('span');
      span.textContent = site.name;

      linkItem.appendChild(link);
      linkItem.appendChild(span);

      linkItem.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e, site);
      });

      fragment.appendChild(linkItem);
    });


    const placeholdersNeeded = Math.min(0, 10 - shortcuts.length);
    if (shortcuts.length < 10) {
      for (let i = 0; i < placeholdersNeeded; i++) {
        const placeholder = document.createElement('div');
        placeholder.className = 'quick-link-placeholder';


        if (i === 0 && shortcuts.length === 0) {
          const hint = document.createElement('span');
          hint.className = 'placeholder-hint';
          hint.textContent = '访问网站将自动添加到这里';
          placeholder.appendChild(hint);
        }

        fragment.appendChild(placeholder);
      }
    }

    quickLinksContainer.appendChild(fragment);

  }


  function showContextMenu(e, site) {
    console.log('=== Quick Link Context Menu ===');
    console.log('Event:', e.type);
    console.log('Site:', site);

    e.preventDefault();

    const existingMenu = document.querySelector('.custom-context-menu');
    if (existingMenu) {
      console.log('Removing existing context menu');
      existingMenu.remove();
    }

    const contextMenu = document.createElement('div');
    contextMenu.className = 'custom-context-menu';

    contextMenu.style.display = 'block';
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;


    const menuItems = [
      { text: chrome.i18n.getMessage("openInNewTab"), icon: 'open_in_new', action: () => window.open(site.url, '_blank') },
      { text: chrome.i18n.getMessage("openInNewWindow"), icon: 'launch', action: () => window.open(site.url, '_blank', 'noopener,noreferrer') },
      { text: chrome.i18n.getMessage("openInIncognito"), icon: 'visibility_off', action: () => openInIncognito(site.url) },
      { text: chrome.i18n.getMessage("editQuickLink"), icon: 'edit', action: () => editQuickLink(site) },
      { text: chrome.i18n.getMessage("deleteQuickLink"), icon: 'delete', action: () => addToBlacklistConfirm(site) },
      { text: chrome.i18n.getMessage("copyLink"), icon: 'content_copy', action: () => copyToClipboard(site.url) },
      { text: chrome.i18n.getMessage("createQRCode"), icon: 'qr_code', action: () => createQRCode(site.url, site.name) }
    ];

    menuItems.forEach((item, index) => {
      const menuItem = document.createElement('div');
      menuItem.className = 'custom-context-menu-item';

      const icon = document.createElement('span');
      icon.className = 'material-icons';
      icon.innerHTML = ICONS[item.icon];

      const text = document.createElement('span');
      text.textContent = item.text;

      menuItem.appendChild(icon);
      menuItem.appendChild(text);

      menuItem.addEventListener('click', () => {
        item.action();
        contextMenu.remove();
      });

      if (index === 3 || index === 5) {
        const divider = document.createElement('div');
        divider.className = 'custom-context-menu-divider';
        contextMenu.appendChild(divider);
      }

      contextMenu.appendChild(menuItem);
    });

    document.body.appendChild(contextMenu);


    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const menuRect = contextMenu.getBoundingClientRect();

    if (e.clientX + menuRect.width > viewportWidth) {
      contextMenu.style.left = `${viewportWidth - menuRect.width}px`;
    }

    if (e.clientY + menuRect.height > viewportHeight) {
      contextMenu.style.top = `${viewportHeight - menuRect.height}px`;
    }


    function closeMenu(e) {
      if (!contextMenu.contains(e.target)) {
        contextMenu.remove();
        document.removeEventListener('click', closeMenu);
      }
    }


    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 0);
  }


  function editQuickLink(site) {
    const editDialog = document.getElementById('edit-dialog');
    const editNameInput = document.getElementById('edit-name');
    const editUrlInput = document.getElementById('edit-url');
    const editDialogTitle = editDialog.querySelector('h2');

    editDialogTitle.textContent = chrome.i18n.getMessage("editDialogTitle");

    editNameInput.value = site.name;
    editUrlInput.value = site.url;

    editDialog.style.display = 'block';

    document.getElementById('edit-form').onsubmit = function (event) {
      event.preventDefault();
      const newName = editNameInput.value.trim();
      const newUrl = editUrlInput.value.trim();

      if (newName && newUrl) {
        const oldUrl = site.url;
        const updatedSite = {
          name: newName,
          url: newUrl,
          favicon: faviconURL(newUrl),
          fixed: true
        };
        updateFixedShortcut(updatedSite, oldUrl);
        editDialog.style.display = 'none';
      }
    };

    document.querySelector('.cancel-button').onclick = function () {
      editDialog.style.display = 'none';
    };

    document.querySelector('.close-button').onclick = function () {
      editDialog.style.display = 'none';
    };
  }


  function refreshQuickLink(site, oldUrl) {
    const linkItem = document.querySelector(`.quick-link-item-container[data-url="${oldUrl}"]`);
    if (linkItem) {
      const link = linkItem.querySelector('a');
      const img = link.querySelector('img');
      const span = linkItem.querySelector('span');

      link.href = site.url;


      const newFaviconUrl = faviconURL(site.url);
      img.src = newFaviconUrl;
      img.alt = `${site.name} Favicon`;


      img.onerror = function () {
        this.src = '../images/placeholder-icon.svg';
      };

      span.textContent = site.name;


      linkItem.dataset.url = site.url;
    } else {
      console.error('Quick link element not found for:', oldUrl);
      generateQuickLinks();
    }
  }


  function addToBlacklistConfirm(site) {
    console.log('=== Quick Link Delete Confirmation ===');
    console.log('Quick link to delete:', site);

    const confirmDialog = document.getElementById('confirm-dialog');
    const confirmMessage = document.getElementById('confirm-dialog-message');
    const confirmDeleteQuickLinkMessage = document.getElementById('confirm-delete-quick-link-message');


    quickLinkToDelete = site;
    console.log('Set quickLinkToDelete:', quickLinkToDelete);


    if (confirmMessage) {
      confirmMessage.style.display = 'none';
    }

    if (confirmDeleteQuickLinkMessage) {
      confirmDeleteQuickLinkMessage.style.display = 'block';
      confirmDeleteQuickLinkMessage.innerHTML = chrome.i18n.getMessage(
        "confirmDeleteQuickLinkMessage",
        `<strong>${site.name}</strong>`
      );
      console.log('Setting quick link delete message:', confirmDeleteQuickLinkMessage.innerHTML);
    } else {
      console.error('Quick link delete message element not found');
    }

    confirmDialog.style.display = 'block';


    document.getElementById('confirm-delete-button').onclick = function () {
      console.log('=== Quick Link Delete Confirmed ===');
      console.log('Current quickLinkToDelete:', quickLinkToDelete);

      if (quickLinkToDelete) {
        const domain = new URL(quickLinkToDelete.url).hostname;
        console.log('Deleting domain:', domain);

        addToBlacklist(domain).then((added) => {
          console.log('Domain added to blacklist:', added);
          if (added) {
            if (quickLinkToDelete.fixed) {
              console.log('Removing fixed shortcut:', quickLinkToDelete);
              chrome.storage.sync.get('fixedShortcuts', (result) => {
                const fixedShortcuts = result.fixedShortcuts || [];
                const updatedShortcuts = fixedShortcuts.filter(s => s.url !== quickLinkToDelete.url);
                chrome.storage.sync.set({ fixedShortcuts: updatedShortcuts });
              });
            }
            generateQuickLinks();

            showToast(chrome.i18n.getMessage('deleteSuccess'));
          }
          confirmDialog.style.display = 'none';

          if (confirmMessage) confirmMessage.style.display = 'block';
          if (confirmDeleteQuickLinkMessage) confirmDeleteQuickLinkMessage.style.display = 'none';
          console.log('Clearing quickLinkToDelete state');
          quickLinkToDelete = null;
        });
      } else {
        console.error('No quick link selected for deletion');
      }
    };


    document.getElementById('cancel-delete-button').onclick = function () {
      console.log('=== Quick Link Delete Cancelled ===');
      console.log('Clearing quickLinkToDelete:', quickLinkToDelete);
      confirmDialog.style.display = 'none';

      if (confirmMessage) confirmMessage.style.display = 'block';
      if (confirmDeleteQuickLinkMessage) confirmDeleteQuickLinkMessage.style.display = 'none';
      quickLinkToDelete = null;
    };
  }


  function openInIncognito(url) {
    chrome.windows.create({ url: url, incognito: true });
  }


  function copyToClipboard(url) {
    try {
      navigator.clipboard.writeText(url).then(() => {

        showToast(chrome.i18n.getMessage("linkCopied"));
      }).catch(() => {

        showToast(chrome.i18n.getMessage("copyLinkFailed"));
      });
    } catch (err) {
      console.error('Copy failed:', err);

      showToast(chrome.i18n.getMessage("copyLinkFailed"));
    }
  }

  function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 3000);
  }


  function createQRCode(url, bookmarkName) {

    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.left = '0';
    modal.style.top = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '1000';

    const qrContainer = document.createElement('div');
    qrContainer.style.backgroundColor = 'white';
    qrContainer.style.padding = '1.5rem 3rem';
    qrContainer.style.width = '320px';
    qrContainer.style.borderRadius = '10px';
    qrContainer.style.display = 'flex';
    qrContainer.style.flexDirection = 'column';
    qrContainer.style.alignItems = 'center';
    qrContainer.style.position = 'relative';


    const closeButton = document.createElement('span');
    closeButton.textContent = '×';
    closeButton.style.position = 'absolute';
    closeButton.style.right = '10px';
    closeButton.style.top = '10px';
    closeButton.style.fontSize = '20px';
    closeButton.style.cursor = 'pointer';
    closeButton.onclick = () => document.body.removeChild(modal);
    qrContainer.appendChild(closeButton);


    const title = document.createElement('h2');
    title.textContent = getLocalizedMessage('scanQRCode');
    title.style.marginBottom = '20px';
    title.style.fontWeight = '600';
    title.style.fontSize = '0.875rem';
    qrContainer.appendChild(title);


    const qrCodeElement = document.createElement('div');
    qrContainer.appendChild(qrCodeElement);


    const urlDisplay = document.createElement('div');
    urlDisplay.textContent = url;
    urlDisplay.style.marginTop = '20px';
    urlDisplay.style.wordBreak = 'break-all';
    urlDisplay.style.maxWidth = '300px';
    urlDisplay.style.textAlign = 'center';
    qrContainer.appendChild(urlDisplay);


    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'space-between';
    buttonContainer.style.width = '100%';
    buttonContainer.style.marginTop = '20px';


    const copyButton = document.createElement('button');
    copyButton.textContent = getLocalizedMessage('copyLink');
    copyButton.onclick = () => {
      navigator.clipboard.writeText(url).then(() => {
        copyButton.textContent = getLocalizedMessage('copied');
        setTimeout(() => copyButton.textContent = getLocalizedMessage('copyLink'), 2000);
      });
    };


    const downloadButton = document.createElement('button');
    downloadButton.textContent = getLocalizedMessage('download');
    downloadButton.onclick = () => {
      setTimeout(() => {
        const canvas = qrCodeElement.querySelector('canvas');
        if (canvas) {
          const link = document.createElement('a');

          const fileName = `${bookmarkName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_qrcode.png`;
          link.download = fileName;
          link.href = canvas.toDataURL('image/png');
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      }, 100);
    };


    [copyButton, downloadButton].forEach(button => {
      button.style.padding = '5px 10px';
      button.style.border = 'none';
      button.style.borderRadius = '5px';
      button.style.cursor = 'pointer';
      button.style.backgroundColor = '#f0f0f0';
      button.style.color = '#333';
      button.style.transition = 'all 0.3s ease';


      button.addEventListener('mouseenter', () => {
        button.style.backgroundColor = '#e0e0e0';
        button.style.color = '#111827';
      });
      button.addEventListener('mouseleave', () => {
        button.style.backgroundColor = '#f0f0f0';
        button.style.color = '#717882';
      });
    });

    buttonContainer.appendChild(copyButton);
    buttonContainer.appendChild(downloadButton);
    qrContainer.appendChild(buttonContainer);

    modal.appendChild(qrContainer);
    document.body.appendChild(modal);


    new QRCode(qrCodeElement, {
      text: url,
      width: 200,
      height: 200
    });


    modal.addEventListener('click', function (event) {
      if (event.target === modal) {
        document.body.removeChild(modal);
      }
    });
  }


  function getBlacklist() {
    return new Promise((resolve) => {
      chrome.storage.sync.get('blacklist', (result) => {
        resolve(result.blacklist || []);
      });
    });
  }


  function addToBlacklist(domain) {
    return new Promise((resolve) => {
      chrome.storage.sync.get('blacklist', (result) => {
        let blacklist = result.blacklist || [];
        if (!blacklist.includes(domain)) {
          blacklist.push(domain);
          chrome.storage.sync.set({ blacklist }, () => {
            resolve(true);
          });
        } else {
          resolve(false);
        }
      });
    });
  }


  generateQuickLinks();


  quickLinksCache.load();


  const MAIN_PAGE_PATTERNS = {
    paths: ['/', '', '/home', '/index', '/main', '/welcome', '/start', '/default', '/dashboard', '/portal', '/explore'],

    queryParams: ['home=true', 'page=home', 'view=home'],

    localizedPaths: ['/zh', '/en', '/zh-CN', '/zh-TW', '/en-US']
  };


  function isMainPageUrl(path, query) {

    if (MAIN_PAGE_PATTERNS.paths.includes(path)) {
      return true;
    }


    if (MAIN_PAGE_PATTERNS.localizedPaths.some(localePath => path.startsWith(localePath))) {
      return true;
    }


    if (query && MAIN_PAGE_PATTERNS.queryParams.some(param => query.includes(param))) {
      return true;
    }


    const pathSegments = path.split('/').filter(Boolean);
    if (pathSegments.length === 1 && pathSegments[0].toLowerCase().includes('home')) {
      return true;
    }

    return false;
  }


  function updateDomainPageInfo(domainInfo, item) {
    const url = new URL(item.url);
    const path = url.pathname;
    const query = url.search;


    if (isMainPageUrl(path, query)) {

      if (!domainInfo.mainPage || item.lastVisitTime > domainInfo.mainPage.lastVisitTime) {
        domainInfo.mainPage = item;
      }
    } else {

      if (!domainInfo.lastSubPage || item.lastVisitTime > domainInfo.lastSubPage.lastVisitTime) {

        if (!domainInfo.subPages) {
          domainInfo.subPages = new Map();
        }

        const existingSubPage = domainInfo.subPages.get(path);
        if (existingSubPage) {
          existingSubPage.visitCount++;
          existingSubPage.lastVisitTime = Math.max(existingSubPage.lastVisitTime, item.lastVisitTime);
        } else {
          domainInfo.subPages.set(path, {
            item: item,
            visitCount: 1,
            lastVisitTime: item.lastVisitTime
          });
        }

        domainInfo.lastSubPage = item;
      }
    }

    return domainInfo;
  }


  function showBackButton() {
    let backButton = document.querySelector('.back-to-links');
    if (!backButton) {
      backButton = document.createElement('button');
      backButton.className = 'back-to-links';
      backButton.innerHTML = '<span class="material-icons">arrow_back</span>';
      backButton.title = '返回快捷链接';
      document.querySelector('main').appendChild(backButton);

      backButton.addEventListener('click', () => {
        const iframe = document.querySelector('.quick-link-iframe');
        if (iframe) {
          iframe.style.display = 'none';
        }
        document.querySelector('.quick-links-wrapper').style.display = 'flex';
        backButton.style.display = 'none';
      });
    }
    backButton.style.display = 'block';
  }
});