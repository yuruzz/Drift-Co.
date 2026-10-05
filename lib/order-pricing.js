const productsByVolume = {
  '40ml': { price: 380, shippingWeightGrams: 500 },
  '50ml': { price: 450, shippingWeightGrams: 500 },
  'Starter Kit': { price: 988, shippingWeightGrams: 0 },
};

export function calculateOrderPricing(items) {
  if (!Array.isArray(items) || items.length === 0) {
    const error = new Error('The bag is empty or contains invalid items.');
    error.statusCode = 400;
    throw error;
  }
  return items.reduce((pricing, item) => {
    const product = productsByVolume[item?.volume];
    const quantity = Number(item?.qty);
    if (!product || Number(item?.price) !== product.price
      || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
      const error = new Error('The bag contains an invalid item, price, or quantity.');
      error.statusCode = 400;
      throw error;
    }
    const lineSubtotal = product.price * quantity;
    const isPartnerKit = item.volume === 'Starter Kit';
    pricing.subtotal += lineSubtotal;
    if (isPartnerKit) {
      pricing.partnerKitCount += quantity;
    } else {
      pricing.bottleSubtotal += lineSubtotal;
      pricing.shippingWeightGrams += product.shippingWeightGrams * quantity;
    }
    return pricing;
  }, {
    subtotal: 0,
    bottleSubtotal: 0,
    shippingWeightGrams: 0,
    partnerKitCount: 0,
  });
}

export function calculateOrderSubtotal(items) {
  return calculateOrderPricing(items).subtotal;
}
