import { api, initPage, escapeHtml, formatPrice, formatDate } from './common.js'

await initPage({ requireAuth: true })
const root = document.getElementById('order-root')
const params = new URLSearchParams(location.search)

try {
  const { order, items, payment } = await api(`/orders/${encodeURIComponent(params.get('id') ?? '')}`)
  document.title = `Order #${order.id} | Oak & Ember`

  root.innerHTML = `
    <div class="page-head">
      <a href="/orders" class="breadcrumb">&larr; All orders</a>
      <h1>Order #${order.id}</h1>
      <p>Placed ${formatDate(order.created_at)} &middot; <span class="badge">${escapeHtml(order.status)}</span></p>
    </div>
    ${
      params.get('placed')
        ? `<div class="banner" role="status">
            <strong>Payment received. Thank you, your order is confirmed.</strong>
            <span>We&apos;re preparing it now and will email you when it ships.</span>
          </div>`
        : ''
    }
    <div class="two-col">
      <section class="panel" aria-labelledby="items-heading">
        <h2 id="items-heading">Items</h2>
        <ul class="cart-list">
          ${items
            .map(
              (item) => `
            <li class="cart-item">
              <div class="cart-thumb"><img src="${escapeHtml(item.image)}" alt="" width="88" height="88" /></div>
              <div class="cart-item-body">
                <div class="cart-item-top">
                  ${item.product_id ? `<a href="/product?id=${item.product_id}">${escapeHtml(item.name)}</a>` : `<span>${escapeHtml(item.name)}</span>`}
                  <span class="price">${formatPrice(item.price_cents * item.quantity)}</span>
                </div>
                <p class="cart-item-meta">${item.quantity} &times; ${formatPrice(item.price_cents)}</p>
              </div>
            </li>`,
            )
            .join('')}
        </ul>
      </section>
      <aside class="panel" aria-labelledby="summary-heading">
        <h2 id="summary-heading">Summary</h2>
        <div class="summary-rows">
          <div class="summary-row"><span>Subtotal</span><span>${formatPrice(order.subtotal_cents)}</span></div>
          <div class="summary-row"><span>Shipping</span><span>${order.shipping_cents === 0 ? 'Free' : formatPrice(order.shipping_cents)}</span></div>
          <div class="summary-row summary-total"><span>Total</span><span>${formatPrice(order.total_cents)}</span></div>
        </div>
        <h2>Ship to</h2>
        <address class="address">
          ${escapeHtml(order.shipping_name)}<br />
          ${escapeHtml(order.address)}<br />
          ${escapeHtml(order.city)}, ${escapeHtml(order.postal_code)}
        </address>
        <h2>Payment</h2>
        ${
          payment
            ? `<dl class="payment-details">
                <div><dt>Method</dt><dd>${escapeHtml(payment.card_brand)} ending in ${escapeHtml(payment.card_last4)}</dd></div>
                <div><dt>Amount</dt><dd>${formatPrice(payment.amount_cents)}</dd></div>
                <div><dt>Status</dt><dd><span class="badge badge-success">${payment.status === 'succeeded' ? 'Paid' : escapeHtml(payment.status)}</span></dd></div>
                <div><dt>Reference</dt><dd><code>${escapeHtml(payment.reference)}</code></dd></div>
              </dl>`
            : '<p class="muted">Pay on delivery</p>'
        }
      </aside>
    </div>`
} catch {
  root.innerHTML = `
    <div class="panel empty-state" style="margin-top: 40px">
      <p>We couldn&apos;t find that order.</p>
      <a href="/orders" class="btn">View your orders</a>
    </div>`
}
