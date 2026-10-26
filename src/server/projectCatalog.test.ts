import { describe, expect, it, vi } from 'vitest'
import { ensureCatalogProjectRoot, mapThreadProjectIds, readProjectCatalog } from './projectCatalog.js'

describe('ensureCatalogProjectRoot', () => {
  it('registers a newly opened root in the modern catalog', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [], nextCursor: null }).mockResolvedValueOnce({ project: { id: 'new' } })
    await ensureCatalogProjectRoot(rpc, '/new/project', 'Project', 'request-key')
    expect(rpc.mock.calls).toEqual([
      ['project/list', { cursor: null, limit: 100 }],
      ['project/create', { idempotencyKey: 'request-key', name: 'Project', roots: [{ path: '/new/project' }] }],
    ])
  })
  it('does not duplicate or rename an existing project containing the root', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 'existing', name: 'Custom label', roots: [{ path: '/shared' }] }], nextCursor: null })
    await ensureCatalogProjectRoot(rpc, '/shared', 'Different label', 'request-key')
    expect(rpc).toHaveBeenCalledTimes(1)
  })
  it('leaves unsupported servers on the legacy write path', async () => {
    const rpc = vi.fn().mockRejectedValue(Object.assign(new Error('Method not found'), { code: -32601 }))
    await ensureCatalogProjectRoot(rpc, '/project', 'Project', 'request-key')
    expect(rpc).toHaveBeenCalledTimes(1)
  })
  it('surfaces create failures without replaying the mutation', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [], nextCursor: null }).mockRejectedValueOnce(new Error('timed out'))
    await expect(ensureCatalogProjectRoot(rpc, '/project', 'Project', 'request-key')).rejects.toThrow('timed out')
    expect(rpc).toHaveBeenCalledTimes(2)
  })
})

describe('readProjectCatalog', () => {
  it('reads every page and keeps projects with overlapping roots distinct', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{ id: 'a', name: 'A', roots: [{ path: '/shared' }] }], nextCursor: 'next' })
      .mockResolvedValueOnce({ data: [{ id: 'b', name: 'B', roots: [{ path: '/shared' }, { path: '/second' }] }], nextCursor: null })
    expect(await readProjectCatalog(rpc)).toEqual([
      { id: 'a', name: 'A', rootPaths: ['/shared'] },
      { id: 'b', name: 'B', rootPaths: ['/shared', '/second'] },
    ])
    expect(rpc.mock.calls).toEqual([
      ['project/list', { cursor: null, limit: 100 }],
      ['project/list', { cursor: 'next', limit: 100 }],
    ])
  })

  it('keeps an empty modern catalog distinct from unsupported', async () => {
    expect(await readProjectCatalog(vi.fn().mockResolvedValue({ data: [], nextCursor: null }))).toEqual([])
  })

  it.each([
    Object.assign(new Error('missing'), { code: -32601 }),
    new Error('Method not found'),
    new Error('unknown variant `project/list`, expected `thread/list`'),
  ])('falls back only for an unsupported method: %s', async error => {
    expect(await readProjectCatalog(vi.fn().mockRejectedValue(error))).toBeUndefined()
  })

  it('propagates transport and malformed response errors', async () => {
    await expect(readProjectCatalog(vi.fn().mockRejectedValue(new Error('connection lost')))).rejects.toThrow('connection lost')
    await expect(readProjectCatalog(vi.fn().mockResolvedValue({}))).rejects.toThrow('Invalid project/list response')
  })

  it('does not silently use a partial catalog after page failure', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [], nextCursor: 'next' })
      .mockRejectedValueOnce(Object.assign(new Error('missing'), { code: -32601 }))
    await expect(readProjectCatalog(rpc)).rejects.toThrow('missing')
  })

  it('rejects repeated cursors', async () => {
    await expect(readProjectCatalog(vi.fn().mockResolvedValue({ data: [], nextCursor: 'same' }))).rejects.toThrow('Repeated')
  })
})

describe('mapThreadProjectIds', () => {
  it('maps legacy IDs for this home and preserves explicit unassigned/deleted membership', () => {
    const projects = [{ id: 'server', name: 'P', rootPaths: ['/shared'] }]
    const state = {
      'app-server-project-id-by-legacy-project-id-by-host': {
        'local:/home': { legacy: 'server', deleted: 'missing' },
        'local:/other': { other: 'server' },
      },
      'thread-project-assignments': {
        a: { projectKind: 'local', projectId: 'legacy' },
        b: { projectKind: 'local', projectId: 'server' },
        c: { projectKind: 'local', projectId: 'deleted' },
        d: { projectKind: 'local', projectId: 'other' },
        e: { projectKind: 'remote', projectId: 'legacy' },
      },
      'projectless-thread-ids': ['b', 'f'],
    }
    expect(mapThreadProjectIds(state, projects, '/home')).toEqual({ a: 'server', b: '', c: '', d: '', e: '', f: '' })
  })

  it('tolerates missing legacy metadata', () => {
    expect(mapThreadProjectIds({}, [], '/home')).toEqual({})
  })
})
