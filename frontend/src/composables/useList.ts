import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

/** 分页列表通用逻辑 */
export interface PagedListOptions<T> {
  /** 列表加载函数 */
  fetcher: (params: Record<string, any>) => Promise<{ list: T[]; total: number; page: number; pageSize: number }>
  /** 初始查询参数 */
  defaultParams?: Record<string, any>
  /** 是否立即加载 */
  immediate?: boolean
}

export function usePagedList<T = any>(options: PagedListOptions<T>) {
  const list = ref<T[]>([])
  const total = ref(0)
  const loading = ref(false)

  const query = ref<Record<string, any>>({
    page: 1,
    pageSize: 20,
    ...(options.defaultParams ?? {}),
  })

  async function load() {
    loading.value = true
    try {
      const res = await options.fetcher({ ...query.value })
      list.value = res.list ?? []
      total.value = res.total ?? 0
      return res
    } catch (error) {
      console.warn('列表加载失败', error)
      list.value = []
      total.value = 0
      return null
    } finally {
      loading.value = false
    }
  }

  function search() {
    query.value.page = 1
    return load()
  }

  function reset() {
    // 重置筛选条件并回到第 1 页，但保留用户选择的每页条数
    query.value = { page: 1, pageSize: query.value.pageSize, ...(options.defaultParams ?? {}) }
    return load()
  }

  function handlePage(page: number) {
    query.value.page = page
    return load()
  }

  function handleSize(pageSize: number) {
    query.value.pageSize = pageSize
    query.value.page = 1
    return load()
  }

  if (options.immediate !== false) {
    load()
  }

  return { list, total, loading, query, load, search, reset, handlePage, handleSize }
}

/** 确认删除 */
export async function confirmDelete(name = '该记录'): Promise<boolean> {
  try {
    await ElMessageBox.confirm(`确定要删除${name}吗？此操作不可撤销。`, '提示', {
      type: 'warning',
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
    })
    return true
  } catch {
    return false
  }
}

/** 操作成功提示 */
export function ok(message = '操作成功'): void {
  ElMessage.success(message)
}

/** 表单重置辅助 */
export function emptyForm<T extends Record<string, any>>(initial: T): T {
  return JSON.parse(JSON.stringify(initial)) as T
}