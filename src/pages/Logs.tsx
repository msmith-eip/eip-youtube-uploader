import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Terminal, Trash2, Download, Copy, Check, RefreshCw,
  AlertCircle, AlertTriangle, Info, CheckCircle2, Filter,
  ChevronDown, ChevronUp, X, Search
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
  error:   { color: 'text-accent-red',    bg: 'bg-accent-red/10',    border: 'border-accent-red/20',    icon: AlertCircle,    label: 'ERROR'   },
  warn:    { color: 'text-yellow-400',    bg: 'bg-yellow-400/10',    border: 'border-yellow-400/20',    icon: AlertTriangle,  label: 'WARN'    },
  info:    { color: 'text-brand-400',     bg: 'bg-brand-400/10',     border: 'border-brand-400/20',     icon: Info,           label: 'INFO'    },
  success: { color: 'text-accent-green',  bg: 'bg-accent-green/10',  border: 'border-accent-green/20',  icon: CheckCircle2,   label: 'OK'      },
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { return iso }
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return '' }
}

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<'all' | 'error' | 'warn' | 'info' | 'success'>('all')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI

  // Load initial logs
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

  // Listen for real-time new log entries
  useEffect(() => {
    if (!isElectron) return
    const handler = (entry: LogEntry) => {
      setLogs(prev => [entry, ...prev].slice(0, 2000))
    }
    ;(window.electronAPI as any).logs.onNewEntry(handler)
    return () => {
      ;(window.electronAPI as any).logs.removeListeners()
    }
  }, [isElectron])

  // Auto-scroll to top (newest logs are at top)
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
    error: logs.filter(l => l.level === 'error').length,
    warn: logs.filter(l => l.level === 'warn').length,
    info: logs.filter(l => l.level === 'info').length,
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
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-600 to-accent-purple flex items-center justify-center shadow-glow-sm">
            <Terminal size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-dark-50">Activity Logs</h1>
            <p className="text-xs text-dark-400">{logs.length} total entries — real-time capture</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="btn-ghost px-3 py-2 text-xs flex items-center gap-1.5"
            title="Refresh logs"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
          <button
            onClick={handleCopyAll}
            className="btn-ghost px-3 py-2 text-xs flex items-center gap-1.5"
            title="Copy all visible logs to clipboard"
          >
            {copied ? <Check size={13} className="text-accent-green" /> : <Copy size={13} />}
            {copied ? 'Copied!' : 'Copy All'}
          </button>
          <button
            onClick={handleExport}
            className="btn-ghost px-3 py-2 text-xs flex items-center gap-1.5"
            title="Export logs to file"
          >
            <Download size={13} />
            Export
          </button>
          <button
            onClick={handleClear}
            className="btn-ghost px-3 py-2 text-xs flex items-center gap-1.5 text-accent-red hover:bg-accent-red/10"
            title="Clear all logs"
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
          return (
            <button
              key={level}
              onClick={() => setFilter(prev => prev === level ? 'all' : level)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                filter === level
                  ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                  : 'bg-dark-800 border-dark-700 text-dark-400 hover:border-dark-600'
              }`}
            >
              <Icon size={16} className={filter === level ? cfg.color : 'text-dark-500'} />
              <div className="text-left">
                <div className={`text-lg font-bold leading-none ${filter === level ? cfg.color : 'text-dark-200'}`}>
                  {count}
                </div>
                <div className="text-[10px] uppercase tracking-wider mt-0.5 opacity-70">{cfg.label}</div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Search + Filter Bar */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input
            type="text"
            placeholder="Search logs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-dark-800 border border-dark-700 rounded-lg pl-9 pr-4 py-2 text-sm text-dark-200 placeholder-dark-500 focus:outline-none focus:border-brand-500 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300">
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-dark-400">
          <span>{filtered.length} shown</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={e => setAutoScroll(e.target.checked)}
              className="w-3 h-3 accent-brand-500"
            />
            Auto-scroll
          </label>
        </div>
      </div>

      {/* Log List */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto rounded-xl border border-dark-700 bg-dark-900 font-mono text-xs"
      >
        {loading ? (
          <div className="flex items-center justify-center h-32 text-dark-500">
            <RefreshCw size={16} className="animate-spin mr-2" /> Loading logs...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-dark-500 gap-2">
            <Terminal size={24} className="opacity-30" />
            <span>{search || filter !== 'all' ? 'No logs match your filter' : 'No logs yet — activity will appear here'}</span>
          </div>
        ) : (
          <div className="divide-y divide-dark-800">
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
                    <div className={`flex items-start gap-3 px-4 py-2.5 hover:bg-dark-800/50 transition-colors ${isExpanded ? 'bg-dark-800/30' : ''}`}>
                      {/* Level icon */}
                      <Icon size={13} className={`${cfg.color} flex-shrink-0 mt-0.5`} />
                      {/* Time */}
                      <span className="text-dark-500 flex-shrink-0 w-20">{formatTime(log.timestamp)}</span>
                      {/* Category badge */}
                      <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${cfg.bg} ${cfg.color}`}>
                        {log.category}
                      </span>
                      {/* Message */}
                      <span className={`flex-1 ${log.level === 'error' ? 'text-accent-red' : log.level === 'warn' ? 'text-yellow-400' : 'text-dark-200'} break-all`}>
                        {log.message}
                      </span>
                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button
                          onClick={e => { e.stopPropagation(); handleCopyEntry(log) }}
                          className="p-1 rounded hover:bg-dark-700 text-dark-500 hover:text-dark-200"
                          title="Copy this entry"
                        >
                          <Copy size={11} />
                        </button>
                        {log.detail && (
                          <button className="p-1 rounded hover:bg-dark-700 text-dark-500 hover:text-dark-200">
                            {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Expanded detail (stack trace etc) */}
                    {isExpanded && log.detail && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-4 pb-3 pt-0"
                      >
                        <pre className="bg-dark-950 border border-dark-700 rounded-lg p-3 text-[11px] text-accent-red/80 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
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
        <div ref={bottomRef} />
      </div>

      {/* Footer tip */}
      <div className="flex-shrink-0 text-[11px] text-dark-500 flex items-center gap-2">
        <Info size={11} />
        <span>
          When reporting issues, click <strong className="text-dark-400">Copy All</strong> to copy logs to clipboard, then paste them in your support message.
          Use <strong className="text-dark-400">Export</strong> to save logs as a text file.
        </span>
      </div>
    </div>
  )
}
