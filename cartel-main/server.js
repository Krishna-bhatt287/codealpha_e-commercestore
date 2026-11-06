import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sessionMiddleware } from './lib/auth.js'
import authRoutes from './routes/auth.js'
import productRoutes from './routes/products.js'
import cartRoutes from './routes/cart.js'
import orderRoutes from './routes/orders.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = Number(process.env.PORT) || 3000

app.disable('x-powered-by')
app.set('trust proxy', 1)

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  })
  next()
})

app.use(express.json({ limit: '20kb' }))

const api = express.Router()
api.use(sessionMiddleware)

// Requiring a JSON body on writes forces a CORS preflight, blocking cross-site form posts.
api.use((req, res, next) => {
  if (req.method !== 'GET' && !req.is('application/json')) {
    return res.status(415).json({ error: 'Requests must be sent as JSON.' })
  }
  next()
})

api.use('/auth', authRoutes)
api.use('/products', productRoutes)
api.use('/cart', cartRoutes)
api.use('/orders', orderRoutes)
api.use((req, res) => res.status(404).json({ error: 'Not found.' }))

app.use('/api', api)
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }))
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')))

app.use((err, req, res, _next) => {
  console.error(err)
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.' })
  res.status(500).json({ error: 'Something went wrong. Please try again.' })
})

app.listen(PORT, () => console.log(`Oak & Ember running at http://localhost:${PORT}`))
