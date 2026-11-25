/* 检查 index.html 引用的脚本和样式能不能取到，防止改名后忘了改 index.html
 * 先起 node serve.mjs，再 node scripts/asset-check.mjs
 */

const base = (process.argv[2] || 'http://127.0.0.1:5173').replace(/\/+$/, '')

const res = await fetch(base + '/index.html')
if (!res.ok) {
  console.error('无法打开 index.html:', res.status)
  process.exit(1)
}
const html = await res.text()

const refs = []
  .concat([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]))
  .concat([...html.matchAll(/<link[^>]+href="(app\/[^"]+)"/g)].map((m) => m[1]))

let bad = 0
for (const ref of refs) {
  const r = await fetch(base + '/' + ref)
  const okStatus = r.ok
  const body = okStatus ? await r.text() : ''
  const hasBom = body.charCodeAt(0) === 0xfeff
  const hasBadge = /\uFFFD/.test(body)
  const pass = okStatus && !hasBom && !hasBadge
  if (!pass) bad++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${ref}  (${r.status}${hasBom ? ', 含 BOM' : ''}${hasBadge ? ', 有乱码' : ''})`)
}

const views = refs.filter((s) => s.indexOf('views') >= 0).length
console.log(`\n共 ${refs.length} 个引用资源（含 ${views} 个页面脚本），失败 ${bad} 个`)
if (bad) process.exitCode = 1
