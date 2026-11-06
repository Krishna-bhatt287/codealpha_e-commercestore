import {
  api,
  initPage,
  setCartCount,
  escapeHtml,
  formatPrice,
  shippingFor,
  freeShippingRemaining,
  quantityOptions,
  toast,
} from './common.js'

const { cart: initialCart, user } = await initPage()
const root = document.getElementById('cart-root')

function render(cart) {
  setCartCount(cart.count)

  if (cart.items.length === 0) {
    root.innerHTML = `
      <div class="panel empty-state">
        <p>Your cart is empty.</p>
        <a href="/" class="btn">Browse products</a>
      </div>`
    return
  }

  const shipping = shippingFor(cart.subtotal_cents)
  const remaining = freeShippingRemaining(cart.subtotal_cents)

  root.innerHTML = `
    <div class="two-col">
      <section class="panel" aria-labelledby="items-heading">
        <h2 id="items-heading">Items (${cart.count})</h2>
        <ul class="cart-list">
          ${cart.items
            .map(
              (item) => `
            <li class="cart-item">
              <a href="/product?id=${item.id}" class="cart-thumb" tabindex="-1" aria-hidden="true">
                <img src="${escapeHtml(item.image)}" alt="" width="88" height="88" />
              </a>
              <div class="cart-item-body">
                <div class="cart-item-top">
                  <a href="/product?id=${item.id}">${escapeHtml(item.name)}</a>
                  <span class="price">${formatPrice(item.price_cents * item.quantity)}</span>
                </div>
                <p class="cart-item-meta">${formatPrice(item.price_cents)} each</p>
                <div class="cart-item-actions">
                  <label class="sr-only" for="qty-${item.id}">Quantity for ${escapeHtml(item.name)}</label>
                  <select class="select" id="qty-${item.id}" data-quantity="${item.id}">
                    ${quantityOptions(item.stock, item.quantity)}
                  </select>
                  <button type="button" class="link-button" data-remove="${item.id}">
                    Remove<span class="sr-only"> ${escapeHtml(item.name)}</span>
                  </button>
                </div>
              </div>
            </li>`,
            )
            .join('')}
        </ul>
      </section>
      <aside class="panel" aria-labelledby="summary-heading">
        <h2 id="summary-heading">Order summary</h2>
        <div class="summary-rows">
          <div class="summary-row"><span>Subtotal</span><span>${formatPrice(cart.subtotal_cents)}</span></div>
          <div class="summary-row"><span>Shipping</span><span>${shipping === 0 ? 'Free' : formatPrice(shipping)}</span></div>
          <div class="summary-row summary-total"><span>Total</span><span>${formatPrice(cart.subtotal_cents + shipping)}</span></div>
        </div>
        <a href="${user ? '/checkout' : '/login?next=%2Fcheckout'}" class="btn btn-block">
          ${user ? 'Proceed to checkout' : 'Log in to check out'}
        </a>
        <p class="summary-note">
          ${remaining > 0 ? `Add ${formatPrice(remaining)} more for free shipping.` : 'You qualify for free shipping.'}
        </p>
      </aside>
    </div>`
}

root.addEventListener('change', async (event) => {
  const select = event.target.closest('[data-quantity]')
  if (!select) return
  try {
    const cart = await api(`/cart/${select.dataset.quantity}`, {
      method: 'PATCH',
      body: { quantity: Number(select.value) },
    })
    render(cart)
    toast('Cart updated')
  } catch (error) {
    toast(error.message, 'error')
  }
})

root.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-remove]')
  if (!button) return
  try {
    render(await api(`/cart/${button.dataset.remove}`, { method: 'DELETE' }))
    toast('Item removed')
  } catch (error) {
    toast(error.message, 'error')
  }
})

render(initialCart)
