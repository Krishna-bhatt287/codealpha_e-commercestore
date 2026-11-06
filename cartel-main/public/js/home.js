import { api, initPage, productCard, bindAddToCartButtons, escapeHtml, toast } from './common.js'

await initPage()

const grid = document.getElementById('product-grid')
const chips = document.getElementById('category-chips')
const searchInput = document.getElementById('search')
const resultCount = document.getElementById('result-count')

let category = new URLSearchParams(location.search).get('category') ?? ''
let query = ''
let requestId = 0

function renderChips(categories) {
  const all = ['', ...categories]
  chips.innerHTML = all
    .map(
      (name) =>
        `<li><button type="button" class="chip" data-category="${escapeHtml(name)}" aria-pressed="${name === category}">${escapeHtml(name || 'All')}</button></li>`,
    )
    .join('')
}

async function loadProducts() {
  const current = ++requestId
  grid.setAttribute('aria-busy', 'true')
  try {
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (category) params.set('category', category)
    const { products, categories } = await api(`/products?${params}`)
    if (current !== requestId) return

    renderChips(categories)
    resultCount.textContent = `${products.length} ${products.length === 1 ? 'product' : 'products'}`
    grid.innerHTML = products.length
      ? products.map(productCard).join('')
      : `<li class="empty-state"><p>No products match your search.</p></li>`
  } catch (error) {
    toast(error.message, 'error')
  } finally {
    grid.removeAttribute('aria-busy')
  }
}

chips.addEventListener('click', (event) => {
  const chip = event.target.closest('[data-category]')
  if (!chip) return
  category = chip.dataset.category
  const url = new URL(location.href)
  if (category) url.searchParams.set('category', category)
  else url.searchParams.delete('category')
  history.replaceState(null, '', url)
  loadProducts()
})

let searchTimer
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    query = searchInput.value.trim()
    loadProducts()
  }, 250)
})
document.getElementById('search-form').addEventListener('submit', (event) => event.preventDefault())

bindAddToCartButtons(grid)
loadProducts()
