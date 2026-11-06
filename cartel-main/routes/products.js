import { Router } from 'express'
import { db } from '../db.js'

const router = Router()

router.get('/', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : ''
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : ''

  const conditions = []
  const params = []
  if (q) {
    conditions.push('(name LIKE ? OR description LIKE ?)')
    params.push(`%${q}%`, `%${q}%`)
  }
  if (category) {
    conditions.push('category = ?')
    params.push(category)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const products = db
    .prepare(`SELECT id, name, description, category, price_cents, image, stock FROM products ${where} ORDER BY id`)
    .all(...params)
  const categories = db
    .prepare('SELECT DISTINCT category FROM products ORDER BY category')
    .all()
    .map((row) => row.category)

  res.json({ products, categories })
})

router.get('/:id', (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Product not found.' })

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id)
  if (!product) return res.status(404).json({ error: 'Product not found.' })

  const related = db
    .prepare('SELECT id, name, category, price_cents, image FROM products WHERE category = ? AND id != ? LIMIT 3')
    .all(product.category, id)

  res.json({ product, related })
})

export default router
