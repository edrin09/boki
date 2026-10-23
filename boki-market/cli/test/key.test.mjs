import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  generateKeyPair,
  loadPrivateKey,
  publicKeyBase64,
  publicKeyFingerprint,
  signPayload,
} from '../lib/key.mjs'
import { verifyDetachedSignature } from '../../server/src/lib/signature.mjs'
import { parseCliJson, runCli } from './helpers.mjs'

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'boki-marketctl-key-'))
}

test('密钥：raw seed / PKCS#8 DER / PEM 三种格式等价，签名可被服务端验证', () => {
  const pair = generateKeyPair()
  const keyFromSeed = loadPrivateKey(pair.seedBase64)
  const keyFromPem = loadPrivateKey(pair.privateKeyPem)

  const der = crypto.createPrivateKey(pair.privateKeyPem).export({ type: 'pkcs8', format: 'der' })
  const keyFromDer = loadPrivateKey(der.toString('base64'))

  const publicBase64 = publicKeyBase64(keyFromSeed)
  assert.equal(publicKeyBase64(keyFromPem), publicBase64)
  assert.equal(publicKeyBase64(keyFromDer), publicBase64)
  assert.equal(publicBase64, pair.publicKeyBase64)
  assert.equal(publicKeyFingerprint(publicBase64), pair.fingerprint)

  const payload = '{"version":2,"market":"boki-official"}'
  const signature = signPayload(keyFromSeed, payload)
  assert.equal(verifyDetachedSignature(Buffer.from(payload), signature, pair.publicKeyBase64), true)

  const tampered = `${payload} `
  assert.equal(verifyDetachedSignature(Buffer.from(tampered), signature, pair.publicKeyBase64), false)
})

test('密钥：非法格式与非 Ed25519 私钥给出明确错误', () => {
  assert.throws(() => loadPrivateKey(''), /PLUGIN_MARKET_PRIVATE_KEY/)
  assert.throws(() => loadPrivateKey('!!!'), /无法解析/)

  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
  const rsaBase64 = rsa.export({ type: 'pkcs8', format: 'der' }).toString('base64')
  assert.throws(() => loadPrivateKey(rsaBase64), /必须是 Ed25519/)
})

test('keygen：生成私钥文件、公钥可用于验签，拒绝覆盖', (t) => {
  const dir = tempDir()
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

  const first = parseCliJson(
    runCli(['keygen', '--key-id', 'release-key', '--out-dir', dir, '--json']),
  )
  assert.equal(first.keyId, 'release-key')
  assert.equal(fs.existsSync(first.privateKeyFile), true)
  assert.equal(first.marketPublicKeys, `release-key:${first.publicKey}`)

  const seed = fs.readFileSync(first.privateKeyFile, 'utf8').trim()
  assert.equal(Buffer.from(seed, 'base64').length, 32)
  assert.equal(publicKeyBase64(loadPrivateKey(seed)), first.publicKey)
  assert.equal(publicKeyFingerprint(first.publicKey), first.publicKeyFingerprint)

  // 私钥内容不得出现在 CLI 输出里
  assert.equal(JSON.stringify(first).includes(seed), false)

  const second = runCli(['keygen', '--key-id', 'release-key', '--out-dir', dir, '--json'])
  assert.equal(second.status, 1)
  assert.match(second.stderr, /已存在/)

  const forced = parseCliJson(
    runCli(['keygen', '--key-id', 'release-key', '--out-dir', dir, '--force', '--json']),
  )
  assert.notEqual(forced.publicKey, first.publicKey)
})
