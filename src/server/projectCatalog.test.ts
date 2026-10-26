import { describe, expect, it, vi } from 'vitest'
import { mapThreadProjectIds, readProjectCatalog } from './projectCatalog.js'

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
