import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle, ExternalLink, Trash2, Search, Download,
  Calendar, Youtube, RefreshCw
} from 'lucide-react'
import type { UploadHistory } from '../types'

export default function History() {
  const [history, setHistory] = useState<UploadHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterChannel, setFilterChannel] = useState('')

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

  const channels = [...new Set(history.map(h => h.channel))].filter(Boolean)

  const filtered = history.filter(item => {
    if (filterChannel && item.channel !== filterChannel) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return item.title.toLowerCase().includes(q) || item.channel.toLowerCase().includes(q)
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-dark-800 bg-dark-950">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-dark-50">Upload History</h2>
            <p className="text-xs text-dark-500 mt-0.5">{history.length} total uploads</p>
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

        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
            <input
              type="text"
              placeholder="Search uploads..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input pl-8 py-1.5 text-xs"
            />
          </div>
          <select
            value={filterChannel}
            onChange={e => setFilterChannel(e.target.value)}
            className="input py-1.5 text-xs w-48"
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
                  className="w-2 h-2 rounded-full bg-brand-500"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </div>
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Youtube size={40} className="text-dark-600 mb-4" />
            <h3 className="text-base font-semibold text-dark-400 mb-2">No upload history</h3>
            <p className="text-sm text-dark-600">Uploaded videos will appear here</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {Object.entries(grouped).map(([date, items]) => (
              <motion.div
                key={date}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Calendar size={13} className="text-dark-500" />
                  <span className="text-xs font-semibold text-dark-400 uppercase tracking-wider">{date}</span>
                  <span className="text-xs text-dark-600">({items.length} uploads)</span>
                  <div className="flex-1 h-px bg-dark-800" />
                </div>

                <div className="flex flex-col gap-1.5">
                  {items.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-dark-800 border border-dark-700 hover:border-dark-600 transition-all group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-accent-green/10 flex items-center justify-center flex-shrink-0">
                        <CheckCircle size={14} className="text-accent-green" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-dark-100 truncate">{item.title}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-dark-500">{item.channel}</span>
                          <span className="text-[10px] text-dark-700">•</span>
                          <span className={`text-[10px] ${
                            item.privacy === 'unlisted' ? 'text-accent-yellow' :
                            item.privacy === 'private' ? 'text-accent-red' :
                            'text-accent-green'
                          }`}>{item.privacy}</span>
                        </div>
                      </div>

                      <div className="text-[10px] text-dark-600 flex-shrink-0">
                        {new Date(item.uploadedAt).toLocaleTimeString('en-US', {
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </div>

                      {item.id && !item.id.startsWith('demo') && (
                        <a
                          href={item.youtubeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-2 py-1 rounded-lg bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-dark-100"
                        >
                          <ExternalLink size={11} />
                          <span className="text-[10px]">View</span>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
