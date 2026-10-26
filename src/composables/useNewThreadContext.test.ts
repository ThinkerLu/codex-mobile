import { describe, expect, it } from 'vitest'
import { useNewThreadContext } from './useNewThreadContext'

describe('new thread project context', () => {
  it('clears a prior project when selecting the same shared folder without a project', () => {
    const context = useNewThreadContext()
    context.selectFolder('/shared', 'project-a')
    context.selectFolder('/shared')
    expect(context.cwd.value).toBe('/shared')
    expect(context.projectId.value).toBeUndefined()
  })

  it('replaces project identity for project-specific new-chat actions sharing a folder', () => {
    const context = useNewThreadContext()
    context.selectFolder('/shared', 'project-a')
    context.selectFolder('/shared', 'project-b')
    expect(context.projectId.value).toBe('project-b')
  })

  it('keeps the parent project when deriving a worktree or returning to its root', () => {
    const context = useNewThreadContext()
    context.selectFolder('/repo', 'project-a')
    context.setWorktreeCwd('/worktrees/branch')
    expect(context.projectId.value).toBe('project-a')
    expect(context.cwd.value).toBe('/worktrees/branch')
    context.setWorktreeCwd('/repo')
    expect(context.projectId.value).toBe('project-a')
  })

  it('clears project identity for a projectless chat or a newly opened directory', () => {
    const context = useNewThreadContext()
    context.selectFolder('/repo', 'project-a')
    context.selectFolder('')
    expect(context.projectId.value).toBeUndefined()
    context.selectFolder('/repo', 'project-a')
    context.selectFolder(' /other ')
    expect(context.projectId.value).toBeUndefined()
    expect(context.cwd.value).toBe('/other')
  })
})
