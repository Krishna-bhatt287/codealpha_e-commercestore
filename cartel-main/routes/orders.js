import { Router } from 'express'
import { db, transaction } from '../db.js'
import { requireUser } from '../lib/auth.js'
import { PaymentError, chargeCard, validateCard } from '../lib/payments.js'
import { MAX_PER_ITEM } from './cart.js'

const router = Router()
const FREE_SHIPPING_THRESHOLD_CENTS = 7500
const SHIPPING_CENTS = 800

class OrderError extends Error {}

const asText = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

router.use(requireUser)

router.get('/', (req, res) => {
  const orders = db
    .prepare(
      `SELECT o.id, o.status, o.total_cents, o.created_at,
              (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) AS item_count
       FROM orders o WHERE o.user_id = ? ORDER BY o.id DESC`,
    )
    .all(req.user.id)
  res.json({ orders })
})

router.get('/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id)
  if (!order) return res.status(404).json({ error: 'Order not found.' })
  const items = db
    .prepare('SELECT product_id, name, image, price_cents, quantity FROM order_items WHERE order_id = ?')
    .all(order.id)
  const payment =
    db
      .prepare(
        `SELECT reference, status, amount_cents, card_brand, card_last4, card_exp_month, card_exp_year, created_at
         FROM payments WHERE order_id = ? AND user_id = ?`,
      )
      .get(order.id, req.user.id) ?? null
  res.json({ order, items, payment })
})

router.post('/', (req, res) => {
  const shipping = {
    name: asText(req.body?.name, 80),
    address: asText(req.body?.address, 200),
    city: asText(req.body?.city, 80),
    postalCode: asText(req.body?.postalCode, 20),
  }
  if (!shipping.name || !shipping.address || !shipping.city || !shipping.postalCode) {
    return res.status(400).json({ error: 'Please complete all shipping fields.' })
  }

  const idempotencyKey = asText(req.body?.idempotencyKey, 64)
  if (!/^[\w-]{16,64}$/.test(idempotencyKey)) {
    return res.status(400).json({ error: 'Missing payment request key. Please reload the page.' })
  }

  const existing = db
    .prepare('SELECT order_id FROM payments WHERE user_id = ? AND idempotency_key = ?')
    .get(req.user.id, idempotencyKey)
  if (existing) return res.status(200).json({ orderId: existing.order_id })

  try {
    const card = validateCard(req.body)

    const orderId = transaction(() => {
      const items = db
        .prepare(
          `SELECT p.id, p.name, p.image, p.price_cents, p.stock, c.quantity
           FROM cart_items c JOIN products p ON p.id = c.product_id WHERE c.session_token = ?`,
        )
        .all(req.session.token)

      if (items.length === 0) throw new OrderError('Your cart is empty.')
      for (const item of items) {
        if (item.quantity > MAX_PER_ITEM) throw new OrderError(`Too many of ${item.name} in your cart.`)
        if (item.quantity > item.stock) throw new OrderError(`Only ${item.stock} of ${item.name} left in stock.`)
      }

      const subtotal = items.reduce((sum, item) => sum + item.price_cents * item.quantity, 0)
      const shippingCost = subtotal >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : SHIPPING_CENTS
      const total = subtotal + shippingCost

      const charge = chargeCard(card, total)

      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO orders (user_id, status, subtotal_cents, shipping_cents, total_cents, shipping_name, address, city, postal_code)
           VALUES (?, 'Paid', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(req.user.id, subtotal, shippingCost, total, shipping.name, shipping.address, shipping.city, shipping.postalCode)

      const insertItem = db.prepare(
        'INSERT INTO order_items (order_id, product_id, name, image, price_cents, quantity) VALUES (?, ?, ?, ?, ?, ?)',
      )
      const reduceStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?')
      for (const item of items) {
        insertItem.run(lastInsertRowid, item.id, item.name, item.image, item.price_cents, item.quantity)
        const { changes } = reduceStock.run(item.quantity, item.id, item.quantity)
        if (changes === 0) throw new OrderError(`${item.name} just sold out.`)
      }

      db.prepare(
        `INSERT INTO payments (order_id, user_id, idempotency_key, reference, amount_cents, card_brand, card_last4,
                               card_exp_month, card_exp_year, cardholder_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        lastInsertRowid,
        req.user.id,
        idempotencyKey,
        charge.reference,
        charge.amountCents,
        charge.brand,
        charge.last4,
        charge.expMonth,
        charge.expYear,
        charge.holder,
      )

      db.prepare('DELETE FROM cart_items WHERE session_token = ?').run(req.session.token)
      return Number(lastInsertRowid)
    })

    res.status(201).json({ orderId })
  } catch (error) {
    if (error instanceof PaymentError) return res.status(error.status).json({ error: error.message, field: error.field })
    if (error instanceof OrderError) return res.status(400).json({ error: error.message })
    throw error
  }
})

export default router
