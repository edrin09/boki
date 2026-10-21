/**
 * P15 解析器验证：身份证 / 营业执照 / 火车票 / 收据 的类型判定与字段抽取。
 * 直接以文本行（PDF 文本层同构）喂解析器，不经过服务。
 *
 * 运行：node test/parsers-verify.mjs
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const { parseDocument } = require('../data/plugins/ocr/server/modules/ocr/parsers/parser.registry.js')

let passed = 0
let failed = 0
function check(name, ok, extra = '') {
  if (ok) {
    passed++
    console.log(`  PASS  ${name}${extra ? '  ' + extra : ''}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${extra ? '  ' + extra : ''}`)
  }
}

function ctx(lines) {
  return {
    lines: lines.map((text, i) => ({
      text,
      score: 1,
      points: [
        [0, i * 22],
        [400, i * 22],
        [400, i * 22 + 18],
        [0, i * 22 + 18],
      ],
    })),
    rawText: lines.join('\n'),
    width: 600,
    height: 800,
    source: 'pdf',
  }
}

function fieldsOf(result) {
  const map = {}
  for (const f of result.fields) map[f.key] = f.value
  return map
}

// 1. 身份证
console.log('\n=== 1. 身份证 ===')
{
  const r = parseDocument(ctx([
    '中华人民共和国居民身份证',
    '姓名 张三',
    '性别 男 民族 汉',
    '出生 1990年1月1日',
    '住址 上海市浦东新区xx路100号',
    '公民身份号码 310101199001011234',
    '签发机关 上海市公安局',
    '有效期限 2020.01.01-2040.01.01',
  ]))
  const f = fieldsOf(r)
  check('类型判定', r.type === 'id_card', `type=${r.type}`)
  check('姓名', String(f.name ?? '').includes('张三'), `name=${f.name}`)
  check('性别', String(f.gender ?? '').includes('男'), `gender=${f.gender}`)
  check('民族', String(f.nation ?? '').includes('汉'), `nation=${f.nation}`)
  check('身份证号', f.id_card === '310101199001011234', `id_card=${f.id_card}`)
  check('签发机关', String(f.issue_org ?? '').includes('公安局'), `issue_org=${f.issue_org}`)
}

// 2. 营业执照
console.log('\n=== 2. 营业执照 ===')
{
  const r = parseDocument(ctx([
    '营业执照',
    '统一社会信用代码 91310000MA1FL2KX3T',
    '名称 上海某某科技有限公司',
    '类型 有限责任公司',
    '法定代表人 李四',
    '注册资本 100万元人民币',
    '成立日期 2018年05月20日',
    '营业期限 2018年05月20日至长期',
    '住所 上海市浦东新区xx路100号',
    '经营范围 信息技术服务、软件开发',
  ]))
  const f = fieldsOf(r)
  check('类型判定', r.type === 'business_license', `type=${r.type}`)
  check('企业名称', String(f.company_name ?? '').includes('上海某某科技'), `company_name=${f.company_name}`)
  check('统一社会信用代码', f.credit_code === '91310000MA1FL2KX3T', `credit_code=${f.credit_code}`)
  check('法定代表人', String(f.legal_person ?? '').includes('李四'), `legal_person=${f.legal_person}`)
  check('注册资本', String(f.registered_capital ?? '').includes('100万'), `registered_capital=${f.registered_capital}`)
  check('经营范围', String(f.business_scope ?? '').includes('信息技术服务'), `business_scope=${String(f.business_scope ?? '').slice(0, 20)}`)
}

// 3. 火车票
console.log('\n=== 3. 火车票 ===')
{
  const r = parseDocument(ctx([
    '火车票',
    '姓名 王五',
    '车次 G1234',
    '出发 上海虹桥 到达 北京南',
    '席别 二等座',
    '日期 2024年05月01日',
    '票价 ¥553.00',
  ]))
  const f = fieldsOf(r)
  check('类型判定', r.type === 'train_ticket', `type=${r.type}`)
  check('旅客姓名', String(f.passenger ?? '').includes('王五'), `passenger=${f.passenger}`)
  check('车次', String(f.train_no ?? '').includes('G1234'), `train_no=${f.train_no}`)
  check('出发站', String(f.from_station ?? '').includes('上海虹桥'), `from_station=${f.from_station}`)
  check('到达站', String(f.to_station ?? '').includes('北京南'), `to_station=${f.to_station}`)
  check('票价', f.amount === 553, `amount=${f.amount}`)
}

// 4. 通用收据
console.log('\n=== 4. 通用收据 ===')
{
  const r = parseDocument(ctx([
    '收款收据',
    '收款单位 某某餐饮管理有限公司',
    '今收到 上海某某科技有限公司',
    '摘要 餐费',
    '金额（大写）人民币伍佰元整',
    '日期 2024年06月01日',
  ]))
  const f = fieldsOf(r)
  check('类型判定', r.type === 'receipt', `type=${r.type}`)
  check('收款单位', String(f.payee ?? '').includes('某某餐饮'), `payee=${f.payee}`)
  check('金额（大写转数字）', f.amount === 500, `amount=${f.amount}`)
  check('日期', f.date === '2024-06-01', `date=${f.date}`)
}

// 5. 未知内容兜底
console.log('\n=== 5. 未知内容 ===')
{
  const r = parseDocument(ctx(['随便一段文字', '没有票据特征']))
  check('类型判定为 unknown', r.type === 'unknown', `type=${r.type}`)
}

// 6. 发票对收据的排除（发票不应被收据抢走）
console.log('\n=== 6. 发票不被误判 ===')
{
  const r = parseDocument(ctx([
    '增值税电子普通发票',
    '发票代码 1100181311',
    '发票号码 31211201',
    '价税合计 ¥1060.00',
  ]))
  check('类型判定为发票', r.type === 'invoice', `type=${r.type}`)
}

console.log(`\n结果: ${passed} 通过 / ${failed} 失败`)
process.exit(failed ? 1 : 0)
