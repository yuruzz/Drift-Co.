// Drift & Co. — Shopping Bag & Cart State
// Real-time calculation, bag drawer & quick add

window.cart = window.cart || [];

// Helper DOM Element Accessors
function getCartElements() {
    return {
        drawer: document.getElementById('cartDrawer'),
        overlay: document.getElementById('cartOverlay'),
        itemsContainer: document.getElementById('cartItems'),
        count: document.getElementById('cartCount'),
        subtotal: document.getElementById('cartSubtotal'),
        totalItems: document.getElementById('cartTotalItems')
    };
}

// Shopping Bag / Cart Drawer Logic
function openCart() {
    const el = getCartElements();
    if (el.drawer) el.drawer.classList.remove('translate-x-full');
    if (el.overlay) {
        el.overlay.classList.remove('opacity-0', 'pointer-events-none');
        el.overlay.classList.add('opacity-100', 'pointer-events-auto');
    }
}

function closeCart() {
    const el = getCartElements();
    if (el.drawer) el.drawer.classList.add('translate-x-full');
    if (el.overlay) {
        el.overlay.classList.remove('opacity-100', 'pointer-events-auto');
        el.overlay.classList.add('opacity-0', 'pointer-events-none');
    }
}

function addToCart(name, price, image, volume = '40ml') {
    const list = window.cart;
    const existing = list.find(item => item.name === name && item.volume === volume);
    if (existing) {
        existing.qty += 1;
    } else {
        list.push({ name, price, image, volume, qty: 1 });
    }
    updateCartUI();
    openCart();
}

function changeCartQty(index, change) {
    const list = window.cart;
    if (!list[index]) return;
    list[index].qty += change;
    if (list[index].qty <= 0) {
        list.splice(index, 1);
    }
    updateCartUI();
}

function removeCartItem(index) {
    const list = window.cart;
    if (!list[index]) return;
    list.splice(index, 1);
    updateCartUI();
}

function orderPartnerPackage() {
    addToCart("Drift & Co. Business Partner Kit (1x 50ml EDP + 10x Testers + Catalog)", 988, "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&q=80&w=800", "Starter Kit");
}

function updateCartUI() {
    const list = window.cart;
    const el = getCartElements();
    const totalQty = list.reduce((sum, item) => sum + item.qty, 0);
    const subtotal = list.reduce((sum, item) => sum + (item.price * item.qty), 0);

    if (el.count) el.count.innerText = totalQty;
    if (el.totalItems) el.totalItems.innerText = totalQty;
    if (el.subtotal) el.subtotal.innerText = `₱${subtotal.toFixed(2)}`;

    if (!el.itemsContainer) return;

    if (list.length === 0) {
        el.itemsContainer.innerHTML = `
            <div class="text-center py-16 text-stone-500">
                <svg class="w-12 h-12 mx-auto text-stone-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
                </svg>
                <p class="font-cormorant text-xl text-stone-800">Your shopping bag is empty.</p>
                <p class="text-xs text-stone-400 mt-1">Discover our 30% oil concentration perfumes.</p>
            </div>
        `;
    } else {
        el.itemsContainer.innerHTML = list.map((item, index) => `
            <div class="flex items-center gap-4 bg-white p-3 border border-[#E8E2D8] rounded-xs">
                <img src="${item.image}" alt="${item.name}" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&q=80&w=800';" class="w-16 h-20 object-cover rounded-xs bg-[#F3EEE7]">
                <div class="flex-1 min-w-0">
                    <h4 class="font-cormorant font-medium text-stone-900 truncate text-base">${item.name}</h4>
                    <p class="text-[11px] text-stone-500">${item.volume} • ₱${item.price.toFixed(2)}</p>
                    <div class="flex items-center gap-2 mt-2">
                        <button onclick="changeCartQty(${index}, -1)" class="w-5 h-5 flex items-center justify-center border border-stone-300 text-stone-600 hover:border-black text-xs cursor-pointer">-</button>
                        <span class="text-xs font-semibold px-1">${item.qty}</span>
                        <button onclick="changeCartQty(${index}, 1)" class="w-5 h-5 flex items-center justify-center border border-stone-300 text-stone-600 hover:border-black text-xs cursor-pointer">+</button>
                    </div>
                </div>
                <div class="text-right">
                    <span class="block text-xs font-semibold text-[#1A1817]">₱${(item.price * item.qty).toFixed(2)}</span>
                    <button onclick="removeCartItem(${index})" class="text-[11px] text-stone-400 hover:text-red-500 mt-2 cursor-pointer">&times; Remove</button>
                </div>
            </div>
        `).join('');
    }
}

function proceedToCheckout() {
    if (window.cart.length === 0) {
        if (typeof showToast === 'function') showToast('Your shopping bag is empty. Please select a fragrance to proceed.');
        return;
    }
    closeCart();
    if (typeof openCheckoutModal === 'function') openCheckoutModal();
}


// Global Window Exports
window.openCart = openCart;
window.closeCart = closeCart;
window.addToCart = addToCart;
window.changeCartQty = changeCartQty;
window.removeCartItem = removeCartItem;
window.orderPartnerPackage = orderPartnerPackage;
window.updateCartUI = updateCartUI;
window.proceedToCheckout = proceedToCheckout;
