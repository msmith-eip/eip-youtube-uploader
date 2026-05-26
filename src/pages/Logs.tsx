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

// Dark-theme level config — all colors readable on navy background
const LEVEL_CONFIG = {
  error: {
    color:       '#fb7185',
    bg:          'rgba(136,19,55,0.18)',
    border:      'rgba(178,34,52,0.4)',
    badgeBg:     'rgba(178,34,52,0.25)',
    badgeText:   '#fb7185',
    badgeBorder: 'rgba(178,34,52,0.5)',
    icon:        AlertCircle,
    label:       'ERROR',
  },
  warn: {
    color:       '#efc965',
    bg:          'rgba(201,169,97,0.1)',
    border:      'rgba(201,169,97,0.35)',
    badgeBg:     'rgba(201,169,97,0.2)',
    badgeText:   '#efc965',
    badgeBorder: 'rgba(201,169,97,0.4)',
    icon:        AlertTriangle,
    label:       'WARN',
  },
  info: {
    color:       '#9db1d5',
    bg:          'rgba(26,68,128,0.2)',
    border:      'rgba(45,90,158,0.4)',
    badgeBg:     'rgba(26,68,128,0.3)',
    badgeText:   '#c5d0e6',
    badgeBorder: 'rgba(45,90,158,0.5)',
    icon:        Info,
    label:       'INFO',
  },
  success: {
    color:       '#4ade80',
    bg:          'rgba(34,197,94,0.08)',
    border:      'rgba(34,197,94,0.3)',
    badgeBg:     'rgba(34,197,94,0.15)',
    badgeText:   '#4ade80',
    badgeBorder: 'rgba(34,197,94,0.35)',
    icon:        CheckCircle2,
    label:       'OK',
  },
}

function formatTime(iso: string, showDate = false) {
  try {
    const d = new Date(iso)
    const time = d.toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' })
    if (!showDate) return time
    const date = d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
    return `${date} ${time}`
  } catch { return iso }
}

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<'all' | 'error' | 'warn' | 'info' | 'success'>('all')
  const [dateFilter, setDateFilter] = useState<'today' | 'all'>('today')
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

  const todayStr = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local time
  const filtered = logs.filter(log => {
    const matchLevel = filter === 'all' || log.level === filter
    const matchSearch = !search ||
      log.message.toLowerCase().includes(search.toLowerCase()) ||
      log.category.toLowerCase().includes(search.toLowerCase()) ||
      (log.detail || '').toLowerCase().includes(search.toLowerCase())
    const matchDate = dateFilter === 'all' || (
      log.timestamp && new Date(log.timestamp).toLocaleDateString('en-CA') === todayStr
    )
    return matchLevel && matchSearch && matchDate
  })

  const counts = {
    error:   filtered.filter(l => l.level === 'error').length,
    warn:    filtered.filter(l => l.level === 'warn').length,
    info:    filtered.filter(l => l.level === 'info').length,
    success: filtered.filter(l => l.level === 'success').length,
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
    <div className="h-full flex flex-col p-6 gap-4" style={{ background: '#061540' }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: '#B22234', boxShadow: '0 0 12px rgba(178,34,52,0.4)' }}
          >
            <Terminal size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Activity Logs</h1>
            <p className="text-xs" style={{ color: '#7491c4' }}>{logs.length} total entries — real-time capture</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} className="btn-ghost text-xs py-1.5 px-3">
            <RefreshCw size={13} />
            Refresh
          </button>
          <button onClick={handleCopyAll} className="btn-ghost text-xs py-1.5 px-3">
            {copied ? <Check size={13} style={{ color: '#4ade80' }} /> : <Copy size={13} />}
            {copied ? 'Copied!' : 'Copy All'}
          </button>
          <button onClick={handleExport} className="btn-ghost text-xs py-1.5 px-3">
            <Download size={13} />
            Export
          </button>
          <button
            onClick={handleClear}
            className="btn-ghost text-xs py-1.5 px-3"
            style={{ color: '#fb7185' }}
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
              className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
              style={{
                background: isActive ? cfg.bg : 'rgba(15,47,97,0.6)',
                border: `1px solid ${isActive ? cfg.border : 'rgba(45,90,158,0.35)'}`,
              }}
            >
              <Icon size={16} style={{ color: isActive ? cfg.color : '#7491c4' }} />
              <div className="text-left">
                <div
                  className="text-lg font-bold leading-none tabular-nums"
                  style={{ color: isActive ? cfg.color : '#ffffff' }}
                >
                  {count}
                </div>
                <div
                  className="text-[10px] uppercase tracking-wider mt-0.5 font-semibold"
                  style={{ color: isActive ? cfg.color : '#7491c4' }}
                >
                  {cfg.label}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Search + Filter Bar */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Today / All date toggle */}
        <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'rgba(45,90,158,0.5)' }}>
          {(['today', 'all'] as const).map(d => (
            <button
              key={d}
              onClick={() => setDateFilter(d)}
              className="px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                background: dateFilter === d ? '#B22234' : 'rgba(15,47,97,0.6)',
                color: dateFilter === d ? '#ffffff' : '#7491c4',
              }}
            >
              {d === 'today' ? 'Today' : 'All Time'}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#4f73b3' }} />
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
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: '#4f73b3' }}
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: '#7491c4' }}>
          <span className="font-medium">{filtered.length} shown</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={e => setAutoScroll(e.target.checked)}
              className="w-3 h-3 accent-red-600"
            />
            Auto-scroll
          </label>
        </div>
      </div>

      {/* Log List */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto rounded-xl font-mono text-xs"
        style={{
          background: '#0a2050',
          border: '1px solid rgba(45,90,158,0.4)',
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-32" style={{ color: '#7491c4' }}>
            <RefreshCw size={16} className="animate-spin mr-2" /> Loading logs...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2" style={{ color: '#7491c4' }}>
            <Terminal size={24} className="opacity-30" />
            <span>{search || filter !== 'all' ? 'No logs match your filter' : 'No logs yet — activity will appear here'}</span>
          </div>
        ) : (
          <div>
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
                    style={{ borderBottom: '1px solid rgba(26,58,110,0.6)' }}
                    onClick={() => log.detail && setExpandedId(isExpanded ? null : log.id)}
                  >
                    <div
                      className="flex items-start gap-3 px-4 py-2.5 transition-colors"
                      style={{ background: isExpanded ? 'rgba(26,68,128,0.2)' : 'transparent' }}
                      onMouseEnter={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'rgba(26,68,128,0.15)' }}
                      onMouseLeave={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      {/* Level icon */}
                      <Icon size={13} className="flex-shrink-0 mt-0.5" style={{ color: cfg.color }} />
                      {/* Time */}
                      <span className={`flex-shrink-0 ${dateFilter === 'all' ? 'w-36' : 'w-20'}`} style={{ color: '#7491c4' }}>{formatTime(log.timestamp, dateFilter === 'all')}</span>
                      {/* Category badge */}
                      <span
                        className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide"
                        style={{
                          background: cfg.badgeBg,
                          color: cfg.badgeText,
                          border: `1px solid ${cfg.badgeBorder}`,
                        }}
                      >
                        {log.category}
                      </span>
                      {/* Message */}
                      <span
                        className="flex-1 break-all"
                        style={{
                          color: log.level === 'error'   ? '#fda4af' :
                                 log.level === 'warn'    ? '#efc965' :
                                 log.level === 'success' ? '#4ade80' :
                                 '#c5d0e6',
                          fontWeight: log.level === 'error' ? 500 : 400,
                        }}
                      >
                        {log.message}
                      </span>
                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button
                          onClick={e => { e.stopPropagation(); handleCopyEntry(log) }}
                          className="p-1 rounded transition-colors"
                          style={{ color: '#7491c4' }}
                          title="Copy this entry"
                        >
                          <Copy size={11} />
                        </button>
                        {log.detail && (
                          <button className="p-1 rounded transition-colors" style={{ color: '#7491c4' }}>
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
                        <pre
                          className="rounded-lg p-3 text-[11px] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed"
                          style={{
                            background: 'rgba(136,19,55,0.15)',
                            border: '1px solid rgba(178,34,52,0.35)',
                            color: '#fda4af',
                          }}
                        >
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
      <div className="flex-shrink-0 text-[11px] flex items-center gap-2" style={{ color: '#7491c4' }}>
        <Info size={11} />
        <span>
          When reporting issues, click <strong style={{ color: '#c5d0e6' }}>Copy All</strong> to copy logs to clipboard.
          Use <strong style={{ color: '#c5d0e6' }}>Export</strong> to save logs as a text file.
        </span>
      </div>
    </div>
  )
}
