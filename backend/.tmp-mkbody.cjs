/** 构造 multipart 上传体，验证 paths 与 files 按索引配对、folderPath 落库 */
const fs = require('node:fs')

// 1x1 透明 PNG，够走完 multer → 落库链路即可（OCR 失败不影响目录判定）
const png = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001',
  'hex',
)

const boundary = '----testBoundary' + Date.now()
const parts = []

function fileField(filename) {
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`,
    ),
  )
  parts.push(png)
  parts.push(Buffer.from('\r\n'))
}

function textField(name, value) {
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    ),
  )
}

fileField('发票1.png')
fileField('发票2.png')
textField('paths', '采购单/张三/发票1.png')
textField('paths', '采购单/张三/发票2.png')
parts.push(Buffer.from(`--${boundary}--\r\n`))

fs.writeFileSync('.tmp-body.bin', Buffer.concat(parts))
fs.writeFileSync('.tmp-ct.txt', 'multipart/form-data; boundary=' + boundary)
console.log('body bytes =', Buffer.concat(parts).length)
