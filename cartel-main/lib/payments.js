import { randomBytes } from 'node:crypto'

export class PaymentError extends Error {
  constructor(message, { field, status = 402 } = {}) {
    super(message)
    this.field = field
    this.status = status
  }
}

// Simulated processor responses, mirroring common gateway test cards.
const TEST_OUTCOMES = {
  '4000000000000002': 'Your card was declined.',
  '4000000000009995': 'Your card has insufficient funds.',
  '4000000000000069': 'Your card has expired.',
}

function passesLuhn(digits) {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

function detectBrand(digits) {
  if (/^4/.test(digits)) return 'Visa'
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(digits)) return 'Mastercard'
  if (/^3[47]/.test(digits)) return 'Amex'
  if (/^6(011|5)/.test(digits)) return 'Discover'
  return 'Card'
}

const asString = (value) => (typeof value === 'string' ? value : '')

export function validateCard(input = {}, now = new Date()) {
  const number = asString(input.cardNumber).replace(/[\s-]/g, '')
  const holder = asString(input.cardName).trim().slice(0, 80)
  const expiry = asString(input.cardExpiry).replace(/\s/g, '')
  const cvc = asString(input.cardCvc).trim()

  if (!holder) throw new PaymentError('Enter the name on your card.', { field: 'cardName', status: 400 })
  if (!/^\d{13,19}$/.test(number) || !passesLuhn(number)) {
    throw new PaymentError('Enter a valid card number.', { field: 'cardNumber', status: 400 })
  }

  const match = expiry.match(/^(\d{2})\/(\d{2}|\d{4})$/)
  const month = match ? Number(match[1]) : 0
  const year = match ? Number(match[2].length === 2 ? `20${match[2]}` : match[2]) : 0
  const endOfExpiryMonth = new Date(year, month, 1)
  if (!match || month < 1 || month > 12 || endOfExpiryMonth <= now) {
    throw new PaymentError('Enter a valid expiry date (MM/YY).', { field: 'cardExpiry', status: 400 })
  }

  const brand = detectBrand(number)
  const cvcLength = brand === 'Amex' ? 4 : 3
  if (!new RegExp(`^\\d{${cvcLength}}$`).test(cvc)) {
    throw new PaymentError(`Enter the ${cvcLength}-digit security code.`, { field: 'cardCvc', status: 400 })
  }

  return { number, holder, brand, last4: number.slice(-4), expMonth: month, expYear: year }
}

// Card data never leaves this function: only brand, last4 and expiry are returned for storage.
export function chargeCard(card, amountCents) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new PaymentError('Invalid payment amount.', { status: 400 })
  }
  const decline = TEST_OUTCOMES[card.number]
  if (decline) throw new PaymentError(decline, { field: 'cardNumber' })

  return {
    reference: `pay_${randomBytes(9).toString('base64url')}`,
    brand: card.brand,
    last4: card.last4,
    expMonth: card.expMonth,
    expYear: card.expYear,
    holder: card.holder,
    amountCents,
  }
}
