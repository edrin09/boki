/**
 * marketctl 命令实现。
 *
 * 发布链与接入说明 7 一致：pack → release →（上架）→ candidate → sign → activate。
 * 私钥只在本文件的 sign 步骤出现，且只来自 PLUGIN_MARKET_PRIVATE_KEY。
 */
import fs from 'node:fs'
import path from 'node:path'
import { bool, str } from './args.mjs'
import { createApi } from './api.mjs'
import { PROJECT_ROOT, requireMarket, requireMarketUrl } from './config.mjs'
import { CliError, usageError } from './errors.mjs'
import {
  generateKeyPair,
  loadPrivateKey,
  normalizeKeyId,
  publicKeyBase64,
  publicKeyFingerprint,
  signPayload,
} from './key.mjs'
import { formatBytes, shortHash } from './output.mjs'
import { isSemver, packPlugin, readPackMetadata, sha256Hex } from './pack.mjs'

const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
const RELEASE_STATUS = new Set(['published', 'hidden', 'draft', 'deprecated'])
const STATUS_FLAGS = new Set([...RELEASE_STATUS, 'keep'])

export function displayPath(file) {
  const absolute = path.resolve(file)
  const relative = path.relative(PROJECT_ROOT, absolute)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return absolute
  return relative.split(path.sep).join('/')
}

function normalizePluginId(value) {
  const id = String(value ?? '').trim()
  if (!PLUGIN_ID_RE.test(id)) throw usageError(`插件 id 不合法：${id || '(空)'}`)
  return id
}

function resolvePluginTarget(config, value) {
  const input = String(value ?? '').trim()
  if (!input) throw usageError('pack / publish 需要 --plugin <id|目录>')
  const direct = path.resolve(input)
  if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) return direct
  const underRoot = path.join(config.pluginRoot, input)
  if (fs.existsSync(underRoot) && fs.statSync(underRoot).isDirectory()) return underRoot
  throw new CliError(`找不到插件目录：${input}（也尝试过 ${underRoot}）`)
}

function parseEnginesFlag(value) {
  if (!value) return undefined
  let parsed
  try {
    parsed = JSON.parse(value)
  } catch {
    throw usageError('--engines 必须是 JSON 对象，例如 \'{"boki":">=1.0.0"}\'')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw usageError('--engines 必须是 JSON 对象')
  }
  return parsed
}

function parsePublishedAt(value) {
  if (!value) return undefined
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) throw usageError(`--published-at 不是合法时间：${value}`)
  return new Date(timestamp).toISOString()
}

function readFileOrThrow(file, label) {
  const target = path.resolve(file)
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    throw new CliError(`${label}不存在：${target}`)
  }
  return { file: target, data: fs.readFileSync(target) }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

/** sign 的输入：候选响应 JSON（含 raw 字符串）或裸 index v2 JSON */
function readCandidate(file) {
  const { file: absolute, data } = readFileOrThrow(file, '候选文件')
  const text = data.toString('utf8')
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new CliError(`候选文件不是合法 JSON：${error.message}`)
  }

  if (typeof parsed?.raw === 'string' && parsed.raw.trim()) {
    return {
      file: absolute,
      raw: parsed.raw,
      meta: {
        snapshotVersion: Number.isInteger(parsed.snapshotVersion) ? parsed.snapshotVersion : null,
        publishedAt: typeof parsed.publishedAt === 'string' ? parsed.publishedAt : null,
        contentHash: typeof parsed.contentHash === 'string' ? parsed.contentHash : null,
      },
    }
  }

  if (parsed?.version !== 2 || !Array.isArray(parsed.plugins)) {
    throw new CliError('无法识别候选文件：需要 candidate 响应（含 raw）或 index v2 JSON')
  }
  return {
    file: absolute,
    raw: text,
    meta: {
      snapshotVersion: null,
      publishedAt: typeof parsed.publishedAt === 'string' ? parsed.publishedAt : null,
      contentHash: null,
    },
  }
}

function signRaw(config, raw, keyIdInput) {
  const keyId = normalizeKeyId(keyIdInput || config.keyId)
  const privateKey = loadPrivateKey(config.privateKey)
  const signature = signPayload(privateKey, raw)
  const publicBase64 = publicKeyBase64(privateKey)
  const contentHash = sha256Hex(Buffer.from(raw, 'utf8'))
  return {
    keyId,
    signature,
    publicKey: publicBase64,
    publicKeyFingerprint: publicKeyFingerprint(publicBase64),
    contentHash,
    signedAt: new Date().toISOString(),
  }
}

// ------------------------------------------------------------------- pack

export function doPack(config, flags) {
  const pluginDir = resolvePluginTarget(config, str(flags, 'plugin'))
  return packPlugin({
    pluginDir,
    distDir: config.distDir,
    outFile: str(flags, 'out') || undefined,
  })
}

export function printPack(result, out) {
  out.step(`打包完成：${result.pluginId}@${result.version}`)
  out.result(result, (value) => [
    `  文件      ${displayPath(value.zipPath)}`,
    `  大小      ${formatBytes(value.size)}（${value.fileCount} 个文件）`,
    `  sha256    ${value.sha256}`,
    `  元数据    ${displayPath(value.sidecar)}`,
  ].join('\n'))
}

// ---------------------------------------------------------------- release

export async function doRelease(config, flags) {
  requireMarket(config)
  const zipInput = str(flags, 'zip')
  if (!zipInput) throw usageError('release 需要 --zip <文件>')
  const { file: zipPath, data: zip } = readFileOrThrow(zipInput, '插件包')
  const metadata = readPackMetadata(zipPath)

  const pluginFlag = str(flags, 'plugin')
  const pluginIdValue = pluginFlag && PLUGIN_ID_RE.test(pluginFlag) ? pluginFlag : metadata?.pluginId
  if (!pluginIdValue) throw usageError('缺少 pluginId：传 --plugin <id> 或使用 pack 生成的 zip 元数据')
  const pluginId = normalizePluginId(pluginIdValue)
  const version = str(flags, 'version') || metadata?.version
  if (!isSemver(version)) throw usageError(`version 必须是 SemVer（可传 --version 或用 pack 生成的元数据）`)
  const apiVersion = str(flags, 'api-version') || metadata?.apiVersion
  if (!apiVersion) throw usageError('缺少 apiVersion（可传 --api-version 或用 pack 生成的元数据）')

  const sha256 = sha256Hex(zip)
  if (metadata?.sha256 && metadata.sha256 !== sha256) {
    throw new CliError('zip 内容与 pack 元数据记录的 sha256 不一致：文件可能被替换，请重新 pack')
  }

  const api = createApi(config)
  const released = await api.release({
    zip,
    pluginId,
    version,
    apiVersion,
    engines: parseEnginesFlag(str(flags, 'engines')) ?? metadata?.engines ?? undefined,
    publishedAt: parsePublishedAt(str(flags, 'published-at')),
    signature: str(flags, 'signature') || undefined,
    sha256,
  })

  if (released?.sha256 && released.sha256 !== sha256) {
    throw new CliError(`服务端记录的 sha256 与本地不一致：${released.sha256}`)
  }

  return { ...released, zipPath, sidecar: metadata ? `${zipPath}.json` : null }
}

export function printRelease(result, out) {
  out.step(`版本已登记：${result.pluginId}@${result.version}`)
  out.result(result, (value) =>
    [
      `  sha256    ${value.sha256}`,
      `  大小      ${formatBytes(value.size)}`,
      `  制品路径  ${value.zipPath}`,
      '  下一步    marketctl publish（或 candidate → sign → activate）',
    ].join('\n'),
  )
}

// -------------------------------------------------------------- candidate

export async function doCandidate(config, flags) {
  requireMarket(config)
  const api = createApi(config)
  const candidate = await api.candidate()
  const output = path.resolve(
    str(flags, 'out') || path.join(config.distDir, 'index-candidate.json'),
  )
  writeJson(output, candidate)
  return {
    file: output,
    snapshotVersion: candidate.snapshotVersion,
    publishedAt: candidate.publishedAt,
    contentHash: candidate.contentHash,
    pluginCount: candidate.pluginCount,
    categoryCount: candidate.categoryCount,
  }
}

export function printCandidate(result, out) {
  out.step(`候选索引已生成：v${result.snapshotVersion}`)
  out.result(result, (value) => [
    `  文件      ${displayPath(value.file)}`,
    `  插件/分类 ${value.pluginCount} / ${value.categoryCount}`,
    `  content   ${shortHash(value.contentHash, 16)}`,
    `  下一步    marketctl sign --raw ${displayPath(value.file)}`,
  ].join('\n'))
}

// ------------------------------------------------------------------- sign

export async function doSign(config, flags) {
  const rawInput = str(flags, 'raw')
  if (!rawInput) throw usageError('sign 需要 --raw <候选文件>')
  const candidate = readCandidate(rawInput)
  const signed = signRaw(config, candidate.raw, str(flags, 'key-id'))
  if (candidate.meta.contentHash && candidate.meta.contentHash !== signed.contentHash) {
    throw new CliError(
      '候选内容已被修改（contentHash 不匹配）：请重新执行 candidate，不要手工编辑 raw',
    )
  }

  const output = path.resolve(str(flags, 'out') || `${candidate.file}.sig.json`)
  const record = {
    ...signed,
    rawFile: candidate.file,
    snapshotVersion: candidate.meta.snapshotVersion,
    publishedAt: candidate.meta.publishedAt,
  }
  writeJson(output, record)
  return { ...record, file: output }
}

export function printSign(result, out) {
  out.step(`已签名：keyId=${result.keyId}`)
  out.result(result, (value) => [
    `  签名文件  ${displayPath(value.file)}`,
    `  公钥指纹  ${value.publicKeyFingerprint}`,
    `  content   ${shortHash(value.contentHash, 16)}`,
    `  下一步    marketctl activate --raw ${displayPath(value.rawFile)} --signature-file ${displayPath(value.file)}`,
  ].join('\n'))
}

// --------------------------------------------------------------- activate

export async function doActivate(config, flags) {
  requireMarket(config)
  const rawInput = str(flags, 'raw')
  if (!rawInput) throw usageError('activate 需要 --raw <候选文件>')
  const candidate = readCandidate(rawInput)

  let signature = str(flags, 'signature')
  let keyId = str(flags, 'key-id')
  let signedMeta = {}

  const signatureFile = str(flags, 'signature-file') || (signature ? '' : `${candidate.file}.sig.json`)
  if (!signature && signatureFile) {
    const { data } = readFileOrThrow(signatureFile, '签名文件')
    try {
      signedMeta = JSON.parse(data.toString('utf8'))
    } catch (error) {
      throw new CliError(`签名文件不是合法 JSON：${error.message}`)
    }
    signature = String(signedMeta.signature || '')
    keyId = keyId || String(signedMeta.keyId || '')
  }
  if (!signature) throw usageError('activate 需要 --signature-file 或 --signature')
  if (!keyId) keyId = config.keyId

  if (signedMeta.contentHash && signedMeta.contentHash !== sha256Hex(Buffer.from(candidate.raw, 'utf8'))) {
    throw new CliError('签名文件的 contentHash 与 raw 不一致：请重新签名')
  }

  const requestedVersion = str(flags, 'version') || signedMeta.snapshotVersion || candidate.meta.snapshotVersion
  const version = requestedVersion === undefined || requestedVersion === null || requestedVersion === ''
    ? undefined
    : Number(requestedVersion)
  if (version !== undefined && (!Number.isInteger(version) || version <= 0)) {
    throw usageError('--version 必须是正整数（快照版本，不是索引格式版本）')
  }

  const api = createApi(config)
  const activated = await api.activate({
    raw: candidate.raw,
    signature,
    keyId: normalizeKeyId(keyId),
    ...(version === undefined ? {} : { version }),
    ...(str(flags, 'published-at') || candidate.meta.publishedAt
      ? { publishedAt: parsePublishedAt(str(flags, 'published-at') || candidate.meta.publishedAt) }
      : {}),
  })
  return activated
}

export function printActivate(result, out) {
  out.step(`快照已激活：v${result.version}`)
  out.result(result, (value) => [
    `  快照      v${value.version}（${value.pluginCount} 个插件 / ${value.categoryCount} 个分类）`,
    `  keyId     ${value.keyId}`,
    `  ETag      ${value.etag}`,
    `  content   ${shortHash(value.contentHash, 16)}`,
  ].join('\n'))
}

// ---------------------------------------------------------------- publish

/**
 * 一条命令：pack → release →（可选上架）→ candidate → sign → activate。
 * `--dry-run` 只打包并输出计划，不访问网络、不读私钥。
 */
export async function doPublish(config, flags, out) {
  const prebuilt = str(flags, 'zip')
  const status = str(flags, 'status') || 'published'
  if (!STATUS_FLAGS.has(status)) {
    throw usageError('--status 只能是 published / hidden / draft / deprecated / keep')
  }

  let packed = null
  let zipPath
  if (prebuilt) {
    zipPath = readFileOrThrow(prebuilt, '插件包').file
  } else {
    packed = doPack(config, flags)
    zipPath = packed.zipPath
  }

  if (bool(flags, 'dry-run')) {
    return {
      dryRun: true,
      packed: packed
        ? {
            pluginId: packed.pluginId,
            version: packed.version,
            zipPath,
            sha256: packed.sha256,
            size: packed.size,
            fileCount: packed.fileCount,
          }
        : null,
      zipPath,
      status,
      steps: ['release', ...(status === 'keep' ? [] : ['status']), 'candidate', 'sign', 'activate'],
    }
  }

  requireMarket(config)
  // 先确认私钥可用再上传：避免「版本已登记、上架了、最后签名失败」的半成品发布
  loadPrivateKey(config.privateKey)

  const releaseFlags = { ...flags, zip: zipPath }
  if (packed) releaseFlags.plugin = packed.pluginId
  const released = await doRelease(config, releaseFlags)
  out?.step(`✔ release    ${released.pluginId}@${released.version}`)

  let statusResult = null
  if (status !== 'keep') {
    const api = createApi(config)
    statusResult = await api.setStatus(released.pluginId, status)
    out?.step(`✔ status     ${status}`)
  }

  const api = createApi(config)
  const candidate = await api.candidate()
  out?.step(`✔ candidate  v${candidate.snapshotVersion}（${candidate.pluginCount} 个插件）`)

  const signed = signRaw(config, candidate.raw, str(flags, 'key-id'))
  out?.step(`✔ sign       keyId=${signed.keyId}（${signed.publicKeyFingerprint}）`)

  // 留档：候选原文与签名（便于回滚核对；不含私钥）。先落盘再激活，避免激活成功但本地无记录。
  const indexDir = path.join(config.distDir, 'index')
  const candidateFile = path.join(indexDir, `${candidate.snapshotVersion}-candidate.json`)
  const signatureFile = path.join(indexDir, `${candidate.snapshotVersion}-signature.json`)
  writeJson(candidateFile, candidate)
  writeJson(signatureFile, {
    ...signed,
    rawFile: candidateFile,
    snapshotVersion: candidate.snapshotVersion,
    publishedAt: candidate.publishedAt,
  })

  const activated = await api.activate({
    raw: candidate.raw,
    signature: signed.signature,
    keyId: signed.keyId,
    version: candidate.snapshotVersion,
    publishedAt: candidate.publishedAt,
  })
  out?.step(`✔ activate   快照 v${activated.version}`)

  return {
    packed: packed
      ? {
          pluginId: packed.pluginId,
          version: packed.version,
          zipPath,
          sha256: packed.sha256,
          size: packed.size,
          fileCount: packed.fileCount,
        }
      : null,
    released,
    status: status === 'keep' ? null : { pluginId: released.pluginId, status, plugin: statusResult },
    candidate: {
      snapshotVersion: candidate.snapshotVersion,
      publishedAt: candidate.publishedAt,
      contentHash: candidate.contentHash,
      pluginCount: candidate.pluginCount,
      categoryCount: candidate.categoryCount,
      file: candidateFile,
    },
    signed: {
      keyId: signed.keyId,
      publicKey: signed.publicKey,
      publicKeyFingerprint: signed.publicKeyFingerprint,
      contentHash: signed.contentHash,
      file: signatureFile,
    },
    activated,
  }
}

export function printPublish(result, out) {
  out.result(result, (value) => {
    if (value.dryRun) {
      return [
        `干跑：${value.packed ? `${value.packed.pluginId}@${value.packed.version}` : value.zipPath}`,
        `  镜像      ${displayPath(value.zipPath)}`,
        `  步骤      ${value.steps.join(' → ')}（--status ${value.status}）`,
        '  未访问网络，也未读取私钥。去掉 --dry-run 执行。',
      ].join('\n')
    }
    return [
      `发布完成：${value.activated.version} 号快照（${value.activated.pluginCount} 个插件）`,
      `  插件      ${value.released.pluginId}@${value.released.version}`,
      `  状态      ${value.status ? value.status.status : '保持不变'}`,
      `  sha256    ${value.released.sha256}`,
      `  签名      keyId=${value.signed.keyId}，指纹 ${value.signed.publicKeyFingerprint}`,
      `  候选      ${displayPath(value.candidate.file)}`,
      `  ETag      ${value.activated.etag}`,
      '  客户端下一次拉取 /v1/index 即可看到（受缓存 TTL 影响）。',
    ].join('\n')
  })
}

// ---------------------------------------------------------------- license

export async function doLicenseIssue(config, flags) {
  requireMarket(config)
  const pluginId = normalizePluginId(str(flags, 'plugin'))
  const plan = str(flags, 'plan') || 'perpetual'
  const api = createApi(config)
  return api.issueLicense({
    pluginId,
    plan,
    ...(str(flags, 'expires-at') ? { expiresAt: parsePublishedAt(str(flags, 'expires-at')) } : {}),
    ...(str(flags, 'order-id') ? { orderId: str(flags, 'order-id') } : {}),
    ...(str(flags, 'buyer-ref') ? { buyerRef: str(flags, 'buyer-ref') } : {}),
  })
}

export function printLicenseIssue(result, out) {
  out.step('授权已签发：明文只显示这一次，请立即交给买家')
  out.result(result, (value) => [
    `  授权码    ${value.key}`,
    `  记录 ID   ${value.id}`,
    `  插件      ${value.pluginId}（${value.plan}）`,
    `  到期      ${value.expiresAt || '永久'}`,
    '  库内只存哈希；丢失只能吊销后重新签发。',
  ].join('\n'))
}

export async function doLicenseRevoke(config, flags) {
  requireMarket(config)
  const id = str(flags, 'id')
  if (!id) throw usageError('license revoke 需要 --id <授权记录 ID>')
  const api = createApi(config)
  return api.revokeLicense(id)
}

export function printLicenseRevoke(result, out) {
  out.step(`授权已吊销：${result.id}`)
  out.result(result, (value) => [
    `  插件      ${value.pluginId}`,
    `  状态      ${value.status}`,
    `  吊销时间  ${value.revokedAt || '-'}`,
    '  已安装插件继续可用；仅新下载与更新被拒绝。',
  ].join('\n'))
}

export async function doLicenseVerify(config, flags) {
  requireMarketUrl(config)
  const key = str(flags, 'key')
  if (!key) throw usageError('license verify 需要 --key <授权码>')
  const api = createApi(config)
  return api.verifyLicense({ key, ...(str(flags, 'plugin') ? { pluginId: normalizePluginId(str(flags, 'plugin')) } : {}) })
}

export function printLicenseVerify(result, out) {
  out.result(result, (value) => {
    if (!value.valid) return `授权无效：${value.reason || 'unknown'}`
    return `授权有效：${value.pluginId}（${value.plan}），到期 ${value.expiresAt || '永久'}`
  })
}

// ----------------------------------------------------------------- keygen

export function doKeygen(config, flags) {
  const keyId = normalizeKeyId(str(flags, 'key-id') || 'cli-key')
  const outDir = path.resolve(str(flags, 'out-dir') || path.join(config.distDir, 'keys'))
  const privateFile = path.join(outDir, `${keyId}.private`)
  if (fs.existsSync(privateFile) && !bool(flags, 'force')) {
    throw new CliError(`私钥文件已存在：${privateFile}（确需覆盖加 --force）`)
  }

  const pair = generateKeyPair()
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(privateFile, `${pair.seedBase64}\n`, { mode: 0o600 })

  return {
    keyId,
    privateKeyFile: privateFile,
    publicKey: pair.publicKeyBase64,
    publicKeyFingerprint: pair.fingerprint,
    marketPublicKeys: `${keyId}:${pair.publicKeyBase64}`,
  }
}

export function printKeygen(result, out) {
  out.step(`密钥已生成：${result.keyId}`)
  out.result(result, (value) => [
    `  私钥文件  ${displayPath(value.privateKeyFile)}（已 gitignore，勿提交、勿上传服务器）`,
    `  公钥指纹  ${value.publicKeyFingerprint}`,
    '',
    '下一步：',
    '  1) 把公钥加入服务端 .env（只放公钥）：',
    `     MARKET_PUBLIC_KEYS=${value.marketPublicKeys}`,
    '  2) 发布端设置私钥环境变量（不要在命令行里明文传）：',
    `     PowerShell: $env:PLUGIN_MARKET_PRIVATE_KEY = Get-Content '${displayPath(value.privateKeyFile)}' -Raw`,
    `     bash:       export PLUGIN_MARKET_PRIVATE_KEY="$(cat '${displayPath(value.privateKeyFile)}')"`,
    `     export PLUGIN_MARKET_KEY_ID=${value.keyId}`,
  ].join('\n'))
}
