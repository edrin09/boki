#!/usr/bin/env node
/**
 * marketctl — BOKI 插件市场发布 CLI（P2）
 *
 * 运行位置：开发机 / CI。这是唯一允许接触签名私钥的地方。
 * 服务器只跑 server/，不安装本 CLI、不持有私钥。
 *
 * 典型链路：
 *   marketctl pack    --plugin banks
 *   marketctl publish --plugin banks                 # 一条命令完成发布
 *   marketctl publish --plugin banks --dry-run       # 只打包，不联网
 *
 * 手工链路（可分步审计）：
 *   pack → release → candidate → sign → activate
 *
 * 环境变量：
 *   MARKET_URL                市场地址（必填；兼容 MARKET_ADMIN_URL / MARKET_PUBLIC_BASE_URL）
 *   PLUGIN_MARKET_PRIVATE_KEY Ed25519 私钥（raw seed base64 / PKCS#8 base64 / PEM）
 *   PLUGIN_MARKET_KEY_ID      密钥标识（默认 key-1，需与服务端 MARKET_PUBLIC_KEYS 对应）
 *   PLUGIN_MARKET_PLUGIN_ROOT 插件源码根目录（默认 plugins/）
 *   PLUGIN_MARKET_DIST_DIR    制品输出目录（默认 dist/）
 */
import { bool, parseArgs } from './lib/args.mjs'
import { PACKAGE_VERSION, loadCliConfig } from './lib/config.mjs'
import { CliError, usageError } from './lib/errors.mjs'
import { createOutput, fail } from './lib/output.mjs'
import {
  doActivate,
  doCandidate,
  doKeygen,
  doLicenseIssue,
  doLicenseRevoke,
  doLicenseVerify,
  doPack,
  doPublish,
  doRelease,
  doSign,
  printActivate,
  printCandidate,
  printKeygen,
  printLicenseIssue,
  printLicenseRevoke,
  printLicenseVerify,
  printPack,
  printPublish,
  printRelease,
  printSign,
} from './lib/commands.mjs'

const GLOBAL_STRINGS = ['url', 'key-id', 'timeout', 'plugin-root', 'dist-dir']
const GLOBAL_BOOLEANS = ['json', 'help']

const COMMANDS = {
  pack: {
    summary: '打包插件目录为 zip（排除 .ts/.map/node_modules），输出 sha256',
    strings: ['plugin', 'out'],
    async run(config, flags) {
      return doPack(config, flags)
    },
    print: printPack,
  },
  release: {
    summary: '登记版本并上传 zip（/v1/admin/releases）',
    strings: ['zip', 'plugin', 'version', 'api-version', 'engines', 'published-at', 'signature'],
    async run(config, flags) {
      return doRelease(config, flags)
    },
    print: printRelease,
  },
  candidate: {
    summary: '拉取未签名索引候选并落盘（/v1/admin/index/candidate）',
    strings: ['out'],
    async run(config, flags) {
      return doCandidate(config, flags)
    },
    print: printCandidate,
  },
  sign: {
    summary: '用本地私钥对候选索引做 Ed25519 签名（不上传私钥）',
    strings: ['raw', 'out'],
    async run(config, flags) {
      return doSign(config, flags)
    },
    print: printSign,
  },
  activate: {
    summary: '回传签名快照并激活（/v1/admin/index/activate）',
    strings: ['raw', 'signature', 'signature-file', 'version', 'published-at'],
    async run(config, flags) {
      return doActivate(config, flags)
    },
    print: printActivate,
  },
  publish: {
    summary: '一条命令：pack → release → 上架 → candidate → sign → activate',
    strings: ['plugin', 'zip', 'status', 'version', 'api-version', 'engines', 'published-at', 'signature'],
    booleans: ['dry-run'],
    async run(config, flags, out) {
      return doPublish(config, flags, out)
    },
    print: printPublish,
  },
  keygen: {
    summary: '生成 Ed25519 发布密钥对（公钥给服务端，私钥留本地）',
    strings: ['out-dir'],
    booleans: ['force'],
    async run(config, flags) {
      return doKeygen(config, flags)
    },
    print: printKeygen,
  },
}

const LICENSE = {
  issue: {
    summary: '签发授权码（明文只返回一次，库内只存哈希）',
    strings: ['plugin', 'plan', 'expires-at', 'order-id', 'buyer-ref'],
    async run(config, flags) {
      return doLicenseIssue(config, flags)
    },
    print: printLicenseIssue,
  },
  revoke: {
    summary: '吊销授权码（已安装插件继续可用）',
    strings: ['id'],
    async run(config, flags) {
      return doLicenseRevoke(config, flags)
    },
    print: printLicenseRevoke,
  },
  verify: {
    summary: '校验授权码（公共接口）',
    strings: ['key', 'plugin'],
    async run(config, flags) {
      return doLicenseVerify(config, flags)
    },
    print: printLicenseVerify,
  },
}

function globalUsage() {
  const width = Math.max(...Object.keys(COMMANDS).map((name) => name.length), 8)
  return [
    `boki-market marketctl v${PACKAGE_VERSION}（P2）`,
    '',
    '用法：marketctl <command> [options]',
    '',
    '命令：',
    ...Object.entries(COMMANDS).map(([name, spec]) => `  ${name.padEnd(width)}  ${spec.summary}`),
    `  ${'license'.padEnd(width)}  授权：issue / revoke / verify`,
    '',
    '全局选项：',
    '  --url <url>            市场地址（默认 MARKET_URL）',
    '  --key-id <id>          签名密钥标识（默认 PLUGIN_MARKET_KEY_ID 或 key-1）',
    '  --timeout <秒>         单次请求超时（默认 60）',
    '  --plugin-root <目录>   插件源码根（默认 plugins/）',
    '  --dist-dir <目录>      打包/候选输出根（默认 dist/）',
    '  --json                 结果输出单行 JSON（进度走 stderr）',
    '  --help                 查看命令帮助',
    '',
    '示例：',
    '  marketctl pack --plugin banks',
    '  marketctl publish --plugin banks --status published',
    '  marketctl publish --plugin banks --dry-run',
    '  marketctl license issue --plugin banks --plan perpetual',
    '',
    '私钥只从 PLUGIN_MARKET_PRIVATE_KEY 读取；本 CLI 永不把私钥写入制品或上传。',
  ].join('\n')
}

function commandUsage(name, spec, { licenseSub = null } = {}) {
  const lines = [`用法：marketctl ${licenseSub ? `license ${licenseSub}` : name} [options]`, '', spec.summary, '']
  const strings = spec.strings ?? []
  const booleans = [...(spec.booleans ?? []), ...GLOBAL_BOOLEANS]
  if (strings.length) {
    lines.push('命令选项：')
    for (const option of strings) lines.push(`  --${option} <value>`)
    lines.push('')
  }
  if (licenseSub === 'issue') {
    lines.push(
      '说明：',
      '  --plan perpetual|subscription（默认 perpetual）；订阅必须给 --expires-at ISO 时间。',
      '  --expires-at 2026-12-31T00:00:00Z',
      '  --order-id / --buyer-ref 可选，用于对账。',
      '',
    )
  }
  if (licenseSub === 'verify') {
    lines.push('说明：走公共接口 POST /v1/license/verify。', '')
  }
  lines.push(
    '全局选项：',
    '  --url <url>  --key-id <id>  --timeout <秒>',
    '  --plugin-root <目录>  --dist-dir <目录>',
    `  ${booleans.includes('json') ? '--json  ' : ''}${booleans.includes('dry-run') ? '--dry-run  ' : ''}--help`,
  )
  return lines.join('\n')
}

function parseWith(spec, argv) {
  return parseArgs(argv, {
    strings: [...new Set([...GLOBAL_STRINGS, ...(spec.strings ?? [])])],
    booleans: [...new Set([...GLOBAL_BOOLEANS, ...(spec.booleans ?? [])])],
  })
}

async function main(argv) {
  const [command, ...rest] = argv

  if (!command || command === 'help') {
    if (command === 'help' && rest[0]) {
      const target = rest[0]
      if (target === 'license') {
        process.stdout.write(
          ['用法：marketctl license <issue|revoke|verify> [options]', '', ...Object.entries(LICENSE).map(([name, spec]) => `  ${name.padEnd(8)} ${spec.summary}`)].join('\n') + '\n',
        )
        return
      }
      if (!COMMANDS[target]) throw usageError(`未知命令：${target}`)
      process.stdout.write(`${commandUsage(target, COMMANDS[target])}\n`)
      return
    }
    process.stdout.write(`${globalUsage()}\n`)
    return
  }

  if (command === '--help' || command === '-h') {
    process.stdout.write(`${globalUsage()}\n`)
    return
  }

  if (command === '--version' || command === '-v') {
    process.stdout.write(`${PACKAGE_VERSION}\n`)
    return
  }

  if (command === 'license') {
    const [sub, ...licenseArgs] = rest
    if (!sub || sub === '--help' || sub === '-h') {
      process.stdout.write(
        ['用法：marketctl license <issue|revoke|verify> [options]', '', ...Object.entries(LICENSE).map(([name, spec]) => `  ${name.padEnd(8)} ${spec.summary}`)].join('\n') + '\n',
      )
      return
    }
    if (!Object.hasOwn(LICENSE, sub)) throw usageError(`未知 license 子命令：${sub}`)
    const spec = LICENSE[sub]
    const { flags } = parseWith(spec, licenseArgs)
    if (bool(flags, 'help')) {
      process.stdout.write(`${commandUsage('license', spec, { licenseSub: sub })}\n`)
      return
    }
    let config
    try {
      config = loadCliConfig(flags)
      const out = createOutput({ json: bool(flags, 'json') })
      const result = await spec.run(config, flags, out)
      spec.print?.(result, out)
    } catch (error) {
      fail(error, { secret: config?.privateKey || process.env.PLUGIN_MARKET_PRIVATE_KEY })
    }
    return
  }

  if (!Object.hasOwn(COMMANDS, command)) {
    throw usageError(`未知命令：${command}（marketctl --help 查看可用命令）`)
  }

  const spec = COMMANDS[command]
  const { flags, positionals } = parseWith(spec, rest)
  if (positionals.length) {
    throw usageError(`多余的参数：${positionals.join(' ')}（请用 --plugin / --zip 等选项）`)
  }
  if (bool(flags, 'help')) {
    process.stdout.write(`${commandUsage(command, spec)}\n`)
    return
  }

  let config
  try {
    config = loadCliConfig(flags)
    const out = createOutput({ json: bool(flags, 'json') })
    const result = await spec.run(config, flags, out)
    spec.print?.(result, out)
  } catch (error) {
    fail(error, { secret: config?.privateKey || process.env.PLUGIN_MARKET_PRIVATE_KEY })
  }
}

try {
  await main(process.argv.slice(2))
} catch (error) {
  if (error instanceof CliError) {
    process.stderr.write(`${error.message}\n`)
    if (error.exitCode === 2) process.stderr.write('运行 marketctl --help 查看用法\n')
    process.exitCode = error.exitCode
  } else {
    process.stderr.write(`${error?.message || String(error)}\n`)
    if (process.env.MARKETCTL_DEBUG === '1' && error?.stack) process.stderr.write(`${error.stack}\n`)
    process.exitCode = 1
  }
}
