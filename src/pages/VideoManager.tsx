import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  Search, Trash2, RefreshCw, CheckSquare, Square, ExternalLink,
  AlertTriangle, X, Edit3, ChevronDown, Type, ArrowUpDown
} from 'lucide-react'
import { useApp } from '../App'

// ── Types ─────────────────────────────────────────────────────────────────────
interface VideoResult {
  videoId: string
  title: string
  channelId: string
  channelTitle: string
  publishedAt: string
  thumbnailUrl: string
}

type RenameMode = 'prepend' | 'append' | 'find-replace' | 'insert-after' | 'uppercase' | 'lowercase'

interface RenameOpts {
  mode: RenameMode
  prepend: string
  append: string
  findText: string
  replaceText: string
  insertAfter: string
  insertText: string
}

interface ProgressState {
  done: number
  total: number
  label: string
}

// ── sessionStorage persistence ────────────────────────────────────────────────
const SS_KEY = 'videoManagerState'
function saveState(data: any) { try { sessionStorage.setItem(SS_KEY, JSON.stringify(data)) } catch {} }
function loadState(): any | null {
  try { const r = sessionStorage.getItem(SS_KEY); return r ? JSON.parse(r) : null } catch { return null }
}

function formatDate(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Confirmation modal ────────────────────────────────────────────────────────
function DeleteConfirmModal({
  count, onConfirm, onCancel
}: { count: number; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="rounded-xl p-6 w-full max-w-md shadow-2xl" style={{ background: '#0d1b3e', border: '1px solid rgba(45,90,158,0.5)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <AlertTriangle size={20} style={{ color: '#ef4444' }} />
          </div>
          <div>
            <div className="text-base font-bold text-white">Confirm Deletion</div>
            <div className="text-xs" style={{ color: '#4f73b3' }}>This cannot be undone</div>
          </div>
        </div>
        <div className="rounded-lg p-4 mb-5" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <p className="text-sm text-white">
            You are about to permanently delete <span className="font-bold text-red-400">{count} video{count !== 1 ? 's' : ''}</span> from YouTube.
          </p>
          <p className="text-xs mt-2" style={{ color: '#4f73b3' }}>
            This action will also remove them from your local upload history.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors" style={{ background: 'rgba(45,90,158,0.2)', border: '1px solid rgba(45,90,158,0.4)', color: '#8aa4d4' }}>
            Cancel
          </button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors" style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
            Delete {count} Video{count !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Rename preview modal ──────────────────────────────────────────────────────
function RenamePreviewModal({
  previews, onConfirm, onCancel
}: { previews: { videoId: string; oldTitle: string; newTitle: string }[]; onConfirm: () => void; onCancel: () => void }) {
  const changed = previews.filter(p => p.oldTitle !== p.newTitle)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="rounded-xl p-6 w-full max-w-2xl shadow-2xl flex flex-col" style={{ background: '#0d1b3e', border: '1px solid rgba(45,90,158,0.5)', maxHeight: '80vh' }}>
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div>
            <div className="text-base font-bold text-white">Preview Rename</div>
            <div className="text-xs" style={{ color: '#4f73b3' }}>{changed.length} title{changed.length !== 1 ? 's' : ''} will change</div>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg transition-colors" style={{ color: '#4f73b3' }}><X size={16} /></button>
        </div>
        <div className="overflow-y-auto flex-1 space-y-2 mb-5 pr-1">
          {changed.slice(0, 50).map(p => (
            <div key={p.videoId} className="rounded-lg p-3" style={{ background: 'rgba(26,68,128,0.2)', border: '1px solid rgba(45,90,158,0.25)' }}>
              <div className="text-xs mb-1" style={{ color: '#4f73b3' }}>Before</div>
              <div className="text-xs text-white font-mono break-all">{p.oldTitle}</div>
              <div className="text-xs mt-1.5 mb-1" style={{ color: '#4ade80' }}>After</div>
              <div className="text-xs font-mono break-all" style={{ color: '#4ade80' }}>{p.newTitle}</div>
            </div>
          ))}
          {changed.length > 50 && (
            <div className="text-xs text-center py-2" style={{ color: '#4f73b3' }}>…and {changed.length - 50} more</div>
          )}
        </div>
        <div className="flex gap-3 flex-shrink-0">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ background: 'rgba(45,90,158,0.2)', border: '1px solid rgba(45,90,158,0.4)', color: '#8aa4d4' }}>Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-lg text-sm font-bold" style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#818cf8' }}>
            Apply {changed.length} Rename{changed.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function VideoManager() {
  const { channels } = useApp()

  // Channel & search
  const [selectedChannelId, setSelectedChannelId] = useState('')
  const [query, setQuery] = useState('')
  const [videos, setVideos] = useState<VideoResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [hasSearched, setHasSearched] = useState(false)

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Action state
  const [actionRunning, setActionRunning] = useState(false)
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const [actionResults, setActionResults] = useState<{ success: number; failed: number } | null>(null)

  // Modals
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [renamePreviews, setRenamePreviews] = useState<{ videoId: string; oldTitle: string; newTitle: string }[] | null>(null)

  // Rename panel
  const [showRenamePanel, setShowRenamePanel] = useState(false)
  const [renameOpts, setRenameOpts] = useState<RenameOpts>({
    mode: 'prepend',
    prepend: '',
    append: '',
    findText: '',
    replaceText: '',
    insertAfter: '',
    insertText: '',
  })

  // Restore session state on mount
  useEffect(() => {
    const saved = loadState()
    if (saved) {
      if (saved.selectedChannelId) setSelectedChannelId(saved.selectedChannelId)
      if (saved.query) setQuery(saved.query)
      if (saved.videos?.length) { setVideos(saved.videos); setHasSearched(true) }
      if (saved.selectedIds) setSelectedIds(new Set(saved.selectedIds))
    }
  }, [])

  // Persist state on changes
  useEffect(() => {
    saveState({ selectedChannelId, query, videos, selectedIds: Array.from(selectedIds) })
  }, [selectedChannelId, query, videos, selectedIds])

  // Register IPC listeners
  useEffect(() => {
    const api = window.electronAPI?.videoManager
    if (!api) return
    api.onDeleteProgress((data) => {
      setProgress({ done: data.done, total: data.total, label: `Deleting ${data.done} / ${data.total}…` })
    })
    api.onRenameProgress((data) => {
      setProgress({ done: data.done, total: data.total, label: `Renaming ${data.done} / ${data.total}…` })
    })
    return () => { api.removeListeners() }
  }, [])

  const handleSearch = useCallback(async () => {
    if (!selectedChannelId) return
    setLoading(true)
    setSearchError('')
    setVideos([])
    setSelectedIds(new Set())
    setHasSearched(true)
    setActionResults(null)
    try {
      const res = await window.electronAPI!.videoManager.search({ channelId: selectedChannelId, query })
      if (res.success && res.videos) {
        setVideos(res.videos as unknown as VideoResult[])
      } else {
        setSearchError(res.error || 'Search failed')
      }
    } catch (e: any) {
      setSearchError(e.message || 'Search failed')
    } finally {
      setLoading(false)
    }
  }, [selectedChannelId, query])

  const allSelected = videos.length > 0 && selectedIds.size === videos.length
  const someSelected = selectedIds.size > 0

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(videos.map(v => v.videoId)))
  }

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDeleteConfirmed = useCallback(async () => {
    setShowDeleteConfirm(false)
    setActionRunning(true)
    setProgress({ done: 0, total: selectedIds.size, label: `Deleting 0 / ${selectedIds.size}…` })
    setActionResults(null)
    try {
      const res = await window.electronAPI!.videoManager.deleteVideos({ videoIds: Array.from(selectedIds) })
      if (res.success && res.results) {
        const succeeded = res.results.filter(r => r.success).map(r => r.videoId)
        const failed = res.results.filter(r => !r.success).length
        setVideos(prev => prev.filter(v => !succeeded.includes(v.videoId)))
        setSelectedIds(new Set())
        setActionResults({ success: succeeded.length, failed })
      }
    } catch (e: any) {
      setSearchError(e.message || 'Delete failed')
    } finally {
      setActionRunning(false)
      setProgress(null)
    }
  }, [selectedIds])

  // ── Rename preview ──────────────────────────────────────────────────────────
  const buildPreviews = useCallback(() => {
    const selected = videos.filter(v => selectedIds.has(v.videoId))
    return selected.map(v => {
      let newTitle = v.title
      const { mode, prepend, append, findText, replaceText, insertAfter, insertText } = renameOpts
      if (mode === 'prepend' && prepend) newTitle = prepend + v.title
      else if (mode === 'append' && append) newTitle = v.title + append
      else if (mode === 'find-replace' && findText !== undefined) newTitle = v.title.split(findText).join(replaceText || '')
      else if (mode === 'insert-after' && insertAfter && insertText) {
        const idx = v.title.indexOf(insertAfter)
        if (idx !== -1) newTitle = v.title.slice(0, idx + insertAfter.length) + insertText + v.title.slice(idx + insertAfter.length)
      } else if (mode === 'uppercase') newTitle = v.title.toUpperCase()
      else if (mode === 'lowercase') newTitle = v.title.toLowerCase()
      return { videoId: v.videoId, oldTitle: v.title, newTitle }
    })
  }, [videos, selectedIds, renameOpts])

  const handleRenamePreview = useCallback(() => {
    const previews = buildPreviews()
    setRenamePreviews(previews)
  }, [buildPreviews])

  const handleRenameConfirmed = useCallback(async () => {
    if (!renamePreviews) return
    setRenamePreviews(null)
    setActionRunning(true)
    setProgress({ done: 0, total: renamePreviews.length, label: `Renaming 0 / ${renamePreviews.length}…` })
    setActionResults(null)
    try {
      const res = await window.electronAPI!.videoManager.batchRename({
        videoIds: renamePreviews.map(p => p.videoId),
        ...renameOpts,
      })
      if (res.success && res.results) {
        const succeeded = res.results.filter(r => r.success)
        const failed = res.results.filter(r => !r.success).length
        // Update titles in local state
        const newTitleMap: Record<string, string> = {}
        for (const r of succeeded) newTitleMap[r.videoId] = r.newTitle
        setVideos(prev => prev.map(v => newTitleMap[v.videoId] ? { ...v, title: newTitleMap[v.videoId] } : v))
        setActionResults({ success: succeeded.length, failed })
      }
    } catch (e: any) {
      setSearchError(e.message || 'Rename failed')
    } finally {
      setActionRunning(false)
      setProgress(null)
    }
  }, [renamePreviews, renameOpts])

  const selectedChannel = channels.find(c => c.id === selectedChannelId)

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#061540' }}>
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4" style={{ borderBottom: '1px solid rgba(45,90,158,0.25)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Video Manager</h1>
            <p className="text-xs mt-0.5" style={{ color: '#4f73b3' }}>Search, bulk delete, and batch rename videos on your channels</p>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="flex-shrink-0 px-6 py-4 space-y-3" style={{ borderBottom: '1px solid rgba(45,90,158,0.2)' }}>
        <div className="flex gap-3 flex-wrap">
          {/* Channel selector */}
          <div className="relative">
            <select
              value={selectedChannelId}
              onChange={e => setSelectedChannelId(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm text-white outline-none"
              style={{ background: 'rgba(26,68,128,0.3)', border: '1px solid rgba(45,90,158,0.4)', minWidth: '200px' }}
            >
              <option value="">Select a channel…</option>
              {channels.map(c => (
                <option key={c.id} value={c.id}>{c.snippet?.title || c.id}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#4f73b3' }} />
          </div>

          {/* Search input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#4f73b3' }} />
            <input
              type="text"
              placeholder="Search by title (leave blank for all videos)…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="w-full pl-9 pr-4 py-2 rounded-lg text-sm text-white placeholder-opacity-50 outline-none"
              style={{ background: 'rgba(26,68,128,0.3)', border: '1px solid rgba(45,90,158,0.4)' }}
            />
          </div>

          <button
            onClick={handleSearch}
            disabled={!selectedChannelId || loading}
            className="px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
            style={{ background: loading ? 'rgba(45,90,158,0.3)' : 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.5)', color: loading ? '#4f73b3' : '#818cf8' }}
          >
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>

        {searchError && (
          <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
            <AlertTriangle size={12} /> {searchError}
          </div>
        )}
      </div>

      {/* Toolbar (shown when results exist) */}
      {videos.length > 0 && (
        <div className="flex-shrink-0 px-6 py-3 flex items-center gap-3 flex-wrap" style={{ borderBottom: '1px solid rgba(45,90,158,0.2)' }}>
          {/* Select all */}
          <button onClick={toggleAll} className="flex items-center gap-2 text-xs font-medium transition-colors" style={{ color: '#8aa4d4' }}>
            {allSelected ? <CheckSquare size={15} style={{ color: '#818cf8' }} /> : <Square size={15} />}
            {allSelected ? 'Deselect All' : `Select All (${videos.length})`}
          </button>

          <div className="flex-1" />

          {someSelected && (
            <>
              <span className="text-xs" style={{ color: '#4f73b3' }}>{selectedIds.size} selected</span>

              {/* Rename toggle */}
              <button
                onClick={() => setShowRenamePanel(p => !p)}
                disabled={actionRunning}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ background: showRenamePanel ? 'rgba(99,102,241,0.25)' : 'rgba(45,90,158,0.2)', border: `1px solid ${showRenamePanel ? 'rgba(99,102,241,0.5)' : 'rgba(45,90,158,0.4)'}`, color: showRenamePanel ? '#818cf8' : '#8aa4d4' }}
              >
                <Edit3 size={13} /> Batch Rename
              </button>

              {/* Delete */}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={actionRunning}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#ef4444' }}
              >
                <Trash2 size={13} /> Delete Selected
              </button>
            </>
          )}
        </div>
      )}

      {/* Rename panel */}
      {showRenamePanel && someSelected && (
        <div className="flex-shrink-0 px-6 py-4 space-y-3" style={{ background: 'rgba(26,68,128,0.12)', borderBottom: '1px solid rgba(45,90,158,0.2)' }}>
          <div className="text-xs font-semibold text-white mb-2">Batch Rename — {selectedIds.size} video{selectedIds.size !== 1 ? 's' : ''}</div>

          {/* Mode selector */}
          <div className="flex gap-2 flex-wrap">
            {([
              { value: 'prepend', label: 'Prepend' },
              { value: 'append', label: 'Append' },
              { value: 'find-replace', label: 'Find & Replace' },
              { value: 'insert-after', label: 'Insert After' },
              { value: 'uppercase', label: 'ALL CAPS' },
              { value: 'lowercase', label: 'all lowercase' },
            ] as { value: RenameMode; label: string }[]).map(m => (
              <button
                key={m.value}
                onClick={() => setRenameOpts(p => ({ ...p, mode: m.value }))}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: renameOpts.mode === m.value ? 'rgba(99,102,241,0.25)' : 'rgba(45,90,158,0.15)',
                  border: `1px solid ${renameOpts.mode === m.value ? 'rgba(99,102,241,0.5)' : 'rgba(45,90,158,0.3)'}`,
                  color: renameOpts.mode === m.value ? '#818cf8' : '#8aa4d4',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Mode-specific inputs */}
          {renameOpts.mode === 'prepend' && (
            <div className="flex gap-3 items-center">
              <span className="text-xs" style={{ color: '#4f73b3' }}>Add to beginning:</span>
              <input
                type="text"
                placeholder="e.g. fe_a1_"
                value={renameOpts.prepend}
                onChange={e => setRenameOpts(p => ({ ...p, prepend: e.target.value }))}
                className="flex-1 px-3 py-1.5 rounded-lg text-xs text-white outline-none"
                style={{ background: 'rgba(26,68,128,0.3)', border: '1px solid rgba(45,90,158,0.4)' }}
              />
            </div>
          )}
          {renameOpts.mode === 'append' && (
            <div className="flex gap-3 items-center">
              <span className="text-xs" style={{ color: '#4f73b3' }}>Add to end:</span>
              <input
                type="text"
                placeholder="e.g. _v2"
                value={renameOpts.append}
                onChange={e => setRenameOpts(p => ({ ...p, append: e.target.value }))}
                className="flex-1 px-3 py-1.5 rounded-lg text-xs text-white outline-none"
                style={{ background: 'rgba(26,68,128,0.3)', border: '1px solid rgba(45,90,158,0.4)' }}
              />
            </div>
          )}
          {renameOpts.mode === 'find-replace' && (
            <div className="flex gap-3 items-center flex-wrap">
              <span className="text-xs" style={{ color: '#4f73b3' }}>Find:</span>
              <input
                type="text"
                placeholder="Text to find"
                value={renameOpts.findText}
                onChange={e => setRenameOpts(p => ({ ...p, findText: e.target.value }))}
                className="px-3 py-1.5 rounded-lg text-xs text-white outline-none"
                style={{ background: 'rgba(26,68,128,0.3)', border: '1px solid rgba(45,90,158,0.4)', minWidth: '160px' }}
              />
              <span className="text-xs" style={{ color: '#4f73b3' }}>Replace with:</span>
              <input
                type="text"
                placeholder="Replacement (blank to delete)"
                value={renameOpts.replaceText}
                onChange={e => setRenameOpts(p => ({ ...p, replaceText: e.target.value }))}
                className="flex-1 px-3 py-1.5 rounded-lg text-xs text-white outline-none"
                style={{ background: 'rgba(26,68,128,0.3)', border: '1px solid rgba(45,90,158,0.4)', minWidth: '160px' }}
              />
            </div>
          )}
          {renameOpts.mode === 'insert-after' && (
            <div className="flex gap-3 items-center flex-wrap">
              <span className="text-xs" style={{ color: '#4f73b3' }}>Insert after:</span>
              <input
                type="text"
                placeholder="e.g. fe_"
                value={renameOpts.insertAfter}
                onChange={e => setRenameOpts(p => ({ ...p, insertAfter: e.target.value }))}
                className="px-3 py-1.5 rounded-lg text-xs text-white outline-none"
                style={{ background: 'rgba(26,68,128,0.3)', border: '1px solid rgba(45,90,158,0.4)', minWidth: '120px' }}
              />
              <span className="text-xs" style={{ color: '#4f73b3' }}>Insert text:</span>
              <input
                type="text"
                placeholder="e.g. a1_"
                value={renameOpts.insertText}
                onChange={e => setRenameOpts(p => ({ ...p, insertText: e.target.value }))}
                className="flex-1 px-3 py-1.5 rounded-lg text-xs text-white outline-none"
                style={{ background: 'rgba(26,68,128,0.3)', border: '1px solid rgba(45,90,158,0.4)', minWidth: '120px' }}
              />
            </div>
          )}
          {(renameOpts.mode === 'uppercase' || renameOpts.mode === 'lowercase') && (
            <div className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8' }}>
              All {selectedIds.size} selected title{selectedIds.size !== 1 ? 's' : ''} will be converted to {renameOpts.mode === 'uppercase' ? 'UPPERCASE' : 'lowercase'}.
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleRenamePreview}
              disabled={actionRunning}
              className="px-5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2"
              style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#818cf8' }}
            >
              <ArrowUpDown size={13} /> Preview Changes
            </button>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {actionRunning && progress && (
        <div className="flex-shrink-0 px-6 py-3" style={{ borderBottom: '1px solid rgba(45,90,158,0.2)' }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium" style={{ color: '#8aa4d4' }}>{progress.label}</span>
            <span className="text-xs" style={{ color: '#4f73b3' }}>{Math.round((progress.done / progress.total) * 100)}%</span>
          </div>
          <div className="w-full rounded-full h-1.5" style={{ background: 'rgba(45,90,158,0.3)' }}>
            <div
              className="h-1.5 rounded-full transition-all"
              style={{ width: `${(progress.done / progress.total) * 100}%`, background: 'linear-gradient(90deg, #6366f1, #818cf8)' }}
            />
          </div>
        </div>
      )}

      {/* Action results */}
      {actionResults && (
        <div className="flex-shrink-0 px-6 py-2 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(45,90,158,0.2)' }}>
          <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', color: '#4ade80' }}>
            ✓ {actionResults.success} succeeded
          </div>
          {actionResults.failed > 0 && (
            <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
              ✗ {actionResults.failed} failed — check Activity Logs
            </div>
          )}
          <button onClick={() => setActionResults(null)} className="ml-auto p-1" style={{ color: '#4f73b3' }}><X size={13} /></button>
        </div>
      )}

      {/* Results list */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {!hasSearched && (
          <div className="flex flex-col items-center justify-center h-full" style={{ color: '#4f73b3' }}>
            <Search size={40} className="mb-3 opacity-30" />
            <p className="text-sm">Select a channel and search to find videos</p>
          </div>
        )}

        {hasSearched && !loading && videos.length === 0 && !searchError && (
          <div className="flex flex-col items-center justify-center h-full" style={{ color: '#4f73b3' }}>
            <Type size={40} className="mb-3 opacity-30" />
            <p className="text-sm">No videos found matching your search</p>
          </div>
        )}

        {videos.length > 0 && (
          <div className="space-y-1">
            {/* Count badge */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold text-white">{videos.length} video{videos.length !== 1 ? 's' : ''} found</span>
              {selectedChannel && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(45,90,158,0.25)', color: '#8aa4d4' }}>
                  {selectedChannel.snippet?.title}
                </span>
              )}
            </div>

            {videos.map(v => (
              <div
                key={v.videoId}
                onClick={() => toggleOne(v.videoId)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all"
                style={{
                  background: selectedIds.has(v.videoId) ? 'rgba(99,102,241,0.12)' : 'rgba(26,68,128,0.15)',
                  border: `1px solid ${selectedIds.has(v.videoId) ? 'rgba(99,102,241,0.35)' : 'rgba(45,90,158,0.25)'}`,
                }}
              >
                {/* Checkbox */}
                <div className="flex-shrink-0" onClick={e => { e.stopPropagation(); toggleOne(v.videoId) }}>
                  {selectedIds.has(v.videoId)
                    ? <CheckSquare size={16} style={{ color: '#818cf8' }} />
                    : <Square size={16} style={{ color: '#4f73b3' }} />}
                </div>

                {/* Thumbnail */}
                {v.thumbnailUrl ? (
                  <img src={v.thumbnailUrl} alt="" className="w-12 h-9 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-9 rounded flex-shrink-0" style={{ background: 'rgba(45,90,158,0.3)' }} />
                )}

                {/* Title & date */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white truncate">{v.title}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: '#4f73b3' }}>{formatDate(v.publishedAt)}</div>
                </div>

                {/* YouTube link */}
                <a
                  href={`https://www.youtube.com/watch?v=${v.videoId}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="flex-shrink-0 p-1.5 rounded transition-colors"
                  style={{ color: '#4f73b3' }}
                >
                  <ExternalLink size={13} />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showDeleteConfirm && (
        <DeleteConfirmModal
          count={selectedIds.size}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      {renamePreviews && (
        <RenamePreviewModal
          previews={renamePreviews}
          onConfirm={handleRenameConfirmed}
          onCancel={() => setRenamePreviews(null)}
        />
      )}
    </div>
  )
}
