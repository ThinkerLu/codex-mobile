import { describe, expect, it } from 'vitest'
import { groupDesktopProjects, UNASSIGNED_PROJECT } from './projectGroups'
import type { UiThread } from '../types/codex'

const projects = [
  { id: 'one', name: 'Same name', rootPaths: ['/repo', '/shared'] },
  { id: 'two', name: 'Same name', rootPaths: ['/repo/nested', '/shared'] },
  { id: 'empty', name: 'Empty', rootPaths: ['/empty'] },
]
const thread = (id: string, cwd: string, projectId?: string): UiThread => ({
  id, cwd, projectId, projectName: 'old', title: id, hasWorktree: false,
  createdAtIso: '2026-10-26', updatedAtIso: '2026-10-26', preview: '', unread: false, inProgress: false,
})
describe('modern project grouping', () => {
  it('keeps explicitly assigned remote projects separate from local matching roots', () => {
    const result = groupDesktopProjects([{ projectName: 'old', threads: [thread('remote-thread', '/repo')] }], projects, { 'remote-thread': 'remote-project' }, [{ id: 'remote-project' }])
    expect(result.find((group) => group.projectName === 'one')?.threads).toEqual([])
    expect(result.find((group) => group.projectName === 'remote-project')?.threads[0].id).toBe('remote-thread')
  })
  it('preserves project identity and empty projects; explicit membership beats directory', () => {
    const result = groupDesktopProjects([{ projectName: 'old', threads: [thread('a', '/repo/nested', 'one'), thread('b', '/repo', undefined)] }], projects, { b: 'two' })
    expect(result.map((group) => [group.projectName, group.threads.map((row) => row.id)])).toEqual([
      ['one', ['a']], ['two', ['b']], ['empty', []],
    ])
  })
  it('uses unique longest roots, but keeps explicit projectless, unknown and ambiguous threads unassigned', () => {
    const result = groupDesktopProjects([{ projectName: 'old', threads: [
      thread('nested', '/repo/nested/src'), thread('ambiguous', '/shared'),
      thread('projectless', '/repo'), thread('unknown', '/elsewhere'), thread('deleted', '/repo', 'deleted-id'),
    ] }], projects, { projectless: '' })
    expect(result.find((group) => group.projectName === 'two')?.threads.map((row) => row.id)).toEqual(['nested'])
    expect(result.find((group) => group.projectName === UNASSIGNED_PROJECT)?.threads.map((row) => row.id)).toEqual(['ambiguous', 'projectless', 'unknown', 'deleted'])
  })
  it('does not infer similarly prefixed directories and deduplicates thread entries', () => {
    const row = thread('a', '/repository')
    const result = groupDesktopProjects([{ projectName: 'old', threads: [row, row] }], projects)
    expect(result.at(-1)?.threads).toHaveLength(1)
    expect(result.at(-1)?.projectName).toBe(UNASSIGNED_PROJECT)
  })
})
