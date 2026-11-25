/* 本地静态服务器：node serve.mjs
 * 起来之后会自动打开浏览器；如果发现后端在 3000 上，就带上 ?api= 直接连后端
 * 不想自动开就设 NO_OPEN=1
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT || 5173)
const apiPort = Number(process.env.API_PORT || 3000)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0])
  if (urlPath === '/') urlPath = '/index.html'
  const filePath = path.join(root, urlPath)

  if (!filePath.startsWith(root)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('404 Not Found: ' + urlPath)
      return
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    })
    res.end(data)
  })
})

/** 后端在不在？在的话页面就带上 ?api=，直接走真库 */
async function backendAlive() {
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 1200)
    const r = await fetch(`http://127.0.0.1:${apiPort}/api/health`, { signal: ctl.signal })
    clearTimeout(t)
    if (!r.ok) return null
    const j = await r.json()
    return j && j.data ? j.data.repo : null
  } catch (e) {
    return null
  }
}

server.listen(port, '127.0.0.1', async () => {
  const repo = await backendAlive()
  const base = `http://localhost:${port}`
  const url = repo ? `${base}/?api=http://127.0.0.1:${apiPort}` : base

  console.log(`前端已启动：${url}`)
  if (repo) {
    console.log(`后端已连上（数据源：${repo === 'mysql' ? 'MySQL' : '内存'}）`)
  } else {
    console.log('没检测到后端，页面会用浏览器本地数据；要连后端请先启动 启动后端.bat')
  }
  console.log('按 Ctrl+C 停止')

  if (process.env.NO_OPEN !== '1' && process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref()
  }
})
