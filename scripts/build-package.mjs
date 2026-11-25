/* 打包：生成 lab5-web-发给别人.zip，带 node_modules，对方不用联网装依赖
 * 会剔掉 server/.env 这类本机配置
 * copyDir 是增量复制，所以暂存目录每次起新名字，免得旧文件混进包里
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')                 // lab5-web
/* 暂存目录每次起新名字：rmSync 有时删不干净，旧文件会混进包 */
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const outBase = path.join(root, '..', `_package-${stamp}`)
const stage = path.join(outBase, 'lab5-web')
const zipPath = path.join(root, '..', 'lab5-web-发给别人.zip')

/** 顶层要带上的东西 */
const INCLUDE = [
  'index.html', 'serve.mjs', 'README.md', '.gitignore',
  '使用说明.md',
  /* 前端 */
  '启动系统.bat', '启动全部.bat',
  /* 数据库：接收方默认走真实 MySQL */
  '安装数据库.bat', '初始化数据库.bat', '启动数据库.bat', '停止数据库.bat',
  /* 后端 */
  '启动后端.bat',
  'app', 'db', 'scripts', 'server', 'vendor'
]

const EXCLUDE_RE = /\.log$/i

function shouldSkip(rel) {
  const norm = rel.split(path.sep).join('/')
  const base = norm.slice(norm.lastIndexOf('/') + 1)
  /* 按文件名排除（任意层级）：server/.env 是本人机器配置，不能发给别人 */
  if (base === '.env' || base === '.DS_Store' || base === 'Thumbs.db') return true
  if (norm === '.npm-cache' || norm.startsWith('.npm-cache/')) return true
  if (norm.includes('node_modules/.cache')) return true
  if (EXCLUDE_RE.test(norm)) return true
  return false
}

function copyDir(src, dst, relBase = '') {
  fs.mkdirSync(dst, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const rel = path.join(relBase, e.name)
    if (shouldSkip(rel.split('/').join(path.sep))) continue
    const s = path.join(src, e.name)
    const d = path.join(dst, e.name)
    if (e.isDirectory()) copyDir(s, d, rel)
    else fs.copyFileSync(s, d)
  }
}

function sizeOf(dir) {
  let total = 0
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else total += fs.statSync(p).size
    }
  }
  walk(dir)
  return total
}

/** 某些环境 rmSync 会"报告成功但没删干净"，必须复核 */
function cleanDir(dir) {
  if (!fs.existsSync(dir)) return true
  for (let i = 0; i < 3; i++) {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }) } catch (e) { /* 再试 */ }
    if (!fs.existsSync(dir)) return true
  }
  // rmSync 在某些环境下会"报成功但没删干净"，退回手动逐个删
  try {
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name)
        if (e.isDirectory()) walk(p)
        else fs.unlinkSync(p)
      }
      fs.rmdirSync(d)
    }
    walk(dir)
  } catch (e) { /* 最后再判断一次 */ }
  return !fs.existsSync(dir)
}

// 清空暂存（目录是唯一的，理论上不需要；保险起见）
if (!cleanDir(outBase)) {
  console.error(`[错误] 无法清空暂存目录：${outBase}（请手动删除后重试）`)
  process.exit(1)
}
fs.mkdirSync(stage, { recursive: true })

// 复制白名单
const missing = []
for (const name of INCLUDE) {
  const s = path.join(root, name)
  if (!fs.existsSync(s)) { missing.push(name); continue }
  const d = path.join(stage, name)
  const st = fs.statSync(s)
  if (st.isDirectory()) copyDir(s, d, name)
  else { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d) }
}

/* bat 是 GBK 编码（cmd 在中文 Windows 上按 cp936 读，存 UTF-8 会变乱码），
   所以这里按字节处理，只补 CRLF，不能当文本重新编码。
   GBK 的尾字节范围是 0x40-0xFE，不会出现 0x0A，按字节换行是安全的。 */
for (const f of fs.readdirSync(stage)) {
  if (!f.endsWith('.bat')) continue
  const fp = path.join(stage, f)
  const buf = fs.readFileSync(fp)
  const out = []
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0a && (i === 0 || buf[i - 1] !== 0x0d)) out.push(0x0d)
    out.push(buf[i])
  }
  const next = Buffer.from(out)
  if (!next.equals(buf)) fs.writeFileSync(fp, next)
}

// 统计
const bytes = sizeOf(stage)
console.log(`暂存目录：${stage}`)
console.log(`未找到（已跳过）：${missing.length ? missing.join(',') : '无'}`)
console.log(`文件总大小：${(bytes / 1048576).toFixed(1)} MB`)

// 断言：不能带出敏感文件
const leaks = []
const scan = (dir, rel = '') => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) scan(path.join(dir, e.name), r)
    else if (e.name === '.env') leaks.push(r)
  }
}
scan(stage)
if (leaks.length) {
  console.error(`[错误] 暂存目录里出现了不该发布的内容：${leaks.join(', ')}`)
  process.exit(1)
}

// 打 zip（系统 tar，正确处理中文名）
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath)
execFileSync('tar', ['-a', '-c', '-f', zipPath, '-C', outBase, 'lab5-web'], { stdio: 'inherit' })
const zipSize = fs.statSync(zipPath).size
console.log(`压缩包：${zipPath}`)
console.log(`压缩包大小：${(zipSize / 1048576).toFixed(1)} MB`)

// 清理暂存
cleanDir(outBase)
console.log('已清理暂存目录')
