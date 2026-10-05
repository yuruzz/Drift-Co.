// Drift & Co. — Checkout & Payment Systems
// BPI, BDO, GCash integration, order placement & partner inquiries

window.lastOrderDetails = null;
window.deliveryQuote = null;
window.selectedDeliveryQuoteToken = '';

let deliveryMap = null;
let deliveryMapMarker = null;
let pendingMapLocation = null;
let deliveryMapReady = false;
let quoteRequestId = 0;
let addressSearchRequestId = 0;
window.deliveryPricing = null;
const PILA_TOWN_CENTER = [14.2376712, 121.3644522];

function getCheckoutSubtotal() {
    return (window.cart || []).reduce((sum, item) => sum + (Number(item.price) * Number(item.qty)), 0);
}

function getCheckoutShippingPricing() {
    return (window.cart || []).reduce((pricing, item) => {
        const quantity = Number(item.qty);
        const lineSubtotal = Number(item.price) * quantity;
        if (item.volume === 'Starter Kit') {
            pricing.partnerKitCount += quantity;
        } else {
            pricing.bottleSubtotal += lineSubtotal;
            pricing.shippingWeightGrams += 500 * quantity;
        }
        return pricing;
    }, { bottleSubtotal: 0, shippingWeightGrams: 0, partnerKitCount: 0 });
}

function updateCheckoutTotals() {
    const subtotal = getCheckoutSubtotal();
    const subtotalEl = document.getElementById('checkoutSubtotal');
    const deliveryEl = document.getElementById('checkoutDeliveryFee');
    const totalEl = document.getElementById('checkoutTotalAmount');
    const countEl = document.getElementById('checkoutItemCount');
    const totalQty = (window.cart || []).reduce((sum, item) => sum + Number(item.qty), 0);

    if (countEl) countEl.innerText = `${totalQty} item${totalQty === 1 ? '' : 's'} in bag`;
    if (subtotalEl) subtotalEl.innerText = `₱${subtotal.toFixed(2)}`;

    const quote = window.deliveryQuote;
    if (!quote) {
        if (deliveryEl) deliveryEl.innerText = 'Select an address';
        if (totalEl) totalEl.innerText = 'Select an address';
        const totalLabel = document.getElementById('checkoutTotalLabel');
        if (totalLabel) totalLabel.innerText = 'Total';
        return;
    }

    const cartPricing = getCheckoutShippingPricing();
    if (quote.subtotal !== subtotal
        || quote.bottleSubtotal !== cartPricing.bottleSubtotal
        || quote.shippingWeightGrams !== cartPricing.shippingWeightGrams
        || quote.partnerKitCount !== cartPricing.partnerKitCount) {
        window.deliveryQuote = null;
        window.selectedDeliveryQuoteToken = '';
        if (deliveryEl) deliveryEl.innerText = 'Select address again';
        if (totalEl) totalEl.innerText = 'Recalculate delivery';
        setDeliveryAddressStatus('Your bag changed. Select the delivery address again to refresh the J&T rate.', true);
        return;
    }

    const deliveryFee = quote.deliveryFee;
    const manualConfirmation = quote.shippingConfirmationReasons?.length > 0;
    if (deliveryEl) {
        if (deliveryFee === null) {
            deliveryEl.innerText = 'To be confirmed';
        } else {
            deliveryEl.innerText = deliveryFee === 0
                ? `Free (${quote.zone || 'zone pending'})`
                : `₱${deliveryFee.toFixed(2)} (${quote.zone})`;
        }
    }
    if (totalEl) {
        const provisionalTotal = subtotal + (deliveryFee || 0);
        totalEl.innerText = `₱${provisionalTotal.toFixed(2)}${manualConfirmation ? ' + shipping TBD' : ''}`;
    }
    const totalLabel = document.getElementById('checkoutTotalLabel');
    if (totalLabel) totalLabel.innerText = manualConfirmation ? 'Provisional total' : 'Total';
}

function setDeliveryAddressStatus(message, isError = false) {
    const status = document.getElementById('deliveryAddressStatus');
    if (!status) return;
    status.innerText = message;
    status.classList.toggle('text-red-600', isError);
    status.classList.toggle('text-stone-500', !isError);
}

function initializeDeliveryMap() {
    if (deliveryMapReady) {
        requestAnimationFrame(() => deliveryMap.invalidateSize());
        return;
    }
    if (!window.L) {
        setDeliveryAddressStatus('The map could not be loaded. Please try again later.', true);
        return;
    }

    const mapElement = document.getElementById('deliveryMap');
    if (!mapElement) return;
    deliveryMap = L.map(mapElement).setView(PILA_TOWN_CENTER, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'
    }).addTo(deliveryMap);

    deliveryMap.on('click', event => {
        pendingMapLocation = event.latlng;
        window.deliveryQuote = null;
        window.selectedDeliveryQuoteToken = '';
        document.getElementById('orderAddress').value = '';
        updateCheckoutTotals();
        if (deliveryMapMarker) deliveryMapMarker.setLatLng(event.latlng);
        else deliveryMapMarker = L.marker(event.latlng).addTo(deliveryMap);
        document.getElementById('useDeliveryMapPin').disabled = false;
        setDeliveryAddressStatus('Map pin selected. Choose “Use selected map pin” to verify the address and calculate delivery.');
    });
    document.getElementById('deliveryAddressSearchButton').addEventListener('click', searchDeliveryAddress);
    document.getElementById('deliveryAddressSearch').addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            searchDeliveryAddress();
        }
    });
    document.getElementById('useDeliveryMapPin').addEventListener('click', () => {
        if (pendingMapLocation) selectDeliveryLocation(pendingMapLocation.lat, pendingMapLocation.lng);
    });
    deliveryMapReady = true;
    setTimeout(() => deliveryMap.invalidateSize(), 100);
}

async function searchDeliveryAddress() {
    const searchInput = document.getElementById('deliveryAddressSearch');
    const resultsContainer = document.getElementById('deliveryAddressResults');
    const query = searchInput.value.trim();
    if (query.length < 3) {
        setDeliveryAddressStatus('Enter at least 3 characters to search for an address.', true);
        return;
    }

    const requestId = ++addressSearchRequestId;
    resultsContainer.replaceChildren();
    resultsContainer.classList.remove('hidden');
    setDeliveryAddressStatus('Searching for matching addresses...');

    try {
        const response = await fetch(`/api/delivery/search?q=${encodeURIComponent(query)}`, {
            headers: { 'Accept': 'application/json' }
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Unable to search for this address.');
        }
        if (requestId !== addressSearchRequestId) return;
        if (!result.addresses.length) {
            setDeliveryAddressStatus('No matching addresses found. Try a nearby landmark or select the map.', true);
            return;
        }

        result.addresses.forEach(address => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'block w-full px-3 py-2 text-left text-[11px] text-stone-700 hover:bg-[#FAF8F5]';
            option.textContent = address.address;
            option.addEventListener('click', () => {
                resultsContainer.classList.add('hidden');
                deliveryMap.setView([address.latitude, address.longitude], 16);
                selectDeliveryLocation(address.latitude, address.longitude);
            });
            resultsContainer.appendChild(option);
        });
        setDeliveryAddressStatus('Choose the matching address from the results.');
    } catch (error) {
        if (requestId !== addressSearchRequestId) return;
        setDeliveryAddressStatus(error.message || 'Unable to search for this address.', true);
    }
}

async function selectDeliveryLocation(latitude, longitude) {
    const requestId = ++quoteRequestId;
    window.deliveryQuote = null;
    window.selectedDeliveryQuoteToken = '';
    document.getElementById('orderAddress').value = '';
    document.getElementById('useDeliveryMapPin').disabled = true;
    updateCheckoutTotals();
    setDeliveryAddressStatus('Verifying the location and checking J&T rates...');

    try {
        const response = await fetch('/api/delivery-quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                latitude,
                longitude,
                items: window.cart || []
            })
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Unable to calculate the delivery charge.');
        }
        if (requestId !== quoteRequestId) return;
        window.deliveryQuote = result;
        window.deliveryPricing = result.pricing;
        window.selectedDeliveryQuoteToken = result.deliveryToken;
        pendingMapLocation = { lat: result.latitude, lng: result.longitude };
        if (deliveryMapMarker) deliveryMapMarker.setLatLng(pendingMapLocation);
        else deliveryMapMarker = L.marker(pendingMapLocation).addTo(deliveryMap);
        document.getElementById('orderAddress').value = result.address;
        updateCheckoutTotals();
        const rateText = result.deliveryFee === null
            ? 'Shipping needs manual confirmation.'
            : result.deliveryFee === 0
                ? `J&T delivery is free for the bottle subtotal (${result.zone || 'zone pending'}).`
                : `J&T ${result.zone} rate: ₱${result.deliveryFee.toFixed(2)}.`;
        const manualText = result.shippingConfirmationReasons?.length
            ? ` ${result.shippingConfirmationReasons.join(' ')}`
            : '';
        setDeliveryAddressStatus(
            `${rateText} Nearest office: ${result.origin} (${result.distanceKm.toFixed(2)} km).${manualText}`,
            false,
        );
    } catch (error) {
        if (requestId !== quoteRequestId) return;
        window.deliveryQuote = null;
        setDeliveryAddressStatus(error.message || 'Unable to verify the selected address.', true);
        updateCheckoutTotals();
    }
}

        // --- Checkout Modal Handlers (Connected to /api/orders) ---
        function openCheckoutModal() {
            const modal = document.getElementById('checkoutModal');
            const formContainer = document.getElementById('checkoutFormContainer');
            const successView = document.getElementById('checkoutSuccessView');
            
            if (formContainer) formContainer.classList.remove('hidden');
            if (successView) successView.classList.add('hidden');

            updateCheckoutTotals();
            initializeDeliveryMap();

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
            if (!window.deliveryQuote || !window.selectedDeliveryQuoteToken) {
                showToast('Search for an address or select a map location and wait for the delivery quote.');
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
            const isQrPhPayment = paymentMethod === 'QR Ph';
            const address = document.getElementById('orderAddress').value;
            const addressDetails = document.getElementById('orderAddressDetails').value;
            const notes = document.getElementById('orderNotes')?.value || '';
            const total = bag.reduce((sum, item) => sum + (item.price * item.qty), 0);

            const payload = {
                customerName,
                phone,
                paymentMethod,
                paymentReference,
                address,
                addressDetails,
                deliveryQuoteToken: window.selectedDeliveryQuoteToken,
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
            console.log('📦 [ORDER SUMMARY]:', {
                itemCount: bag.reduce((sum, item) => sum + Number(item.qty), 0),
                paymentMethod
            });

            const diagnosis = {
                timestamp: new Date().toISOString(),
                requestUrl: window.location.origin + '/api/orders',
                itemCount: bag.reduce((sum, item) => sum + Number(item.qty), 0),
                paymentMethod,
                statusCode: null,
                statusText: null,
                responseHeaders: {},
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
                    // Read complete raw response body
                    let responseBodyText = '';
                    try {
                        responseBodyText = await res.text();
                    } catch (readErr) {
                        console.error('Unable to read the order response:', readErr);
                        responseBodyText = '';
                    }

                    // Attempt parsing JSON
                    let data = null;
                    if (responseBodyText) {
                        try {
                            data = JSON.parse(responseBodyText);
                        } catch (parseErr) {
                            console.warn('Order service returned an invalid response format:', parseErr.message);
                        }
                    }

                    if (res.ok && data && data.success && data.order) {
                        currentPlacedOrder = data.order;
                        if (isQrPhPayment) {
                            if (typeof data.payment?.qrCodeDataUrl !== 'string') {
                                throw new Error('The QR Ph code was not returned. Please retry or contact the store.');
                            }
                            currentPlacedOrder.qrCodeDataUrl = data.payment.qrCodeDataUrl;
                        }
                    } else {
                        console.error('Order service rejected the request:', res.status, data?.error || res.statusText);
                        throw new Error(data?.error || 'The order could not be confirmed. Please retry.');
                    }
                } else {
                    throw new Error('Could not connect to the order service. Your order was not confirmed; please retry.');
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
                console.error('Checkout failed:', err);
                showToast(err.message || 'Unable to place your order. Please retry.');
            } finally {
                console.log('💡 TIP: You can inspect the complete diagnosis object anytime via: window.__lastCheckoutDiagnosis');
                console.groupEnd();
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = `<span>Confirm & Place Order</span>`;
                }
            }
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
            document.getElementById('successTotal').innerText = `₱${Number(order.total || 0).toFixed(2)}${order.shippingConfirmationRequired ? ' (provisional)' : ''}`;
            const subtotalRow = document.getElementById('successSubtotalRow');
            const deliveryFeeRow = document.getElementById('successDeliveryFeeRow');
            subtotalRow?.classList.add('hidden');
            deliveryFeeRow?.classList.add('hidden');
            if (Number.isFinite(Number(order.subtotal)) && subtotalRow) {
                subtotalRow.classList.remove('hidden');
                document.getElementById('successSubtotal').innerText = `₱${Number(order.subtotal).toFixed(2)}`;
            }
            if (order.deliveryFee !== null && Number.isFinite(Number(order.deliveryFee)) && deliveryFeeRow) {
                deliveryFeeRow.classList.remove('hidden');
                document.getElementById('successDeliveryFee').innerText = Number(order.deliveryFee) === 0
                    ? (order.shippingConfirmationRequired ? 'Free for bottles; remaining shipping to confirm' : 'Free')
                    : `₱${Number(order.deliveryFee).toFixed(2)}${order.shippingConfirmationRequired ? ' for bottles; remaining shipping to confirm' : ` (${order.shippingZone || 'J&T'})`}`;
            } else if (order.shippingConfirmationRequired && deliveryFeeRow) {
                deliveryFeeRow.classList.remove('hidden');
                document.getElementById('successDeliveryFee').innerText = 'Shipping charge to be confirmed';
            }
            document.getElementById('successPaymentMethod').innerText = order.paymentMethod;
            const isQrPhPayment = order.paymentMethod === 'QR Ph';
            const successIcon = document.getElementById('successOrderIcon');
            if (successIcon) {
                successIcon.innerText = isQrPhPayment ? '₱' : '✓';
                successIcon.className = isQrPhPayment
                    ? 'w-14 h-14 bg-amber-100 text-amber-800 rounded-full flex items-center justify-center mx-auto text-2xl font-bold shadow-xs'
                    : 'w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-2xl font-bold shadow-xs';
            }
            const successTitle = document.getElementById('successOrderTitle');
            const successSubtitle = document.getElementById('successOrderSubtitle');
            if (successTitle) successTitle.innerText = isQrPhPayment ? 'Scan to Pay' : 'Order Confirmed!';
            if (successSubtitle) successSubtitle.innerText = isQrPhPayment
                ? 'Your order is reserved until PayMongo confirms your payment.'
                : order.shippingConfirmationRequired
                    ? 'Your order is received. Drift & Co. will confirm the final shipping charge before dispatch.'
                    : 'Notification & order receipt dispatched';

            const qrBox = document.getElementById('successQrPaymentBox');
            const qrImage = document.getElementById('successQrCode');
            if (qrBox && qrImage) {
                qrBox.classList.toggle('hidden', !isQrPhPayment || !order.qrCodeDataUrl);
                if (isQrPhPayment && order.qrCodeDataUrl) qrImage.src = order.qrCodeDataUrl;
                else qrImage.removeAttribute('src');
            }

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

            if (order.shippingConfirmationRequired) {
                document.getElementById('successBankDetailsBox')?.classList.add('hidden');
            } else {
                renderSuccessBankDetails(order.paymentMethod, order.total);
            }

            // Display notification dispatch report
            const notifStatusEl = document.getElementById('successNotificationStatus');
            const paymentBanner = document.getElementById('successPaymentBanner');
            if (notifStatusEl) {
                if (isQrPhPayment) {
                    notifStatusEl.innerText = order.paymentStatus === 'Paid'
                        ? 'Payment received and verified securely by PayMongo.'
                        : 'Payment status: Pending — waiting for PayMongo confirmation.';
                } else if (order.notificationsSent && order.notificationsSent.length > 0) {
                    const channels = order.notificationsSent.map(l => l.channel).join(', ');
                    notifStatusEl.innerText = `Alert dispatched via: ${channels}`;
                } else {
                    notifStatusEl.innerText = `Order confirmed. Dispatch concierge notified.`;
                }
            }
            if (paymentBanner && isQrPhPayment && order.paymentStatus !== 'Paid') {
                paymentBanner.className = 'bg-amber-50 border border-amber-200 text-amber-900 text-[11px] p-2.5 rounded-xs flex items-center justify-center gap-2 max-w-sm mx-auto';
            }

            // Play sound chime for instant feedback
            playOrderAlertChime();

            // Clear cart
            window.cart = [];
            if (typeof updateCartUI === 'function') updateCartUI();
            if (typeof loadStats === 'function') loadStats();
            showToast(`Order ${order.id} placed successfully!`);
            if (isQrPhPayment && order.paymentStatus !== 'Paid') pollQrPhPaymentStatus(order.id);
        }

        async function pollQrPhPaymentStatus(orderId) {
            const deadline = Date.now() + 30 * 60 * 1000;
            while (Date.now() < deadline) {
                await new Promise(resolve => setTimeout(resolve, 8000));
                try {
                    const response = await fetch(`/api/orders/track/${encodeURIComponent(orderId)}`);
                    if (!response.ok) continue;
                    const data = await response.json();
                    const paymentStatus = data.order?.paymentStatus;
                    if (paymentStatus === 'Paid') {
                        const status = document.getElementById('successNotificationStatus');
                        if (status) status.innerText = 'Payment received and verified securely by PayMongo.';
                        const banner = document.getElementById('successPaymentBanner');
                        if (banner) banner.className = 'bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] p-2.5 rounded-xs flex items-center justify-center gap-2 max-w-sm mx-auto';
                        const title = document.getElementById('successOrderTitle');
                        if (title) title.innerText = 'Payment Received';
                        const subtitle = document.getElementById('successOrderSubtitle');
                        if (subtitle) subtitle.innerText = 'PayMongo verified your QR Ph payment.';
                        const qrBox = document.getElementById('successQrPaymentBox');
                        if (qrBox) qrBox.classList.add('hidden');
                        const icon = document.getElementById('successOrderIcon');
                        if (icon) {
                            icon.innerText = '✓';
                            icon.className = 'w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-2xl font-bold shadow-xs';
                        }
                        showToast(`Payment received for order ${orderId}.`);
                        return;
                    }
                    if (paymentStatus === 'Expired' || paymentStatus === 'Failed') {
                        const status = document.getElementById('successNotificationStatus');
                        if (status) status.innerText = `Payment ${paymentStatus.toLowerCase()}. Please place a new order or contact the store.`;
                        const title = document.getElementById('successOrderTitle');
                        if (title) title.innerText = `QR Ph ${paymentStatus}`;
                        const subtitle = document.getElementById('successOrderSubtitle');
                        if (subtitle) subtitle.innerText = 'This order has not been paid.';
                        return;
                    }
                } catch (error) {
                    console.error('QR Ph payment status check failed:', error);
                }
            }
        }

        // --- Notification & SMS Dispatch Handlers for Customer / Concierge ---
        function generateOrderSummaryText(order) {
            if (!order) return '';
            const itemsList = (order.items || []).map(it => `• ${it.qty}x ${it.name} (${it.volume || '50ml'}) — ₱${(it.price * it.qty).toFixed(2)}`).join('\n');
            let bankNote = '';
            if (order.paymentMethod && order.paymentMethod.includes('BPI')) {
                bankNote = `\nBPI Account: ${currentPaymentSettings.bpiAccountNumber} (${currentPaymentSettings.bpiAccountName})\n`;
            } else if (order.paymentMethod && order.paymentMethod.includes('BDO')) {
                bankNote = `\nBDO Account: ${currentPaymentSettings.bdoAccountNumber} (${currentPaymentSettings.bdoAccountName})\n`;
            } else if (order.paymentMethod && order.paymentMethod.includes('GCash')) {
                bankNote = `\nGCash: ${currentPaymentSettings.gcashNumber} (${currentPaymentSettings.gcashAccountName})\n`;
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
