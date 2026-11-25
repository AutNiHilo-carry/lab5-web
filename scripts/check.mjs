/* 静态检查：先查语法，再把 app 下的脚本丢进桩环境里跑一遍
 */

import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const root = path.resolve('.')
const appDir = path.join(root, 'app')
const files = fs.readdirSync(appDir).filter((f) => f.endsWith('.js')).sort()

let failed = 0

// 1. 语法检查
for (const f of files.map((x) => 'app/' + x)) {
  const code = fs.readFileSync(path.join(root, f), 'utf8')
  try {
    new vm.Script(code, { filename: f })
    console.log(`语法 OK   ${f}`)
  } catch (e) {
    failed++
    console.log(`语法 FAIL ${f}: ${e.message}`)
  }
}

// 2. 模板字符串检查：模板里是否残留 backtick / 明显未闭合
for (const f of files) {
  const code = fs.readFileSync(path.join(appDir, f), 'utf8')
  const templates = code.match(/template: `[\s\S]*?`/g) || []
  templates.forEach((t, i) => {
    const open = (t.match(/<([a-zA-Z][\w-]*)[\s>]/g) || []).length
    const close = (t.match(/<\/[a-zA-Z][\w-]*>/g) || []).length
    const selfClose = (t.match(/\/>/g) || []).length
    if (close > open) {
      failed++
      console.log(`模板 ${f} #${i} 可能有多余闭合标签 open=${open} close=${close} self=${selfClose}`)
    }
  })
}

console.log(failed ? `\n发现 ${failed} 个问题` : '\n检查完成，未发现语法问题')
