import { describe, expect, it } from 'vitest'
import { createJwt, createPasswordHash, decryptSecret, encryptSecret, hmacSha256Hex, verifyJwt, verifyPassword } from './crypto'

describe('crypto helpers', () => {
  it('verifies pbkdf2 password hashes', async () => {
    const hash = await createPasswordHash('correct-password', 1000)

    await expect(verifyPassword('correct-password', hash)).resolves.toBe(true)
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false)
  })

  it('encrypts and decrypts secrets with AES-GCM', async () => {
    const key = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')
    const encrypted = await encryptSecret('api-secret', key)

    expect(encrypted).not.toContain('api-secret')
    await expect(decryptSecret(encrypted, key)).resolves.toBe('api-secret')
  })

  it('creates and verifies JWTs', async () => {
    const token = await createJwt({ sub: 'admin@example.com' }, 'jwt-secret', 60)

    await expect(verifyJwt<{ sub: string }>(token, 'jwt-secret')).resolves.toMatchObject({
      sub: 'admin@example.com',
    })
    await expect(verifyJwt(token, 'wrong-secret')).resolves.toBeNull()
  })

  it('generates stable hmac hex signatures', async () => {
    await expect(hmacSha256Hex('secret', 'message')).resolves.toBe(
      '8b5f48702995c1598c573db1e21866a9b825d4a794d169d7060a03605796360b',
    )
  })
})
