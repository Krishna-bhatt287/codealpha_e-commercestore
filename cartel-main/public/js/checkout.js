import { api, initPage, escapeHtml, formatPrice, shippingFor } from './common.js'

const { cart, user } = await initPage({ requireAuth: true })
const root = document.getElementById('checkout-root')

if (cart.items.length === 0) {
  root.innerHTML = `
    <div class="panel empty-state">
      <p>Your cart is empty, so there is nothing to check out yet.</p>
      <a href="/" class="btn">Browse products</a>
    </div>`
} else {
  const shipping = shippingFor(cart.subtotal_cents)
  root.innerHTML = `
    <div class="two-col">
      <section class="panel" aria-labelledby="shipping-heading">
        <h2 id="shipping-heading">Shipping details</h2>
        <form id="checkout-form" class="form-stack" novalidate>
          <div class="field">
            <label for="name">Full name</label>
            <input class="input" id="name" name="name" autocomplete="name" required maxlength="80" value="${escapeHtml(user.name)}" />
          </div>
          <div class="field">
            <label for="address">Street address</label>
            <input class="input" id="address" name="address" autocomplete="street-address" required maxlength="200" />
          </div>
          <div class="form-row">
            <div class="field">
              <label for="city">City</label>
              <input class="input" id="city" name="city" autocomplete="address-level2" required maxlength="80" />
            </div>
            <div class="field">
              <label for="postalCode">Postal code</label>
              <input class="input" id="postalCode" name="postalCode" autocomplete="postal-code" required maxlength="20" />
            </div>
          </div>
          <fieldset class="payment-fieldset">
            <legend>Payment</legend>
            <div class="field">
              <label for="cardName">Name on card</label>
              <input class="input" id="cardName" name="cardName" autocomplete="cc-name" required maxlength="80" value="${escapeHtml(user.name)}" />
            </div>
            <div class="field">
              <label for="cardNumber">Card number</label>
              <div class="card-input">
                <input class="input" id="cardNumber" name="cardNumber" inputmode="numeric" autocomplete="cc-number" required maxlength="23" placeholder="1234 5678 9012 3456" aria-describedby="card-brand" />
                <span class="card-brand" id="card-brand" aria-live="polite"></span>
              </div>
            </div>
            <div class="form-row">
              <div class="field">
                <label for="cardExpiry">Expiry (MM/YY)</label>
                <input class="input" id="cardExpiry" name="cardExpiry" inputmode="numeric" autocomplete="cc-exp" required maxlength="5" placeholder="MM/YY" />
              </div>
              <div class="field">
                <label for="cardCvc">Security code</label>
                <input class="input" id="cardCvc" name="cardCvc" inputmode="numeric" autocomplete="cc-csc" required maxlength="4" placeholder="CVC" />
              </div>
            </div>
            <details class="test-cards">
              <summary>Test cards for this demo</summary>
              <ul>
                <li><code>4242 4242 4242 4242</code> succeeds</li>
                <li><code>4000 0000 0000 0002</code> is declined</li>
                <li><code>4000 0000 0000 9995</code> has insufficient funds</li>
              </ul>
              <p>Use any future expiry date and any 3-digit code.</p>
            </details>
          </fieldset>
          <p class="form-error" id="form-error" role="alert"></p>
          <button type="submit" class="btn btn-block">Pay ${formatPrice(cart.subtotal_cents + shipping)}</button>
          <p class="field-hint secure-note">Only the card brand and last 4 digits are stored.</p>
        </form>
      </section>
      <aside class="panel" aria-labelledby="summary-heading">
        <h2 id="summary-heading">Your order</h2>
        <ul class="mini-items">
          ${cart.items
            .map(
              (item) => `
            <li class="mini-item">
              <img src="${escapeHtml(item.image)}" alt="" width="48" height="48" />
              <span>${escapeHtml(item.name)} &times; ${item.quantity}</span>
              <span class="price">${formatPrice(item.price_cents * item.quantity)}</span>
            </li>`,
            )
            .join('')}
        </ul>
        <div class="summary-rows">
          <div class="summary-row"><span>Subtotal</span><span>${formatPrice(cart.subtotal_cents)}</span></div>
          <div class="summary-row"><span>Shipping</span><span>${shipping === 0 ? 'Free' : formatPrice(shipping)}</span></div>
          <div class="summary-row summary-total"><span>Total</span><span>${formatPrice(cart.subtotal_cents + shipping)}</span></div>
        </div>
      </aside>
    </div>`

  const form = document.getElementById('checkout-form')
  const errorEl = document.getElementById('form-error')
  const { cardNumber, cardExpiry, cardCvc } = form.elements
  const brandEl = document.getElementById('card-brand')
  // One key per checkout attempt so a double-click or network retry can never charge twice.
  const idempotencyKey = crypto.randomUUID()

  const detectBrand = (digits) =>
    /^4/.test(digits) ? 'Visa'
    : /^(5[1-5]|2[2-7])/.test(digits) ? 'Mastercard'
    : /^3[47]/.test(digits) ? 'Amex'
    : /^6(011|5)/.test(digits) ? 'Discover'
    : ''

  cardNumber.addEventListener('input', () => {
    const digits = cardNumber.value.replace(/\D/g, '').slice(0, 19)
    cardNumber.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ')
    brandEl.textContent = detectBrand(digits)
  })
  cardExpiry.addEventListener('input', (event) => {
    const digits = cardExpiry.value.replace(/\D/g, '').slice(0, 4)
    const deleting = event.inputType?.startsWith('delete')
    cardExpiry.value = digits.length > 2 || (digits.length === 2 && !deleting) ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
  })
  cardCvc.addEventListener('input', () => {
    cardCvc.value = cardCvc.value.replace(/\D/g, '').slice(0, 4)
  })

  const clearInvalid = () => form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'))

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    clearInvalid()
    const data = Object.fromEntries(new FormData(form))
    const missing = Object.entries(data).find(([, value]) => !String(value).trim())
    if (missing) {
      errorEl.textContent = 'Please complete all shipping and payment fields.'
      form.elements[missing[0]].setAttribute('aria-invalid', 'true')
      form.elements[missing[0]].focus()
      return
    }

    const button = form.querySelector('button[type="submit"]')
    const label = button.textContent
    button.disabled = true
    button.textContent = 'Processing payment...'
    errorEl.textContent = ''
    try {
      const { orderId } = await api('/orders', { method: 'POST', body: { ...data, idempotencyKey } })
      location.href = `/order?id=${orderId}&placed=1`
    } catch (error) {
      errorEl.textContent = error.message
      const field = error.data?.field && form.elements[error.data.field]
      if (field) {
        field.setAttribute('aria-invalid', 'true')
        field.focus()
      }
      button.disabled = false
      button.textContent = label
    }
  })
}
