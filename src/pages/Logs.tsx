import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Terminal, Trash2, Download, Copy, Check, RefreshCw,
  AlertCircle, AlertTriangle, Info, CheckCircle2, X, Search,
  ChevronDown, ChevronUp
} from 'lucide-react'

interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'success'
  category: string
  message: string
  detail?: string
}

const LEVEL_CONFIG = {
  error:   {
    color:  'text-danger-700',
    bg:     'bg-danger-50',
    border: 'border-danger-200',
    badge:  'bg-danger-100 text-danger-700 border border-danger-200',
    icon:   AlertCircle,
    label:  'ERROR',
    count_bg: 'bg-danger-50 border-danger-200 text-danger-700',
  },
  warn:    {
    color:  'text-gold-700',
    bg:     'bg-gold-50',
    border: 'border-gold-200',
    badge:  'bg-gold-100 text-gold-700 border border-gold-200',
    icon:   AlertTriangle,
    label:  'WARN',
    count_bg: 'bg-gold-50 border-gold-200 text-gold-700',
  },
  info:    {
    color:  'text-brand-700',
    bg:     'bg-brand-50',
    border: 'border-brand-200',
    badge:  'bg-brand-100 text-brand-700 border border-brand-200',
    icon:   Info,
    label:  'INFO',
    count_bg: 'bg-brand-50 border-brand-200 text-brand-700',
  },
  success: {
    color:  'text-green-700',
    bg:     'bg-green-50',
    border: 'border-green-200',
    badge:  'bg-green-100 text-green-700 border border-green-200',
    icon:   CheckCircle2,
    label:  'OK',
    count_bg: 'bg-green-50 border-green-200 text-green-700',
  },
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { return iso }
}

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<'all' | 'error' | 'warn' | 'info' | 'success'>('all')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [loading, setLoading] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI

  useEffect(() => {
    async function loadLogs() {
      if (!isElectron) { setLoading(false); return }
      try {
        const all = await (window.electronAPI as any).logs.getAll()
        setLogs(all || [])
      } catch (e) {
        console.error('Failed to load logs', e)
      } finally {
        setLoading(false)
      }
    }
    loadLogs()
  }, [isElectron])

  useEffect(() => {
    if (!isElectron) return
    const handler = (entry: LogEntry) => {
      setLogs(prev => [entry, ...prev].slice(0, 5000))
    }
    ;(window.electronAPI as any).logs.onNewEntry(handler)
    return () => {
      ;(window.electronAPI as any).logs.removeListeners()
    }
  }, [isElectron])

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = 0
    }
  }, [logs, autoScroll])

  const filtered = logs.filter(log => {
    const matchLevel = filter === 'all' || log.level === filter
    const matchSearch = !search ||
      log.message.toLowerCase().includes(search.toLowerCase()) ||
      log.category.toLowerCase().includes(search.toLowerCase()) ||
      (log.detail || '').toLowerCase().includes(search.toLowerCase())
    return matchLevel && matchSearch
  })

  const counts = {
    error:   logs.filter(l => l.level === 'error').length,
    warn:    logs.filter(l => l.level === 'warn').length,
    info:    logs.filter(l => l.level === 'info').length,
    success: logs.filter(l => l.level === 'success').length,
  }

  const handleCopyAll = useCallback(async () => {
    const text = filtered.map(e =>
      `[${e.timestamp}] [${e.level.toUpperCase()}] [${e.category}] ${e.message}${e.detail ? '\n  ' + e.detail : ''}`
    ).join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [filtered])

  const handleCopyEntry = useCallback(async (log: LogEntry) => {
    const text = `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.category}] ${log.message}${log.detail ? '\n' + log.detail : ''}`
    await navigator.clipboard.writeText(text)
  }, [])

  const handleExport = useCallback(async () => {
    if (!isElectron) return
    await (window.electronAPI as any).logs.export()
  }, [isElectron])

  const handleClear = useCallback(async () => {
    if (!isElectron) return
    await (window.electronAPI as any).logs.clear()
    setLogs([])
  }, [isElectron])

  const handleRefresh = useCallback(async () => {
    if (!isElectron) return
    const all = await (window.electronAPI as any).logs.getAll()
    setLogs(all || [])
  }, [isElectron])

  return (
    <div className="h-full flex flex-col p-6 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center shadow-glow-sm">
            <Terminal size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-surface-ink">Activity Logs</h1>
            <p className="text-xs text-surface-muted">{logs.length} total entries — real-time capture</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} className="btn-ghost text-xs py-1.5 px-3">
            <RefreshCw size={13} />
            Refresh
          </button>
          <button onClick={handleCopyAll} className="btn-ghost text-xs py-1.5 px-3">
            {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
            {copied ? 'Copied!' : 'Copy All'}
          </button>
          <button onClick={handleExport} className="btn-ghost text-xs py-1.5 px-3">
            <Download size={13} />
            Export
          </button>
          <button
            onClick={handleClear}
            className="btn-ghost text-xs py-1.5 px-3 text-danger-600 hover:bg-danger-50 hover:text-danger-700"
          >
            <Trash2 size={13} />
            Clear
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3 flex-shrink-0">
        {(['error', 'warn', 'info', 'success'] as const).map(level => {
          const cfg = LEVEL_CONFIG[level]
          const Icon = cfg.icon
          const count = counts[level]
          const isActive = filter === level
          return (
            <button
              key={level}
              onClick={() => setFilter(prev => prev === level ? 'all' : level)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                isActive
                  ? `${cfg.bg} ${cfg.border} shadow-sm`
                  : 'bg-white border-surface-divider hover:bg-surface-cream hover:border-surface-border'
              }`}
            >
              <Icon size={16} className={isActive ? cfg.color : 'text-surface-muted'} />
              <div className="text-left">
                <div className={`text-lg font-bold leading-none tabular-nums ${isActive ? cfg.color : 'text-surface-ink'}`}>
                  {count}
                </div>
                <div className={`text-[10px] uppercase tracking-wider mt-0.5 font-semibold ${isActive ? cfg.color : 'text-surface-muted'}`}>
                  {cfg.label}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Search + Filter Bar */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-subtle" />
          <input
            type="text"
            placeholder="Search logs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-9 pr-4 py-2 text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-subtle hover:text-surface-muted"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-surface-muted">
          <span className="font-medium">{filtered.length} shown</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={e => setAutoScroll(e.target.checked)}
              className="w-3 h-3 accent-brand-600"
            />
            Auto-scroll
          </label>
        </div>
      </div>

      {/* Log List */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto rounded-xl border border-surface-divider bg-white font-mono text-xs shadow-sm"
      >
        {loading ? (
          <div className="flex items-center justify-center h-32 text-surface-muted">
            <RefreshCw size={16} className="animate-spin mr-2" /> Loading logs...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-surface-muted gap-2">
            <Terminal size={24} className="opacity-30" />
            <span>{search || filter !== 'all' ? 'No logs match your filter' : 'No logs yet — activity will appear here'}</span>
          </div>
        ) : (
          <div className="divide-y divide-surface-divider">
            <AnimatePresence initial={false}>
              {filtered.map((log) => {
                const cfg = LEVEL_CONFIG[log.level]
                const Icon = cfg.icon
                const isExpanded = expandedId === log.id
                return (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15 }}
                    className={`group ${log.detail ? 'cursor-pointer' : ''}`}
                    onClick={() => log.detail && setExpandedId(isExpanded ? null : log.id)}
                  >
                    <div className={`flex items-start gap-3 px-4 py-2.5 hover:bg-surface-cream transition-colors ${isExpanded ? 'bg-surface-cream' : ''}`}>
                      {/* Level icon */}
                      <Icon size={13} className={`${cfg.color} flex-shrink-0 mt-0.5`} />
                      {/* Time */}
                      <span className="text-surface-muted flex-shrink-0 w-20">{formatTime(log.timestamp)}</span>
                      {/* Category badge */}
                      <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${cfg.badge}`}>
                        {log.category}
                      </span>
                      {/* Message */}
                      <span className={`flex-1 ${
                        log.level === 'error' ? 'text-danger-700 font-medium' :
                        log.level === 'warn'  ? 'text-gold-700' :
                        log.level === 'success' ? 'text-green-700' :
                        'text-surface-body'
                      } break-all`}>
                        {log.message}
                      </span>
                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button
                          onClick={e => { e.stopPropagation(); handleCopyEntry(log) }}
                          className="p-1 rounded hover:bg-surface-divider text-surface-muted hover:text-surface-ink"
                          title="Copy this entry"
                        >
                          <Copy size={11} />
                        </button>
                        {log.detail && (
                          <button className="p-1 rounded hover:bg-surface-divider text-surface-muted hover:text-surface-ink">
                            {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Expanded detail */}
                    {isExpanded && log.detail && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-4 pb-3 pt-0"
                      >
                        <pre className="bg-surface-cream border border-surface-divider rounded-lg p-3 text-[11px] text-danger-700 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                          {log.detail}
                        </pre>
                      </motion.div>
                    )}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Footer tip */}
      <div className="flex-shrink-0 text-[11px] text-surface-muted flex items-center gap-2">
        <Info size={11} />
        <span>
          When reporting issues, click <strong className="text-surface-body">Copy All</strong> to copy logs to clipboard.
          Use <strong className="text-surface-body">Export</strong> to save logs as a text file.
        </span>
      </div>
    </div>
  )
}
