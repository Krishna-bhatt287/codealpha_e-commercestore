export const MAX_PER_ITEM = 10
const FREE_SHIPPING_THRESHOLD_CENTS = 7500
const SHIPPING_CENTS = 800

const state = { user: null, cart: { items: [], count: 0, subtotal_cents: 0 } }

export async function api(path, { method = 'GET', body } = {}) {
  const options = { method, credentials: 'same-origin', headers: {} }
  if (method !== 'GET') {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body ?? {})
  }
  const res = await fetch(`/api${path}`, options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = new Error(data.error || 'Something went wrong.')
  error.status = res.status
  error.data = data
  throw error
  }
  return data
}

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
export const formatPrice = (cents) => currency.format(cents / 100)

export const shippingFor = (subtotal) =>
  subtotal === 0 || subtotal >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : SHIPPING_CENTS

export const freeShippingRemaining = (subtotal) => Math.max(0, FREE_SHIPPING_THRESHOLD_CENTS - subtotal)

export function formatDate(sqliteDate) {
  return new Date(`${sqliteDate.replace(' ', 'T')}Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
}

export function safeNext(value) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

const cartIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l-1 13H7L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>`

function renderHeader() {
  const { user, cart } = state
  const path = location.pathname.replace(/\.html$/, '')
  const current = (href) => (path === href || (href === '/' && path === '/index') ? 'aria-current="page"' : '')
  const firstName = user?.name.split(' ')[0]

  document.getElementById('site-header').innerHTML = `
    <div class="container header-inner">
      <a href="/" class="logo">Oak <span>&amp;</span> Ember</a>
      <nav aria-label="Main">
        <ul class="nav-list">
          <li><a href="/" ${current('/')}>Shop</a></li>
          ${user ? `<li><a href="/orders" ${current('/orders')}>Orders</a></li>` : ''}
        </ul>
      </nav>
      <div class="header-actions">
        ${
          user
            ? `<span class="greeting">Hi, ${escapeHtml(firstName)}</span>
               <button type="button" class="link-button" id="logout-button">Log out</button>`
            : `<a href="/login" ${current('/login')}>Log in</a>
               <a href="/register" class="btn btn-small">Sign up</a>`
        }
        <a href="/cart" class="cart-link" data-cart-link>
          ${cartIcon}
          <span class="cart-count" data-cart-count aria-hidden="true"></span>
        </a>
      </div>
    </div>`

  setCartCount(cart.count)

  document.getElementById('logout-button')?.addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' })
    location.href = '/'
  })
}

function renderFooter() {
  const footer = document.createElement('footer')
  footer.className = 'site-footer'
  footer.innerHTML = `
    <div class="container footer-inner">
      <p>Oak &amp; Ember &middot; Goods for slow living</p>
      <p>Free shipping on orders over $75</p>
    </div>`
  document.body.append(footer)

  const toastEl = document.createElement('div')
  toastEl.className = 'toast'
  toastEl.id = 'toast'
  toastEl.setAttribute('role', 'status')
  toastEl.setAttribute('aria-live', 'polite')
  document.body.append(toastEl)
}

export async function initPage({ requireAuth = false } = {}) {
  const [{ user }, cart] = await Promise.all([api('/auth/me'), api('/cart')])
  state.user = user
  state.cart = cart

  if (requireAuth && !user) {
    location.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`)
    return new Promise(() => {})
  }

  renderHeader()
  renderFooter()
  return state
}

export function setCartCount(count) {
  state.cart.count = count
  const badge = document.querySelector('[data-cart-count]')
  const link = document.querySelector('[data-cart-link]')
  if (!badge || !link) return
  badge.textContent = count
  badge.hidden = count === 0
  link.setAttribute('aria-label', `Cart, ${count} ${count === 1 ? 'item' : 'items'}`)
}

let toastTimer
export function toast(message, type = 'success') {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = message
  el.className = `toast show ${type === 'error' ? 'error' : ''}`
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800)
}

export function productCard(product) {
  const soldOut = product.stock === 0
  const href = `/product?id=${product.id}`
  return `
    <li class="product-card">
      <a href="${href}" class="product-media" tabindex="-1" aria-hidden="true">
        <img src="${escapeHtml(product.image)}" alt="" width="600" height="600" loading="lazy" />
      </a>
      <div class="product-body">
        <p class="eyebrow">${escapeHtml(product.category)}</p>
        <h3><a href="${href}">${escapeHtml(product.name)}</a></h3>
        ${product.description ? `<p class="product-desc">${escapeHtml(product.description)}</p>` : ''}
        <div class="product-footer">
          <span class="price">${formatPrice(product.price_cents)}</span>
          ${
            product.stock === undefined
              ? ''
              : `<button type="button" class="btn btn-small" data-add-to-cart="${product.id}" ${soldOut ? 'disabled' : ''}>
                  ${soldOut ? 'Sold out' : 'Add to cart'}<span class="sr-only">: ${escapeHtml(product.name)}</span>
                </button>`
          }
        </div>
      </div>
    </li>`
}

export async function addToCart(productId, quantity = 1) {
  const cart = await api('/cart', { method: 'POST', body: { productId, quantity } })
  setCartCount(cart.count)
  return cart
}

export function bindAddToCartButtons(container) {
  container.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-add-to-cart]')
    if (!button) return
    button.disabled = true
    try {
      await addToCart(Number(button.dataset.addToCart))
      toast('Added to cart')
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      button.disabled = false
    }
  })
}

export function quantityOptions(max, selected = 1) {
  const limit = Math.max(1, Math.min(max, MAX_PER_ITEM))
  return Array.from(
    { length: limit },
    (_, i) => `<option value="${i + 1}" ${i + 1 === selected ? 'selected' : ''}>${i + 1}</option>`,
  ).join('')
}
