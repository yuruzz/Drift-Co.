// Drift & Co. — Order Tracking System
// Real-time tracking, parcel delivery timeline & concierge support

function escapeTrackingHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

        // --- DRIFT & CO. ORDER TRACKING SYSTEM ---
        function openOrderTracker(orderId = '') {
            const modal = document.getElementById('orderTrackingModal');
            if (!modal) return;

            updateRecentChipsUI();

            modal.classList.remove('opacity-0', 'pointer-events-none');
            modal.classList.add('opacity-100');

            const input = document.getElementById('trackOrderInput');
            if (orderId && typeof orderId === 'string' && orderId.trim()) {
                if (input) input.value = orderId.trim();
                performOrderTracking(orderId.trim());
            } else if (input && !input.value) {
                // Check if user has an order placed recently in localStorage
                const lastId = localStorage.getItem('drift_last_order_id');
                if (lastId) {
                    input.value = lastId;
                }
            }
        }

        function closeOrderTracker() {
            const modal = document.getElementById('orderTrackingModal');
            if (!modal) return;
            modal.classList.remove('opacity-100');
            modal.classList.add('opacity-0', 'pointer-events-none');
        }

        function closeOrderTrackerBackdrop(e) {
            if (e && e.target && e.target.id === 'orderTrackingModal') {
                closeOrderTracker();
            }
        }

        function handleTrackOrderSubmit(e) {
            if (e) e.preventDefault();
            const input = document.getElementById('trackOrderInput');
            if (!input || !input.value.trim()) {
                showToast('Please enter the full Order Reference ID');
                return;
            }
            performOrderTracking(input.value.trim());
        }

        function handleSectionTrackSubmit(e) {
            if (e) e.preventDefault();
            const input = document.getElementById('sectionTrackInput');
            if (!input || !input.value.trim()) {
                showToast('Please enter the full Order Reference ID');
                return;
            }
            openOrderTracker(input.value.trim());
        }

        function quickTrackOrder(orderId) {
            const input = document.getElementById('trackOrderInput');
            if (input) input.value = orderId;
            openOrderTracker(orderId);
        }

        function saveRecentTrackedOrder(orderId) {
            if (!orderId) return;
            try {
                let recents = JSON.parse(localStorage.getItem('drift_recent_orders') || '[]');
                if (!Array.isArray(recents)) recents = [];
                recents = recents.filter(id => id !== orderId);
                recents.unshift(orderId);
                if (recents.length > 4) recents = recents.slice(0, 4);
                localStorage.setItem('drift_recent_orders', JSON.stringify(recents));
                localStorage.setItem('drift_last_order_id', orderId);
                updateRecentChipsUI();
            } catch (e) {}
        }

        function updateRecentChipsUI() {
            const container = document.getElementById('trackRecentChips');
            if (!container) return;

            try {
                let recents = JSON.parse(localStorage.getItem('drift_recent_orders') || '[]');
                if (!Array.isArray(recents)) recents = [];
                container.replaceChildren();
                container.classList.toggle('hidden', recents.length === 0);
                if (recents.length) {
                    const label = document.createElement('span');
                    label.className = 'text-[10px] uppercase font-semibold text-stone-400';
                    label.textContent = 'Recent Orders:';
                    container.appendChild(label);
                }
                Array.from(new Set(recents)).slice(0, 4).forEach(id => {
                    if (typeof id !== 'string') return;
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'px-2 py-0.5 bg-stone-100 hover:bg-[#C5A059] hover:text-white rounded-xs text-[10px] font-mono transition-colors cursor-pointer border border-stone-200';
                    button.textContent = id;
                    button.addEventListener('click', () => quickTrackOrder(id));
                    container.appendChild(button);
                });
            } catch (e) {}
        }

        async function performOrderTracking(query) {
            const submitBtn = document.getElementById('trackSubmitBtn');
            const initialState = document.getElementById('trackInitialState');
            const loadingState = document.getElementById('trackLoadingState');
            const errorState = document.getElementById('trackErrorState');
            const resultState = document.getElementById('trackResultState');

            if (initialState) initialState.classList.add('hidden');
            if (errorState) errorState.classList.add('hidden');
            if (resultState) resultState.classList.add('hidden');
            if (loadingState) loadingState.classList.remove('hidden');

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = `
                    <div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Locating...</span>
                `;
            }

            try {
                const res = await fetch(`/api/orders/track/${encodeURIComponent(query)}`).catch(() => null);
                let data = null;
                if (res && res.ok) {
                    try {
                        data = await res.json();
                    } catch (e) {}
                }

                if (data && data.success && data.order && data.tracking) {
                    if (loadingState) loadingState.classList.add('hidden');
                    saveRecentTrackedOrder(data.order.id);
                    renderTrackingResult(data);
                    if (resultState) resultState.classList.remove('hidden');
                    return;
                }

                // Check local storage for orders placed on Vercel Static or offline
                let localOrders = [];
                try {
                    localOrders = JSON.parse(localStorage.getItem('drift_local_orders') || '[]');
                } catch (e) {}

                const cleanQuery = (query || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                const matchedLocal = localOrders.find(o =>
                    (o.id || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === cleanQuery
                );

                if (matchedLocal) {
                    if (loadingState) loadingState.classList.add('hidden');
                    saveRecentTrackedOrder(matchedLocal.id);
                    const safeOrder = {
                        id: matchedLocal.id,
                        status: matchedLocal.status || 'Pending',
                        createdAt: matchedLocal.createdAt,
                        total: matchedLocal.total,
                        shippingConfirmationRequired: Boolean(matchedLocal.shippingConfirmationRequired),
                        shippingConfirmationReasons: matchedLocal.shippingConfirmationReasons || [],
                        deliveryFee: matchedLocal.deliveryFee,
                        shippingZone: matchedLocal.shippingZone,
                        shippingOrigin: matchedLocal.shippingOrigin,
                    };
                    const localTrackingData = {
                        success: true,
                        order: safeOrder,
                        tracking: {
                            trackingNumber: 'PH-' + (matchedLocal.id || '').replace('DRFT-', '') + '-EXP',
                            courier: 'J&T Express / Flash Express Concierge',
                            status: matchedLocal.status || 'Pending',
                            currentStep: 1,
                            stepDate: new Date(matchedLocal.createdAt || Date.now()).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }),
                            estDelivery: '2 – 4 business days',
                            latestUpdate: 'Order confirmed and registered in dispatch queue.'
                        }
                    };
                    renderTrackingResult(localTrackingData);
                    if (resultState) resultState.classList.remove('hidden');
                    return;
                }

                if (loadingState) loadingState.classList.add('hidden');
                const msgEl = document.getElementById('trackErrorMessage');
                if (msgEl) {
                    msgEl.innerText = (data && data.error) || `No order found matching "${query}". Please check the full reference ID on your confirmation receipt.`;
                }
                if (errorState) errorState.classList.remove('hidden');
            } catch (err) {
                console.error('Tracking fetch error:', err);
                if (loadingState) loadingState.classList.add('hidden');
                const msgEl = document.getElementById('trackErrorMessage');
                if (msgEl) msgEl.innerText = 'Unable to reach order tracking service. Please try again in a moment.';
                if (errorState) errorState.classList.remove('hidden');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = `<span>Track</span>`;
                }
            }
        }

        function renderTrackingResult(data) {
            const { order, tracking } = data;
            const container = document.getElementById('trackResultState');
            if (!container) return;
            const isPickup = order.fulfillmentMethod === 'pickup';

            const statusColors = {
                Pending: {
                    badge: 'bg-amber-100 text-amber-900 border-amber-300',
                    dot: 'bg-amber-500',
                    label: 'Order Received — Compounding Queue',
                    headline: 'Your bespoke fragrance order is registered in our atelier.',
                },
                Confirmed: {
                    badge: 'bg-blue-100 text-blue-900 border-blue-300',
                    dot: 'bg-blue-500',
                    label: 'Confirmed — Hand-Compounding in Lab',
                    headline: 'Our perfumers are blending your 30% fragrance oil formula.',
                },
                Shipped: {
                    badge: 'bg-indigo-100 text-indigo-900 border-indigo-300',
                    dot: 'bg-indigo-500',
                    label: 'Dispatched — In Transit with Courier',
                    headline: 'Your cushioned luxury parcel is en route with our courier partner.',
                },
                Delivered: {
                    badge: 'bg-emerald-100 text-emerald-900 border-emerald-300',
                    dot: 'bg-emerald-500',
                    label: 'Delivered & Received',
                    headline: 'Package delivered! Enjoy your signature Drift & Co. perfume.',
                },
            };

            const currentConfig = statusColors[order.status] || statusColors['Pending'];
            const currentStatusLabel = isPickup
                ? ({
                    Pending: 'Order Received — Pickup Order',
                    Confirmed: 'Confirmed — Being Prepared for Pickup',
                    Shipped: 'Ready for Pickup at Pila Office',
                    Delivered: 'Picked Up & Completed',
                }[order.status] || currentConfig.label)
                : currentConfig.label;
            const totalLabel = order.shippingConfirmationRequired ? 'Items Subtotal (Shipping to Confirm)' : 'Total';
            const totalDisplay = `₱${Number(order.total).toFixed(2)}${order.shippingConfirmationRequired ? ' (provisional)' : ''}`;
            const whatsappAmount = order.shippingConfirmationRequired
                ? 'shipping charge awaiting confirmation'
                : `Total: ₱${Number(order.total).toFixed(2)}`;

            const createdDateFormatted = new Date(order.createdAt).toLocaleDateString('en-PH', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            container.innerHTML = `
                <!-- Main Header Status Card -->
                <div class="bg-gradient-to-br from-[#1A1817] to-[#2B2724] text-white p-5 rounded-xs border border-stone-800 space-y-3 shadow-md">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-700/80 pb-3">
                        <div>
                            <span class="text-[10px] uppercase tracking-widest text-[#C5A059] font-semibold block">Order Reference</span>
                            <div class="flex items-center gap-2 mt-0.5">
                                <span class="font-mono text-xl sm:text-2xl font-bold tracking-wider text-white">${escapeTrackingHtml(order.id)}</span>
                                <button type="button" data-copy-order-id class="p-1 hover:text-[#C5A059] transition-colors cursor-pointer text-stone-400" title="Copy Order ID">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                </button>
                            </div>
                        </div>
                        <div class="flex sm:flex-col items-start sm:items-end justify-between gap-1">
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${currentConfig.badge} shadow-xs">
                                <span class="w-2 h-2 rounded-full ${currentConfig.dot} animate-pulse"></span>
                                <span>${currentStatusLabel}</span>
                            </span>
                            <span class="text-[11px] text-stone-400 font-light">Placed on ${createdDateFormatted}</span>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
                        <div class="space-y-1">
                            <span class="text-[10px] uppercase tracking-wider text-stone-400 block font-medium">${isPickup ? 'Pickup' : 'Estimated Arrival'}</span>
                            <span class="text-sm font-semibold text-[#C5A059]">${escapeTrackingHtml(tracking.estimatedDelivery)}</span>
                            <p class="text-[11px] text-stone-300 font-light">${isPickup ? 'Drift & Co. Office, Bulilan Norte, Pila, Laguna' : 'Express nationwide fragile parcel courier'}</p>
                        </div>
                        <div class="space-y-1 sm:text-right">
                            <span class="text-[10px] uppercase tracking-wider text-stone-400 block font-medium">${isPickup ? 'Pickup Reference' : 'Courier & Waybill'}</span>
                            <span class="font-mono text-xs font-semibold text-white">${escapeTrackingHtml(tracking.trackingNumber)}</span>
                            <p class="text-[11px] text-stone-400">${escapeTrackingHtml(tracking.courier)}</p>
                        </div>
                    </div>
                </div>

                <!-- Visual Stepper / Timeline -->
                <div class="bg-white border border-[#E8E2D8] p-5 rounded-xs space-y-4 shadow-2xs">
                    <div class="flex items-center justify-between border-b border-stone-100 pb-2">
                        <span class="text-xs uppercase tracking-wider font-semibold text-stone-900 flex items-center gap-1.5">
                            <svg class="w-4 h-4 text-[#C5A059]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            <span>${isPickup ? 'Atelier & Pickup Timeline' : 'Atelier & Courier Timeline'}</span>
                        </span>
                        <span class="text-[10px] uppercase tracking-wider font-semibold text-[#9E7D3B]">Step ${escapeTrackingHtml(tracking.currentStep)} of 4</span>
                    </div>

                    <div class="space-y-4 relative pl-2">
                        ${tracking.timeline.map((item, idx) => {
                            const isCompleted = item.status === 'completed';
                            const isInProgress = item.status === 'in_progress';
                            const isLast = idx === tracking.timeline.length - 1;

                            return `
                                <div class="relative flex items-start gap-3.5 group">
                                    <!-- Connecting Line -->
                                    ${!isLast ? `
                                        <div class="absolute left-3.5 top-7 bottom-0 w-0.5 ${isCompleted ? 'bg-emerald-500' : isInProgress ? 'bg-[#C5A059]' : 'bg-stone-200'}" style="height: calc(100% + 4px);"></div>
                                    ` : ''}

                                    <!-- Step Icon -->
                                    <div class="relative z-10 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-all shadow-xs ${
                                        isCompleted ? 'bg-emerald-600 text-white ring-4 ring-emerald-50' :
                                        isInProgress ? 'bg-[#C5A059] text-stone-950 ring-4 ring-[#C5A059]/20 animate-pulse' :
                                        'bg-stone-100 text-stone-400 border border-stone-300'
                                    }">
                                        ${isCompleted ? '✓' : escapeTrackingHtml(item.step)}
                                    </div>

                                    <!-- Step Details -->
                                    <div class="flex-1 pb-3 text-xs">
                                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                            <span class="font-semibold ${isCompleted ? 'text-stone-900' : isInProgress ? 'text-[#9E7D3B] font-bold' : 'text-stone-500'}">
                                                ${escapeTrackingHtml(item.title)}
                                            </span>
                                            <span class="text-[10px] font-mono ${isCompleted || isInProgress ? 'text-stone-600 font-medium' : 'text-stone-400'}">
                                                ${escapeTrackingHtml(item.timestamp)}
                                            </span>
                                        </div>
                                        <p class="text-stone-600 text-[11px] mt-0.5 font-light leading-relaxed">
                                            ${escapeTrackingHtml(item.description)}
                                        </p>
                                        <span class="inline-flex items-center gap-1 text-[10px] text-stone-400 mt-1">
                                            <span>📍</span>
                                            <span>${escapeTrackingHtml(item.location)}</span>
                                        </span>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>

                <!-- Delivery summary without customer address or contact information -->
                <div class="bg-[#FAF8F5] border border-[#E8E2D8] p-4 rounded-xs text-xs space-y-2">
                    <span class="text-[11px] uppercase tracking-wider font-semibold text-stone-800 block border-b border-stone-200 pb-1.5">
                        ${isPickup ? 'Pickup summary' : 'Delivery summary'}
                    </span>
                    <div class="space-y-1 text-stone-700 pt-1">
                        ${isPickup
                            ? `<p><strong class="text-stone-900">Pickup:</strong> Free at the Drift & Co. Office.</p>`
                            : order.shippingConfirmationRequired
                            ? `<p class="text-amber-800"><strong>Shipping:</strong> Charge to be confirmed by Drift & Co. before dispatch.</p>`
                            : Number.isFinite(Number(order.deliveryFee))
                                ? `<p><strong class="text-stone-900">${order.shippingZone ? 'J&T delivery' : 'Delivery charge'}:</strong> ${order.deliveryFee === 0 ? 'Free' : `₱${Number(order.deliveryFee).toFixed(2)}`}${order.shippingZone ? ` (${escapeTrackingHtml(order.shippingZone)})` : ''}</p>`
                                : ''}
                        ${order.shippingOrigin ? `<p><strong class="text-stone-900">${isPickup ? 'Pickup location:' : 'Dispatch office:'}</strong> ${escapeTrackingHtml(order.shippingOrigin)}</p>` : ''}
                    </div>
                    <div class="border-t border-stone-200 pt-2 flex items-center justify-between text-sm">
                        <span class="font-semibold text-stone-800">${totalLabel}:</span>
                        <span class="font-bold text-[#C5A059] text-base">${totalDisplay}</span>
                    </div>
                </div>

                <!-- Customer Concierge Support Actions -->
                <div class="p-3.5 bg-stone-100 border border-stone-200 rounded-xs space-y-2.5">
                    <div class="flex items-center justify-between">
                        <span class="text-[11px] uppercase tracking-wider font-semibold text-stone-800">
                            Drift & Co. Concierge Support
                        </span>
                        <span class="text-[10px] text-stone-500">Need to modify details?</span>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <a href="https://api.whatsapp.com/send?phone=639569310005&amp;text=${encodeURIComponent(`Hello Drift & Co. Concierge, inquiring about my order #${order.id} (${whatsappAmount})`)}" target="_blank" rel="noopener noreferrer" class="py-2 px-3 bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold uppercase tracking-wider rounded-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs">
                            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/></svg>
                            <span>WhatsApp</span>
                        </a>
                        <a href="sms:09569310005?body=${encodeURIComponent(`Hi Drift & Co., inquiring about my order #${order.id}`)}" class="py-2 px-3 bg-[#1A1817] hover:bg-[#C5A059] text-white text-[11px] font-semibold uppercase tracking-wider rounded-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs">
                            <svg class="w-3.5 h-3.5 text-[#C5A059]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
                            <span>SMS Concierge</span>
                        </a>
                        <button type="button" data-copy-tracking-summary class="py-2 px-3 bg-white border border-stone-300 hover:border-black text-stone-800 text-[11px] font-semibold uppercase tracking-wider rounded-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs">
                            <svg class="w-3.5 h-3.5 text-stone-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                            <span>Copy Details</span>
                        </button>
                    </div>
                </div>
            `;

            container.querySelector('[data-copy-order-id]')?.addEventListener('click', () => {
                copyToClipboard(String(order.id), 'Order ID copied!');
            });
            container.querySelector('[data-copy-tracking-summary]')?.addEventListener('click', () => {
                copyTrackingSummary(
                    order.id,
                    order.status,
                    tracking.trackingNumber,
                    order.total,
                    order.shippingConfirmationRequired,
                    isPickup,
                    order.shippingOrigin,
                );
            });
        }

        function copyToClipboard(text, msg = 'Copied to clipboard!') {
            navigator.clipboard.writeText(text).then(() => {
                showToast(msg);
            }).catch(() => {
                showToast('Unable to copy.');
            });
        }

        function copyTrackingSummary(orderId, status, trackingNo, total, shippingConfirmationRequired = false, isPickup = false, pickupLocation = '') {
            const summary = `DRIFT & CO. PARCEL TRACKING SUMMARY\n` +
                `Order ID: ${orderId}\n` +
                `Status: ${status}\n` +
                `${isPickup ? 'Pickup Reference' : 'Courier Waybill'}: ${trackingNo}\n` +
                (isPickup ? `Pickup Location: ${pickupLocation}\n` : '') +
                `${shippingConfirmationRequired ? 'Items subtotal (shipping to confirm)' : 'Total'}: ₱${Number(total).toFixed(2)}\n` +
                `Concierge Support: 09569310005 | drift&co2010@gmail.com`;
            copyToClipboard(summary, 'Tracking summary copied!');
        }

// Global Window Exports
window.openOrderTracker = openOrderTracker;
window.closeOrderTracker = closeOrderTracker;
window.closeOrderTrackerBackdrop = closeOrderTrackerBackdrop;
window.handleTrackOrderSubmit = handleTrackOrderSubmit;
window.handleSectionTrackSubmit = handleSectionTrackSubmit;
window.quickTrackOrder = quickTrackOrder;
window.saveRecentTrackedOrder = saveRecentTrackedOrder;
window.updateRecentChipsUI = updateRecentChipsUI;
window.performOrderTracking = performOrderTracking;
window.renderTrackingResult = renderTrackingResult;
window.copyToClipboard = copyToClipboard;
window.copyTrackingSummary = copyTrackingSummary;
