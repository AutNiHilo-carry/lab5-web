/* 全局命名空间与通用工具 */
window.MES = window.MES || {}

;(function (MES) {
  const pad = (n) => String(n).padStart(2, '0')

  MES.pad = pad
  MES.fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  MES.fmtTime = (d) =>
    `${MES.fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  MES.now = () => MES.fmtTime(new Date())

  /** n 天前的日期字符串 */
  MES.dateAgo = (n) => {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return MES.fmtDate(d)
  }

  /** n 天前的完整时间字符串 */
  MES.timeAgo = (n, h = 9, m = 0) => {
    const d = new Date()
    d.setDate(d.getDate() - n)
    d.setHours(h, m, 0, 0)
    return MES.fmtTime(d)
  }

  /** 数字格式化：去掉多余小数位 */
  MES.num = (v) => {
    if (v === null || v === undefined || v === '') return '-'
    const n = Number(v)
    if (Number.isNaN(n)) return v
    return Number.isInteger(n) ? String(n) : String(+n.toFixed(2))
  }

  MES.money = (v) => (v === null || v === undefined ? '-' : Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

  MES.EP = window.ElementPlus
  MES.icons = window.ElementPlusIconsVue || {}

  MES.msg = (text, type = 'success') => MES.EP.ElMessage({ message: text, type, duration: 2200 })

  MES.err = (e) => {
    const text = e && e.message ? e.message : String(e)
    MES.EP.ElMessage({ message: text, type: 'error', duration: 3000 })
  }

  MES.confirm = (text, title = '请确认') =>
    MES.EP.ElMessageBox.confirm(text, title, {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })

  /** 取图标组件 */
  MES.iconOf = (name) => MES.icons[name] || MES.icons.Menu

  /** 状态 -> el-tag 类型 */
  MES.tagType = (status) => ({
    草稿: 'info',
    已下达: 'warning',
    生产中: 'primary',
    已完工: 'success',
    已关闭: 'info',
    已取消: 'info',
    待开始: 'info',
    等待前置: 'info',
    进行中: 'warning',
    已完成: 'success',
    正常: 'success',
    检修: 'warning',
    停用: 'info',
    启用: 'success',
    已确认: 'success'
  }[status] || 'info')

  /** 业务类型 -> 标签颜色 */
  MES.docTagType = (type) => ({
    采购入库: 'success',
    生产领料: 'warning',
    生产退料: 'info',
    成品入库: 'primary',
    销售出库: 'danger'
  }[type] || 'info')
})(window.MES)

