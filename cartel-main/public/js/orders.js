import { api, initPage, escapeHtml, formatPrice, formatDate } from './common.js'

await initPage({ requireAuth: true })
const root = document.getElementById('orders-root')
const { orders } = await api('/orders')

root.innerHTML = orders.length
  ? `<ul class="order-list">
      ${orders
        .map(
          (order) => `
        <li>
          <a class="order-row" href="/order?id=${order.id}">
            <strong>Order #${order.id}</strong>
            <span class="muted">${formatDate(order.created_at)} &middot; ${order.item_count} ${order.item_count === 1 ? 'item' : 'items'}</span>
            <span class="badge">${escapeHtml(order.status)}</span>
            <span class="price">${formatPrice(order.total_cents)}</span>
          </a>
        </li>`,
        )
        .join('')}
    </ul>`
  : `<div class="panel empty-state">
      <p>You haven&apos;t placed any orders yet.</p>
      <a href="/" class="btn">Start shopping</a>
    </div>`
