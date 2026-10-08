/**
 * 文件名字符集回纠工具
 *
 * multer/busboy 在未显式声明 multipart 参数编码时默认以 latin1 解码 filename，
 * 导致中文文件名（UTF-8 字节按 latin1 解析）入库为乱码（如 `çµååç¥¨.pdf`）。
 *
 * 本工具按「连续 latin1 高位字符段」逐段回纠：把该段按 latin1 还原为字节流再按 UTF-8
 * 解码，仅当还原结果无替换符 U+FFFD 且明显是中日韩文字时才采用，避免破坏本来正确的
 * UTF-8 字符串（如 `café.pdf` 中的 é、已正确存库的中文）。
 */

const LATIN1_HIGH = /[\u0080-\u00ff]/
const REPLACEMENT_CHAR = /\uFFFD/
/** 中日韩统一表意文字 + 扩展A + 兼容表意 + 平假名/片假名 + 谚文 */
const CJK =
  /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af]/

/** 单段 latin1 高位字符回纠；无法可靠还原时返回 null */
function recoverSegment(segment: string): string | null {
  const recovered = Buffer.from(segment, 'latin1').toString('utf8')
  if (REPLACEMENT_CHAR.test(recovered)) return null
  if (!CJK.test(recovered)) return null
  return recovered
}

/**
 * 回纠 UTF-8-as-latin1 乱码的文件名/摘要。
 * - 纯 ASCII：原样返回（无开销）。
 * - 逐段处理，正确的中文、ASCII 与少量交通字符（如 é）不受影响。
 * - 混合串（如 `9æå·¥èµ¡è¡¨ 应发工资`）也能局部还原。
 */
export function recoverFilename(name: string | null | undefined): string | null | undefined {
  if (!name || !LATIN1_HIGH.test(name)) return name

  let out = ''
  let run = ''
  const flush = () => {
    if (run) {
      const fixed = recoverSegment(run)
      out += fixed !== null ? fixed : run
      run = ''
    }
  }

  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i)
    if (code >= 0x80 && code <= 0xff) {
      run += name[i]
    } else {
      flush()
      out += name[i]
    }
  }
  flush()

  return out === name ? name : out
}