/* 登录：明文口令 + 内存里的 token，作业够用了，真上线得换 bcrypt + JWT
 */

import { unauthorized, badRequest } from '../lib/errors.js'
import { rowToApi } from '../lib/convert.js'

const tokens = new Map()

const randomToken = () =>
  [...Array(32)].map(() => Math.floor(Math.random() * 36).toString(36)).join('')

/** 对外返回的用户信息（去掉口令，补角色/部门/车间名称） */
async function userPayload(repo, user) {
  const safe = rowToApi(user)
  delete safe.password
  const role = await repo.get('role', user.role_id)
  const dept = user.department_id ? await repo.get('department', user.department_id) : null
  const ws = user.workshop_id ? await repo.get('workshop', user.workshop_id) : null
  let perms = []
  if (role) {
    if (role.code === 'R01') perms = ['*']
    else if (Array.isArray(role.perms)) perms = role.perms.slice()
    else {
      try { perms = JSON.parse(role.perms || '[]') } catch (e) { perms = [] }
      if (!Array.isArray(perms)) perms = []
    }
  }
  return {
    ...safe,
    perms,
    roleCode: role ? role.code : null,
    roleName: role ? role.name : null,
    departmentName: dept ? dept.name : null,
    workshopName: ws ? ws.name : null
  }
}

export async function login(repo, { account, password }) {
  if (!account || !password) throw badRequest('请输入账号和密码')
  const users = await repo.find('sys_user', { account: String(account).trim() })
  const user = users[0]
  if (!user) throw unauthorized('账号或密码错误')
  if (user.status !== '启用') throw forbiddenUser()
  if (String(user.password) !== String(password)) throw unauthorized('账号或密码错误')

  const token = randomToken()
  tokens.set(token, { userId: user.id, at: Date.now() })
  return { token, user: await userPayload(repo, user) }
}

/** 演示用“切换操作人”：给已登录者换发该用户的凭证，让写操作真正记在他名下 */
export async function switchUser(repo, userId) {
  const user = await repo.get('sys_user', Number(userId))
  if (!user) throw badRequest('用户不存在')
  if (user.status !== '启用') throw forbiddenUser()
  const token = randomToken()
  tokens.set(token, { userId: user.id, at: Date.now() })
  return { token, user: await userPayload(repo, user) }
}

function forbiddenUser() {
  const e = unauthorized('该账号已停用')
  return e
}

export function authUser(req) {
  const header = req.headers.authorization || ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  return tokens.get(token) || null
}

/** 中间件：作业环境里读接口放开，写接口要登录 */
export function requireAuth(req, res, next) {
  const u = authUser(req)
  if (!u) {
    return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: '请先登录' })
  }
  req.auth = u
  next()
}

export function logout(token) {
  tokens.delete(token)
}

export function activeTokenCount() {
  return tokens.size
}
