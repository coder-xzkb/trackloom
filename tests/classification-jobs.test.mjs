import test from 'node:test'
import assert from 'node:assert/strict'
import { ClassificationJobs } from '../src/utils/classification-jobs.ts'

const pending = (signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))

test('返回上一步只停止本页面匹配的任务，不影响其他页面', async () => {
  const jobs = new ClassificationJobs()
  const first = jobs.run('tab1:frame0', 'a', pending)
  const second = jobs.run('tab2:frame0', 'b', pending)
  const firstStopped = assert.rejects(first, { name: 'AbortError' })
  const secondStopped = assert.rejects(second, { name: 'AbortError' })
  assert.equal(jobs.cancel('tab1:frame0', 'b'), false)
  assert.equal(jobs.cancel('tab1:frame0', 'a'), true)
  await firstStopped
  assert.equal(jobs.cancel('tab2:frame0', 'b'), true)
  await secondStopped
})

test('旧任务的结束回调不能清除新任务，快速返回再开始仍可停止', async () => {
  const jobs = new ClassificationJobs()
  const first = jobs.run('page', 'old', pending)
  const firstStopped = assert.rejects(first, { name: 'AbortError' })
  const second = jobs.run('page', 'new', pending)
  const secondStopped = assert.rejects(second, { name: 'AbortError' })
  await firstStopped
  assert.equal(jobs.cancel('page', 'old'), false)
  assert.equal(jobs.cancel('page', 'new'), true)
  await secondStopped
})

test('任务完成后返回仍安全，不会取消后续页面的任务', async () => {
  const jobs = new ClassificationJobs()
  assert.equal(await jobs.run('page', 'done', async () => 42), 42)
  assert.equal(jobs.cancel('page', 'done'), false)
})
