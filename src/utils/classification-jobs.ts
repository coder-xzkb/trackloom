// 每个页面只保留一个分类任务，返回上一步时停止请求；其他页面不能停止本页任务。
export class ClassificationJobs {
  private jobs = new Map<string, { requestId: string; controller: AbortController }>()

  async run<T>(owner: string, requestId: string, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.jobs.get(owner)?.controller.abort()
    const job = { requestId, controller: new AbortController() }
    this.jobs.set(owner, job)
    try {
      return await work(job.controller.signal)
    } finally {
      if (this.jobs.get(owner) === job) this.jobs.delete(owner)
    }
  }

  cancel(owner: string, requestId: string): boolean {
    const job = this.jobs.get(owner)
    if (!job || job.requestId !== requestId) return false
    job.controller.abort()
    return true
  }
}
