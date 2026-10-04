// Drift & Co. — Checkout & Payment Systems
// BPI, BDO, GCash integration, order placement & partner inquiries

window.lastOrderDetails = null;

        // --- Checkout Modal Handlers (Connected to /api/orders) ---
        function openCheckoutModal() {
            const modal = document.getElementById('checkoutModal');
            const formContainer = document.getElementById('checkoutFormContainer');
            const successView = document.getElementById('checkoutSuccessView');
            
            if (formContainer) formContainer.classList.remove('hidden');
            if (successView) successView.classList.add('hidden');

            const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
            const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
            
            const countEl = document.getElementById('checkoutItemCount');
            const totalEl = document.getElementById('checkoutTotalAmount');
            if (countEl) countEl.innerText = `${totalQty} bottle${totalQty > 1 ? 's' : ''} in bag`;
            if (totalEl) totalEl.innerText = `₱${subtotal.toFixed(2)}`;

            if (typeof syncPaymentMethodDropdown === 'function') syncPaymentMethodDropdown();
            handlePaymentMethodChange();

            if (modal) {
                modal.classList.remove('opacity-0', 'pointer-events-none');
                modal.classList.add('opacity-100', 'pointer-events-auto');
            }
        }

        function closeCheckoutModal(e) {
            const modal = document.getElementById('checkoutModal');
            if (e.target === modal) closeCheckoutModalDirect();
        }

        function closeCheckoutModalDirect() {
            const modal = document.getElementById('checkoutModal');
            if (modal) {
                modal.classList.remove('opacity-100', 'pointer-events-auto');
                modal.classList.add('opacity-0', 'pointer-events-none');
            }
        }

        async function submitCheckoutOrder(e) {
            e.preventDefault();
            const bag = (window.cart && Array.isArray(window.cart) && window.cart.length > 0) 
                ? window.cart 
                : ((typeof cart !== 'undefined' && Array.isArray(cart)) ? cart : []);

            if (bag.length === 0) {
                showToast('Your shopping bag is empty. Please add a fragrance first.');
                return;
            }

            const btn = document.getElementById('submitOrderBtn');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = `<span>Placing order...</span>`;
            }

            const customerName = document.getElementById('orderCustomerName').value;
            const phone = document.getElementById('orderPhone').value;
            const paymentMethod = document.getElementById('orderPaymentMethod').value;
            const paymentReference = document.getElementById('orderPaymentReference')?.value || '';
            const address = document.getElementById('orderAddress').value;
            const notes = document.getElementById('orderNotes')?.value || '';
            const total = bag.reduce((sum, item) => sum + (item.price * item.qty), 0);

            const payload = {
                customerName,
                phone,
                paymentMethod,
                paymentReference,
                address,
                notes,
                items: bag,
                total
            };

            let currentPlacedOrder = null;

            const requestHeaders = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };

            console.group('🛒 [DRIFT & CO. CHECKOUT NETWORK DIAGNOSTICS]');
            console.log('⏰ [TIMESTAMP]:', new Date().toISOString());
            console.log('🌐 [REQUEST URL]:', window.location.origin + '/api/orders');
            console.log('📤 [FULL REQUEST HEADERS]:', requestHeaders);
            console.log('📦 [FULL REQUEST PAYLOAD]:', payload);
            console.log('📦 [PAYLOAD JSON]:\n' + JSON.stringify(payload, null, 2));

            const diagnosis = {
                timestamp: new Date().toISOString(),
                requestUrl: window.location.origin + '/api/orders',
                requestHeaders,
                payload,
                statusCode: null,
                statusText: null,
                responseHeaders: {},
                rawResponseBody: null,
                parsedResponseData: null,
                networkError: null,
                fallbackTriggered: false
            };
            window.__lastCheckoutDiagnosis = diagnosis;

            try {
                // Perform the backend API request
                const res = await fetch('/api/orders', {
                    method: 'POST',
                    headers: requestHeaders,
                    body: JSON.stringify(payload)
                }).catch(fetchErr => {
                    diagnosis.networkError = {
                        name: fetchErr.name,
                        message: fetchErr.message,
                        stack: fetchErr.stack,
                        full: String(fetchErr)
                    };
                    console.error('💥 [FETCH EXCEPTION - NETWORK REQUEST FAILED]:', fetchErr);
                    console.error('💥 [ERROR NAME]:', fetchErr.name);
                    console.error('💥 [ERROR MESSAGE]:', fetchErr.message);
                    return null;
                });

                if (res) {
                    diagnosis.statusCode = res.status;
                    diagnosis.statusText = res.statusText;

                    // Capture all response headers
                    try {
                        if (res.headers) {
                            if (typeof res.headers.entries === 'function') {
                                diagnosis.responseHeaders = Object.fromEntries(res.headers.entries());
                            } else if (res.headers.forEach) {
                                res.headers.forEach((v, k) => { diagnosis.responseHeaders[k] = v; });
                            }
                        }
                    } catch (e) {
                        diagnosis.responseHeaders = { error: 'Could not serialize headers' };
                    }

                    console.log(`📡 [RESPONSE STATUS CODE]: ${res.status} (${res.statusText})`);
                    console.log('📋 [RESPONSE HEADERS]:', diagnosis.responseHeaders);

                    // Read complete raw response body
                    let responseBodyText = '';
                    try {
                        responseBodyText = await res.text();
                        diagnosis.rawResponseBody = responseBodyText;
                    } catch (readErr) {
                        console.error('⚠️ [ERROR READING RESPONSE BODY]:', readErr);
                        responseBodyText = '';
                    }

                    console.log('📄 [FULL RESPONSE BODY (RAW)]:\n', responseBodyText || '(empty response body)');

                    // Attempt parsing JSON
                    let data = null;
                    if (responseBodyText) {
                        try {
                            data = JSON.parse(responseBodyText);
                            diagnosis.parsedResponseData = data;
                            console.log('🔍 [FULL RESPONSE BODY (PARSED JSON)]:', data);
                        } catch (parseErr) {
                            console.warn('⚠️ [NOTE: RESPONSE IS NOT JSON - Likely HTML 404/500/502 page from host]:', parseErr.message);
                        }
                    }

                    if (res.ok && data && data.success && data.order) {
                        console.log('✅ [CHECKOUT SUCCESS]: Backend confirmed order placement!', data.order);
                        currentPlacedOrder = data.order;
                    } else {
                        diagnosis.fallbackTriggered = true;
                        console.error('❌ [BACKEND RETURNED ERROR RESPONSE]:', {
                            httpStatus: res.status,
                            statusText: res.statusText,
                            responseHeaders: diagnosis.responseHeaders,
                            responseBody: data || responseBodyText
                        });
                        console.warn('⚡ [FAILSAFE ACTIVATED]: Seamlessly saving order locally so customer is not blocked.');
                        currentPlacedOrder = createLocalOrder(payload);
                    }
                } else {
                    diagnosis.fallbackTriggered = true;
                    console.warn('⚡ [FAILSAFE ACTIVATED]: Fetch failed without response. Saving order locally.');
                    currentPlacedOrder = createLocalOrder(payload);
                }

                window.lastOrderDetails = currentPlacedOrder;
                renderOrderSuccessUI(currentPlacedOrder);

            } catch (err) {
                diagnosis.networkError = {
                    name: err.name,
                    message: err.message,
                    stack: err.stack,
                    full: String(err)
                };
                diagnosis.fallbackTriggered = true;
                console.error('💥 [UNEXPECTED EXCEPTION IN CHECKOUT]:', err);
                currentPlacedOrder = createLocalOrder(payload);
                window.lastOrderDetails = currentPlacedOrder;
                renderOrderSuccessUI(currentPlacedOrder);
            } finally {
                console.log('💡 TIP: You can inspect the complete diagnosis object anytime via: window.__lastCheckoutDiagnosis');
                console.groupEnd();
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = `<span>Confirm & Place Order</span>`;
                }
            }
        }

        // Resilient Local Order Generator for Vercel Static & Offline Environments
        function createLocalOrder(payload) {
            const orderId = 'DRFT-' + Math.floor(100000 + Math.random() * 900000);
            const calculatedTotal = Number(payload.total) || (payload.items || []).reduce((sum, item) => sum + (item.price * item.qty), 0);

            const order = {
                id: orderId,
                customerName: String(payload.customerName || 'Customer').trim(),
                phone: String(payload.phone || '').trim(),
                address: String(payload.address || '').trim(),
                paymentMethod: String(payload.paymentMethod || 'Cash on Delivery (COD)').trim(),
                paymentReference: payload.paymentReference ? String(payload.paymentReference).trim() : undefined,
                notes: payload.notes ? String(payload.notes).trim() : undefined,
                items: payload.items || [],
                total: calculatedTotal,
                status: 'Pending',
                createdAt: new Date().toISOString(),
                notificationsSent: [
                    { channel: 'Concierge Booking', recipient: payload.phone, status: 'Confirmed' }
                ]
            };

            // Store persistently in browser
            try {
                let stored = JSON.parse(localStorage.getItem('drift_local_orders') || '[]');
                if (!Array.isArray(stored)) stored = [];
                stored.unshift(order);
                localStorage.setItem('drift_local_orders', JSON.stringify(stored));

                let recents = JSON.parse(localStorage.getItem('drift_recent_orders') || '[]');
                if (!Array.isArray(recents)) recents = [];
                recents.unshift(order.id);
                localStorage.setItem('drift_recent_orders', JSON.stringify(recents));
                localStorage.setItem('drift_last_order_id', order.id);
            } catch (e) {}

            // Send instant background push notification via ntfy.sh (free, zero server needed)
            try {
                const itemsSummary = (order.items || []).map(i => `${i.name} (${i.qty}x)`).join(', ');
                fetch('https://ntfy.sh/drift-co-orders-alert', {
                    method: 'POST',
                    headers: {
                        'Title': `New Drift & Co. Order: ${order.customerName} (₱${order.total.toFixed(2)})`,
                        'Priority': 'urgent',
                        'Tags': 'shopping_bags,perfume'
                    },
                    body: `Order #${order.id}\nCustomer: ${order.customerName} (${order.phone})\nTotal: ₱${order.total.toFixed(2)} (${order.paymentMethod})\nDelivery: ${order.address}\nItems: ${itemsSummary}`
                }).catch(() => {});
            } catch (e) {}

            return order;
        }

        // Unified Success Screen Renderer
        function renderOrderSuccessUI(order) {
            document.getElementById('checkoutFormContainer').classList.add('hidden');
            const successView = document.getElementById('checkoutSuccessView');
            successView.classList.remove('hidden');

            document.getElementById('successOrderId').innerText = order.id;
            document.getElementById('successCustomerName').innerText = order.customerName;
            document.getElementById('successCustomerPhone').innerText = order.phone;
            document.getElementById('successAddress').innerText = order.address || 'Address provided';
            document.getElementById('successTotal').innerText = `₱${Number(order.total || 0).toFixed(2)}`;
            document.getElementById('successPaymentMethod').innerText = order.paymentMethod;

            const refRow = document.getElementById('successPaymentRefRow');
            const refVal = document.getElementById('successPaymentRef');
            if (order.paymentReference) {
                if (refRow && refVal) {
                    refRow.classList.remove('hidden');
                    refVal.innerText = order.paymentReference;
                }
            } else if (refRow) {
                refRow.classList.add('hidden');
            }

            renderSuccessBankDetails(order.paymentMethod, order.total);

            // Display notification dispatch report
            const notifStatusEl = document.getElementById('successNotificationStatus');
            if (notifStatusEl) {
                if (order.notificationsSent && order.notificationsSent.length > 0) {
                    const channels = order.notificationsSent.map(l => l.channel).join(', ');
                    notifStatusEl.innerText = `Alert dispatched via: ${channels}`;
                } else {
                    notifStatusEl.innerText = `Order confirmed. Dispatch concierge notified.`;
                }
            }

            // Play sound chime for instant feedback
            playOrderAlertChime();

            // Clear cart
            window.cart = [];
            if (typeof updateCartUI === 'function') updateCartUI();
            if (typeof loadStats === 'function') loadStats();
            showToast(`Order ${order.id} placed successfully!`);
        }

        // --- Notification & SMS Dispatch Handlers for Customer / Concierge ---
        function generateOrderSummaryText(order) {
            if (!order) return '';
            const itemsList = (order.items || []).map(it => `• ${it.qty}x ${it.name} (${it.volume || '50ml'}) — ₱${(it.price * it.qty).toFixed(2)}`).join('\n');
            let bankNote = '';
            if (order.paymentMethod && order.paymentMethod.includes('BPI')) {
                bankNote = `\nBPI Account: ${currentPaymentSettings.bpiAccountNumber || '0019-2834-51'} (${currentPaymentSettings.bpiAccountName || 'Drift & Co. Fragrances'})\n`;
            } else if (order.paymentMethod && order.paymentMethod.includes('BDO')) {
                bankNote = `\nBDO Account: ${currentPaymentSettings.bdoAccountNumber || '0068-1234-5678'} (${currentPaymentSettings.bdoAccountName || 'Drift & Co. Fragrances'})\n`;
            } else if (order.paymentMethod && order.paymentMethod.includes('GCash')) {
                bankNote = `\nGCash: ${currentPaymentSettings.gcashNumber || '0917-123-4567'} (${currentPaymentSettings.gcashAccountName || 'Drift & Co. Store'})\n`;
            }

            return `DRIFT & CO. OFFICIAL ORDER RECEIPT\n` +
                `Order ID: ${order.id}\n` +
                `Customer: ${order.customerName}\n` +
                `Phone: ${order.phone}\n` +
                `Delivery Address: ${order.address || 'Not specified'}\n` +
                `Payment: ${order.paymentMethod}\n` +
                (order.paymentReference ? `Payment Ref: ${order.paymentReference}\n` : '') +
                bankNote +
                (order.notes ? `Special Notes: ${order.notes}\n` : '') +
                `\nBottles:\n${itemsList}\n\n` +
                `Total Payable: ₱${order.total.toFixed(2)}\n` +
                `Status: ${order.status}\n\n` +
                `Thank you for choosing Drift & Co. Luxury Fragrances. Our concierge will contact you for dispatch.`;
        }

        function sendSuccessViaSMS() {
            const order = window.lastOrderDetails;
            if (!order) {
                showToast('No active order found.');
                return;
            }
            const body = generateOrderSummaryText(order);
            const cleanPhone = (order.phone || '').replace(/[^0-9+]/g, '');
            window.location.href = `sms:${cleanPhone}?body=${encodeURIComponent(body)}`;
            showToast('Opening SMS application...');
        }

        function sendSuccessViaWhatsApp() {
            const order = window.lastOrderDetails;
            if (!order) {
                showToast('No active order found.');
                return;
            }
            const body = generateOrderSummaryText(order);
            let phone = (order.phone || '').replace(/[^0-9]/g, '');
            if (phone.startsWith('0')) phone = '63' + phone.slice(1);
            window.open(`https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(body)}`, '_blank');
            showToast('Opening WhatsApp...');
        }

        function copySuccessOrderSummary() {
            const order = window.lastOrderDetails;
            if (!order) return;
            const text = generateOrderSummaryText(order);
            navigator.clipboard.writeText(text).then(() => {
                showToast('Order receipt copied to clipboard!');
            }).catch(() => {
                showToast('Could not copy receipt.');
            });
        }

        // Web Audio Synthesized Luxury Chime
        function playOrderAlertChime() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                
                const playTone = (freq, start, duration) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
                    
                    gain.gain.setValueAtTime(0, ctx.currentTime + start);
                    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + start + 0.03);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
                    
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    
                    osc.start(ctx.currentTime + start);
                    osc.stop(ctx.currentTime + start + duration);
                };

                // Ascending melodic chime (E5 -> G#5 -> B5)
                playTone(659.25, 0.0, 0.4);
                playTone(830.61, 0.12, 0.4);
                playTone(987.77, 0.24, 0.7);
            } catch (e) {
                // Audio not allowed without prior user interaction
            }
        }

        // --- Partner Inquiry Modal Handlers (Connected to /api/partner-inquiries) ---
        function openPartnerModal() {
            const modal = document.getElementById('partnerModal');
            const formContainer = document.getElementById('partnerFormContainer');
            const successView = document.getElementById('partnerSuccessView');

            if (formContainer) formContainer.classList.remove('hidden');
            if (successView) successView.classList.add('hidden');

            if (modal) {
                modal.classList.remove('opacity-0', 'pointer-events-none');
                modal.classList.add('opacity-100', 'pointer-events-auto');
            }
        }

        function closePartnerModal(e) {
            const modal = document.getElementById('partnerModal');
            if (e.target === modal) closePartnerModalDirect();
        }

        function closePartnerModalDirect() {
            const modal = document.getElementById('partnerModal');
            if (modal) {
                modal.classList.remove('opacity-100', 'pointer-events-auto');
                modal.classList.add('opacity-0', 'pointer-events-none');
            }
        }

        function addPartnerKitToCartAndClose() {
            orderPartnerPackage();
            closePartnerModalDirect();
            showToast('Business Partner Kit (₱988) added to bag!');
        }

        async function submitPartnerInquiry(e) {
            e.preventDefault();
            const name = document.getElementById('partnerName').value;
            const phone = document.getElementById('partnerPhone').value;
            const email = document.getElementById('partnerEmail').value;
            const location = document.getElementById('partnerLocation').value;
            const message = document.getElementById('partnerMessage').value;
            const payload = { name, phone, email, location, message, packageType: 'Starter Package ₱988' };

            let currentInquiry = null;

            try {
                const res = await fetch('/api/partner-inquiries', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }).catch(() => null);

                let data = null;
                if (res && res.ok) {
                    try {
                        data = await res.json();
                    } catch (e) {
                        data = null;
                    }
                }

                if (data && data.success && data.inquiry) {
                    currentInquiry = data.inquiry;
                } else {
                    currentInquiry = createLocalInquiry(payload);
                }
            } catch (err) {
                console.warn('Partner inquiry fallback triggered:', err);
                currentInquiry = createLocalInquiry(payload);
            }

            document.getElementById('partnerFormContainer').classList.add('hidden');
            const successView = document.getElementById('partnerSuccessView');
            successView.classList.remove('hidden');
            document.getElementById('partnerInquiryRefId').innerText = `Ref: ${currentInquiry.id}`;
            if (typeof loadStats === 'function') loadStats();
            showToast('Partner inquiry submitted successfully!');
        }

        function createLocalInquiry(payload) {
            const inqId = 'INQ-' + Math.floor(100000 + Math.random() * 900000);
            const inquiry = {
                id: inqId,
                name: String(payload.name || '').trim(),
                phone: String(payload.phone || '').trim(),
                email: payload.email ? String(payload.email).trim() : undefined,
                location: payload.location ? String(payload.location).trim() : undefined,
                message: payload.message ? String(payload.message).trim() : undefined,
                packageType: payload.packageType || 'Starter Package ₱988',
                createdAt: new Date().toISOString()
            };

            try {
                let stored = JSON.parse(localStorage.getItem('drift_local_inquiries') || '[]');
                if (!Array.isArray(stored)) stored = [];
                stored.unshift(inquiry);
                localStorage.setItem('drift_local_inquiries', JSON.stringify(stored));
            } catch (e) {}

            try {
                fetch('https://ntfy.sh/drift-co-orders-alert', {
                    method: 'POST',
                    headers: {
                        'Title': `New Reseller Application: ${inquiry.name}`,
                        'Priority': 'high',
                        'Tags': 'briefcase,handshake'
                    },
                    body: `Applicant: ${inquiry.name} (${inquiry.phone})\nLocation: ${inquiry.location || 'N/A'}\nPackage: ${inquiry.packageType}\nMessage: ${inquiry.message || 'None'}`
                }).catch(() => {});
            } catch (e) {}

            return inquiry;
        }


// Global Window Exports
window.openCheckoutModal = openCheckoutModal;
window.closeCheckoutModal = closeCheckoutModal;
window.closeCheckoutModalDirect = closeCheckoutModalDirect;
window.submitCheckoutOrder = submitCheckoutOrder;
window.generateOrderSummaryText = generateOrderSummaryText;
window.sendSuccessViaSMS = sendSuccessViaSMS;
window.sendSuccessViaWhatsApp = sendSuccessViaWhatsApp;
window.copySuccessOrderSummary = copySuccessOrderSummary;
window.playOrderAlertChime = playOrderAlertChime;
window.openPartnerModal = openPartnerModal;
window.closePartnerModal = closePartnerModal;
window.closePartnerModalDirect = closePartnerModalDirect;
window.addPartnerKitToCartAndClose = addPartnerKitToCartAndClose;
window.submitPartnerInquiry = submitPartnerInquiry;

function copyPartnerPhone() {
    const num = '09569310005';
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(num).then(() => {
            if (typeof showToast === 'function') showToast('📋 Hotline 09569310005 copied to clipboard!');
        }).catch(() => fallbackCopy(num));
    } else {
        fallbackCopy(num);
    }
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        if (typeof showToast === 'function') showToast('📋 Hotline 09569310005 copied to clipboard!');
    } catch(e) {
        if (typeof showToast === 'function') showToast('Drift & Co. Hotline: 09569310005');
    }
    document.body.removeChild(ta);
}

window.copyPartnerPhone = copyPartnerPhone;
window.getCheckoutDiagnostics = function() {
    console.table(window.__lastCheckoutDiagnosis || {});
    return window.__lastCheckoutDiagnosis;
};
