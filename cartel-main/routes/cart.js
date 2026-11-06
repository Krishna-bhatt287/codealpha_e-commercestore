import { Router } from 'express'
import { db } from '../db.js'
import { ensureSession } from '../lib/auth.js'

const router = Router()
export const MAX_PER_ITEM = 10

export function getCart(sessionToken) {
  const items = sessionToken
    ? db
        .prepare(
          `SELECT p.id, p.name, p.image, p.category, p.price_cents, p.stock, c.quantity
           FROM cart_items c JOIN products p ON p.id = c.product_id
           WHERE c.session_token = ? ORDER BY p.name`,
        )
        .all(sessionToken)
    : []
  const subtotal_cents = items.reduce((sum, item) => sum + item.price_cents * item.quantity, 0)
  const count = items.reduce((sum, item) => sum + item.quantity, 0)
  return { items, subtotal_cents, count }
}

function parseQuantity(value) {
  const quantity = Number(value)
  return Number.isInteger(quantity) && quantity > 0 && quantity <= MAX_PER_ITEM ? quantity : null
}

function findProduct(id) {
  const productId = Number(id)
  if (!Number.isInteger(productId)) return null
  return db.prepare('SELECT id, name, stock FROM products WHERE id = ?').get(productId)
}

router.get('/', (req, res) => {
  res.json(getCart(req.session?.token))
})

router.post('/', (req, res) => {
  const product = findProduct(req.body?.productId)
  if (!product) return res.status(404).json({ error: 'Product not found.' })
  const quantity = parseQuantity(req.body?.quantity ?? 1)
  if (!quantity) return res.status(400).json({ error: `Quantity must be between 1 and ${MAX_PER_ITEM}.` })

  const session = ensureSession(req, res)
  const existing = db
    .prepare('SELECT quantity FROM cart_items WHERE session_token = ? AND product_id = ?')
    .get(session.token, product.id)
  const next = (existing?.quantity ?? 0) + quantity
  const limit = Math.min(product.stock, MAX_PER_ITEM)

  if (next > limit) {
    return res.status(400).json({
      error: product.stock === 0 ? `${product.name} is out of stock.` : `You can add up to ${limit} of this item.`,
    })
  }

  db.prepare(
    `INSERT INTO cart_items (session_token, product_id, quantity) VALUES (?, ?, ?)
     ON CONFLICT (session_token, product_id) DO UPDATE SET quantity = excluded.quantity`,
  ).run(session.token, product.id, next)

  res.json(getCart(session.token))
})

router.patch('/:productId', (req, res) => {
  if (!req.session) return res.status(404).json({ error: 'Item not in cart.' })
  const product = findProduct(req.params.productId)
  if (!product) return res.status(404).json({ error: 'Product not found.' })
  const quantity = parseQuantity(req.body?.quantity)
  if (!quantity) return res.status(400).json({ error: `Quantity must be between 1 and ${MAX_PER_ITEM}.` })
  if (quantity > product.stock) return res.status(400).json({ error: `Only ${product.stock} left in stock.` })

  db.prepare('UPDATE cart_items SET quantity = ? WHERE session_token = ? AND product_id = ?').run(
    quantity,
    req.session.token,
    product.id,
  )
  res.json(getCart(req.session.token))
})

router.delete('/:productId', (req, res) => {
  if (req.session) {
    db.prepare('DELETE FROM cart_items WHERE session_token = ? AND product_id = ?').run(
      req.session.token,
      Number(req.params.productId),
    )
  }
  res.json(getCart(req.session?.token))
})

export default router
