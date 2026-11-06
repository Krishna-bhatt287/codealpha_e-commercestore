import { Router } from 'express'
import { db } from '../db.js'
import { hashPassword, verifyPassword, startUserSession, endSession } from '../lib/auth.js'

const router = Router()
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const asText = (value) => (typeof value === 'string' ? value.trim() : '')

router.get('/me', (req, res) => {
  res.json({ user: req.user ?? null })
})

router.post('/register', (req, res) => {
  const name = asText(req.body?.name)
  const email = asText(req.body?.email).toLowerCase()
  const password = typeof req.body?.password === 'string' ? req.body.password : ''

  if (name.length < 2 || name.length > 80) return res.status(400).json({ error: 'Please enter your name.' })
  if (!EMAIL_PATTERN.test(email) || email.length > 254)
    return res.status(400).json({ error: 'Please enter a valid email address.' })
  if (password.length < 8 || password.length > 128)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' })

  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'An account with this email already exists.' })
  }

  const { lastInsertRowid } = db
    .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run(name, email, hashPassword(password))
  const userId = Number(lastInsertRowid)

  startUserSession(req, res, userId)
  res.status(201).json({ user: { id: userId, name, email } })
})

router.post('/login', (req, res) => {
  const email = asText(req.body?.email).toLowerCase()
  const password = typeof req.body?.password === 'string' ? req.body.password : ''

  const user = db.prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?').get(email)
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' })
  }

  startUserSession(req, res, user.id)
  res.json({ user: { id: user.id, name: user.name, email: user.email } })
})

router.post('/logout', (req, res) => {
  endSession(req, res)
  res.json({ ok: true })
})

export default router
