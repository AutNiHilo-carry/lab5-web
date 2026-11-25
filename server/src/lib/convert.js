/* 字段名转换：库里是 snake_case，接口用 camelCase
 */

export const toCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
export const toSnake = (s) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())

/** 一行数据库记录 → 接口对象 */
export function rowToApi(row) {
  if (!row) return null
  const out = {}
  Object.keys(row).forEach((k) => { out[toCamel(k)] = row[k] })
  return out
}

/** 接口入参 → 数据库列（只保留白名单内的列） */
export function apiToRow(payload, columns) {
  const out = {}
  Object.keys(payload || {}).forEach((k) => {
    if (typeof payload[k] === 'undefined') return
    const col = toSnake(k)
    if (columns.indexOf(col) >= 0) out[col] = payload[k]
  })
  return out
}
