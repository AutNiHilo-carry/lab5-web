/* 带状态码的错误类型，路由层直接转成响应
 */

export class AppError extends Error {
  constructor(message, status = 400, code = 'BAD_REQUEST') {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
  }
}

export const badRequest = (msg) => new AppError(msg, 400, 'BAD_REQUEST')
export const unauthorized = (msg) => new AppError(msg, 401, 'UNAUTHORIZED')
export const notFound = (msg) => new AppError(msg, 404, 'NOT_FOUND')
export const conflict = (msg) => new AppError(msg, 409, 'CONFLICT')
export const serverError = (msg) => new AppError(msg, 500, 'SERVER_ERROR')

/** 把 async 路由处理函数的异常交给 Express 错误中间件 */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
