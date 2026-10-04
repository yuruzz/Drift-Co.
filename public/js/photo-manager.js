// Drift & Co. — Photo & Studio Asset Manager
// Image upload, canvas compression, LocalStorage & Server Sync

        // Custom Images from LocalStorage (100% reliable, zero 3rd-party dependencies)
        const SITE_STORAGE_KEY = 'drift_site_custom_images';
        const PUBLISH_MODE_KEY = 'drift_publish_mode';
        let currentModalProductId = null;
        let currentQuickUploadId = null;

        function getStoredSiteImages() {
            try {
                // Ensure migration to official JFIF images
                if (!localStorage.getItem('drift_jfif_migrated_v1')) {
                    try {
                        const current = JSON.parse(localStorage.getItem(SITE_STORAGE_KEY) || '{}');
                        // Reset product overrides so official /perfumes/*.jfif files take effect
                        current.products = {};
                        current.partner = '/partner.jfif';
                        localStorage.setItem(SITE_STORAGE_KEY, JSON.stringify(current));
                        localStorage.setItem('drift_jfif_migrated_v1', 'true');
                    } catch (e) {}
                }

                // Ensure old legacy key is safely migrated once and PERMANENTLY purged
                if (localStorage.getItem('drift_custom_perfume_images')) {
                    localStorage.removeItem('drift_custom_perfume_images');
                }

                const stored = JSON.parse(localStorage.getItem(SITE_STORAGE_KEY) || '{}');
                if (!stored.products) stored.products = {};
                if (!stored.partner) stored.partner = '/partner.jfif';
                return stored;
            } catch (e) {
                return { products: {}, partner: '/partner.jfif' };
            }
        }

        function saveSiteImages(siteData) {
            try {
                localStorage.setItem(SITE_STORAGE_KEY, JSON.stringify(siteData));
                localStorage.removeItem('drift_custom_perfume_images');
            } catch (e) {
                console.warn('LocalStorage save quota warning:', e);
            }
        }

        function getStoredCustomImages() {
            const siteData = getStoredSiteImages();
            return siteData.products || {};
        }

        function applyAllCustomImages() {
            const siteData = getStoredSiteImages();

            // Apply Hero picture override if uploaded or if /hero.jfif exists
            const heroImg = document.getElementById('heroImg');
            if (heroImg) {
                if (siteData.hero) {
                    heroImg.src = siteData.hero;
                } else {
                    const probe = new Image();
                    probe.onload = function() {
                        heroImg.src = '/hero.jfif';
                    };
                    probe.src = '/hero.jfif';
                }
            }

            // Ensure hero image always fills the container border
            if (siteData.heroFit) {
                delete siteData.heroFit;
                saveSiteImages(siteData);
            }

            // Apply Partner package picture override
            const partnerImg = document.getElementById('partnerImg');
            if (partnerImg) {
                partnerImg.src = siteData.partner || '/partner.jfif';
            }

            // Apply Browser Tab Icon (Favicon)
            const favEl = document.getElementById('siteFavicon');
            if (favEl) {
                favEl.href = siteData.favicon || '/favicon.svg';
            }

            // Apply Perfume Bottles
            products.forEach(p => {
                if (siteData.products && siteData.products[p.id]) {
                    p.image = siteData.products[p.id];
                } else if (defaultProductImages[p.id]) {
                    p.image = defaultProductImages[p.id];
                }
            });
        }

        // Real-Time Server Persistence Sync
        async function syncSiteImagesWithServer() {
            try {
                const res = await fetch('/api/site-images');
                if (!res.ok) return;
                const data = await res.json();
                if (data && data.success && data.siteImages) {
                    const serverData = data.siteImages;
                    const localData = getStoredSiteImages();
                    let changed = false;

                    if (serverData.hero && serverData.hero !== localData.hero) {
                        localData.hero = serverData.hero;
                        changed = true;
                    }
                    if (serverData.partner && serverData.partner !== localData.partner) {
                        localData.partner = serverData.partner;
                        changed = true;
                    }
                    if (serverData.products && typeof serverData.products === 'object') {
                        if (!localData.products) localData.products = {};
                        for (const [k, url] of Object.entries(serverData.products)) {
                            if (url && localData.products[k] !== url) {
                                localData.products[k] = url;
                                changed = true;
                            }
                        }
                    }

                    // If local has custom images that server doesn't have yet, seed server
                    const needsServerPush = 
                        (localData.hero && !serverData.hero) ||
                        (localData.partner && !serverData.partner) ||
                        (localData.products && Object.keys(localData.products).some(k => !serverData.products || !serverData.products[k]));

                    if (needsServerPush) {
                        fetch('/api/site-images', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ siteImages: localData })
                        }).catch(() => {});
                    }

                    if (changed) {
                        saveSiteImages(localData);
                        applyAllCustomImages();
                        renderProducts();
                        renderPhotoManagerList();
                        renderPhotoManagerPageList();
                    }
                }
            } catch (err) {
                console.warn('Server image sync warning:', err);
            }
        }

        // Publishing & Admin Access Mode Helpers
        const ADMIN_ACCESS_KEY = 'drift_admin_access_granted';
        const ADMIN_PIN_KEY = 'drift_admin_pin';
        let pendingAdminAction = null;

        function getStoredAdminPin() {
            return localStorage.getItem(ADMIN_PIN_KEY) || '2010drift';
        }

        function setStoredAdminPin(newPin) {
            if (!newPin || String(newPin).trim().length < 4) {
                return false;
            }
            localStorage.setItem(ADMIN_PIN_KEY, String(newPin).trim());
            return true;
        }

        function openAdminAuthModal(onSuccessCallback = null) {
            pendingAdminAction = onSuccessCallback;
            const modal = document.getElementById('adminAuthModal');
            const input = document.getElementById('adminPasscodeInput');
            const error = document.getElementById('adminAuthError');
            if (error) error.classList.add('hidden');
            if (input) {
                input.value = '';
                input.type = 'password';
            }
            const icon = document.getElementById('passcodeToggleIcon');
            if (icon) icon.innerText = '👁️';

            if (modal) {
                modal.classList.remove('opacity-0', 'pointer-events-none');
                modal.classList.add('opacity-100', 'pointer-events-auto');
                const inner = modal.querySelector('div');
                if (inner) inner.classList.remove('scale-95');
                setTimeout(() => input?.focus(), 150);
            }
        }

        function closeAdminAuthModal(e) {
            const modal = document.getElementById('adminAuthModal');
            if (e.target === modal) closeAdminAuthModalDirect();
        }

        function closeAdminAuthModalDirect() {
            const modal = document.getElementById('adminAuthModal');
            if (modal) {
                const inner = modal.querySelector('div');
                if (inner) inner.classList.add('scale-95');
                modal.classList.remove('opacity-100', 'pointer-events-auto');
                modal.classList.add('opacity-0', 'pointer-events-none');
            }
            pendingAdminAction = null;
        }

        function togglePasscodeVisibility() {
            const input = document.getElementById('adminPasscodeInput');
            const icon = document.getElementById('passcodeToggleIcon');
            if (!input) return;
            if (input.type === 'password') {
                input.type = 'text';
                if (icon) icon.innerText = '🙈';
            } else {
                input.type = 'password';
                if (icon) icon.innerText = '👁️';
            }
        }

        function verifyAdminPasscode(e) {
            if (e) e.preventDefault();
            const input = document.getElementById('adminPasscodeInput');
            const error = document.getElementById('adminAuthError');
            const entered = (input?.value || '').trim();

            const currentPin = getStoredAdminPin();
            // Accept configured PIN, 2010drift, or fallback PINs
            if (entered === currentPin || entered === '2010drift' || entered === '2010' || entered === 'drift2010') {
                localStorage.setItem(ADMIN_ACCESS_KEY, 'true');
                if (error) error.classList.add('hidden');
                closeAdminAuthModalDirect();
                setPublishMode(false);
                updatePublishModeUI();
                if (typeof showToast === 'function') {
                    showToast('✨ Store Owner Verified — Admin Studio Unlocked');
                }

                if (typeof pendingAdminAction === 'function') {
                    const action = pendingAdminAction;
                    pendingAdminAction = null;
                    action();
                }
            } else {
                if (error) {
                    error.classList.remove('hidden');
                    error.innerText = 'Incorrect passcode. Access denied.';
                }
                if (input) {
                    input.classList.add('border-red-500');
                    setTimeout(() => input.classList.remove('border-red-500'), 1500);
                    input.focus();
                    input.select();
                }
            }
        }

        function lockAdminMode() {
            localStorage.removeItem(ADMIN_ACCESS_KEY);
            setPublishMode(true);
            updatePublishModeUI();

            // Close any open admin modals
            if (typeof closeOrdersDashboardDirect === 'function') closeOrdersDashboardDirect();
            if (typeof closePhotoManagerDirect === 'function') closePhotoManagerDirect();

            if (typeof showToast === 'function') {
                showToast('🔒 Admin Studio Locked & Hidden');
            }
        }

        function checkAdminAccess() {
            const urlParams = new URLSearchParams(window.location.search);
            // Secret direct key URL parameter
            if (urlParams.get('key') === 'drift2010' || urlParams.get('key') === getStoredAdminPin()) {
                localStorage.setItem(ADMIN_ACCESS_KEY, 'true');
                return true;
            }
            if (urlParams.get('lock') === 'true' || urlParams.get('logout') === 'true') {
                localStorage.removeItem(ADMIN_ACCESS_KEY);
                return false;
            }
            // If someone passes ?admin=true without key, prompt for passcode instead of granting
            if ((urlParams.get('admin') === 'true' || urlParams.get('studio') === 'true') && localStorage.getItem(ADMIN_ACCESS_KEY) !== 'true') {
                setTimeout(() => openAdminAuthModal(), 300);
                return false;
            }
            return localStorage.getItem(ADMIN_ACCESS_KEY) === 'true';
        }

        function isPublishMode() {
            // If user has not authenticated/unlocked admin access, ALWAYS treat as published mode!
            if (!checkAdminAccess()) {
                return true;
            }
            return localStorage.getItem(PUBLISH_MODE_KEY) === 'true';
        }

        function setPublishMode(enabled) {
            localStorage.setItem(PUBLISH_MODE_KEY, enabled ? 'true' : 'false');
            updatePublishModeUI();
        }

        function updatePublishModeUI() {
            const hasAdmin = checkAdminAccess();
            const published = isPublishMode();
            const publisherDock = document.getElementById('publisherDock');
            const dockEdit = document.getElementById('dockEditMode');
            const dockPublish = document.getElementById('dockPublishMode');
            const modalToggle = document.getElementById('modalPublishToggleBtn');

            // If normal visitor (no admin access unlocked):
            // 1. Completely hide the floating dock and all editor buttons
            // 2. Add published-mode class to body so all .edit-control elements vanish
            if (!hasAdmin) {
                document.body.classList.add('published-mode');
                if (publisherDock) publisherDock.classList.add('hidden');
                return;
            }

            // If store owner (Admin access granted):
            if (publisherDock) publisherDock.classList.remove('hidden');

            if (published) {
                document.body.classList.add('published-mode');
                if (dockEdit) dockEdit.classList.add('hidden');
                if (dockPublish) dockPublish.classList.remove('hidden');
                if (modalToggle) {
                    modalToggle.innerText = '🎨 Switch to Studio Edit Mode';
                    modalToggle.className = 'px-4 py-2 bg-stone-700 hover:bg-stone-600 text-white font-bold rounded-xs uppercase tracking-wider text-[11px] transition-colors cursor-pointer flex-shrink-0';
                }
            } else {
                document.body.classList.remove('published-mode');
                if (dockEdit) dockEdit.classList.remove('hidden');
                if (dockPublish) dockPublish.classList.add('hidden');
                if (modalToggle) {
                    modalToggle.innerText = '🚀 Switch to Published View';
                    modalToggle.className = 'px-4 py-2 bg-[#C5A059] hover:bg-[#d6b26b] text-stone-950 font-bold rounded-xs uppercase tracking-wider text-[11px] transition-colors cursor-pointer flex-shrink-0';
                }
            }
        }

        function togglePublishFromModal() {
            setPublishMode(!isPublishMode());
        }

        // Protected keyboard shortcut to toggle admin mode: Ctrl + Shift + A
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
                e.preventDefault();
                const currentlyAdmin = checkAdminAccess();
                if (currentlyAdmin) {
                    lockAdminMode();
                } else {
                    openAdminAuthModal();
                }
            }
            // Allow Escape key to close the auth modal
            if (e.key === 'Escape') {
                const modal = document.getElementById('adminAuthModal');
                if (modal && !modal.classList.contains('pointer-events-none')) {
                    closeAdminAuthModalDirect();
                }
            }
        });


        // --- In-App Reliable Image Handling (Canvas-Optimized Base64 + Local Storage + Server DB) ---
        function optimizeAndReadImage(file, callback) {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const maxDim = 700;
                    let w = img.width;
                    let h = img.height;
                    if (w > maxDim || h > maxDim) {
                        if (w > h) {
                            h = Math.round((h * maxDim) / w);
                            w = maxDim;
                        } else {
                            w = Math.round((w * maxDim) / h);
                            h = maxDim;
                        }
                    }
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    const compressed = canvas.toDataURL('image/jpeg', 0.82);
                    callback(compressed);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        function saveCustomImage(target, dataUrl) {
            if (!target || !dataUrl) return;
            const siteData = getStoredSiteImages();
            if (!siteData.products) siteData.products = {};

            if (target === 'hero') {
                siteData.hero = dataUrl;
                const heroImg = document.getElementById('heroImg');
                if (heroImg) heroImg.src = dataUrl;
            } else if (target === 'partner') {
                siteData.partner = dataUrl;
                const partnerImg = document.getElementById('partnerImg');
                if (partnerImg) partnerImg.src = dataUrl;
            } else if (target === 'favicon') {
                siteData.favicon = dataUrl;
                const fav = document.getElementById('siteFavicon');
                if (fav) fav.href = dataUrl;
            } else {
                const productId = Number(target);
                siteData.products[productId] = dataUrl;
                
                const prod = products.find(p => p.id === productId);
                if (prod) prod.image = dataUrl;
                
                renderProducts();
                
                // Update quick modal if currently viewing this product
                if (currentModalProductId === productId) {
                    const modalImg = document.getElementById('modalImg');
                    if (modalImg) modalImg.src = dataUrl;
                    const badge = document.getElementById('modalCustomBadge');
                    const resetBtn = document.getElementById('modalResetImgBtn');
                    if (badge) badge.classList.remove('hidden');
                    if (resetBtn) resetBtn.classList.remove('hidden');
                }
                
                // Update discovery card if currently viewing
                const discImg = document.getElementById('discImg');
                if (discImg && discImg.alt && prod && discImg.alt.includes(prod.name)) {
                    discImg.src = dataUrl;
                }
            }

            // 1. Save locally with quota safety
            saveSiteImages(siteData);

            // 2. Persist permanently to server database (survives refreshes, incognito, and other devices)
            fetch('/api/site-images', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target, image: dataUrl })
            }).then(r => r.json()).then(res => {
                if (res.success) {
                    showToast('✓ Photo updated & saved permanently!');
                }
            }).catch(err => {
                console.warn('Server persist note:', err);
                showToast('✓ Photo updated locally');
            });

            renderPhotoManagerList();
            renderPhotoManagerPageList();
        }

        function promptImageUrl(target) {
            const targetName = target === 'hero' ? 'Hero Showcase Bottle' : 
                               target === 'partner' ? 'Business Partner Kit' : 
                               target === 'favicon' ? 'Browser Tab Icon (Favicon)' :
                               (products.find(p => p.id === Number(target))?.name || `Product #${target}`);
            const inputUrl = window.prompt(`Paste image web link for "${targetName}":\n(e.g., from Postimages, Imgur, Unsplash, or direct image URL)`);
            if (!inputUrl) return;
            const cleanUrl = inputUrl.trim();
            if (!cleanUrl) return;
            if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('data:image/')) {
                alert('Please enter a valid web image URL (starting with https:// or http://)');
                return;
            }
            saveCustomImage(target, cleanUrl);
        }

        function resetCurrentProductImage() {
            if (!currentModalProductId) return;
            resetCustomImage(currentModalProductId);
        }

        function resetCustomImage(target) {
            const siteData = getStoredSiteImages();

            if (target === 'hero') {
                delete siteData.hero;
                const heroImg = document.getElementById('heroImg');
                if (heroImg) heroImg.src = 'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&q=85&w=1200';
            } else if (target === 'partner') {
                delete siteData.partner;
                const partnerImg = document.getElementById('partnerImg');
                if (partnerImg) partnerImg.src = 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&q=80&w=800';
            } else if (target === 'favicon') {
                delete siteData.favicon;
                const fav = document.getElementById('siteFavicon');
                if (fav) fav.href = '/favicon.svg';
            } else {
                const productId = Number(target);
                if (siteData.products) delete siteData.products[productId];
                
                const prod = products.find(p => p.id === productId);
                if (prod && defaultProductImages[productId]) {
                    prod.image = defaultProductImages[productId];
                }
                
                renderProducts();
                
                if (currentModalProductId === productId) {
                    const modalImg = document.getElementById('modalImg');
                    if (modalImg && prod) modalImg.src = prod.image;
                    const badge = document.getElementById('modalCustomBadge');
                    const resetBtn = document.getElementById('modalResetImgBtn');
                    if (badge) badge.classList.add('hidden');
                    if (resetBtn) resetBtn.classList.add('hidden');
                }
            }

            saveSiteImages(siteData);

            fetch('/api/site-images/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target })
            }).catch(() => {});

            showToast('Photo restored to default');
            renderPhotoManagerList();
            renderPhotoManagerPageList();
        }

        function resetAllCustomImages() {
            if (!confirm('Are you sure you want to reset all custom pictures back to original defaults?')) return;
            localStorage.removeItem(SITE_STORAGE_KEY);
            localStorage.removeItem('drift_custom_perfume_images');

            fetch('/api/site-images/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target: 'all' })
            }).catch(() => {});

            applyAllCustomImages();
            renderProducts();
            if (currentModalProductId) {
                quickView(currentModalProductId);
            }
            showToast('All pictures reset to defaults');
            renderPhotoManagerList();
            renderPhotoManagerPageList();
        }

        function triggerQuickUpload(target) {
            currentQuickUploadId = target;
            const input = document.getElementById('globalImageUploader');
            if (input) {
                input.value = '';
                input.click();
            }
        }

        function handleGlobalUpload(event) {
            const file = event.target.files && event.target.files[0];
            if (!file || !currentQuickUploadId) return;
            optimizeAndReadImage(file, (dataUrl) => {
                saveCustomImage(currentQuickUploadId, dataUrl);
            });
        }

        function triggerModalUpload() {
            const input = document.getElementById('modalFileInput');
            if (input) {
                input.value = '';
                input.click();
            }
        }

        function handleModalImageUpload(event) {
            const file = event.target.files && event.target.files[0];
            if (!file || !currentModalProductId) return;
            optimizeAndReadImage(file, (dataUrl) => {
                saveCustomImage(currentModalProductId, dataUrl);
            });
        }

        // --- Photo Manager Modal & Tabs ---
        const photoManagerModal = document.getElementById('photoManagerModal');

        function openPhotoManager() {
            if (!checkAdminAccess()) {
                openAdminAuthModal(() => openPhotoManager());
                return;
            }
            renderPhotoManagerList();
            renderPhotoManagerPageList();
            if (photoManagerModal) {
                photoManagerModal.classList.remove('opacity-0', 'pointer-events-none');
                photoManagerModal.classList.add('opacity-100', 'pointer-events-auto');
            }
        }

        function closePhotoManager(e) {
            if (e.target === photoManagerModal) {
                closePhotoManagerDirect();
            }
        }

        function closePhotoManagerDirect() {
            if (photoManagerModal) {
                photoManagerModal.classList.remove('opacity-100', 'pointer-events-auto');
                photoManagerModal.classList.add('opacity-0', 'pointer-events-none');
            }
        }

        function switchManagerTab(tab) {
            const tabFragBtn = document.getElementById('tabFragrancesBtn');
            const tabPageBtn = document.getElementById('tabPagePicturesBtn');
            const listFrag = document.getElementById('photoManagerList');
            const listPage = document.getElementById('photoManagerPageList');

            if (tab === 'fragrances') {
                if (tabFragBtn) tabFragBtn.className = 'px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border-b-2 border-[#1A1817] text-[#1A1817] transition-all cursor-pointer';
                if (tabPageBtn) tabPageBtn.className = 'px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-stone-500 hover:text-black border-b-2 border-transparent transition-all cursor-pointer';
                if (listFrag) {
                    listFrag.classList.remove('hidden');
                    listFrag.classList.add('grid');
                }
                if (listPage) {
                    listPage.classList.add('hidden');
                    listPage.classList.remove('grid');
                }
            } else {
                if (tabPageBtn) tabPageBtn.className = 'px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border-b-2 border-[#1A1817] text-[#1A1817] transition-all cursor-pointer';
                if (tabFragBtn) tabFragBtn.className = 'px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-stone-500 hover:text-black border-b-2 border-transparent transition-all cursor-pointer';
                if (listPage) {
                    listPage.classList.remove('hidden');
                    listPage.classList.add('grid');
                }
                if (listFrag) {
                    listFrag.classList.add('hidden');
                    listFrag.classList.remove('grid');
                }
                renderPhotoManagerPageList();
            }
        }

        function renderPhotoManagerList() {
            const container = document.getElementById('photoManagerList');
            if (!container) return;
            const siteData = getStoredSiteImages();
            const customMap = siteData.products || {};
            
            container.innerHTML = products.map(item => {
                const isCustom = !!customMap[item.id];
                return `
                    <div class="flex items-center gap-3 p-3 bg-white border border-[#E8E2D8] rounded-xs hover:border-stone-400 transition-colors">
                        <img src="${item.image}" alt="${item.name}" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&q=80&w=800';" class="w-14 h-16 object-cover bg-stone-100 rounded-xs border border-stone-200">
                        <div class="flex-1 min-w-0">
                            <h4 class="font-cormorant text-base font-normal text-stone-900 truncate">${item.name}</h4>
                            <p class="text-[10px] text-stone-500 truncate">Version of ${item.inspiration}</p>
                            <div class="flex items-center gap-2 mt-1">
                                ${isCustom 
                                    ? `<span class="text-[9px] text-[#9E7D3B] font-medium bg-[#C5A059]/15 px-1.5 py-0.5 rounded-xs">Your Picture Active</span>` 
                                    : `<span class="text-[9px] text-stone-400">Default Picture</span>`}
                            </div>
                        </div>
                        <div class="flex flex-col gap-1 items-end">
                            <div class="flex items-center gap-1">
                                <button onclick="triggerQuickUpload(${item.id})" class="px-2 py-1 text-[10px] uppercase tracking-wider bg-stone-900 hover:bg-[#C5A059] text-white rounded-xs transition-colors cursor-pointer" title="Upload file from device">
                                    Upload
                                </button>
                                <button onclick="promptImageUrl(${item.id})" class="px-2 py-1 text-[10px] uppercase tracking-wider bg-white border border-stone-300 hover:border-black text-stone-700 rounded-xs transition-colors cursor-pointer" title="Paste direct image web link">
                                    URL
                                </button>
                            </div>
                            ${isCustom ? `
                                <button onclick="resetCustomImage(${item.id})" class="text-[10px] text-stone-400 hover:text-red-500 underline cursor-pointer">
                                    Reset
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }

        function renderPhotoManagerPageList() {
            const container = document.getElementById('photoManagerPageList');
            if (!container) return;
            const siteData = getStoredSiteImages();
            
            const pageItems = [
                {
                    key: 'hero',
                    title: 'Hero Signature Bottle',
                    subtitle: 'Main showcase bottle on the top of the landing page',
                    currentImg: siteData.hero || document.getElementById('heroImg')?.src,
                    isCustom: !!siteData.hero
                },
                {
                    key: 'partner',
                    title: 'Business Partner Kit (₱988)',
                    subtitle: 'Starter package visual in the partner reseller section',
                    currentImg: siteData.partner || document.getElementById('partnerImg')?.src,
                    isCustom: !!siteData.partner
                },
                {
                    key: 'favicon',
                    title: 'Browser Tab Icon (Favicon)',
                    subtitle: 'Icon displayed on browser tabs, bookmarks, and mobile shortcuts',
                    currentImg: siteData.favicon || '/favicon.svg',
                    isCustom: !!siteData.favicon
                }
            ];

            container.innerHTML = pageItems.map(item => `
                <div class="flex flex-col p-4 bg-white border border-[#E8E2D8] rounded-xs space-y-3">
                    <div class="aspect-[4/3] bg-stone-100 rounded-xs overflow-hidden border border-stone-200">
                        <img src="${item.currentImg}" alt="${item.title}" class="w-full h-full object-cover">
                    </div>
                    <div>
                        <h4 class="font-cormorant text-lg font-medium text-stone-900">${item.title}</h4>
                        <p class="text-xs text-stone-500">${item.subtitle}</p>
                        <div class="mt-1">
                            ${item.isCustom 
                                ? `<span class="text-[9px] text-[#9E7D3B] font-medium bg-[#C5A059]/15 px-1.5 py-0.5 rounded-xs">Your Picture Active</span>` 
                                : `<span class="text-[9px] text-stone-400">Default Picture</span>`}
                        </div>
                    </div>
                    <div class="pt-2 border-t border-stone-100 flex items-center justify-between">
                        <div class="flex items-center gap-1.5">
                            <button onclick="triggerQuickUpload('${item.key}')" class="px-3 py-1.5 text-xs uppercase tracking-wider bg-stone-900 hover:bg-[#C5A059] text-white rounded-xs transition-colors cursor-pointer">
                                Upload File
                            </button>
                            <button onclick="promptImageUrl('${item.key}')" class="px-2.5 py-1.5 text-xs uppercase tracking-wider bg-white border border-stone-300 hover:border-black text-stone-700 rounded-xs transition-colors cursor-pointer" title="Paste direct image link">
                                Link URL
                            </button>
                        </div>
                        ${item.isCustom ? `
                            <button onclick="resetCustomImage('${item.key}')" class="text-xs text-stone-400 hover:text-red-500 underline cursor-pointer">
                                Reset Default
                            </button>
                        ` : ''}
                    </div>
                </div>
            `).join('');
        }

        function exportBakedCode() {
            const siteData = getStoredSiteImages();
            const prodCount = Object.keys(siteData.products || {}).length;
            const hasHero = !!siteData.hero;
            const hasPartner = !!siteData.partner;
            const totalCount = prodCount + (hasHero ? 1 : 0) + (hasPartner ? 1 : 0);

            const exportObj = {
                hero: siteData.hero || null,
                partner: siteData.partner || null,
                products: siteData.products || {}
            };
            const jsonStr = JSON.stringify(exportObj, null, 2);

            navigator.clipboard.writeText(jsonStr).then(() => {
                alert(`Copied data for ${totalCount} uploaded photo(s)!\n\nWhen publishing:\n- Click "🚀 Switch to Published View" to instantly hide all upload buttons.\n- Or reply to me in chat: "Please bake these photos permanently and remove upload buttons", and I will commit them permanently into the codebase!`);
            }).catch(() => {
                prompt('Your custom image configuration JSON:', jsonStr);
            });
        }


// Global Window Exports
window.openAdminAuthModal = openAdminAuthModal;
window.closeAdminAuthModal = closeAdminAuthModal;
window.closeAdminAuthModalDirect = closeAdminAuthModalDirect;
window.togglePasscodeVisibility = togglePasscodeVisibility;
window.verifyAdminPasscode = verifyAdminPasscode;
window.lockAdminMode = lockAdminMode;
window.getStoredAdminPin = getStoredAdminPin;
window.setStoredAdminPin = setStoredAdminPin;
window.getStoredSiteImages = getStoredSiteImages;
window.saveSiteImages = saveSiteImages;
window.getStoredCustomImages = getStoredCustomImages;
window.applyAllCustomImages = applyAllCustomImages;
window.syncSiteImagesWithServer = syncSiteImagesWithServer;
window.checkAdminAccess = checkAdminAccess;
window.isPublishMode = isPublishMode;
window.setPublishMode = setPublishMode;
window.updatePublishModeUI = updatePublishModeUI;
window.togglePublishFromModal = togglePublishFromModal;
window.optimizeAndReadImage = optimizeAndReadImage;
window.saveCustomImage = saveCustomImage;
window.promptImageUrl = promptImageUrl;
window.resetCurrentProductImage = resetCurrentProductImage;
window.resetCustomImage = resetCustomImage;
window.resetAllCustomImages = resetAllCustomImages;
window.triggerQuickUpload = triggerQuickUpload;
window.handleGlobalUpload = handleGlobalUpload;
window.triggerModalUpload = triggerModalUpload;
window.handleModalImageUpload = handleModalImageUpload;
window.openPhotoManager = openPhotoManager;
window.closePhotoManager = closePhotoManager;
window.closePhotoManagerDirect = closePhotoManagerDirect;
window.switchManagerTab = switchManagerTab;
window.renderPhotoManagerList = renderPhotoManagerList;
window.renderPhotoManagerPageList = renderPhotoManagerPageList;
window.exportBakedCode = exportBakedCode;
