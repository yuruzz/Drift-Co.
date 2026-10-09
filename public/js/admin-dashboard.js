// Drift & Co. — Orders & Inquiries Admin Hub
// Real-time order monitoring, bank account configuration, SMS & notifications

        // --- Orders & Inquiries Admin Dashboard ---
        let activeOrdersTab = 'orders';

        function escapeAdminHtml(value) {
            return String(value ?? '').replace(/[&<>"']/g, char => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            })[char]);
        }

        function safeAdminPhone(value) {
            return String(value || '').replace(/[^0-9+]/g, '');
        }

        function safeAdminImageUrl(value) {
            try {
                const url = new URL(String(value || ''), window.location.origin);
                return url.protocol === 'https:' ? url.href : '';
            } catch {
                return '';
            }
        }

        function bindPaymentCopyButtons(container) {
            if (container.dataset.paymentCopyBound) return;
            container.dataset.paymentCopyBound = 'true';
            container.addEventListener('click', event => {
                const button = event.target.closest('[data-copy-payment]');
                if (!button || !container.contains(button)) return;
                copyToClipboard(button.dataset.copyValue || '', button.dataset.copyMessage || 'Copied!');
            });
        }

        function studioApiHeaders(headers = {}) {
            const pin = typeof getStoredAdminPin === 'function'
                ? getStoredAdminPin()
                : '';
            return { ...headers, 'X-Studio-Pin': pin };
        }

        function openOrdersDashboard(initialTab = 'orders') {
            if (typeof checkAdminAccess === 'function' && !checkAdminAccess()) {
                if (typeof openAdminAuthModal === 'function') {
                    openAdminAuthModal(() => openOrdersDashboard(initialTab));
                }
                return;
            }

            loadDashboardData();
            const modal = document.getElementById('ordersDashboardModal');
            if (modal) {
                modal.classList.remove('opacity-0', 'pointer-events-none');
                modal.classList.add('opacity-100', 'pointer-events-auto');
            }
            if (initialTab) {
                switchOrdersTab(initialTab);
            }
        }

        function closeOrdersDashboard(e) {
            const modal = document.getElementById('ordersDashboardModal');
            if (e.target === modal) closeOrdersDashboardDirect();
        }

        function closeOrdersDashboardDirect() {
            const modal = document.getElementById('ordersDashboardModal');
            if (modal) {
                modal.classList.remove('opacity-100', 'pointer-events-auto');
                modal.classList.add('opacity-0', 'pointer-events-none');
            }
        }

        let currentPaymentSettings = {
            bdoEnabled: false,
            bdoAccountName: '',
            bdoAccountNumber: '',
            bdoQrUrl: '',
            bpiEnabled: false,
            bpiAccountName: '',
            bpiAccountNumber: '',
            bpiQrUrl: '',
            gcashEnabled: false,
            gcashAccountName: '',
            gcashNumber: '',
            gcashQrUrl: '',
            instructions: 'Please transfer the exact amount and save a screenshot of your transfer receipt. You may paste your transaction reference number below or send proof of payment to our concierge.',
            gatewayProvider: 'manual',
            paymongoPublicKey: '',
            qrphEnabled: false,
        };

        function switchOrdersTab(tab) {
            activeOrdersTab = tab;
            const tabOrdersBtn = document.getElementById('tabOrdersBtn');
            const tabInquiriesBtn = document.getElementById('tabInquiriesBtn');
            const tabNotifBtn = document.getElementById('tabNotificationsBtn');
            const tabPaymentsBtn = document.getElementById('tabPaymentsBtn');
            const listOrders = document.getElementById('dashOrdersList');
            const listInquiries = document.getElementById('dashInquiriesList');
            const notifSettings = document.getElementById('dashNotificationsSettings');
            const paymentSettings = document.getElementById('dashPaymentSettings');

            // Reset tab styles
            [tabOrdersBtn, tabInquiriesBtn, tabNotifBtn, tabPaymentsBtn].forEach(btn => {
                if (btn) btn.className = 'px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-stone-500 hover:text-black border-b-2 border-transparent cursor-pointer flex items-center gap-1.5 whitespace-nowrap';
            });
            [listOrders, listInquiries, notifSettings, paymentSettings].forEach(c => {
                if (c) c.classList.add('hidden');
            });

            if (tab === 'orders') {
                tabOrdersBtn.className = 'px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border-b-2 border-[#1A1817] text-[#1A1817] cursor-pointer whitespace-nowrap';
                listOrders.classList.remove('hidden');
            } else if (tab === 'inquiries') {
                tabInquiriesBtn.className = 'px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border-b-2 border-[#1A1817] text-[#1A1817] cursor-pointer whitespace-nowrap';
                listInquiries.classList.remove('hidden');
            } else if (tab === 'notifications') {
                tabNotifBtn.className = 'px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border-b-2 border-[#1A1817] text-[#1A1817] cursor-pointer flex items-center gap-1.5 whitespace-nowrap';
                notifSettings.classList.remove('hidden');
                loadNotificationSettings();
            } else if (tab === 'payments') {
                if (tabPaymentsBtn) tabPaymentsBtn.className = 'px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border-b-2 border-[#1A1817] text-[#1A1817] cursor-pointer flex items-center gap-1.5 whitespace-nowrap';
                if (paymentSettings) paymentSettings.classList.remove('hidden');
                loadPaymentSettings();
            }
        }

        async function loadPaymentSettings() {
            try {
                const res = await fetch('/api/payments/settings');
                const data = await res.json();
                if (!res.ok || !data.success || !data.settings) {
                    throw new Error(data.error || 'Unable to load payment settings.');
                }
                currentPaymentSettings = { ...currentPaymentSettings, ...data.settings };
            } catch (err) {
                console.warn('Error loading payment settings:', err);
                if (typeof showToast === 'function') showToast(err.message || 'Unable to load payment settings.');
            } finally {
                const s = currentPaymentSettings;
                
                if (document.getElementById('cfgBpiEnabled')) document.getElementById('cfgBpiEnabled').checked = Boolean(s.bpiEnabled);
                if (document.getElementById('cfgBpiAccountName')) document.getElementById('cfgBpiAccountName').value = s.bpiAccountName || '';
                if (document.getElementById('cfgBpiAccountNumber')) document.getElementById('cfgBpiAccountNumber').value = s.bpiAccountNumber || '';
                if (document.getElementById('cfgBpiQrUrl')) document.getElementById('cfgBpiQrUrl').value = s.bpiQrUrl || '';

                if (document.getElementById('cfgBdoEnabled')) document.getElementById('cfgBdoEnabled').checked = Boolean(s.bdoEnabled);
                if (document.getElementById('cfgBdoAccountName')) document.getElementById('cfgBdoAccountName').value = s.bdoAccountName || '';
                if (document.getElementById('cfgBdoAccountNumber')) document.getElementById('cfgBdoAccountNumber').value = s.bdoAccountNumber || '';
                if (document.getElementById('cfgBdoQrUrl')) document.getElementById('cfgBdoQrUrl').value = s.bdoQrUrl || '';

                if (document.getElementById('cfgGcashEnabled')) document.getElementById('cfgGcashEnabled').checked = Boolean(s.gcashEnabled);
                if (document.getElementById('cfgGcashAccountName')) document.getElementById('cfgGcashAccountName').value = s.gcashAccountName || '';
                if (document.getElementById('cfgGcashNumber')) document.getElementById('cfgGcashNumber').value = s.gcashNumber || '';
                if (document.getElementById('cfgGcashQrUrl')) document.getElementById('cfgGcashQrUrl').value = s.gcashQrUrl || '';

                if (document.getElementById('cfgPaymentInstructions')) document.getElementById('cfgPaymentInstructions').value = s.instructions || '';
                
                syncPaymentMethodDropdown();
                handlePaymentMethodChange();
            }
        }

        async function loadStorePaymentSettings() {
            try {
                const res = await fetch('/api/payments/settings');
                const data = await res.json();
                if (!res.ok || !data.success || !data.settings) {
                    throw new Error(data.error || 'Unable to load payment options.');
                }
                currentPaymentSettings = { ...currentPaymentSettings, ...data.settings };
                const qrphStatus = document.getElementById('qrphGatewayStatus');
                if (qrphStatus) {
                    qrphStatus.innerText = currentPaymentSettings.qrphEnabled
                        ? 'QR Ph is enabled and ready for checkout.'
                        : 'QR Ph is not active yet. Configure all three PayMongo environment variables and redeploy.';
                }
                const select = document.getElementById('orderPaymentMethod');
                if (select) {
                    const selectedMethod = select.value;
                    syncPaymentMethodDropdown();
                    if ([...select.options].some(option => option.value === selectedMethod && !option.disabled)) {
                        select.value = selectedMethod;
                    }
                    handlePaymentMethodChange();
                }
            } catch (error) {
                console.error('Unable to load public payment settings:', error);
            }
        }

        function syncPaymentMethodDropdown() {
            const sel = document.getElementById('orderPaymentMethod');
            if (!sel) return;
            const s = currentPaymentSettings;
            const curVal = sel.value;
            
            sel.innerHTML = `
                <option value="Cash on Delivery (COD)" ${curVal === 'Cash on Delivery (COD)' ? 'selected' : ''}>Cash on Delivery (COD) — Available</option>
                <option value="QR Ph" ${s.qrphEnabled ? '' : 'disabled class="text-stone-400"'} ${curVal === 'QR Ph' && s.qrphEnabled ? 'selected' : ''}>QR Ph ${s.qrphEnabled ? '(GCash, BPI, BDO & more)' : '(Currently Unavailable)'}</option>
                <option value="GCash" ${s.gcashEnabled ? '' : 'disabled class="text-stone-400"'} ${curVal === 'GCash' && s.gcashEnabled ? 'selected' : ''}>GCash ${s.gcashEnabled ? '(Scan QR / Send Money)' : '(Currently Unavailable)'}</option>
                <option value="BPI Bank Transfer" ${s.bpiEnabled ? '' : 'disabled class="text-stone-400"'} ${curVal === 'BPI Bank Transfer' && s.bpiEnabled ? 'selected' : ''}>BPI Bank Transfer ${s.bpiEnabled ? '(BPI Online / QR Ph)' : '(Currently Unavailable)'}</option>
                <option value="BDO Bank Transfer" ${s.bdoEnabled ? '' : 'disabled class="text-stone-400"'} ${curVal === 'BDO Bank Transfer' && s.bdoEnabled ? 'selected' : ''}>BDO Bank Transfer ${s.bdoEnabled ? '(BDO Pay / QR Ph)' : '(Currently Unavailable)'}</option>
            `;
            
            if (sel.selectedOptions && sel.selectedOptions[0] && sel.selectedOptions[0].disabled) {
                sel.value = 'Cash on Delivery (COD)';
            }
        }

        async function savePaymentSettings(e) {
            e.preventDefault();
            const btn = document.getElementById('btnSavePaymentSettings');
            if (btn) btn.innerText = 'Saving Accounts...';

            const payload = {
                bpiEnabled: document.getElementById('cfgBpiEnabled')?.checked,
                bpiAccountName: document.getElementById('cfgBpiAccountName')?.value,
                bpiAccountNumber: document.getElementById('cfgBpiAccountNumber')?.value,
                bpiQrUrl: document.getElementById('cfgBpiQrUrl')?.value,

                bdoEnabled: document.getElementById('cfgBdoEnabled')?.checked,
                bdoAccountName: document.getElementById('cfgBdoAccountName')?.value,
                bdoAccountNumber: document.getElementById('cfgBdoAccountNumber')?.value,
                bdoQrUrl: document.getElementById('cfgBdoQrUrl')?.value,

                gcashEnabled: document.getElementById('cfgGcashEnabled')?.checked,
                gcashAccountName: document.getElementById('cfgGcashAccountName')?.value,
                gcashNumber: document.getElementById('cfgGcashNumber')?.value,
                gcashQrUrl: document.getElementById('cfgGcashQrUrl')?.value,

                instructions: document.getElementById('cfgPaymentInstructions')?.value,
            };

            try {
                const res = await fetch('/api/payments/settings', {
                    method: 'POST',
                    headers: studioApiHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!res.ok || !data.success || !data.settings) {
                    throw new Error(data.error || 'Unable to save payment settings.');
                }
                currentPaymentSettings = { ...currentPaymentSettings, ...data.settings };
                showToast('Bank and payment accounts saved.');
            } catch (err) {
                console.error('Save payment settings error:', err);
                showToast(err.message || 'Unable to save payment settings.');
            } finally {
                if (btn) btn.innerText = 'Save Bank & Payment Accounts';
                syncPaymentMethodDropdown();
                handlePaymentMethodChange();
            }
        }

        function handlePaymentMethodChange() {
            const method = document.getElementById('orderPaymentMethod')?.value || 'Cash on Delivery (COD)';
            const box = document.getElementById('bankPaymentInfoBox');
            if (!box) return;
            const s = currentPaymentSettings;
            const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

            if (method === 'QR Ph') {
                box.className = 'p-3 bg-[#FAF8F5] border border-[#E8E2D8] rounded-xs text-xs space-y-2';
                box.innerHTML = `
                    <p class="font-semibold text-stone-900">Secure dynamic QR Ph payment</p>
                    <p class="text-stone-600">A unique QR code for this order and exact total will appear after you place the order. Scan it with a participating bank or e-wallet app, including GCash, BPI, or BDO Pay.</p>
                `;
                return;
            }

            if (method.includes('BPI')) {
                box.classList.remove('hidden');
                box.className = 'p-3 bg-red-50/70 border border-red-200/80 rounded-xs text-xs space-y-2';
                box.innerHTML = `
                    <div class="flex items-center justify-between border-b border-red-200 pb-1.5">
                        <div class="flex items-center gap-1.5">
                            <span class="px-1.5 py-0.5 bg-red-700 text-white text-[9px] font-bold rounded-xs">BPI</span>
                            <span class="font-semibold text-red-950 uppercase tracking-wider text-[10px]">Bank of the Philippine Islands</span>
                        </div>
                        <span class="text-[10px] font-semibold text-red-800">Total: ₱${total.toFixed(2)}</span>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-stone-800">
                        <div>
                            <span class="text-[10px] text-stone-500 uppercase tracking-wider block">Account Name:</span>
                            <span class="font-medium text-stone-900">${escapeAdminHtml(s.bpiAccountName)}</span>
                        </div>
                        <div>
                            <span class="text-[10px] text-stone-500 uppercase tracking-wider block">Account Number:</span>
                            <div class="flex items-center gap-1.5 mt-0.5">
                                <span class="font-mono font-bold text-red-900 text-xs">${escapeAdminHtml(s.bpiAccountNumber)}</span>
                                <button type="button" data-copy-payment data-copy-value="${escapeAdminHtml(s.bpiAccountNumber)}" data-copy-message="BPI Account Number copied!" class="px-2 py-0.5 bg-red-700 hover:bg-red-800 text-white rounded-xs text-[9px] uppercase font-semibold cursor-pointer">
                                    Copy
                                </button>
                            </div>
                        </div>
                    </div>
                    ${safeAdminImageUrl(s.bpiQrUrl) ? `
                        <div class="pt-1 flex items-center gap-2">
                            <img src="${escapeAdminHtml(safeAdminImageUrl(s.bpiQrUrl))}" alt="BPI QR" class="w-16 h-16 object-contain bg-white border border-red-200 rounded-xs">
                            <span class="text-[10px] text-stone-500">Scan via BPI Online / BPI Mobile App / any QR Ph bank</span>
                        </div>
                    ` : ''}
                    <div class="pt-1">
                        <label class="block text-[10px] uppercase font-semibold text-stone-700 mb-1">
                            BPI Confirmation / Reference No. <span class="text-stone-400 font-normal">(Optional)</span>
                        </label>
                        <input type="text" id="orderPaymentReference" placeholder="e.g. 994821034 or last 4 digits" class="w-full px-2.5 py-1.5 text-xs bg-white border border-red-200 rounded-xs font-mono focus:outline-none focus:border-red-600">
                    </div>
                `;
            } else if (method.includes('BDO')) {
                box.classList.remove('hidden');
                box.className = 'p-3 bg-blue-50/70 border border-blue-200/80 rounded-xs text-xs space-y-2';
                box.innerHTML = `
                    <div class="flex items-center justify-between border-b border-blue-200 pb-1.5">
                        <div class="flex items-center gap-1.5">
                            <span class="px-1.5 py-0.5 bg-blue-900 text-amber-300 text-[9px] font-bold rounded-xs">BDO</span>
                            <span class="font-semibold text-blue-950 uppercase tracking-wider text-[10px]">Banco de Oro (BDO Unibank)</span>
                        </div>
                        <span class="text-[10px] font-semibold text-blue-900">Total: ₱${total.toFixed(2)}</span>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-stone-800">
                        <div>
                            <span class="text-[10px] text-stone-500 uppercase tracking-wider block">Account Name:</span>
                            <span class="font-medium text-stone-900">${escapeAdminHtml(s.bdoAccountName)}</span>
                        </div>
                        <div>
                            <span class="text-[10px] text-stone-500 uppercase tracking-wider block">Account Number:</span>
                            <div class="flex items-center gap-1.5 mt-0.5">
                                <span class="font-mono font-bold text-blue-950 text-xs">${escapeAdminHtml(s.bdoAccountNumber)}</span>
                                <button type="button" data-copy-payment data-copy-value="${escapeAdminHtml(s.bdoAccountNumber)}" data-copy-message="BDO Account Number copied!" class="px-2 py-0.5 bg-blue-900 hover:bg-blue-950 text-white rounded-xs text-[9px] uppercase font-semibold cursor-pointer">
                                    Copy
                                </button>
                            </div>
                        </div>
                    </div>
                    ${safeAdminImageUrl(s.bdoQrUrl) ? `
                        <div class="pt-1 flex items-center gap-2">
                            <img src="${escapeAdminHtml(safeAdminImageUrl(s.bdoQrUrl))}" alt="BDO QR" class="w-16 h-16 object-contain bg-white border border-blue-200 rounded-xs">
                            <span class="text-[10px] text-stone-500">Scan via BDO Pay / BDO Online / InstaPay</span>
                        </div>
                    ` : ''}
                    <div class="pt-1">
                        <label class="block text-[10px] uppercase font-semibold text-stone-700 mb-1">
                            BDO Confirmation / Reference No. <span class="text-stone-400 font-normal">(Optional)</span>
                        </label>
                        <input type="text" id="orderPaymentReference" placeholder="e.g. BDO-781923" class="w-full px-2.5 py-1.5 text-xs bg-white border border-blue-200 rounded-xs font-mono focus:outline-none focus:border-blue-700">
                    </div>
                `;
            } else if (method.includes('GCash')) {
                box.classList.remove('hidden');
                box.className = 'p-3 bg-sky-50/70 border border-sky-200/80 rounded-xs text-xs space-y-2';
                box.innerHTML = `
                    <div class="flex items-center justify-between border-b border-sky-200 pb-1.5">
                        <div class="flex items-center gap-1.5">
                            <span class="px-1.5 py-0.5 bg-blue-600 text-white text-[9px] font-bold rounded-xs">GCash</span>
                            <span class="font-semibold text-sky-950 uppercase tracking-wider text-[10px]">GCash Mobile Wallet</span>
                        </div>
                        <span class="text-[10px] font-semibold text-blue-700">Total: ₱${total.toFixed(2)}</span>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-stone-800">
                        <div>
                            <span class="text-[10px] text-stone-500 uppercase tracking-wider block">Account Name:</span>
                            <span class="font-medium text-stone-900">${escapeAdminHtml(s.gcashAccountName)}</span>
                        </div>
                        <div>
                            <span class="text-[10px] text-stone-500 uppercase tracking-wider block">GCash Mobile:</span>
                            <div class="flex items-center gap-1.5 mt-0.5">
                                <span class="font-mono font-bold text-blue-900 text-xs">${escapeAdminHtml(s.gcashNumber)}</span>
                                <button type="button" data-copy-payment data-copy-value="${escapeAdminHtml(s.gcashNumber)}" data-copy-message="GCash Number copied!" class="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xs text-[9px] uppercase font-semibold cursor-pointer">
                                    Copy
                                </button>
                            </div>
                        </div>
                    </div>
                    ${safeAdminImageUrl(s.gcashQrUrl) ? `
                        <div class="pt-1 flex items-center gap-2">
                            <img src="${escapeAdminHtml(safeAdminImageUrl(s.gcashQrUrl))}" alt="GCash QR" class="w-16 h-16 object-contain bg-white border border-sky-200 rounded-xs">
                            <span class="text-[10px] text-stone-500">Scan via GCash App</span>
                        </div>
                    ` : ''}
                    <div class="pt-1">
                        <label class="block text-[10px] uppercase font-semibold text-stone-700 mb-1">
                            GCash Reference No. <span class="text-stone-400 font-normal">(Optional)</span>
                        </label>
                        <input type="text" id="orderPaymentReference" placeholder="e.g. 1029 3847 5612" class="w-full px-2.5 py-1.5 text-xs bg-white border border-sky-200 rounded-xs font-mono focus:outline-none focus:border-blue-600">
                    </div>
                `;
            } else {
                box.classList.remove('hidden');
                box.className = 'p-2.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xs text-xs space-y-1';
                box.innerHTML = `
                    <div class="flex items-center gap-1.5 text-emerald-900 font-semibold text-[11px]">
                        <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span>Cash on Delivery (COD)</span>
                    </div>
                    <p class="text-[11px] text-stone-600">Pay in cash when your bespoke perfume arrives at your door. No advance deposit required.</p>
                `;
            }
            bindPaymentCopyButtons(box);
        }

        function renderSuccessBankDetails(method, total) {
            const container = document.getElementById('successBankDetailsBox');
            if (!container) return;
            const s = currentPaymentSettings;

            if (method.includes('BPI')) {
                container.classList.remove('hidden');
                container.innerHTML = `
                    <div class="flex items-center justify-between border-b border-stone-200 pb-1.5">
                        <span class="font-bold text-red-800 uppercase tracking-wider text-[10px]">BPI Transfer Instructions</span>
                        <span class="text-[10px] text-stone-600 font-semibold">Amount: ₱${Number(total).toFixed(2)}</span>
                    </div>
                    <div class="space-y-1 text-stone-700">
                        <p><strong>Account Name:</strong> ${escapeAdminHtml(s.bpiAccountName)}</p>
                        <div class="flex items-center justify-between bg-stone-50 p-1.5 rounded-xs border border-stone-200">
                            <div>
                                <span class="text-[9px] text-stone-400 block uppercase">BPI Account Number</span>
                                <span class="font-mono font-bold text-stone-900">${escapeAdminHtml(s.bpiAccountNumber)}</span>
                            </div>
                            <button type="button" data-copy-payment data-copy-value="${escapeAdminHtml(s.bpiAccountNumber)}" data-copy-message="BPI Account Number copied!" class="px-2 py-1 bg-red-700 hover:bg-red-800 text-white rounded-xs text-[10px] uppercase font-semibold cursor-pointer">
                                Copy
                            </button>
                        </div>
                        ${safeAdminImageUrl(s.bpiQrUrl) ? `<img src="${escapeAdminHtml(safeAdminImageUrl(s.bpiQrUrl))}" alt="BPI QR" class="w-28 h-28 object-contain mx-auto border border-stone-200 rounded-xs mt-1">` : ''}
                        <p class="text-[10px] text-stone-500 italic pt-1">Please keep a screenshot of your payment. Our concierge will verify your transfer before dispatch.</p>
                    </div>
                `;
            } else if (method.includes('BDO')) {
                container.classList.remove('hidden');
                container.innerHTML = `
                    <div class="flex items-center justify-between border-b border-stone-200 pb-1.5">
                        <span class="font-bold text-blue-900 uppercase tracking-wider text-[10px]">BDO Transfer Instructions</span>
                        <span class="text-[10px] text-stone-600 font-semibold">Amount: ₱${Number(total).toFixed(2)}</span>
                    </div>
                    <div class="space-y-1 text-stone-700">
                        <p><strong>Account Name:</strong> ${escapeAdminHtml(s.bdoAccountName)}</p>
                        <div class="flex items-center justify-between bg-stone-50 p-1.5 rounded-xs border border-stone-200">
                            <div>
                                <span class="text-[9px] text-stone-400 block uppercase">BDO Account Number</span>
                                <span class="font-mono font-bold text-stone-900">${escapeAdminHtml(s.bdoAccountNumber)}</span>
                            </div>
                            <button type="button" data-copy-payment data-copy-value="${escapeAdminHtml(s.bdoAccountNumber)}" data-copy-message="BDO Account Number copied!" class="px-2 py-1 bg-blue-900 hover:bg-blue-950 text-white rounded-xs text-[10px] uppercase font-semibold cursor-pointer">
                                Copy
                            </button>
                        </div>
                        ${safeAdminImageUrl(s.bdoQrUrl) ? `<img src="${escapeAdminHtml(safeAdminImageUrl(s.bdoQrUrl))}" alt="BDO QR" class="w-28 h-28 object-contain mx-auto border border-stone-200 rounded-xs mt-1">` : ''}
                        <p class="text-[10px] text-stone-500 italic pt-1">Please keep a screenshot of your payment. Our concierge will verify your transfer before dispatch.</p>
                    </div>
                `;
            } else if (method.includes('GCash')) {
                container.classList.remove('hidden');
                container.innerHTML = `
                    <div class="flex items-center justify-between border-b border-stone-200 pb-1.5">
                        <span class="font-bold text-blue-600 uppercase tracking-wider text-[10px]">GCash Transfer Instructions</span>
                        <span class="text-[10px] text-stone-600 font-semibold">Amount: ₱${Number(total).toFixed(2)}</span>
                    </div>
                    <div class="space-y-1 text-stone-700">
                        <p><strong>Account Name:</strong> ${escapeAdminHtml(s.gcashAccountName)}</p>
                        <div class="flex items-center justify-between bg-stone-50 p-1.5 rounded-xs border border-stone-200">
                            <div>
                                <span class="text-[9px] text-stone-400 block uppercase">GCash Mobile Number</span>
                                <span class="font-mono font-bold text-stone-900">${escapeAdminHtml(s.gcashNumber)}</span>
                            </div>
                            <button type="button" data-copy-payment data-copy-value="${escapeAdminHtml(s.gcashNumber)}" data-copy-message="GCash Number copied!" class="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xs text-[10px] uppercase font-semibold cursor-pointer">
                                Copy
                            </button>
                        </div>
                        ${safeAdminImageUrl(s.gcashQrUrl) ? `<img src="${escapeAdminHtml(safeAdminImageUrl(s.gcashQrUrl))}" alt="GCash QR" class="w-28 h-28 object-contain mx-auto border border-stone-200 rounded-xs mt-1">` : ''}
                        <p class="text-[10px] text-stone-500 italic pt-1">Please send screenshot of your GCash receipt to our concierge.</p>
                    </div>
                `;
            } else {
                container.classList.add('hidden');
            }
            bindPaymentCopyButtons(container);
        }

        async function loadNotificationSettings() {
            try {
                const res = await fetch('/api/notifications/settings', { headers: studioApiHeaders() });
                const data = await res.json();
                if (data.success && data.settings) {
                    const s = data.settings;
                    if (document.getElementById('cfgOwnerPhone')) document.getElementById('cfgOwnerPhone').value = s.ownerPhone || '';
                    if (document.getElementById('cfgOwnerName')) document.getElementById('cfgOwnerName').value = s.ownerName || '';
                    if (document.getElementById('cfgWebhookUrl')) document.getElementById('cfgWebhookUrl').value = s.webhookUrl || '';
                    if (document.getElementById('cfgTelegramBotToken')) document.getElementById('cfgTelegramBotToken').value = s.telegramBotTokenMasked || s.telegramBotToken || '';
                    if (document.getElementById('cfgTelegramChatId')) document.getElementById('cfgTelegramChatId').value = s.telegramChatId || '';
                    if (document.getElementById('cfgSemaphoreApiKey')) document.getElementById('cfgSemaphoreApiKey').value = s.semaphoreApiKeyMasked || s.semaphoreApiKey || '';
                    if (document.getElementById('cfgSemaphoreSenderName')) document.getElementById('cfgSemaphoreSenderName').value = s.semaphoreSenderName || 'DriftAndCo';
                    if (document.getElementById('cfgNtfyTopic')) document.getElementById('cfgNtfyTopic').value = s.ntfyTopic || 'drift-co-orders-alert';
                    
                    if (document.getElementById('cfgNotifyOwnerOnOrder')) document.getElementById('cfgNotifyOwnerOnOrder').checked = s.notifyOwnerOnOrder !== false;
                    if (document.getElementById('cfgNotifyCustomerOnOrder')) document.getElementById('cfgNotifyCustomerOnOrder').checked = s.notifyCustomerOnOrder !== false;
                    if (document.getElementById('cfgNotifyOwnerOnInquiry')) document.getElementById('cfgNotifyOwnerOnInquiry').checked = s.notifyOwnerOnInquiry !== false;
                    if (document.getElementById('cfgSoundAlertsEnabled')) document.getElementById('cfgSoundAlertsEnabled').checked = s.soundAlertsEnabled !== false;
                } else if (data.error) {
                    showToast(data.error);
                }
            } catch (err) {
                console.error('Error loading notification settings:', err);
            }
        }

        async function saveNotificationSettings(e) {
            e.preventDefault();
            const btn = document.getElementById('btnSaveNotifSettings');
            if (btn) btn.innerText = 'Saving...';

            const payload = {
                ownerPhone: document.getElementById('cfgOwnerPhone')?.value,
                ownerName: document.getElementById('cfgOwnerName')?.value,
                webhookUrl: document.getElementById('cfgWebhookUrl')?.value,
                telegramBotToken: document.getElementById('cfgTelegramBotToken')?.value,
                telegramChatId: document.getElementById('cfgTelegramChatId')?.value,
                semaphoreApiKey: document.getElementById('cfgSemaphoreApiKey')?.value,
                semaphoreSenderName: document.getElementById('cfgSemaphoreSenderName')?.value,
                ntfyTopic: document.getElementById('cfgNtfyTopic')?.value || 'drift-co-orders-alert',
                notifyOwnerOnOrder: document.getElementById('cfgNotifyOwnerOnOrder')?.checked,
                notifyCustomerOnOrder: document.getElementById('cfgNotifyCustomerOnOrder')?.checked,
                notifyOwnerOnInquiry: document.getElementById('cfgNotifyOwnerOnInquiry')?.checked,
                soundAlertsEnabled: document.getElementById('cfgSoundAlertsEnabled')?.checked,
            };

            try {
                const res = await fetch('/api/notifications/settings', {
                    method: 'POST',
                    headers: studioApiHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    showToast('Notification settings saved successfully!');
                } else {
                    showToast(data.error || 'Failed to save settings.');
                }
            } catch (err) {
                console.error('Save notification settings error:', err);
                showToast('Network error saving settings.');
            } finally {
                if (btn) btn.innerText = 'Save Notification Settings';
            }
        }

        async function sendTestNotificationAlert() {
            const btn = document.getElementById('btnSendTestAlert');
            if (btn) btn.innerHTML = `<span>Sending...</span>`;

            try {
                const res = await fetch('/api/notifications/test', { method: 'POST', headers: studioApiHeaders() });
                const data = await res.json();
                if (data.success) {
                    const ntfy = (data.logs || []).find(log => log.channel.startsWith('Instant Phone Alert'));
                    if (ntfy?.status === 'Sent') {
                        showToast(`ntfy test sent to ${ntfy.recipient}.`);
                        playOrderAlertChime();
                    } else if (ntfy?.status === 'Failed') {
                        showToast(`ntfy failed: ${ntfy.error || 'check the topic and Vercel function logs'}`);
                    } else {
                        showToast('ntfy was not sent. Enable owner order notifications and save settings.');
                    }
                } else {
                    showToast(data.error || 'Failed to trigger test notification.');
                }
            } catch (err) {
                console.error('Test notification error:', err);
                showToast('Error sending test notification.');
            } finally {
                if (btn) btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg><span>Send Test Alert</span>`;
            }
        }

        function textCustomerDirect(phone, customerName, orderId, total) {
            const body = `Hi ${customerName}! This is Drift & Co. Concierge regarding your order #${orderId} (₱${Number(total).toFixed(2)}). We are preparing your order for dispatch.`;
            const cleanPhone = (phone || '').replace(/[^0-9+]/g, '');
            window.location.href = `sms:${cleanPhone}?body=${encodeURIComponent(body)}`;
        }

        function whatsappCustomerDirect(phone, customerName, orderId, total) {
            const body = `Hello ${customerName}! Drift & Co. Concierge here regarding your fragrance order *#${orderId}* (₱${Number(total).toFixed(2)}).`;
            let clean = (phone || '').replace(/[^0-9]/g, '');
            if (clean.startsWith('0')) clean = '63' + clean.slice(1);
            window.open(`https://api.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(body)}`, '_blank');
        }

        async function resendOrderAlert(orderId) {
            try {
                const res = await fetch(`/api/orders/${orderId}/notify`, { method: 'POST', headers: studioApiHeaders() });
                const data = await res.json();
                if (data.success) {
                    showToast(`Alert dispatched for order ${orderId}!`);
                    loadDashboardData();
                } else {
                    showToast('Failed to resend alert.');
                }
            } catch (err) {
                console.error('Resend alert error:', err);
                showToast('Error re-sending notification.');
            }
        }

        let showDeliveredOrders = false;

        function toggleDeliveredOrdersView() {
            showDeliveredOrders = !showDeliveredOrders;
            loadDashboardData();
        }

        async function loadDashboardData() {
            try {
                const statsRes = await fetch('/api/stats').catch(() => null);
                if (statsRes && statsRes.ok) {
                    const statsData = await statsRes.json();
                    if (statsData.success && statsData.stats) {
                        document.getElementById('dashTotalOrders').innerText = statsData.stats.totalOrders;
                        document.getElementById('dashTotalRevenue').innerText = `₱${statsData.stats.totalRevenue.toFixed(2)}`;
                        document.getElementById('dashTotalInquiries').innerText = statsData.stats.totalInquiries;
                    }
                }

                // Load orders
                let allOrders = [];
                try {
                    const ordersRes = await fetch('/api/orders', { headers: studioApiHeaders() }).catch(() => null);
                    if (ordersRes && ordersRes.ok) {
                        const ordersData = await ordersRes.json();
                        if (ordersData.orders) allOrders = ordersData.orders;
                    }
                } catch (e) {}

                // Merge any client-stored local orders for Vercel/offline resilience
                try {
                    const localOrders = JSON.parse(localStorage.getItem('drift_local_orders') || '[]');
                    const existingIds = new Set(allOrders.map(o => o.id));
                    for (const lo of localOrders) {
                        if (!existingIds.has(lo.id)) {
                            allOrders.push(lo);
                        }
                    }
                } catch (e) {}

                const ordersContainer = document.getElementById('dashOrdersList');
                
                // Separate active vs delivered orders
                const activeOrders = allOrders.filter(order => order.status !== 'Delivered');
                const deliveredOrders = allOrders.filter(order => order.status === 'Delivered');
                const displayOrders = showDeliveredOrders ? allOrders : activeOrders;

                // Update dock count to show actionable active orders
                const dockCount = document.getElementById('dockOrderCount');
                if (dockCount) dockCount.innerText = activeOrders.length;

                if (displayOrders.length > 0) {
                    const headerToolbar = `
                        <div class="flex items-center justify-between bg-stone-100/80 border border-stone-200 px-3 py-2 rounded-xs text-xs mb-3">
                            <div class="flex items-center gap-2">
                                <span class="font-semibold text-stone-800">
                                    ${showDeliveredOrders ? `All Orders (${allOrders.length})` : `Active Orders (${activeOrders.length})`}
                                </span>
                                ${deliveredOrders.length > 0 ? `
                                    <span class="text-[11px] text-stone-500 font-medium">· ${deliveredOrders.length} delivered</span>
                                ` : ''}
                            </div>
                            ${deliveredOrders.length > 0 ? `
                            <button onclick="toggleDeliveredOrdersView()" class="text-[11px] font-semibold text-[#C5A059] hover:text-[#A88440] hover:underline cursor-pointer flex items-center gap-1 transition-colors">
                                <span>${showDeliveredOrders ? 'Hide Delivered Orders' : `View Delivered Archive (${deliveredOrders.length})`}</span>
                            </button>
                            ` : ''}
                        </div>
                    `;

                    const cardsHtml = displayOrders.map((order, orderIndex) => {
                        const notifLogs = (order.notificationsSent || []).map(log => log.channel).join(', ') || 'SMS & App Dispatch';
                        const isDelivered = order.status === 'Delivered';
                        const totalLabel = order.shippingConfirmationRequired ? 'Items subtotal (provisional)' : 'Total';
                        const shippingSummary = order.fulfillmentMethod === 'pickup'
                            ? `<p class="pt-1"><strong>Pickup:</strong> No delivery fee • ${escapeAdminHtml(order.shippingOrigin || 'Drift & Co. Office, Pila, Laguna')}</p>`
                            : order.shippingConfirmationRequired
                            ? `<p class="pt-1 text-amber-800"><strong>Shipping:</strong> Confirmation required${order.shippingConfirmationReasons?.length ? ` — ${escapeAdminHtml(order.shippingConfirmationReasons.join(' '))}` : ''}</p>`
                            : order.shippingZone
                                ? `<p class="pt-1"><strong>J&T delivery:</strong> ${order.deliveryFee === 0 ? 'Free' : `₱${Number(order.deliveryFee).toFixed(2)}`} • ${escapeAdminHtml(order.shippingZone)} • ${escapeAdminHtml(order.shippingWeightGrams || 0)} g • From ${escapeAdminHtml(order.shippingOrigin || 'office not recorded')}</p>`
                                : Number.isFinite(Number(order.deliveryFee))
                                    ? `<p class="pt-1"><strong>Delivery charge recorded:</strong> ₱${Number(order.deliveryFee).toFixed(2)}</p>`
                                    : '';
                        return `
                        <div class="bg-white border ${isDelivered ? 'border-emerald-200 bg-emerald-50/20' : 'border-[#E8E2D8]'} p-4 rounded-xs shadow-xs space-y-3">
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-2">
                                <div>
                                    <span class="font-mono text-xs font-bold text-[#C5A059]">${escapeAdminHtml(order.id)}</span>
                                    <span class="text-[11px] text-stone-400 ml-2">${escapeAdminHtml(new Date(order.createdAt).toLocaleString())}</span>
                                    <span class="inline-block ml-2 px-2 py-0.5 bg-stone-100 text-stone-600 rounded-xs text-[10px]" title="Notification channels dispatched">🔔 ${escapeAdminHtml(notifLogs)}</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-xs ${
                                        order.status === 'Confirmed' ? 'bg-blue-100 text-blue-800' :
                                        order.status === 'Shipped' ? 'bg-amber-100 text-amber-800' :
                                        order.status === 'Delivered' ? 'bg-emerald-100 text-emerald-800' :
                                        'bg-stone-100 text-stone-700'
                                    }">${escapeAdminHtml(order.status)}</span>
                                    <select data-order-action="status" data-order-index="${orderIndex}" class="text-xs bg-stone-50 border border-stone-200 rounded-xs px-2 py-1 cursor-pointer font-medium">
                                        <option value="Pending" ${order.status === 'Pending' ? 'selected' : ''}>Pending</option>
                                        <option value="Confirmed" ${order.status === 'Confirmed' ? 'selected' : ''} ${order.paymentMethod === 'QR Ph' && order.paymentStatus !== 'Paid' ? 'disabled' : ''}>Confirmed</option>
                                        <option value="Shipped" ${order.status === 'Shipped' ? 'selected' : ''} ${order.paymentMethod === 'QR Ph' && order.paymentStatus !== 'Paid' ? 'disabled' : ''}>Shipped</option>
                                        <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''} ${order.paymentMethod === 'QR Ph' && order.paymentStatus !== 'Paid' ? 'disabled' : ''}>Delivered (Archive)</option>
                                    </select>
                                    <button type="button" data-order-action="track" data-order-index="${orderIndex}" class="px-2 py-1 bg-stone-100 hover:bg-[#C5A059] hover:text-white rounded-xs text-[10px] font-semibold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs" title="Preview public tracking page for this order">
                                        <svg class="w-3 h-3 text-[#C5A059]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
                                        <span>Track</span>
                                    </button>
                                </div>
                            </div>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                <div>
                                    <p><strong class="text-stone-700">Customer:</strong> ${escapeAdminHtml(order.customerName)}</p>
                                    <div class="flex items-center gap-1.5 flex-wrap pt-0.5">
                                        <strong class="text-stone-700">Phone:</strong>
                                        <span class="font-mono text-stone-900">${escapeAdminHtml(order.phone)}</span>
                                        <button type="button" data-order-action="sms" data-order-index="${orderIndex}" class="px-2 py-0.5 bg-stone-100 hover:bg-[#C5A059] hover:text-white rounded-xs text-[10px] font-semibold transition-colors cursor-pointer" title="Send SMS message to customer">📱 Text SMS</button>
                                        <button type="button" data-order-action="whatsapp" data-order-index="${orderIndex}" class="px-2 py-0.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-xs text-[10px] font-semibold transition-colors cursor-pointer" title="Message customer on WhatsApp">💬 WhatsApp</button>
                                        <a href="tel:${escapeAdminHtml(safeAdminPhone(order.phone))}" class="px-2 py-0.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xs text-[10px] font-semibold transition-colors">📞 Call</a>
                                    </div>
                                    <p class="pt-1"><strong class="text-stone-700">Payment:</strong> ${escapeAdminHtml(order.paymentMethod)}</p>
                                    ${order.paymentStatus ? `<p class="pt-0.5"><strong class="text-stone-700">Payment status:</strong> <span class="font-semibold ${order.paymentStatus === 'Paid' ? 'text-emerald-700' : 'text-amber-700'}">${escapeAdminHtml(order.paymentStatus)}</span></p>` : ''}
                                </div>
                                <div>
                                    <p><strong class="text-stone-700">${order.fulfillmentMethod === 'pickup' ? 'Pickup location:' : 'Delivery address:'}</strong> ${escapeAdminHtml(order.address || 'Not provided')}</p>
                                    ${shippingSummary}
                                    ${order.notes ? `<p><strong class="text-stone-700">Notes:</strong> ${escapeAdminHtml(order.notes)}</p>` : ''}
                                    <div class="pt-1">
                                        <button type="button" data-order-action="resend" data-order-index="${orderIndex}" class="text-[10px] text-[#C5A059] hover:underline font-semibold cursor-pointer">🔄 Re-dispatch Alert to Owner</button>
                                    </div>
                                </div>
                            </div>
                            <div class="bg-stone-50 p-2.5 rounded-xs text-xs border border-stone-100">
                                <div class="flex items-center justify-between font-semibold border-b border-stone-200 pb-1 mb-1">
                                    <span>Items (${order.items.length}):</span>
                                    <span class="text-[#C5A059]">${totalLabel}: ₱${Number(order.total).toFixed(2)}</span>
                                </div>
                                <ul class="space-y-0.5 text-stone-600">
                                    ${(order.items || []).map(item => `<li>${escapeAdminHtml(item.qty)}x ${escapeAdminHtml(item.name)} (${escapeAdminHtml(item.volume || '50ml')}) — ₱${(Number(item.price) * Number(item.qty)).toFixed(2)}</li>`).join('')}
                                </ul>
                            </div>
                        </div>
                        `;
                    }).join('');

                    ordersContainer.innerHTML = headerToolbar + cardsHtml;
                    ordersContainer.querySelectorAll('[data-order-action]').forEach(control => {
                        const order = displayOrders[Number(control.dataset.orderIndex)];
                        if (!order) return;

                        if (control.dataset.orderAction === 'status') {
                            control.addEventListener('change', event => updateOrderStatus(order.id, event.currentTarget.value));
                        } else {
                            control.addEventListener('click', () => {
                                if (control.dataset.orderAction === 'track') openOrderTracker(order.id);
                                if (control.dataset.orderAction === 'sms') textCustomerDirect(order.phone, order.customerName, order.id, order.total);
                                if (control.dataset.orderAction === 'whatsapp') whatsappCustomerDirect(order.phone, order.customerName, order.id, order.total);
                                if (control.dataset.orderAction === 'resend') resendOrderAlert(order.id);
                            });
                        }
                    });
                } else if (deliveredOrders.length > 0 && activeOrders.length === 0) {
                    ordersContainer.innerHTML = `
                        <div class="text-center py-12 text-stone-400 text-xs">
                            <div class="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto text-xl mb-2 font-bold shadow-xs">✓</div>
                            <p class="font-cormorant text-2xl text-stone-900 font-light">All Orders Delivered</p>
                            <p class="mt-1 text-stone-500">Delivered orders are automatically archived and hidden from active studio mode.</p>
                            <button onclick="toggleDeliveredOrdersView()" class="mt-4 px-4 py-2 bg-stone-100 hover:bg-[#C5A059] hover:text-white text-stone-800 rounded-xs text-xs font-semibold cursor-pointer transition-colors shadow-2xs">
                                View Delivered Archive (${deliveredOrders.length})
                            </button>
                        </div>
                    `;
                } else {
                    ordersContainer.innerHTML = `
                        <div class="text-center py-12 text-stone-400 text-xs">
                            <p class="font-cormorant text-xl text-stone-700">No customer orders placed yet.</p>
                            <p class="mt-1">Orders placed via the cart checkout will appear here in real time.</p>
                        </div>
                    `;
                }

                // Load inquiries
                const inqRes = await fetch('/api/partner-inquiries', { headers: studioApiHeaders() });
                const inqData = await inqRes.json();
                const inqContainer = document.getElementById('dashInquiriesList');

                if (inqData.inquiries && inqData.inquiries.length > 0) {
                    inqContainer.innerHTML = inqData.inquiries.map(inq => `
                        <div class="bg-white border border-[#E8E2D8] p-4 rounded-xs shadow-xs space-y-2 text-xs">
                            <div class="flex items-center justify-between border-b border-stone-100 pb-2">
                                <span class="font-mono text-xs font-bold text-[#C5A059]">${escapeAdminHtml(inq.id)}</span>
                                <span class="text-[11px] text-stone-400">${escapeAdminHtml(new Date(inq.createdAt).toLocaleString())}</span>
                            </div>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                    <p><strong class="text-stone-700">Applicant:</strong> ${escapeAdminHtml(inq.name)}</p>
                                    <p><strong class="text-stone-700">Phone:</strong> <a href="tel:${escapeAdminHtml(safeAdminPhone(inq.phone))}" class="text-[#C5A059] hover:underline">${escapeAdminHtml(inq.phone)}</a></p>
                                    <p><strong class="text-stone-700">Email:</strong> ${escapeAdminHtml(inq.email || 'N/A')}</p>
                                </div>
                                <div>
                                    <p><strong class="text-stone-700">Location:</strong> ${escapeAdminHtml(inq.location || 'N/A')}</p>
                                    <p><strong class="text-stone-700">Package:</strong> ${escapeAdminHtml(inq.packageType)}</p>
                                    ${inq.message ? `<p><strong class="text-stone-700">Message:</strong> ${escapeAdminHtml(inq.message)}</p>` : ''}
                                </div>
                            </div>
                        </div>
                    `).join('');
                } else {
                    inqContainer.innerHTML = `
                        <div class="text-center py-12 text-stone-400 text-xs">
                            <p class="font-cormorant text-xl text-stone-700">No reseller applications yet.</p>
                            <p class="mt-1">Inquiries submitted through the Business Partner Kit form will appear here.</p>
                        </div>
                    `;
                }
            } catch (err) {
                console.error('Error loading dashboard data:', err);
            }
        }

        async function updateOrderStatus(orderId, newStatus) {
            // Update local storage order if present
            try {
                const local = JSON.parse(localStorage.getItem('drift_local_orders') || '[]');
                const idx = local.findIndex(o => o.id === orderId);
                if (idx !== -1) {
                    local[idx].status = newStatus;
                    localStorage.setItem('drift_local_orders', JSON.stringify(local));
                }
            } catch (e) {}

            try {
                const res = await fetch(`/api/orders/${orderId}/status`, {
                    method: 'PATCH',
                    headers: studioApiHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ status: newStatus })
                }).catch(() => null);

                if (res && res.ok) {
                    if (newStatus === 'Delivered') {
                        showToast(`✓ Order ${orderId} marked as Delivered and archived from active view.`);
                    } else {
                        showToast(`Order ${orderId} updated to ${newStatus}`);
                    }
                } else {
                    if (newStatus === 'Delivered') {
                        showToast(`✓ Order ${orderId} marked as Delivered and archived.`);
                    } else {
                        showToast(`Order ${orderId} updated to ${newStatus}`);
                    }
                }
                loadDashboardData();
            } catch (err) {
                console.error('Status update error:', err);
                if (newStatus === 'Delivered') {
                    showToast(`✓ Order ${orderId} marked as Delivered.`);
                } else {
                    showToast(`Order ${orderId} updated to ${newStatus}`);
                }
                loadDashboardData();
            }
        }

        let previousOrderCount = null;
        let previousRevenue = null;

        async function loadStats() {
            try {
                const res = await fetch('/api/stats');
                const data = await res.json();
                if (data.success && data.stats) {
                    const currentOrders = data.stats.totalOrders;
                    const dockCount = document.getElementById('dockOrderCount');
                    if (dockCount) dockCount.innerText = currentOrders;

                    // If a new order just came in while the page is open, chime and notify
                    if (previousOrderCount !== null && currentOrders > previousOrderCount) {
                        playOrderAlertChime();
                        showToast(`🔔 New Order Received! Total orders: ${currentOrders}`);
                        if (activeOrdersTab === 'orders' && document.getElementById('ordersDashboardModal')?.classList.contains('opacity-100')) {
                            loadDashboardData();
                        }
                    } else if (
                        previousRevenue !== null
                        && data.stats.totalRevenue !== previousRevenue
                        && activeOrdersTab === 'orders'
                        && document.getElementById('ordersDashboardModal')?.classList.contains('opacity-100')
                    ) {
                        loadDashboardData();
                    }
                    previousOrderCount = currentOrders;
                    previousRevenue = data.stats.totalRevenue;
                }
            } catch (e) {
                // Backend initializing or offline
            }
        }

        // Poll every 10 seconds for new orders while admin or page is open
        setInterval(loadStats, 10000);

        function showToast(message) {
            let toast = document.getElementById('driftToast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'driftToast';
                toast.className = 'fixed bottom-5 right-5 z-50 px-4 py-3 bg-[#1A1817] text-white text-xs font-medium rounded-sm shadow-2xl border border-stone-700 transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-none flex items-center gap-2';
                document.body.appendChild(toast);
            }
            toast.innerText = message;
            toast.classList.remove('translate-y-2', 'opacity-0', 'pointer-events-none');
            toast.classList.add('translate-y-0', 'opacity-100');

            setTimeout(() => {
                toast.classList.remove('translate-y-0', 'opacity-100');
                toast.classList.add('translate-y-2', 'opacity-0', 'pointer-events-none');
            }, 3500);
        }


// Global Window Exports
loadStorePaymentSettings();
window.openOrdersDashboard = openOrdersDashboard;
window.closeOrdersDashboard = closeOrdersDashboard;
window.closeOrdersDashboardDirect = closeOrdersDashboardDirect;
window.switchOrdersTab = switchOrdersTab;
window.loadPaymentSettings = loadPaymentSettings;
window.savePaymentSettings = savePaymentSettings;
window.syncPaymentMethodDropdown = syncPaymentMethodDropdown;
window.handlePaymentMethodChange = handlePaymentMethodChange;
window.renderSuccessBankDetails = renderSuccessBankDetails;
window.loadNotificationSettings = loadNotificationSettings;
window.saveNotificationSettings = saveNotificationSettings;
window.sendTestNotificationAlert = sendTestNotificationAlert;
window.textCustomerDirect = textCustomerDirect;
window.whatsappCustomerDirect = whatsappCustomerDirect;
window.resendOrderAlert = resendOrderAlert;
window.loadDashboardData = loadDashboardData;
window.toggleDeliveredOrdersView = toggleDeliveredOrdersView;
window.updateOrderStatus = updateOrderStatus;
window.loadStats = loadStats;
window.showToast = showToast;
