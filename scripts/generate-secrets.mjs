import { webcrypto } from 'node:crypto'

const crypto = globalThis.crypto ?? webcrypto

const password = process.argv[2]

if (!password) {
  console.error('Usage: node scripts/generate-secrets.mjs <admin-password>')
  process.exit(1)
}

const encoder = new TextEncoder()
const salt = crypto.getRandomValues(new Uint8Array(16))
const iterations = 100000
const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
const bits = await crypto.subtle.deriveBits(
  { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
  keyMaterial,
  256,
)
const encryptionKey = crypto.getRandomValues(new Uint8Array(32))

const base64 = (bytes) => Buffer.from(bytes).toString('base64')

console.log(`ADMIN_PASSWORD_HASH=pbkdf2$${iterations}$${base64(salt)}$${base64(new Uint8Array(bits))}`)
console.log(`ENCRYPTION_KEY=${base64(encryptionKey)}`)
console.log(`JWT_SECRET=${base64(crypto.getRandomValues(new Uint8Array(32)))}`)
