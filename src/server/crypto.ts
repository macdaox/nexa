const encoder = new TextEncoder()

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function bytesToBase64(bytes: Uint8Array) {
  if (typeof btoa === 'function') {
    let binary = ''
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte)
    })
    return btoa(binary)
  }
  return Buffer.from(bytes).toString('base64')
}

function base64ToBytes(value: string) {
  if (typeof atob === 'function') {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
  }
  return Uint8Array.from(Buffer.from(value, 'base64'))
}

function base64UrlEncode(bytes: Uint8Array) {
  return bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function base64UrlDecode(value: string) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  return base64ToBytes(padded)
}

export async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return bytesToHex(new Uint8Array(signature))
}

export async function hmacSha256Base64(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return bytesToBase64(new Uint8Array(signature))
}

export async function verifyPassword(password: string, storedHash: string) {
  const [scheme, iterationsText, saltBase64, expectedBase64] = storedHash.split('$')
  if (scheme !== 'pbkdf2') return false

  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: base64ToBytes(saltBase64),
      iterations: Number(iterationsText),
    },
    keyMaterial,
    256,
  )
  return timingSafeEqual(bytesToBase64(new Uint8Array(bits)), expectedBase64)
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return diff === 0
}

export async function createPasswordHash(password: string, iterations = 210000) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    keyMaterial,
    256,
  )
  return `pbkdf2$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`
}

export async function createJwt(payload: Record<string, unknown>, secret: string, ttlSeconds: number) {
  const now = Math.floor(Date.now() / 1000)
  const body = { ...payload, iat: now, exp: now + ttlSeconds }
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const encodedBody = base64UrlEncode(encoder.encode(JSON.stringify(body)))
  const signature = await hmacSha256Base64(secret, `${header}.${encodedBody}`)
  return `${header}.${encodedBody}.${signature.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`
}

export async function verifyJwt<T extends Record<string, unknown>>(token: string, secret: string) {
  const [header, body, signature] = token.split('.')
  if (!header || !body || !signature) return null

  const expected = (await hmacSha256Base64(secret, `${header}.${body}`))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
  if (!timingSafeEqual(signature, expected)) return null

  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as T & { exp?: number }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null
  return payload
}

async function importAesKey(base64Key: string) {
  const raw = base64ToBytes(base64Key)
  if (raw.byteLength !== 32) {
    throw new Error('ENCRYPTION_KEY must be a base64 encoded 32-byte key')
  }
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptSecret(value: string, base64Key: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await importAesKey(base64Key)
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(value))
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(cipher))}`
}

export async function decryptSecret(value: string, base64Key: string) {
  const [ivBase64, cipherBase64] = value.split('.')
  const key = await importAesKey(base64Key)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(ivBase64) },
    key,
    base64ToBytes(cipherBase64),
  )
  return new TextDecoder().decode(plain)
}
