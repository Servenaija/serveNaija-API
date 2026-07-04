const Cart = require("../models/cart");

async function getCartTotal(userId) {
  const cart = await Cart.findOne({ user: userId }).populate('items.product');

  if (!cart) return { total: 0, items: [] };

  const total = cart.items.reduce((sum, item) => {
    return sum + item.product.price * item.quantity;
  }, 0);

  return { total, items: cart.items };
}

function getDeliveryFeeForRestaurant(restaurantId) {
  // Placeholder logic: could be based on distance, etc.
  return 800; // flat fee in cents or whatever currency
}

module.exports = {
    getCartTotal,
    getDeliveryFeeForRestaurant,
}