document.addEventListener('DOMContentLoaded', () => {

    if (!window.WelcomeManager) {
        console.error('WelcomeManager not found. Make sure welcome.js is loaded before wallpaper.js');
    }
    const wallpaperManager = new WallpaperManager();
});


class WallpaperManager {
    constructor() {

        this.wallpaperOptions = document.querySelectorAll('.wallpaper-option');
        this.uploadInput = document.getElementById('upload-wallpaper');
        this.mainElement = document.querySelector('main');


        this.initializePresetWallpapers();


        this.preloadQueue = new Set();
        this.preloadedImages = new Map();


        this.userWallpapers = [];


        this.activeOption = null;


        this.loadUserWallpapers();


        this.initializeEventListeners();
        this.initialize();


        this.bingWallpapers = [];
        this.initBingWallpapers();
    }


    initializePresetWallpapers() {
        this.presetWallpapers = [
            {
                url: './../images/wallpapers/wallpaper-1.jpg',
                title: 'Foggy Forest'
            },
            {
                url: './../images/wallpapers/wallpaper-2.jpg',
                title: 'Mountain Lake'
            },
            {
                url: './../images/wallpapers/wallpaper-3.jpg',
                title: 'Sunset Beach'
            },
            {
                url: '../images/wallpapers/wallpaper-4.jpg',
                title: 'City Night'
            },
            {
                url: './../images/wallpapers/wallpaper-5.jpg',
                title: 'Aurora'
            },
            {
                url: './../images/wallpapers/wallpaper-6.jpg',
                title: 'Desert Dunes'
            },
            {
                url: './../images/wallpapers/wallpaper-7.jpg',
                title: 'Mountain View'
            },
            {
                url: './../images/wallpapers/wallpaper-8.jpg',
                title: 'Forest Lake'
            },
            {
                url: './../images/wallpapers/wallpaper-9.jpg',
                title: 'Sunset Hills'
            },
            {
                url: './../images/wallpapers/wallpaper-10.jpg',
                title: 'Ocean View'
            }
        ];
    }


    async loadPresetWallpapers() {
        const wallpaperContainer = document.querySelector('.wallpaper-options');
        if (!wallpaperContainer) {
            console.error('Wallpaper container not found');
            return;
        }

        wallpaperContainer.innerHTML = '';


        if (Array.isArray(this.presetWallpapers)) {
            this.presetWallpapers.forEach(preset => {
                const option = this.createWallpaperOption(preset.url, preset.title);
                wallpaperContainer.appendChild(option);
            });
        }


        if (Array.isArray(this.userWallpapers)) {
            this.userWallpapers.forEach(wallpaper => {
                const option = this.createWallpaperOption(
                    wallpaper.url,
                    chrome.i18n.getMessage('uploadedWallpaperBadge'),
                    true
                );
                wallpaperContainer.appendChild(option);
            });
        }
    }

    initialize() {
        this.preloadWallpapers();
        this.loadPresetWallpapers();
        this.initializeWallpaper().then(() => {
            document.documentElement.classList.remove('loading-wallpaper');
        });
    }

    initializeEventListeners() {

        this.uploadInput.addEventListener('change', (event) => this.handleFileUpload(event));


        const resetButton = document.getElementById('reset-wallpaper');
        if (resetButton) {
            resetButton.addEventListener('click', () => this.resetWallpaper());
        }


        window.addEventListener('error', (e) => this.handleImageError(e), true);


        const checkCacheButton = document.getElementById('check-wallpaper-cache');
        if (checkCacheButton) {
            checkCacheButton.addEventListener('click', () => this.checkWallpaperCache());
        }


        document.querySelectorAll('.settings-bg-option').forEach(option => {
            option.addEventListener('click', () => {
                this.handleBackgroundOptionClick(option);
            });
        });


        document.querySelectorAll('.wallpaper-option').forEach(option => {
            option.addEventListener('click', () => {
                this.handleWallpaperOptionClick(option);
            });
        });
    }

    handleBackgroundOptionClick(option) {

        this.clearAllActiveStates();


        option.classList.add('active');
        this.activeOption = option;


        const bgClass = option.getAttribute('data-bg');

        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDarkMode) {

            document.documentElement.className = bgClass;
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.className = bgClass;
        }


        this.clearWallpaper();
        localStorage.setItem('useDefaultBackground', 'true');


        const welcomeElement = document.getElementById('welcome-message');
        if (welcomeElement && window.WelcomeManager) {
            window.WelcomeManager.adjustTextColor(welcomeElement);
        }
    }

    handleWallpaperOptionClick(option) {

        this.clearAllActiveStates();


        option.classList.add('active');
        this.activeOption = option;


        const wallpaperUrl = option.getAttribute('data-wallpaper-url');
        this.setWallpaper(wallpaperUrl);


        document.documentElement.className = '';
        localStorage.removeItem('useDefaultBackground');
    }

    clearAllActiveStates() {

        document.querySelectorAll('.settings-bg-option').forEach(option => {
            option.classList.remove('active');
        });


        document.querySelectorAll('.wallpaper-option').forEach(option => {
            option.classList.remove('active');
        });

        document.querySelectorAll('.bing-wallpaper-item').forEach(option => {
            option.classList.remove('active');
        });
    }


    preloadWallpapers() {
        this.presetWallpapers.forEach(preset => {
            if (!this.preloadedImages.has(preset.url)) {
                const img = new Image();
                img.src = preset.url;
                this.preloadQueue.add(preset.url);

                img.onload = () => {
                    this.preloadedImages.set(preset.url, img);
                    this.preloadQueue.delete(preset.url);
                };
            }
        });
    }


    async initializeWallpaper() {
        const savedWallpaper = localStorage.getItem('originalWallpaper');
        const useDefaultBackground = localStorage.getItem('useDefaultBackground');
        const savedBg = localStorage.getItem('selectedBackground');
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';


        this.clearAllActiveStates();

        if (useDefaultBackground === 'true') {

            const bgClass = savedBg || 'gradient-background-7';
            const bgOption = document.querySelector(`.settings-bg-option[data-bg="${bgClass}"]`);

            if (bgOption) {
                bgOption.classList.add('active');
                this.activeOption = bgOption;

                if (isDarkMode) {
                    document.documentElement.className = bgClass;
                    document.documentElement.setAttribute('data-theme', 'dark');
                } else {
                    document.documentElement.className = bgClass;
                }
            }
            return;
        }

        if (savedWallpaper) {

            let wallpaperOption = document.querySelector(`.wallpaper-option[data-wallpaper-url="${savedWallpaper}"]`);


            if (!wallpaperOption) {

                await this.loadPresetWallpapers();
                wallpaperOption = document.querySelector(`.wallpaper-option[data-wallpaper-url="${savedWallpaper}"]`);
            }

            if (wallpaperOption) {
                wallpaperOption.classList.add('active');
                this.activeOption = wallpaperOption;
            }

            await new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    this.applyWallpaper(savedWallpaper);
                    resolve();
                };
                img.onerror = resolve;
                img.src = savedWallpaper;
            });
        } else {

            const defaultBgOption = document.querySelector('.settings-bg-option[data-bg="gradient-background-7"]');
            if (defaultBgOption) {
                defaultBgOption.classList.add('active');
                this.activeOption = defaultBgOption;
                document.documentElement.className = 'gradient-background-7';
                localStorage.setItem('useDefaultBackground', 'true');
                localStorage.setItem('selectedBackground', 'gradient-background-7');
            }
        }
    }


    resetWallpaper() {

        this.clearAllActiveStates();
        this.clearWallpaper();


        const defaultBgOption = document.querySelector('.settings-bg-option[data-bg="gradient-background-7"]');
        if (defaultBgOption) {
            defaultBgOption.classList.add('active');
            this.activeOption = defaultBgOption;
            document.documentElement.className = 'gradient-background-7';

            localStorage.setItem('useDefaultBackground', 'true');
            localStorage.setItem('selectedBackground', 'gradient-background-7');
        }


        alert(chrome.i18n.getMessage('wallpaperResetSuccess'));
    }


    clearWallpaper() {
        document.body.classList.remove('has-wallpaper');
        document.body.style.removeProperty('--wallpaper-image');
        document.body.style.backgroundImage = 'none';
        this.mainElement.style.backgroundImage = 'none';
    }


    applyWallpaper(url) {
        const backgroundStyle = {
            backgroundImage: `url("${url}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundAttachment: 'fixed'
        };


        requestAnimationFrame(() => {
            document.body.classList.add('has-wallpaper');
            document.body.style.setProperty('--wallpaper-image', `url("${url}")`);
            Object.assign(this.mainElement.style, backgroundStyle);
            Object.assign(document.body.style, backgroundStyle);


            const welcomeElement = document.getElementById('welcome-message');
            if (welcomeElement && window.WelcomeManager) {
                window.WelcomeManager.adjustTextColor(welcomeElement);
            }
        });
    }


    async setWallpaper(url) {
        if (!url) return;

        try {

            if (url.includes('images.unsplash.com')) {
                url = `${url}?q=80&w=1920&auto=format&fit=crop`;
            }

            localStorage.removeItem('useDefaultBackground');
            document.querySelectorAll('.settings-bg-option').forEach(option => {
                option.classList.remove('active');
            });
            document.documentElement.className = '';
            await this.applyAndSaveWallpaper(url);
        } catch (error) {
            console.error('设置壁纸失败:', error);
            alert('设置壁纸失败，请重试');
        }
    }


    async applyAndSaveWallpaper(dataUrl) {
        try {

            this.clearWallpaperCache();


            const compressedDataUrl = await this.compressImageForStorage(dataUrl);

            try {

                localStorage.setItem('originalWallpaper', compressedDataUrl);
            } catch (storageError) {
                console.warn('无法保存壁纸到本地存储，将只保存在内存中');
            }


            if (this.wallpaperCache) {
                URL.revokeObjectURL(this.wallpaperCache.src);
                this.wallpaperCache.src = '';
            }
            this.wallpaperCache = new Image();
            this.wallpaperCache.src = dataUrl;


            await this.applyWallpaper(dataUrl);
        } catch (error) {
            console.error('Failed to save wallpaper:', error);
            alert('设置壁纸失败，请重试');
        }
    }


    async compressImageForStorage(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');


                const maxWidth = 1920;
                const scale = Math.min(1, maxWidth / img.width);
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;

                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);


                const compressedDataUrl = canvas.toDataURL('image/jpeg', 1);


                URL.revokeObjectURL(img.src);
                resolve(compressedDataUrl);
            };
            img.src = dataUrl;
        });
    }


    createThumbnail(dataUrl, callback) {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const thumbnailSize = { width: 200, height: 200 };

            canvas.width = thumbnailSize.width;
            canvas.height = thumbnailSize.height;
            ctx.drawImage(img, 0, 0, thumbnailSize.width, thumbnailSize.height);

            const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.7);
            callback(thumbnailDataUrl);
        };
        img.src = dataUrl;
    }


    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!this.validateFile(file)) return;

        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const compressedDataUrl = await this.compressImageForStorage(e.target.result);


                this.userWallpapers.unshift({
                    url: compressedDataUrl,
                    title: '自定义壁纸',
                    timestamp: Date.now()
                });


                const MAX_WALLPAPERS = 1;
                if (this.userWallpapers.length > MAX_WALLPAPERS) {

                    const removedWallpapers = this.userWallpapers.splice(MAX_WALLPAPERS);

                    removedWallpapers.forEach(wallpaper => {
                        if (wallpaper.url) {
                            URL.revokeObjectURL(wallpaper.url);
                        }
                    });
                }


                try {
                    localStorage.setItem('userWallpapers', JSON.stringify(this.userWallpapers));
                } catch (storageError) {
                    console.warn('Storage quota exceeded, removing oldest wallpapers');

                    while (this.userWallpapers.length > 1) {
                        this.userWallpapers.pop();
                        try {
                            localStorage.setItem('userWallpapers', JSON.stringify(this.userWallpapers));
                            break;
                        } catch (e) {
                            continue;
                        }
                    }
                }

                await this.loadPresetWallpapers();
                await this.setWallpaper(compressedDataUrl);

            } catch (error) {
                console.error('处理壁纸时出错:', error);
                alert('设置壁纸失败，请重试');
            }
        };
        reader.onerror = () => alert(chrome.i18n.getMessage('fileReadError'));
        reader.readAsDataURL(file);

        event.target.value = '';
    }


    validateFile(file) {
        if (!file) return false;
        if (!file.type.startsWith('image/')) {
            alert(chrome.i18n.getMessage('pleaseUploadImage'));
            return false;
        }
        if (file.size > 10 * 1024 * 1024) {
            alert(chrome.i18n.getMessage('imageSizeExceeded'));
            return false;
        }
        return true;
    }


    getMaxScreenResolution() {
        const pixelRatio = window.devicePixelRatio || 1;
        let maxWidth = window.screen.width;
        let maxHeight = window.screen.height;


        const baseWidth = 1920;
        const baseHeight = 1080;


        if (pixelRatio > 1) {
            maxWidth = Math.min(maxWidth * pixelRatio, 2560);
            maxHeight = Math.min(maxHeight * pixelRatio, 1440);
        }


        return {
            width: Math.min(maxWidth, baseWidth),
            height: Math.min(maxHeight, baseHeight)
        };
    }


    calculateMaxFileSize() {
        const maxResolution = this.getMaxScreenResolution();
        const pixelCount = maxResolution.width * maxResolution.height;
        const baseSize = pixelCount * 4;


        let compressionRatio = 0.7;
        if (pixelCount > 1920 * 1080) {
            compressionRatio = 0.5;
        }


        const maxSize = Math.round(baseSize * compressionRatio);
        return Math.min(Math.max(maxSize, 2 * 1024 * 1024), 5 * 1024 * 1024);
    }


    compressAndSetWallpaper(img, maxResolution) {

        const previewCanvas = document.createElement('canvas');
        const previewCtx = previewCanvas.getContext('2d');
        const previewWidth = Math.round(img.width * 0.1);
        const previewHeight = Math.round(img.height * 0.1);

        previewCanvas.width = previewWidth;
        previewCanvas.height = previewHeight;
        previewCtx.drawImage(img, 0, 0, previewWidth, previewHeight);


        const previewUrl = previewCanvas.toDataURL('image/jpeg', 0.5);
        this.setWallpaper(previewUrl);


        requestAnimationFrame(() => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');


            const ratio = Math.min(
                maxResolution.width / img.width,
                maxResolution.height / img.height
            );

            const width = Math.round(img.width * ratio);
            const height = Math.round(img.height * ratio);

            canvas.width = width;
            canvas.height = height;


            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            ctx.drawImage(img, 0, 0, width, height);


            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
            this.setWallpaper(compressedDataUrl);
        });
    }


    handleImageError(e) {
        if (e.target.tagName === 'IMG' || e.target.tagName === 'IMAGE') {
            console.error('图片加载失败:', e.target.src);
            if (e.target.src !== this.defaultWallpaper) {
                this.setWallpaper(this.defaultWallpaper);
            }
        }
    }


    createWallpaperOption(url, title, isUploaded = false) {
        const option = document.createElement('div');
        option.className = 'wallpaper-option';
        option.dataset.wallpaperUrl = url;
        option.title = title;
        option.style.backgroundImage = `url('${url}')`;


        if (isUploaded) {
            const badge = document.createElement('span');
            badge.className = 'uploaded-wallpaper-badge';
            badge.textContent = chrome.i18n.getMessage('uploadedWallpaperBadge');
            option.appendChild(badge);
        }

        option.addEventListener('click', () => {
            document.querySelectorAll('.settings-bg-option').forEach(opt => {
                opt.classList.remove('active');
            });
            document.querySelectorAll('.wallpaper-option').forEach(opt => {
                opt.classList.remove('active');
            });
            option.classList.add('active');
            document.documentElement.className = '';
            this.setWallpaper(url);
        });

        return option;
    }


    generateThumbnail(imageUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();

            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');


                const maxSize = 150;
                const ratio = Math.min(maxSize / img.width, maxSize / img.height);
                const width = Math.round(img.width * ratio);
                const height = Math.round(img.height * ratio);

                canvas.width = width;
                canvas.height = height;
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);


                if (this.supportsWebP()) {
                    resolve(canvas.toDataURL('image/webp', 0.8));
                } else {
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                }
            };

            img.onerror = reject;
            img.src = imageUrl;
        });
    }


    supportsWebP() {
        const canvas = document.createElement('canvas');
        return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    }


    clearWallpaperCache() {
        if (this.wallpaperCache) {
            URL.revokeObjectURL(this.wallpaperCache.src);
            this.wallpaperCache.src = '';
            this.wallpaperCache = null;
        }

        localStorage.removeItem('originalWallpaper');
        localStorage.removeItem('selectedWallpaper');
        localStorage.removeItem('wallpaperThumbnail');


    }


    loadOnlineWallpapers() {
        const container = document.querySelector('.wallpaper-options-container');
        if (!container) return;

        this.onlineWallpapers.forEach(wallpaper => {
            const option = document.createElement('div');
            option.className = 'wallpaper-option';
            option.setAttribute('data-wallpaper-url', wallpaper.url);


            const img = document.createElement('img');
            img.src = wallpaper.thumbnail;
            img.alt = 'Online Wallpaper';
            img.className = 'wallpaper-thumbnail';

            option.appendChild(img);
            container.appendChild(option);


            option.addEventListener('click', () => {
                this.setWallpaper(wallpaper.url);
            });
        });
    }


    loadUserWallpapers() {
        try {
            const savedWallpapers = localStorage.getItem('userWallpapers');
            if (savedWallpapers) {
                this.userWallpapers = JSON.parse(savedWallpapers);

                this.userWallpapers = this.userWallpapers.filter(wallpaper => {
                    return wallpaper && wallpaper.url && typeof wallpaper.url === 'string';
                });

                localStorage.setItem('userWallpapers', JSON.stringify(this.userWallpapers));
            }
        } catch (error) {
            console.error('Failed to load user wallpapers:', error);
            this.userWallpapers = [];
        }
    }


    getLocalizedMessage(key, fallback, substitutions = []) {
        try {
            const message = chrome.i18n.getMessage(key, substitutions);
            return message || fallback;
        } catch (error) {
            console.warn(`Failed to get localized message for key: ${key}`, error);
            if (substitutions.length > 0) {

                return fallback.replace(/\$1/g, substitutions[0])
                    .replace(/\$2/g, substitutions[1]);
            }
            return fallback;
        }
    }


    handleFileRead(e, file, maxSize) {
        const img = new Image();
        img.onload = () => {
            const maxResolution = this.getMaxScreenResolution();

            if (img.width < maxResolution.width || img.height < maxResolution.height) {

                const warning = this.getLocalizedMessage(
                    'lowResolutionWarning',
                    `图片分辨率过低，建议使用至少 ${maxResolution.width}x${maxResolution.height} 的图片以获得最佳效果`,
                    [maxResolution.width.toString(), maxResolution.height.toString()]
                );
                alert(warning);
            }

            try {
                if (file.size <= maxSize) {
                    this.setWallpaper(e.target.result);
                } else {
                    this.compressAndSetWallpaper(img, maxResolution);
                }
            } catch (error) {
                console.error('处理壁纸时出错:', error);
                alert(this.getLocalizedMessage('wallpaperSetError', '设置壁纸失败，请重试'));
            } finally {
                URL.revokeObjectURL(img.src);
            }
        };
        img.onerror = () => {
            alert(this.getLocalizedMessage('imageLoadError', '图片加载失败，请尝试其他图片'));
            URL.revokeObjectURL(img.src);
        };
        img.src = e.target.result;
    }


    async initBingWallpapers() {
        try {

            const wallpapers = await this.fetchBingWallpapers(4);
            this.bingWallpapers = wallpapers;


            this.renderBingWallpapers();
        } catch (error) {
            console.error('Failed to initialize Bing wallpapers:', error);
        }
    }


    async fetchBingWallpapers(count = 4) {
        try {

            const response = await fetch(
                `https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=${count}&mkt=zh-CN&uhd=1&uhdwidth=3840&uhdheight=2160`
            );
            const data = await response.json();

            if (!data?.images) {
                console.error('No images data in response');
                return [];
            }


            return data.images.map(({ url, title, copyright, startdate }) => ({

                url: `https://cn.bing.com${url}`,
                title: title || copyright?.split('(')[0]?.trim() || 'Bing Wallpaper',
                copyright,
                date: startdate
            }));
        } catch (error) {
            console.error('Failed to fetch Bing wallpapers:', error);
            return [];
        }
    }


    renderBingWallpapers() {
        const container = document.querySelector('.bing-wallpapers-grid');
        if (!container) return;

        container.innerHTML = '';
        const fragment = document.createDocumentFragment();
        this.bingWallpapers.forEach(wallpaper =>
            fragment.appendChild(this.createBingWallpaperElement(wallpaper))
        );
        container.appendChild(fragment);
    }


    createBingWallpaperElement(wallpaper) {
        const { url, title, date } = wallpaper;
        const element = document.createElement('div');
        element.className = 'bing-wallpaper-item';
        element.setAttribute('data-wallpaper-url', url);
        element.title = title;
        element.innerHTML = `
            <div class="bing-wallpaper-thumbnail" style="background-image: url(${url})"></div>
            <div class="bing-wallpaper-info">
                <div class="bing-wallpaper-title">${title}</div>
                <div class="bing-wallpaper-date">${this.formatDate(date)}</div>
            </div>
        `;


        element.addEventListener('click', () => {
            this.handleWallpaperOptionClick(element);
        });

        return element;
    }


    formatDate(dateStr) {
        try {
            const year = dateStr.slice(0, 4);
            const month = parseInt(dateStr.slice(4, 6));
            const day = parseInt(dateStr.slice(6, 8));
            const date = new Date(year, month - 1, day);
            return `${month}月${day}日`;
        } catch (error) {
            console.error('Error formatting date:', error);
            return dateStr;
        }
    }
}

function optimizeMemoryUsage(img) {

    const url = img.src;
    img.onload = null;
    img.src = '';
    URL.revokeObjectURL(url);
}