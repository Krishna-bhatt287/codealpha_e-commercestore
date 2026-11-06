import crypto from 'node:crypto'
import { db } from '../db.js'

const SESSION_COOKIE = 'sid'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':')
  const expected = Buffer.from(hash, 'hex')
  const actual = crypto.scryptSync(password, salt, 64)
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

function parseCookies(header = '') {
  const cookies = {}
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim())
  }
  return cookies
}

// SameSite=None + Partitioned lets the session work inside an embedded preview iframe.
function writeSessionCookie(res, token, maxAge = SESSION_MAX_AGE_SECONDS) {
  res.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=${maxAge}`,
  )
}

export function sessionMiddleware(req, res, next) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  req.session = token ? db.prepare('SELECT token, user_id FROM sessions WHERE token = ?').get(token) : undefined
  req.user = req.session?.user_id
    ? db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(req.session.user_id)
    : undefined
  next()
}

export function ensureSession(req, res) {
  if (req.session) return req.session
  const token = crypto.randomBytes(32).toString('base64url')
  db.prepare('INSERT INTO sessions (token) VALUES (?)').run(token)
  writeSessionCookie(res, token)
  req.session = { token, user_id: null }
  return req.session
}

// Issues a fresh token on login to prevent session fixation, carrying the guest cart over.
export function startUserSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url')
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId)
  if (req.session) {
    db.prepare('UPDATE cart_items SET session_token = ? WHERE session_token = ?').run(token, req.session.token)
    db.prepare('DELETE FROM sessions WHERE token = ?').run(req.session.token)
  }
  writeSessionCookie(res, token)
}

export function endSession(req, res) {
  if (req.session) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.session.token)
  writeSessionCookie(res, '', 0)
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in to continue.' })
  next()
}
