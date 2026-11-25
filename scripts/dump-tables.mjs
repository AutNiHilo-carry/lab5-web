import fs from 'node:fs'
import vm from 'node:vm'

const ctx = vm.createContext({ console, Date, Math, String, Number, Object, Array, JSON,
  setTimeout, clearTimeout,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} } })
vm.runInContext(
  'var window={MES:{}}; var Vue={ reactive: function(o){return o} };',
  ctx, { filename: 'stub.js' })

for (const f of ['app/00-core.js', 'app/10-db.js']) {
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f })
}

const MES = ctx.window.MES
MES.db.reset()
const s = MES.db.state
const out = []
for (const [t, rows] of Object.entries(s)) {
  if (t === 'seq' || t === '_meta') continue
  const keys = new Set()
  rows.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)))
  out.push(`${t}\t${rows.length}\t${[...keys].join(',')}`)
}
console.log(out.join('\n'))
console.log('表数量:', out.length)
