export type CatalogProject = { id: string; name: string; rootPaths: string[] }
type Rpc = (method: string, params: unknown) => Promise<unknown>

export async function ensureCatalogProjectRoot(rpc: Rpc, path: string, name: string, idempotencyKey: string): Promise<void> {
  const projects = await readProjectCatalog(rpc)
  if (projects === undefined || projects.some((project) => project.rootPaths.includes(path))) return
  await rpc('project/create', { idempotencyKey, name, roots: [{ path }] })
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function unsupported(error: unknown): boolean {
  const value = record(error)
  if (value?.code === -32601) return true
  const message = error instanceof Error ? error.message : String(value?.message ?? '')
  return /^method not found\b/i.test(message)
    || /unknown variant [`'"]project\/list[`'"]/i.test(message)
    || /(?:unknown|unsupported) method[:\s`'"]+project\/list\b/i.test(message)
}

export async function readProjectCatalog(rpc: Rpc): Promise<CatalogProject[] | undefined> {
  const projects: CatalogProject[] = []
  const cursors = new Set<string>()
  let cursor: string | null = null
  do {
    let response: unknown
    try {
      response = await rpc('project/list', { cursor, limit: 100 })
    } catch (error) {
      if (cursor === null && unsupported(error)) return undefined
      throw error
    }
    const page = record(response)
    if (!page || !Array.isArray(page.data)) throw new Error('Invalid project/list response')
    for (const value of page.data) {
      const project = record(value)
      if (!project || typeof project.id !== 'string' || typeof project.name !== 'string'
        || !Array.isArray(project.roots)) throw new Error('Invalid project/list project')
      const rootPaths = project.roots.map((root: unknown) => {
        const item = record(root)
        if (typeof item?.path !== 'string') throw new Error('Invalid project/list root')
        return item.path
      })
      projects.push({ id: project.id, name: project.name, rootPaths })
    }
    const next = page.nextCursor
    if (next !== null && next !== undefined && typeof next !== 'string') {
      throw new Error('Invalid project/list cursor')
    }
    cursor = typeof next === 'string' ? next : null
    if (cursor !== null) {
      if (cursors.has(cursor)) throw new Error('Repeated project/list cursor')
      cursors.add(cursor)
    }
  } while (cursor !== null)
  return projects
}

export function mapThreadProjectIds(
  state: Record<string, unknown>, projects: CatalogProject[], codexHome: string,
): Record<string, string> {
  const ids = new Set(projects.map(project => project.id))
  const hosts = record(state['app-server-project-id-by-legacy-project-id-by-host'])
  const migration = record(hosts?.[`local:${codexHome}`]) ?? {}
  const assignments = record(state['thread-project-assignments']) ?? {}
  const remoteIds = new Set(Array.isArray(state['remote-projects']) ? state['remote-projects'].map((item) => record(item)?.id).filter((id): id is string => typeof id === 'string') : [])
  const result: Record<string, string> = {}
  for (const [threadId, value] of Object.entries(assignments)) {
    const assignment = record(value)
    if (!assignment || typeof assignment.projectId !== 'string') continue
    if (assignment.projectKind !== 'local') {
      result[threadId] = remoteIds.has(assignment.projectId) ? assignment.projectId : ''
      continue
    }
    const id = assignment.projectId
    const mapped = migration[id]
    result[threadId] = ids.has(id) ? id : typeof mapped === 'string' && ids.has(mapped) ? mapped : ''
  }
  const projectless = state['projectless-thread-ids']
  if (Array.isArray(projectless)) {
    for (const threadId of projectless) if (typeof threadId === 'string') result[threadId] = ''
  }
  return result
}
