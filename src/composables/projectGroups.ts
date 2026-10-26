import type { UiProjectGroup, UiThread } from '../types/codex'
import { normalizePathForComparison } from '../pathUtils'

export type DesktopProject = { id: string; name: string; rootPaths: string[] }
export const UNASSIGNED_PROJECT = '__codex_unassigned__'

export function groupDesktopProjects(
  groups: UiProjectGroup[], projects: DesktopProject[], assignments: Record<string, string> = {}, remoteProjects: Array<{ id: string }> = [],
): UiProjectGroup[] {
  const rows = new Map<string, UiThread[]>([...projects, ...remoteProjects].map((project) => [project.id, []]))
  const seen = new Set<string>()
  for (const thread of groups.flatMap((group) => group.threads)) {
    if (seen.has(thread.id)) continue
    seen.add(thread.id)
    let projectId = thread.projectId ?? assignments[thread.id]
    // Infer only when no explicit assignment exists, and the longest root is unique.
    if (projectId === undefined) {
      const cwd = normalizePathForComparison(thread.cwd)
      const matches = projects.map((project) => ({
        id: project.id,
        length: Math.max(0, ...project.rootPaths.map((path) => {
          const root = normalizePathForComparison(path).replace(/\/$/, '')
          return root && (cwd === root || cwd.startsWith(`${root}/`)) ? root.length : 0
        })),
      })).filter((match) => match.length > 0).sort((a, b) => b.length - a.length)
      if (matches.length && matches[0].length !== matches[1]?.length) projectId = matches[0].id
    }
    const key = projectId && rows.has(projectId) ? projectId : UNASSIGNED_PROJECT
    if (!rows.has(key)) rows.set(key, [])
    rows.get(key)!.push({ ...thread, projectName: key, projectId: key === UNASSIGNED_PROJECT ? '' : key })
  }
  return [...rows].map(([projectName, threads]) => ({
    projectName,
    threads: threads.sort((a, b) => Date.parse(b.updatedAtIso) - Date.parse(a.updatedAtIso)),
  }))
}
