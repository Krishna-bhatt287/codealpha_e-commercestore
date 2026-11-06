import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, 'data')
mkdirSync(dataDir, { recursive: true })

export const db = new DatabaseSync(process.env.DATABASE_FILE || path.join(dataDir, 'store.db'))

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    details TEXT NOT NULL,
    category TEXT NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    image TEXT NOT NULL,
    stock INTEGER NOT NULL CHECK (stock >= 0)
  );

  CREATE TABLE IF NOT EXISTS cart_items (
    session_token TEXT NOT NULL REFERENCES sessions(token) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (session_token, product_id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'Processing',
    subtotal_cents INTEGER NOT NULL,
    shipping_cents INTEGER NOT NULL,
    total_cents INTEGER NOT NULL,
    shipping_name TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    image TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    quantity INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    reference TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'succeeded',
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    card_brand TEXT NOT NULL,
    card_last4 TEXT NOT NULL,
    card_exp_month INTEGER NOT NULL,
    card_exp_year INTEGER NOT NULL,
    cardholder_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, idempotency_key)
  );

  CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
`)

export function transaction(fn) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

const seedProducts = [
  {
    name: 'Stoneware Pour-Over Set',
    category: 'Kitchen',
    price_cents: 4800,
    image: '/images/pour-over-set.png',
    stock: 24,
    description: 'A matte cream dripper, carafe and cup for slow morning coffee.',
    details: 'Wheel-thrown stoneware with a food-safe satin glaze. Dripper fits standard #2 filters. Carafe holds 600 ml. Dishwasher safe.',
  },
  {
    name: 'Washed Linen Throw',
    category: 'Living',
    price_cents: 8900,
    image: '/images/linen-throw.png',
    stock: 15,
    description: 'Stonewashed European linen in a warm rust tone, softer with every wash.',
    details: '100% European flax linen, 130 x 170 cm, hand-knotted fringe. Machine wash cold, tumble dry low.',
  },
  {
    name: 'Ceramic Table Lamp',
    category: 'Lighting',
    price_cents: 12900,
    image: '/images/ceramic-lamp.png',
    stock: 8,
    description: 'A sculptural sand-glazed base topped with a pleated linen shade.',
    details: 'Ceramic base, linen shade, 45 cm tall. E26 socket, inline switch, 2 m fabric cord. Bulb not included.',
  },
  {
    name: 'Walnut Serving Board',
    category: 'Kitchen',
    price_cents: 5600,
    image: '/images/walnut-board.png',
    stock: 30,
    description: 'Solid American black walnut, oiled and ready for the table.',
    details: 'Single-piece walnut, 45 x 20 cm, finished with food-safe mineral oil and beeswax. Hand wash only.',
  },
  {
    name: 'Bud Vase Trio',
    category: 'Decor',
    price_cents: 4200,
    image: '/images/bud-vases.png',
    stock: 20,
    description: 'Three hand-thrown vases in terracotta, cream and charcoal glazes.',
    details: 'Set of three, each 9-13 cm tall. Watertight glazed interiors. Every set varies slightly by hand.',
  },
  {
    name: 'Wool Felt Desk Tray',
    category: 'Workspace',
    price_cents: 3400,
    image: '/images/felt-organizer.png',
    stock: 40,
    description: 'Dense merino felt keeps pens, cards and keys quietly in order.',
    details: '5 mm merino wool felt, 28 x 18 cm, stitched corners. Spot clean with a damp cloth.',
  },
  {
    name: 'Brass Dome Pendant',
    category: 'Lighting',
    price_cents: 18900,
    image: '/images/brass-pendant.png',
    stock: 6,
    description: 'A brushed brass dome that casts a warm, focused pool of light.',
    details: 'Spun brass shade, 30 cm diameter, 1.5 m adjustable cord. Hardwire installation recommended.',
  },
  {
    name: 'Cedar Soy Candle',
    category: 'Decor',
    price_cents: 2400,
    image: '/images/cedar-candle.png',
    stock: 50,
    description: 'Cedarwood, vetiver and smoke, hand-poured in amber glass.',
    details: '100% soy wax, cotton wick, 220 g. Approximately 45 hours burn time.',
  },
]

const { count } = db.prepare('SELECT COUNT(*) AS count FROM products').get()
if (count === 0) {
  const insert = db.prepare(
    'INSERT INTO products (name, description, details, category, price_cents, image, stock) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
  transaction(() => {
    for (const p of seedProducts) {
      insert.run(p.name, p.description, p.details, p.category, p.price_cents, p.image, p.stock)
    }
  })
}
