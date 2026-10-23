import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createZip, readZip } from '../lib/zip.mjs'
import { packPlugin, sha256Hex } from '../lib/pack.mjs'
import { writePlugin } from './helpers.mjs'

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'boki-marketctl-zip-'))
}

test('ZIP：写入/读取往返、确定性排序、CRC 与非法路径', () => {
  const zip = createZip([
    { name: 'b.txt', data: 'world' },
    { name: 'a.txt', data: 'hello' },
    { name: 'dir/large.txt', data: 'x'.repeat(4096) },
    { name: 'empty.txt', data: Buffer.alloc(0) },
  ])

  const entries = readZip(zip)
  assert.deepEqual([...entries.keys()], ['a.txt', 'b.txt', 'dir/large.txt', 'empty.txt'])
  assert.equal(entries.get('a.txt').toString(), 'hello')
  assert.equal(entries.get('dir/large.txt').toString().length, 4096)

  // 同样的条目 → 同样的字节（排序稳定，无时间噪音时）
  const again = createZip([
    { name: 'empty.txt', data: Buffer.alloc(0) },
    { name: 'dir/large.txt', data: 'x'.repeat(4096) },
    { name: 'a.txt', data: 'hello' },
    { name: 'b.txt', data: 'world' },
  ])
  assert.equal(sha256Hex(zip), sha256Hex(again))

  assert.throws(() => createZip([{ name: '../escape.txt', data: 'x' }]), /非法路径段/)
  assert.throws(() => createZip([{ name: '/abs.txt', data: 'x' }]), /绝对路径/)
  assert.throws(() => createZip([{ name: 'a.txt', data: '1' }, { name: 'a.txt', data: '2' }]), /重复/)
  assert.throws(() => createZip([]), /至少需要一个条目/)
  assert.throws(() => readZip(Buffer.from('not a zip')), /ZIP/)
})

test('pack：排除源码/依赖/私密文件，生成 sha256 与 sidecar', (t) => {
  const dir = tempDir()
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

  const pluginDir = writePlugin(dir)
  const distDir = path.join(dir, 'dist')
  const result = packPlugin({ pluginDir, distDir })

  assert.equal(result.pluginId, 'banks')
  assert.equal(result.version, '1.0.0')
  assert.equal(result.apiVersion, '^1.0.0')
  assert.deepEqual(result.engines, { boki: '>=1.0.0' })
  assert.equal(fs.existsSync(result.zipPath), true)
  assert.equal(fs.existsSync(result.sidecar), true)

  const zip = fs.readFileSync(result.zipPath)
  assert.equal(sha256Hex(zip), result.sha256)
  assert.equal(result.size, zip.length)

  const entries = readZip(zip)
  const names = [...entries.keys()]
  assert.ok(names.includes('manifest.json'))
  assert.ok(names.includes('client/index.js'))
  assert.ok(names.includes('client/style.css'))
  assert.ok(names.includes('client/pages/index.vue'))
  assert.ok(names.includes('server/index.js'))
  assert.ok(names.includes('README.md'))

  // 排除项
  assert.ok(!names.some((name) => name.endsWith('.ts')))
  assert.ok(!names.some((name) => name.endsWith('.map')))
  assert.ok(!names.some((name) => name.startsWith('node_modules/')))
  assert.ok(!names.includes('.env'))
  assert.ok(!names.includes('.DS_Store'))
  assert.ok(!names.includes('backup.zip'))

  // sidecar 记录文件清单，便于发布审计
  const sidecar = JSON.parse(fs.readFileSync(result.sidecar, 'utf8'))
  assert.equal(sidecar.sha256, result.sha256)
  assert.deepEqual(sidecar.files, names)
  assert.equal(sidecar.fileCount, names.length)

  // 同内容重复打包 → 同 sha256
  const second = packPlugin({ pluginDir, distDir })
  assert.equal(second.sha256, result.sha256)
})

test('pack：manifest 校验、目录名一致、输出位置与缺失文件', (t) => {
  const dir = tempDir()
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

  const pluginDir = writePlugin(dir, { id: 'banks' })
  const distDir = path.join(dir, 'dist')

  // 目录名与 id 不一致
  const renamed = path.join(dir, 'wrong-name')
  fs.renameSync(pluginDir, renamed)
  assert.throws(() => packPlugin({ pluginDir: renamed, distDir }), /manifest.id/)

  // 缺 manifest
  const emptyDir = path.join(dir, 'empty')
  fs.mkdirSync(emptyDir)
  assert.throws(() => packPlugin({ pluginDir: emptyDir, distDir }), /manifest.json/)

  // 非法版本
  const bad = writePlugin(path.join(dir, 'bad-root'), { id: 'badver' })
  const manifest = JSON.parse(fs.readFileSync(path.join(bad, 'manifest.json'), 'utf8'))
  manifest.version = 'v1'
  fs.writeFileSync(path.join(bad, 'manifest.json'), JSON.stringify(manifest))
  assert.throws(() => packPlugin({ pluginDir: bad, distDir }), /SemVer/)

  // 输出不能放进源码目录
  const good = writePlugin(path.join(dir, 'good-root'), { id: 'good' })
  assert.throws(
    () => packPlugin({ pluginDir: good, distDir, outFile: path.join(good, 'x.zip') }),
    /不能放在插件源码目录内/,
  )
})
