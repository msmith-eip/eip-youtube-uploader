import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  Search, Trash2, ShieldCheck, RefreshCw, CheckSquare, Square,
  ChevronDown, ChevronRight, ExternalLink, AlertTriangle, Info, X
} from 'lucide-react'
import type { DuplicateVideoEntry } from '../types'

type ScanMode = 'duplicates' | 'disclosure'

interface DupGroup {
  key: string
  title: string
  videos: DuplicateVideoEntry[]
}

interface ChannelCount {
  title: string
  total: number
}

interface ProgressState {
  done: number
  total: number
  lastVideoId: string
  lastSuccess: boolean
}

// ── sessionStorage persistence helpers ────────────────────────────────────────
const SS_KEY = 'dupManagerState'

function saveState(data: any) {
  try { sessionStorage.setItem(SS_KEY, JSON.stringify(data)) } catch {}
}

function loadState(): any | null {
  try {
    const raw = sessionStorage.getItem(SS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function formatDate(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function parseDateInput(val: string): Date | null {
  if (!val) return null
  const d = new Date(val + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}

// ── Styled confirmation modal ─────────────────────────────────────────────────
interface ConfirmModalProps {
  videoCount: number
  channelCounts: Record<string, ChannelCount>
  selectedIds: string[]
  allVideosInGroups: DuplicateVideoEntry[]
  onConfirm: () => void
  onCancel: () => void
}

function DeleteConfirmModal({ videoCount, channelCounts, selectedIds, allVideosInGroups, onConfirm, onCancel }: ConfirmModalProps) {
  // Calculate how many videos will remain per channel after deletion
  const selectedSet = new Set(selectedIds)
  const channelSelectedCount: Record<string, number> = {}
  for (const v of allVideosInGroups) {
    if (selectedSet.has(v.videoId)) {
      channelSelectedCount[v.channelId] = (channelSelectedCount[v.channelId] || 0) + 1
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl" style={{ background: '#071847', border: '1px solid #1a3a8f' }}>
        <div className="flex items-start gap-3 mb-4">
          <div className="rounded-full p-2 flex-shrink-0" style={{ background: 'rgba(178,34,52,0.15)' }}>
            <AlertTriangle size={20} style={{ color: '#fb7185' }} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Confirm Deletion</h3>
            <p className="text-xs mt-1" style={{ color: '#9db1d5' }}>
              This will permanently delete {videoCount} video{videoCount !== 1 ? 's' : ''} from YouTube. This cannot be undone.
            </p>
          </div>
          <button onClick={onCancel} className="ml-auto flex-shrink-0 p-1 rounded hover:bg-white/10">
            <X size={14} style={{ color: '#4f73b3' }} />
          </button>
        </div>

        {/* Per-channel impact summary */}
        <div className="rounded-lg p-3 mb-4" style={{ background: '#0a1f5c', border: '1px solid #0e2a6e' }}>
          <div className="text-xs font-semibold text-white mb-2">Impact per channel</div>
          {Object.entries(channelSelectedCount).map(([chId, delCount]) => {
            const ch = channelCounts[chId]
            const remaining = ch ? ch.total - delCount : null
            return (
              <div key={chId} className="flex items-center justify-between py-1 text-xs border-b last:border-0" style={{ borderColor: '#0e2a6e' }}>
                <span style={{ color: '#9db1d5' }}>{ch?.title || chId}</span>
                <span>
                  <span style={{ color: '#fb7185' }}>−{delCount}</span>
                  {remaining !== null && (
                    <span style={{ color: '#4f73b3' }}> → {remaining.toLocaleString()} remaining</span>
                  )}
                </span>
              </div>
            )
          })}
        </div>

        <p className="text-xs mb-4" style={{ color: '#4f73b3' }}>
          Only the extra copies are selected. The oldest copy of each video is preserved.
        </p>

        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="btn-secondary text-xs py-2 px-4">Cancel</button>
          <button
            onClick={onConfirm}
            className="text-xs py-2 px-4 rounded-lg font-semibold text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #B22234, #e11d48)' }}
          >
            Delete {videoCount} Video{videoCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function DuplicateManager() {
  // Restore from sessionStorage on mount
  const saved = loadState()

  const [mode, setMode] = useState<ScanMode>(saved?.mode || 'duplicates')
  const [scanComplete, setScanComplete] = useState<boolean>(saved?.scanComplete || false)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [totalScanned, setTotalScanned] = useState<number>(saved?.totalScanned || 0)
  const [channelCounts, setChannelCounts] = useState<Record<string, ChannelCount>>(saved?.channelCounts || {})

  const [dupGroups, setDupGroups] = useState<DupGroup[]>(saved?.dupGroups || [])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(saved?.expandedGroups || []))
  const [disclosureVideos, setDisclosureVideos] = useState<DuplicateVideoEntry[]>(saved?.disclosureVideos || [])

  const [selected, setSelected] = useState<Set<string>>(new Set(saved?.selected || []))
  const [dateFrom, setDateFrom] = useState<string>(saved?.dateFrom || '')
  const [dateTo, setDateTo] = useState<string>(saved?.dateTo || '')
  const [search, setSearch] = useState<string>(saved?.search || '')

  const [showConfirm, setShowConfirm] = useState(false)
  const [actionRunning, setActionRunning] = useState(false)
  const [actionType, setActionType] = useState<'delete' | 'disclosure' | null>(null)
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const [actionResults, setActionResults] = useState<{ videoId: string; success: boolean; error?: string }[] | null>(
    saved?.actionResults || null
  )

  // Persist state whenever it changes
  useEffect(() => {
    saveState({
      mode, scanComplete, totalScanned, channelCounts,
      dupGroups, expandedGroups: Array.from(expandedGroups),
      disclosureVideos, selected: Array.from(selected),
      dateFrom, dateTo, search, actionResults,
    })
  }, [mode, scanComplete, totalScanned, channelCounts, dupGroups, expandedGroups, disclosureVideos, selected, dateFrom, dateTo, search, actionResults])

  // Subscribe to delete/fix-disclosure progress events
  useEffect(() => {
    const api = (window.electronAPI as any)?.duplicates
    if (!api?.onDeleteProgress) return
    api.onDeleteProgress((data: { done: number; total: number; videoId: string; success: boolean; error?: string }) => {
      setProgress({ done: data.done, total: data.total, lastVideoId: data.videoId, lastSuccess: data.success })
    })
    return () => api.removeDeleteProgressListener?.()
  }, [])

  // ── Filtering ──────────────────────────────────────────────────────────────
  const fromDate = parseDateInput(dateFrom)
  const toDate = parseDateInput(dateTo)

  function inDateRange(iso: string): boolean {
    if (!fromDate && !toDate) return true
    const d = new Date(iso)
    if (isNaN(d.getTime())) return true
    if (fromDate && d < fromDate) return false
    if (toDate) {
      const end = new Date(toDate)
      end.setHours(23, 59, 59, 999)
      if (d > end) return false
    }
    return true
  }

  const filteredGroups = useMemo<DupGroup[]>(() => {
    return dupGroups
      .map(g => ({
        ...g,
        videos: g.videos.filter(v =>
          inDateRange(v.publishedAt) &&
          (!search || v.title.toLowerCase().includes(search.toLowerCase()) || v.channelTitle.toLowerCase().includes(search.toLowerCase()))
        ),
      }))
      .filter(g => g.videos.length >= 2)
  }, [dupGroups, dateFrom, dateTo, search])

  const filteredDisclosure = useMemo<DuplicateVideoEntry[]>(() => {
    return disclosureVideos.filter(v =>
      inDateRange(v.publishedAt) &&
      (!search || v.title.toLowerCase().includes(search.toLowerCase()) || v.channelTitle.toLowerCase().includes(search.toLowerCase()))
    )
  }, [disclosureVideos, dateFrom, dateTo, search])

  // All selectable IDs in current filtered view
  const allSelectableIds = useMemo<string[]>(() => {
    if (mode === 'duplicates') {
      return filteredGroups.flatMap(g => g.videos.slice(1).map(v => v.videoId))
    }
    return filteredDisclosure.map(v => v.videoId)
  }, [mode, filteredGroups, filteredDisclosure])

  // All videos across all groups (for confirmation modal impact calc)
  const allVideosInGroups = useMemo<DuplicateVideoEntry[]>(() => {
    return dupGroups.flatMap(g => g.videos)
  }, [dupGroups])

  const allSelected = allSelectableIds.length > 0 && allSelectableIds.every(id => selected.has(id))
  const someSelected = allSelectableIds.some(id => selected.has(id))
  const selectedCount = allSelectableIds.filter(id => selected.has(id)).length

  // ── Selection helpers ──────────────────────────────────────────────────────
  function toggleVideo(videoId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(videoId)) next.delete(videoId)
      else next.add(videoId)
      return next
    })
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(allSelectableIds))
    }
  }

  function toggleGroup(videos: DuplicateVideoEntry[]) {
    const ids = videos.slice(1).map(v => v.videoId)
    const allGroupSelected = ids.every(id => selected.has(id))
    setSelected(prev => {
      const next = new Set(prev)
      if (allGroupSelected) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      return next
    })
  }

  function toggleExpand(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // ── Scan ───────────────────────────────────────────────────────────────────
  const handleScan = useCallback(async () => {
    setScanning(true)
    setScanError(null)
    setScanComplete(false)
    setSelected(new Set())
    setActionResults(null)
    setProgress(null)
    setDupGroups([])
    setDisclosureVideos([])
    setChannelCounts({})

    try {
      if (mode === 'duplicates') {
        const res = await window.electronAPI.duplicates.scan()
        if (!res.success) throw new Error(res.error || 'Scan failed')
        const counts = (res as any).channelVideoCounts || {}
        setChannelCounts(counts)
        const groups: DupGroup[] = Object.entries(res.duplicates || {}).map(([key, vids]) => ({
          key,
          title: (vids[0]?.title) || key,
          videos: vids,
        }))
        groups.sort((a, b) => b.videos.length - a.videos.length)
        setDupGroups(groups)
        setTotalScanned(res.totalScanned || 0)
        const autoExpand = new Set(groups.filter(g => g.videos.length <= 5).map(g => g.key))
        setExpandedGroups(autoExpand)
      } else {
        const res = await window.electronAPI.duplicates.scanMissingDisclosure()
        if (!res.success) throw new Error(res.error || 'Scan failed')
        setDisclosureVideos(res.videos || [])
        setTotalScanned(res.totalScanned || 0)
      }
      setScanComplete(true)
    } catch (err: any) {
      setScanError(err.message || 'Unknown error')
    } finally {
      setScanning(false)
    }
  }, [mode])

  // ── Delete (after confirmation) ────────────────────────────────────────────
  const runDelete = useCallback(async () => {
    const ids = Array.from(selected).filter(id => allSelectableIds.includes(id))
    if (ids.length === 0) return

    setShowConfirm(false)
    setActionRunning(true)
    setActionType('delete')
    setActionResults(null)
    setProgress({ done: 0, total: ids.length, lastVideoId: '', lastSuccess: true })

    try {
      const res = await window.electronAPI.duplicates.deleteVideos(ids)
      if (!res.success) throw new Error(res.error || 'Delete failed')
      setActionResults(res.results || [])

      const deletedIds = new Set((res.results || []).filter(r => r.success).map(r => r.videoId))

      // Update channel counts
      setChannelCounts(prev => {
        const next = { ...prev }
        for (const v of allVideosInGroups) {
          if (deletedIds.has(v.videoId) && next[v.channelId]) {
            next[v.channelId] = { ...next[v.channelId], total: Math.max(0, next[v.channelId].total - 1) }
          }
        }
        return next
      })

      setDupGroups(prev =>
        prev
          .map(g => ({ ...g, videos: g.videos.filter(v => !deletedIds.has(v.videoId)) }))
          .filter(g => g.videos.length >= 2)
      )
      setDisclosureVideos(prev => prev.filter(v => !deletedIds.has(v.videoId)))
      setSelected(prev => {
        const next = new Set(prev)
        deletedIds.forEach(id => next.delete(id))
        return next
      })
    } catch (err: any) {
      setScanError(err.message || 'Delete failed')
    } finally {
      setActionRunning(false)
      setProgress(null)
    }
  }, [selected, allSelectableIds, allVideosInGroups])

  // ── Fix Disclosure ─────────────────────────────────────────────────────────
  const handleFixDisclosure = useCallback(async () => {
    const ids = Array.from(selected).filter(id => allSelectableIds.includes(id))
    if (ids.length === 0) return

    setActionRunning(true)
    setActionType('disclosure')
    setActionResults(null)
    setProgress({ done: 0, total: ids.length, lastVideoId: '', lastSuccess: true })

    try {
      const res = await window.electronAPI.duplicates.fixDisclosure(ids)
      if (!res.success) throw new Error(res.error || 'Fix disclosure failed')
      setActionResults(res.results || [])

      const fixedIds = new Set((res.results || []).filter(r => r.success).map(r => r.videoId))
      setDisclosureVideos(prev => prev.filter(v => !fixedIds.has(v.videoId)))
      setSelected(prev => {
        const next = new Set(prev)
        fixedIds.forEach(id => next.delete(id))
        return next
      })
    } catch (err: any) {
      setScanError(err.message || 'Fix disclosure failed')
    } finally {
      setActionRunning(false)
      setProgress(null)
    }
  }, [selected, allSelectableIds])

  // ── Mode switch ────────────────────────────────────────────────────────────
  function switchMode(m: ScanMode) {
    setMode(m)
    setScanComplete(false)
    setDupGroups([])
    setDisclosureVideos([])
    setSelected(new Set())
    setActionResults(null)
    setProgress(null)
    setChannelCounts({})
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full" style={{ background: '#061540' }}>

      {/* Confirmation modal */}
      {showConfirm && (
        <DeleteConfirmModal
          videoCount={selectedCount}
          channelCounts={channelCounts}
          selectedIds={Array.from(selected)}
          allVideosInGroups={allVideosInGroups}
          onConfirm={runDelete}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b" style={{ borderColor: '#0e2a6e' }}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-bold text-white">Duplicate Manager</h2>
            <p className="text-xs mt-0.5" style={{ color: '#4f73b3' }}>
              Scan your channels for duplicate videos or missing disclosure labels
            </p>
          </div>
          {scanComplete && (
            <span className="text-xs" style={{ color: '#4f73b3' }}>
              {totalScanned.toLocaleString()} videos scanned
            </span>
          )}
        </div>

        {/* Mode tabs + scan button */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: '#0a1f5c' }}>
            <button
              onClick={() => switchMode('duplicates')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none ${mode === 'duplicates' ? 'text-white' : 'text-navy-300 hover:text-white'}`}
              style={mode === 'duplicates' ? { background: '#1a3a8f' } : {}}
            >
              Duplicate Videos
            </button>
            <button
              onClick={() => switchMode('disclosure')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none ${mode === 'disclosure' ? 'text-white' : 'text-navy-300 hover:text-white'}`}
              style={mode === 'disclosure' ? { background: '#1a3a8f' } : {}}
            >
              Missing Disclosure
            </button>
          </div>

          <button
            onClick={handleScan}
            disabled={scanning || actionRunning}
            className="btn-primary text-xs py-1.5 flex items-center gap-1.5"
          >
            <RefreshCw size={12} className={scanning ? 'animate-spin' : ''} />
            {scanning ? 'Scanning…' : scanComplete ? 'Re-Scan' : 'Scan Channels'}
          </button>
        </div>

        {/* Channel video counts */}
        {scanComplete && Object.keys(channelCounts).length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {Object.entries(channelCounts).map(([chId, ch]) => (
              <div key={chId} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs" style={{ background: '#0a1f5c', border: '1px solid #0e2a6e' }}>
                <span style={{ color: '#9db1d5' }}>{ch.title}</span>
                <span className="font-semibold" style={{ color: '#60a5fa' }}>{ch.total.toLocaleString()} videos</span>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        {scanComplete && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: '#4f73b3' }} />
              <input
                type="text"
                placeholder="Search title or channel…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input pl-8 py-1.5 text-xs w-52"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs" style={{ color: '#4f73b3' }}>From</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input py-1.5 text-xs w-36" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs" style={{ color: '#4f73b3' }}>To</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input py-1.5 text-xs w-36" />
            </div>
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-xs px-2 py-1 rounded" style={{ color: '#4f73b3' }}>
                Clear dates
              </button>
            )}
          </div>
        )}
      </div>

      {/* Toolbar */}
      {scanComplete && (
        <div className="flex-shrink-0 px-6 py-2 flex items-center gap-3 border-b" style={{ borderColor: '#0e2a6e', background: '#071847' }}>
          <button onClick={toggleSelectAll} className="flex items-center gap-1.5 text-xs" style={{ color: '#4f73b3' }}>
            {allSelected
              ? <CheckSquare size={14} style={{ color: '#60a5fa' }} />
              : someSelected
                ? <CheckSquare size={14} style={{ color: '#4f73b3' }} />
                : <Square size={14} />}
            <span>{allSelected ? 'Deselect All' : 'Select All'}</span>
          </button>

          {selectedCount > 0 && (
            <span className="text-xs font-semibold" style={{ color: '#60a5fa' }}>
              {selectedCount} selected
            </span>
          )}

          <div className="flex-1" />

          {/* Progress bar during action */}
          {actionRunning && progress && (
            <div className="flex items-center gap-2">
              <div className="w-32 h-1.5 rounded-full overflow-hidden" style={{ background: '#0a1f5c' }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`, background: actionType === 'delete' ? '#B22234' : '#1a4480' }}
                />
              </div>
              <span className="text-xs tabular-nums" style={{ color: '#9db1d5' }}>
                {actionType === 'delete' ? 'Deleting' : 'Fixing'} {progress.done} / {progress.total}
              </span>
            </div>
          )}

          {selectedCount > 0 && mode === 'duplicates' && !actionRunning && (
            <button
              onClick={() => setShowConfirm(true)}
              className="btn-danger text-xs py-1.5 flex items-center gap-1.5"
            >
              <Trash2 size={12} />
              Delete {selectedCount} Video{selectedCount !== 1 ? 's' : ''}
            </button>
          )}

          {selectedCount > 0 && mode === 'disclosure' && !actionRunning && (
            <button
              onClick={handleFixDisclosure}
              className="btn-primary text-xs py-1.5 flex items-center gap-1.5"
            >
              <ShieldCheck size={12} />
              Fix Disclosure on {selectedCount} Video{selectedCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-4">

        {/* Error */}
        {scanError && (
          <div className="flex items-start gap-2 p-3 rounded-lg mb-4 text-xs" style={{ background: '#2d0a0a', color: '#fb7185', border: '1px solid #7f1d1d' }}>
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>{scanError}</span>
          </div>
        )}

        {/* Action results summary */}
        {actionResults && !actionRunning && (
          <div className="mb-4 p-3 rounded-lg text-xs" style={{ background: '#071847', border: '1px solid #0e2a6e' }}>
            <div className="font-semibold text-white mb-1">
              {actionType === 'delete' ? 'Delete' : 'Fix Disclosure'} Complete
            </div>
            <div className="flex gap-4">
              <span style={{ color: '#4ade80' }}>✓ {actionResults.filter(r => r.success).length} succeeded</span>
              {actionResults.filter(r => !r.success).length > 0 && (
                <span style={{ color: '#fb7185' }}>✗ {actionResults.filter(r => !r.success).length} failed</span>
              )}
            </div>
            {actionResults.filter(r => !r.success).slice(0, 5).map(r => (
              <div key={r.videoId} className="mt-1" style={{ color: '#fb7185' }}>
                {r.videoId}: {r.error}
              </div>
            ))}
          </div>
        )}

        {/* Empty / scanning state */}
        {!scanComplete && !scanning && (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <div className="rounded-full p-4" style={{ background: '#0a1f5c' }}>
              {mode === 'duplicates' ? <Trash2 size={28} style={{ color: '#4f73b3' }} /> : <ShieldCheck size={28} style={{ color: '#4f73b3' }} />}
            </div>
            <p className="text-sm font-semibold text-white">
              {mode === 'duplicates' ? 'Find Duplicate Videos' : 'Find Missing Disclosure Labels'}
            </p>
            <p className="text-xs text-center max-w-xs" style={{ color: '#4f73b3' }}>
              {mode === 'duplicates'
                ? 'Scan all your channels to find videos with the same title uploaded more than once. Keep the oldest copy and delete the rest.'
                : 'Scan all your channels to find videos missing the "Altered or Synthetic Content" disclosure label and fix them in bulk.'}
            </p>
            <button onClick={handleScan} className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5">
              <RefreshCw size={12} />
              Start Scan
            </button>
          </div>
        )}

        {scanning && (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <RefreshCw size={28} className="animate-spin" style={{ color: '#60a5fa' }} />
            <p className="text-sm text-white">Scanning channels…</p>
            <p className="text-xs" style={{ color: '#4f73b3' }}>This may take a minute for large channels</p>
          </div>
        )}

        {/* Duplicates results */}
        {scanComplete && mode === 'duplicates' && (
          <>
            {filteredGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <Info size={24} style={{ color: '#4ade80' }} />
                <p className="text-sm font-semibold" style={{ color: '#4ade80' }}>No duplicates found</p>
                <p className="text-xs" style={{ color: '#4f73b3' }}>
                  {dupGroups.length === 0 ? 'All videos on your channels have unique titles.' : 'No duplicates match the current filters.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-semibold" style={{ color: '#fb7185' }}>
                    {filteredGroups.length} duplicate group{filteredGroups.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-xs" style={{ color: '#4f73b3' }}>
                    ({filteredGroups.reduce((s, g) => s + g.videos.length - 1, 0)} extra copies)
                  </span>
                  <button onClick={() => setExpandedGroups(new Set(filteredGroups.map(g => g.key)))} className="text-xs ml-2" style={{ color: '#4f73b3' }}>Expand all</button>
                  <button onClick={() => setExpandedGroups(new Set())} className="text-xs" style={{ color: '#4f73b3' }}>Collapse all</button>
                </div>

                {filteredGroups.map(group => {
                  const isExpanded = expandedGroups.has(group.key)
                  const groupIds = group.videos.slice(1).map(v => v.videoId)
                  const groupAllSelected = groupIds.every(id => selected.has(id))
                  const groupSomeSelected = groupIds.some(id => selected.has(id))

                  return (
                    <div key={group.key} className="rounded-lg overflow-hidden" style={{ border: '1px solid #0e2a6e', background: '#071847' }}>
                      <div
                        className="flex items-center gap-2 px-4 py-3 cursor-pointer"
                        style={{ background: '#0a1f5c' }}
                        onClick={() => toggleExpand(group.key)}
                      >
                        <button
                          className="flex-shrink-0"
                          onClick={e => { e.stopPropagation(); toggleGroup(group.videos) }}
                        >
                          {groupAllSelected
                            ? <CheckSquare size={14} style={{ color: '#60a5fa' }} />
                            : groupSomeSelected
                              ? <CheckSquare size={14} style={{ color: '#4f73b3' }} />
                              : <Square size={14} style={{ color: '#4f73b3' }} />}
                        </button>
                        {isExpanded ? <ChevronDown size={14} style={{ color: '#4f73b3' }} /> : <ChevronRight size={14} style={{ color: '#4f73b3' }} />}
                        <span className="text-xs font-semibold text-white flex-1 truncate">{group.title}</span>
                        <span className="text-xs flex-shrink-0" style={{ color: '#fb7185' }}>{group.videos.length} copies</span>
                        <span className="text-xs flex-shrink-0" style={{ color: '#4f73b3' }}>{group.videos[0]?.channelTitle}</span>
                      </div>

                      {isExpanded && (
                        <div className="divide-y" style={{ borderColor: '#0e2a6e' }}>
                          {group.videos.map((video, idx) => {
                            const isOldest = idx === 0
                            const isSelected = selected.has(video.videoId)
                            return (
                              <div
                                key={video.videoId}
                                className="flex items-center gap-3 px-4 py-2.5"
                                style={{ background: isSelected ? '#0d2660' : undefined }}
                              >
                                <button
                                  className="flex-shrink-0"
                                  onClick={() => !isOldest && toggleVideo(video.videoId)}
                                  disabled={isOldest}
                                  style={{ opacity: isOldest ? 0.3 : 1 }}
                                >
                                  {isSelected
                                    ? <CheckSquare size={14} style={{ color: '#60a5fa' }} />
                                    : <Square size={14} style={{ color: '#4f73b3' }} />}
                                </button>

                                {video.thumbnailUrl
                                  ? <img src={video.thumbnailUrl} alt="" className="w-12 h-9 object-cover rounded flex-shrink-0" />
                                  : <div className="w-12 h-9 rounded flex-shrink-0" style={{ background: '#0e2a6e' }} />}

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-white truncate">{video.title}</span>
                                    {isOldest && (
                                      <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0 font-semibold" style={{ background: '#14532d', color: '#4ade80' }}>
                                        oldest — keep
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-xs" style={{ color: '#4f73b3' }}>{video.channelTitle}</span>
                                    <span className="text-xs" style={{ color: '#4f73b3' }}>•</span>
                                    <span className="text-xs" style={{ color: '#4f73b3' }}>{formatDate(video.publishedAt)}</span>
                                  </div>
                                </div>

                                <a
                                  href={`https://www.youtube.com/watch?v=${video.videoId}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex-shrink-0 p-1 rounded hover:bg-white/10"
                                  title="Open on YouTube"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <ExternalLink size={12} style={{ color: '#4f73b3' }} />
                                </a>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* Disclosure results */}
        {scanComplete && mode === 'disclosure' && (
          <>
            {filteredDisclosure.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <ShieldCheck size={24} style={{ color: '#4ade80' }} />
                <p className="text-sm font-semibold" style={{ color: '#4ade80' }}>All videos have disclosure set</p>
                <p className="text-xs" style={{ color: '#4f73b3' }}>
                  {disclosureVideos.length === 0
                    ? 'Every video on your channels has the Altered/Synthetic Content disclosure label.'
                    : 'No videos match the current filters.'}
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-semibold" style={{ color: '#fb7185' }}>
                    {filteredDisclosure.length} video{filteredDisclosure.length !== 1 ? 's' : ''} missing disclosure
                  </span>
                </div>
                <div className="space-y-1">
                  {filteredDisclosure.map(video => {
                    const isSelected = selected.has(video.videoId)
                    return (
                      <div
                        key={video.videoId}
                        className="flex items-center gap-3 px-4 py-2.5 rounded-lg cursor-pointer"
                        style={{ background: isSelected ? '#0d2660' : '#071847', border: '1px solid #0e2a6e' }}
                        onClick={() => toggleVideo(video.videoId)}
                      >
                        <button className="flex-shrink-0" onClick={e => { e.stopPropagation(); toggleVideo(video.videoId) }}>
                          {isSelected
                            ? <CheckSquare size={14} style={{ color: '#60a5fa' }} />
                            : <Square size={14} style={{ color: '#4f73b3' }} />}
                        </button>

                        {video.thumbnailUrl
                          ? <img src={video.thumbnailUrl} alt="" className="w-12 h-9 object-cover rounded flex-shrink-0" />
                          : <div className="w-12 h-9 rounded flex-shrink-0" style={{ background: '#0e2a6e' }} />}

                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-white truncate">{video.title || '(no title)'}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs" style={{ color: '#4f73b3' }}>{video.channelTitle}</span>
                            <span className="text-xs" style={{ color: '#4f73b3' }}>•</span>
                            <span className="text-xs" style={{ color: '#4f73b3' }}>{formatDate(video.publishedAt)}</span>
                          </div>
                        </div>

                        <a
                          href={`https://www.youtube.com/watch?v=${video.videoId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-shrink-0 p-1 rounded hover:bg-white/10"
                          title="Open on YouTube"
                          onClick={e => e.stopPropagation()}
                        >
                          <ExternalLink size={12} style={{ color: '#4f73b3' }} />
                        </a>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
