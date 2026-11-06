import {
  api,
  initPage,
  productCard,
  bindAddToCartButtons,
  addToCart,
  escapeHtml,
  formatPrice,
  quantityOptions,
  toast,
} from './common.js'

await initPage()

const root = document.getElementById('product-root')
const relatedSection = document.getElementById('related')
const relatedGrid = document.getElementById('related-grid')
const id = new URLSearchParams(location.search).get('id')

function stockLabel(stock) {
  if (stock === 0) return { text: 'Out of stock', className: 'out' }
  if (stock <= 8) return { text: `Only ${stock} left`, className: 'low' }
  return { text: 'In stock, ships in 1-2 days', className: '' }
}

try {
  const { product, related } = await api(`/products/${encodeURIComponent(id ?? '')}`)
  document.title = `${product.name} | Oak & Ember`
  document.querySelector('meta[name="description"]').setAttribute('content', product.description)

  const stock = stockLabel(product.stock)
  root.innerHTML = `
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/">Shop</a> / <a href="/?category=${encodeURIComponent(product.category)}">${escapeHtml(product.category)}</a> / <span aria-current="page">${escapeHtml(product.name)}</span>
    </nav>
    <div class="detail">
      <div class="detail-media">
        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" width="800" height="800" />
      </div>
      <div class="detail-info">
        <p class="eyebrow">${escapeHtml(product.category)}</p>
        <h1>${escapeHtml(product.name)}</h1>
        <p class="detail-price">${formatPrice(product.price_cents)}</p>
        <p class="detail-desc">${escapeHtml(product.description)}</p>
        <p class="stock ${stock.className}">${stock.text}</p>
        <form class="buy-row" id="buy-form">
          <div class="field">
            <label for="quantity">Quantity</label>
            <select id="quantity" class="select" ${product.stock === 0 ? 'disabled' : ''}>${quantityOptions(product.stock)}</select>
          </div>
          <button type="submit" class="btn" ${product.stock === 0 ? 'disabled' : ''}>
            ${product.stock === 0 ? 'Sold out' : 'Add to cart'}
          </button>
        </form>
        <div class="detail-specs">
          <h2>Details</h2>
          <p>${escapeHtml(product.details)}</p>
        </div>
        <ul class="perks">
          <li>Free shipping on orders over $75</li>
          <li>30-day returns on unused items</li>
        </ul>
      </div>
    </div>`

  document.getElementById('buy-form').addEventListener('submit', async (event) => {
    event.preventDefault()
    const button = event.currentTarget.querySelector('button')
    const quantity = Number(document.getElementById('quantity').value)
    button.disabled = true
    try {
      await addToCart(product.id, quantity)
      toast(`Added ${quantity} to cart`)
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      button.disabled = false
    }
  })

  if (related.length) {
    relatedGrid.innerHTML = related.map(productCard).join('')
    relatedSection.hidden = false
  }
} catch {
  document.title = 'Product not found | Oak & Ember'
  root.innerHTML = `
    <div class="empty-state">
      <h1>Product not found</h1>
      <p>This item may have been removed.</p>
      <a href="/" class="btn">Back to shop</a>
    </div>`
}

bindAddToCartButtons(relatedGrid)
