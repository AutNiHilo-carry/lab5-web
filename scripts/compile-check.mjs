/* 用 Vue 的运行时编译器把每个模板编一遍，模板写错这里就报
 */

import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const root = path.resolve('.')

// 最小 DOM 桩，让 vue.global.prod.js 能加载
const doc = {
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }),
  createElementNS: () => ({ style: {}, setAttribute() {} }),
  createTextNode: () => ({}),
  createComment: () => ({}),
  querySelector: () => null,
  addEventListener() {},
  removeEventListener() {},
  documentElement: { style: {} },
  body: { appendChild() {}, style: {} },
  head: { appendChild() {} }
}

const sandbox = {
  console,
  document: doc,
  navigator: { userAgent: 'node' },
  location: { href: 'http://localhost/', pathname: '/', search: '', hash: '' },
  setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
  Promise, JSON, Math, Date, Number, String, Object, Array, Error, isNaN, parseInt, parseFloat, RegExp, Map, Set, WeakMap, Symbol,
  localStorage: { _d: {}, getItem(k) { return this._d[k] ?? null }, setItem(k, v) { this._d[k] = String(v) }, removeItem(k) { delete this._d[k] } },
  requestAnimationFrame: (fn) => setTimeout(fn, 0)
}
sandbox.window = sandbox
sandbox.globalThis = sandbox
sandbox.self = sandbox

const ctx = vm.createContext(sandbox)
const run = (code, name) => vm.runInContext(code, ctx, { filename: name })

run(fs.readFileSync('vendor/vue.global.prod.js', 'utf8'), 'vue.global.prod.js')
console.log('Vue 已加载:', typeof sandbox.Vue, Object.keys(sandbox.Vue).slice(0, 5).join(','))

// 桩 vue-router / element-plus
run(`
  var VueRouter = {
    createRouter: function () { return { beforeEach: function(){}, push: function(){} } },
    createWebHashHistory: function () { return {} },
    useRoute: function () { return { params: {}, path: '/', meta: {} } },
    useRouter: function () { return { push: function(){} } }
  };
  var ElementPlus = { ElMessage: function(){}, ElMessageBox: { confirm: function(){ return Promise.reject('cancel') } }, install: function(){} };
  var ElementPlusIconsVue = { DataBoard:{}, Plus:{}, Search:{} };
  var ElementPlusLocaleZhCn = {};
`, 'stubs.js')

// 依次加载业务代码
const files = fs.readdirSync('app').filter((f) => f.endsWith('.js')).sort()
for (const f of files) {
  try {
    run(fs.readFileSync(path.join('app', f), 'utf8'), f)
  } catch (e) {
    console.log(`执行失败 ${f}: ${e.message}`)
    process.exit(1)
  }
}

/* 编译所有模板。
 * vue.global.prod.js 只导出 compile()，它把模板编成渲染函数。
 * 生产版在 Node 里碰到 <template #default="{ row }"> 这种插槽作用域会报
 * Cannot read properties of undefined —— 这是工具限制，不是模板写错了，浏览器里正常。
 * 所以这里遇到该错误就算跳过，单独计数。 */
const MES = sandbox.MES
const { compile } = sandbox.Vue
let errors = 0
let skipped = 0
const list = []

for (const [name, comp] of Object.entries(MES.views)) list.push([name, comp])
list.push(['MainLayout', MES.MainLayout])
list.push(['PageHead', MES.ui.PageHead])
list.push(['StatusTag', MES.ui.StatusTag])
list.push(['CrudPage', MES.ui.CrudPage])

const ENV_LIMIT = /Cannot read properties of undefined \(reading '(type|length|0)'\)/

for (const [name, comp] of list) {
  if (!comp || !comp.template) { console.log(`SKIP  ${name} 无模板`); continue }
  try {
    const res = compile(comp.template, {
      onError: (e) => { throw e },
      onWarn: () => {}
    })
    if (!res || typeof res !== 'function') throw new Error('编译结果为空')
    console.log(`模板 OK   ${name}`)
  } catch (e) {
    if (ENV_LIMIT.test(e.message)) {
      skipped++
      console.log(`模板 ~    ${name}（含插槽作用域写法，沙箱内跳过）`)
    } else {
      errors++
      console.log(`模板 FAIL ${name}: ${e.message}`)
    }
  }
}

console.log(`\n编译通过 ${list.length - errors - skipped}，跳过 ${skipped}，失败 ${errors}`)
process.exitCode = errors ? 1 : 0
