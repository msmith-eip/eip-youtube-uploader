import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle, ExternalLink, Trash2, Search,
  Calendar, Youtube, RefreshCw, XCircle, FolderOpen, AlertCircle
} from 'lucide-react'
import type { UploadHistory } from '../types'

type FilterTab = 'all' | 'success' | 'failed'

export default function History() {
  const [history, setHistory] = useState<UploadHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterChannel, setFilterChannel] = useState('')
  const [filterTab, setFilterTab] = useState<FilterTab>('all')

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    setLoading(true)
    try {
      if (window.electronAPI) {
        const h = await window.electronAPI.history.get()
        setHistory(h || [])
      }
    } finally {
      setLoading(false)
    }
  }

  const handleClear = async () => {
    if (!confirm('Clear all upload history? This cannot be undone.')) return
    if (window.electronAPI) {
      await window.electronAPI.history.clear()
    }
    setHistory([])
  }

  const handleBrowse = async (item: UploadHistory) => {
    if (!window.electronAPI) return
    await new Promise(r => setTimeout(r, 150))
    let result: any
    try {
      result = await window.electronAPI.dialog.openVideos()
    } catch (e) {
      console.error('Browse dialog error:', e)
      return
    }
    if (!result || result.canceled || !result.filePaths || !result.filePaths.length) return
    const newPath = result.filePaths[0]
    setHistory(prev => prev.map(h =>
      h.id === item.id ? { ...h, filePath: newPath } : h
    ))
    alert(`File located:\n${newPath}\n\nGo to Upload Queue and add this file to retry the upload.`)
  }

  const successCount = history.filter(h => !h.status || h.status === 'success').length
  const failedCount = history.filter(h => h.status === 'failed').length

  const channels = [...new Set(history.map(h => h.channel))].filter(Boolean)

  const filtered = history.filter(item => {
    if (filterTab === 'success' && item.status === 'failed') return false
    if (filterTab === 'failed' && item.status !== 'failed') return false
    if (filterChannel && item.channel !== filterChannel) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        item.title.toLowerCase().includes(q) ||
        item.channel.toLowerCase().includes(q) ||
        (item.error || '').toLowerCase().includes(q)
      )
    }
    return true
  })

  // Group by date
  const grouped = filtered.reduce((acc, item) => {
    const date = new Date(item.uploadedAt).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })
    if (!acc[date]) acc[date] = []
    acc[date].push(item)
    return acc
  }, {} as Record<string, UploadHistory[]>)

  const tabClass = (tab: FilterTab) =>
    `px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none ${
      filterTab === tab
        ? 'bg-brand-600 text-white shadow-sm'
        : 'text-surface-muted hover:text-surface-ink hover:bg-surface-cream'
    }`

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-surface-divider bg-white">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-bold text-surface-ink">Upload History</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-green-700 font-semibold">{successCount} uploaded</span>
              {failedCount > 0 && (
                <span className="text-xs text-danger-600 font-semibold">• {failedCount} failed</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadHistory} className="btn-secondary text-xs py-1.5">
              <RefreshCw size={13} />
              Refresh
            </button>
            {history.length > 0 && (
              <button onClick={handleClear} className="btn-danger text-xs py-1.5">
                <Trash2 size={13} />
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Filter tabs + search */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-surface-cream rounded-lg p-1 border border-surface-divider">
            <button className={tabClass('all')} onClick={() => setFilterTab('all')}>
              All ({history.length})
            </button>
            <button className={tabClass('success')} onClick={() => setFilterTab('success')}>
              ✓ Uploaded ({successCount})
            </button>
            <button className={tabClass('failed')} onClick={() => setFilterTab('failed')}>
              ✗ Failed ({failedCount})
            </button>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-subtle" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input pl-8 py-1.5 text-xs w-44"
            />
          </div>
          <select
            value={filterChannel}
            onChange={e => setFilterChannel(e.target.value)}
            className="input py-1.5 text-xs w-44"
          >
            <option value="">All channels</option>
            {channels.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  className="w-2 h-2 rounded-full bg-brand-600"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </div>
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Youtube size={40} className="text-surface-subtle mb-4" />
            <h3 className="text-base font-semibold text-surface-ink mb-2">No upload history</h3>
            <p className="text-sm text-surface-muted">Uploaded and failed videos will appear here</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Search size={32} className="text-surface-subtle mb-3" />
            <p className="text-sm text-surface-muted">No results match your filters</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {Object.entries(grouped).map(([date, items]) => (
              <motion.div
                key={date}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {/* Date separator */}
                <div className="flex items-center gap-2 mb-3">
                  <Calendar size={13} className="text-surface-muted" />
                  <span className="text-xs font-bold text-surface-body uppercase tracking-wider">{date}</span>
                  <span className="text-xs text-surface-muted">
                    ({items.filter(i => !i.status || i.status === 'success').length} uploaded
                    {items.filter(i => i.status === 'failed').length > 0 &&
                      `, ${items.filter(i => i.status === 'failed').length} failed`})
                  </span>
                  <div className="flex-1 h-px bg-surface-divider" />
                </div>

                <div className="flex flex-col gap-1.5">
                  {items.map(item => {
                    const isFailed = item.status === 'failed'
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border transition-all group ${
                          isFailed
                            ? 'bg-danger-50 border-danger-200 hover:border-danger-300'
                            : 'bg-white border-surface-divider hover:border-brand-300 hover:bg-surface-cream'
                        }`}
                      >
                        {/* Status icon */}
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          isFailed ? 'bg-danger-100' : 'bg-green-100'
                        }`}>
                          {isFailed
                            ? <XCircle size={14} className="text-danger-600" />
                            : <CheckCircle size={14} className="text-green-600" />
                          }
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-surface-ink break-words leading-relaxed">
                            {item.title}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-[10px] text-surface-muted font-medium">{item.channel}</span>
                            <span className="text-[10px] text-surface-subtle">•</span>
                            <span className={`text-[10px] font-semibold ${
                              item.privacy === 'unlisted' ? 'text-gold-600' :
                              item.privacy === 'private' ? 'text-danger-600' :
                              'text-green-700'
                            }`}>{item.privacy}</span>
                            {isFailed && (
                              <>
                                <span className="text-[10px] text-surface-subtle">•</span>
                                <span className="text-[10px] text-danger-600 font-bold">Failed</span>
                              </>
                            )}
                          </div>

                          {/* Error message */}
                          {isFailed && item.error && (
                            <div className="flex items-start gap-1 mt-1.5 bg-danger-100 rounded-lg px-2 py-1.5 border border-danger-200">
                              <AlertCircle size={10} className="text-danger-600 flex-shrink-0 mt-0.5" />
                              <p className="text-[10px] text-danger-700 break-words leading-relaxed">{item.error}</p>
                            </div>
                          )}

                          {/* File path for failed */}
                          {isFailed && item.filePath && (
                            <p className="text-[10px] text-surface-muted mt-1 break-all leading-relaxed">{item.filePath}</p>
                          )}
                        </div>

                        {/* Time */}
                        <div className="text-[10px] text-surface-muted font-medium flex-shrink-0 mt-0.5">
                          {new Date(item.uploadedAt).toLocaleTimeString('en-US', {
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                          {isFailed ? (
                            <button
                              onClick={() => handleBrowse(item)}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-surface-divider hover:bg-surface-cream hover:border-brand-300 text-surface-body hover:text-surface-ink transition-colors"
                              title="Locate video file"
                            >
                              <FolderOpen size={11} />
                              <span className="text-[10px] font-medium">Browse</span>
                            </button>
                          ) : (
                            item.youtubeUrl && !item.id.startsWith('demo') && (
                              <a
                                href={item.youtubeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-surface-divider hover:bg-surface-cream hover:border-brand-300 text-surface-body hover:text-surface-ink"
                              >
                                <ExternalLink size={11} />
                                <span className="text-[10px] font-medium">View</span>
                              </a>
                            )
                          )}
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
