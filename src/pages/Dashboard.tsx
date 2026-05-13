import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Upload, CheckCircle, AlertCircle, Clock, Video,
  TrendingUp, Play, ExternalLink, RefreshCw, ChevronRight,
  Tv, Download, Loader2
} from 'lucide-react'
import { useApp } from '../App'
import type { UploadHistory } from '../types'
import * as XLSX from 'xlsx'

export default function Dashboard() {
  const navigate = useNavigate()
  const { auth, channels, uploadJobs, isUploading, refreshChannels } = useApp()
  const [history, setHistory] = useState<UploadHistory[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [exportingVideos, setExportingVideos] = useState(false)
  const [exportStatus, setExportStatus] = useState<string>('')
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)

  useEffect(() => {
    loadHistory()
  }, [])

  const showToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 5000)
  }, [])

  const loadHistory = async () => {
    setLoadingHistory(true)
    try {
      if (window.electronAPI) {
        const h = await window.electronAPI.history.get()
        setHistory(h || [])
      }
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleExportChannelVideos = async () => {
    if (!window.electronAPI) return
    setExportingVideos(true)
    setExportStatus('Connecting to YouTube...')
    try {
      const result = await window.electronAPI.youtube.exportAllVideos()
      if (!result.success || !result.videos) {
        showToast('error', result.error || 'Failed to fetch videos')
        return
      }

      const videos = result.videos
      setExportStatus(`Building Excel file (${videos.length} videos)...`)

      const workbook = XLSX.utils.book_new()

      const rows = videos.map((v: any) => ({
        'CHANNEL': v.channelName,
        'TITLE': v.title,
        'YOUTUBE_URL': v.url,
        'PUBLISHED_DATE': v.publishedAt ? new Date(v.publishedAt).toLocaleDateString() : '',
        'VIDEO_ID': v.videoId,
        'TAGS': v.tags,
        'DESCRIPTION': v.description,
      }))

      const sheet = XLSX.utils.json_to_sheet(rows, {
        header: ['CHANNEL', 'TITLE', 'YOUTUBE_URL', 'PUBLISHED_DATE', 'VIDEO_ID', 'TAGS', 'DESCRIPTION'],
      })
      sheet['!cols'] = [
        { wch: 30 }, { wch: 60 }, { wch: 45 }, { wch: 16 },
        { wch: 16 }, { wch: 50 }, { wch: 80 },
      ]
      XLSX.utils.book_append_sheet(workbook, sheet, 'All Videos')

      const channelGroups = new Map<string, any[]>()
      for (const v of videos) {
        const key = v.channelName
        if (!channelGroups.has(key)) channelGroups.set(key, [])
        channelGroups.get(key)!.push(v)
      }

      for (const [channelName, channelVideos] of channelGroups) {
        const channelRows = channelVideos.map((v: any) => ({
          'TITLE': v.title,
          'YOUTUBE_URL': v.url,
          'PUBLISHED_DATE': v.publishedAt ? new Date(v.publishedAt).toLocaleDateString() : '',
          'VIDEO_ID': v.videoId,
          'TAGS': v.tags,
        }))
        const channelSheet = XLSX.utils.json_to_sheet(channelRows, {
          header: ['TITLE', 'YOUTUBE_URL', 'PUBLISHED_DATE', 'VIDEO_ID', 'TAGS'],
        })
        channelSheet['!cols'] = [
          { wch: 60 }, { wch: 45 }, { wch: 16 }, { wch: 16 }, { wch: 50 },
        ]
        const safeName = channelName.replace(/[\\/*?[\]:]/g, '').substring(0, 31)
        XLSX.utils.book_append_sheet(workbook, channelSheet, safeName)
      }

      const arrayBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx', cellStyles: true })
      const data = Array.from(new Uint8Array(arrayBuffer))
      const today = new Date().toISOString().split('T')[0]
      const saveResult = await (window.electronAPI.fs as any).saveFile({
        defaultPath: `EIP_Channel_Videos_${today}.xlsx`,
        data,
      })

      if (saveResult.canceled) {
        showToast('info', 'Export cancelled')
      } else if (saveResult.success) {
        showToast('success', `Exported ${videos.length} videos to Excel successfully!`)
      } else {
        showToast('error', saveResult.error || 'Failed to save file')
      }
    } catch (err: any) {
      showToast('error', `Export failed: ${err.message}`)
    } finally {
      setExportingVideos(false)
      setExportStatus('')
    }
  }

  const totalUploaded = history.length
  const todayUploaded = history.filter(h => {
    const d = new Date(h.uploadedAt)
    const today = new Date()
    return d.toDateString() === today.toDateString()
  }).length

  const pendingJobs = uploadJobs.filter(j => j.status === 'pending').length

  const stats = [
    {
      label: 'Uploaded Today',
      value: todayUploaded,
      icon: TrendingUp,
      iconStyle: { color: '#4ade80' },
      iconBgStyle: { background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.25)' },
    },
    {
      label: 'Total Uploads',
      value: totalUploaded,
      icon: CheckCircle,
      iconStyle: { color: '#7491c4' },
      iconBgStyle: { background: 'rgba(26,68,128,0.3)', border: '1px solid rgba(45,90,158,0.4)' },
    },
    {
      label: 'In Queue',
      value: pendingJobs,
      icon: Clock,
      iconStyle: { color: '#C9A961' },
      iconBgStyle: { background: 'rgba(201,169,97,0.15)', border: '1px solid rgba(201,169,97,0.25)' },
    },
    {
      label: 'Connected Channels',
      value: channels.length,
      icon: Tv,
      iconStyle: { color: '#fb7185' },
      iconBgStyle: { background: 'rgba(178,34,52,0.15)', border: '1px solid rgba(178,34,52,0.25)' },
    },
  ]

  return (
      <div className="p-6 h-full overflow-auto" style={{ background: '#061540' }}>
      {/* Toast */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-12 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2"
          style={{
            background: toast.type === 'success' ? 'rgba(34,197,94,0.15)' : toast.type === 'error' ? 'rgba(178,34,52,0.2)' : 'rgba(26,68,128,0.3)',
            border: toast.type === 'success' ? '1px solid rgba(34,197,94,0.4)' : toast.type === 'error' ? '1px solid rgba(178,34,52,0.5)' : '1px solid rgba(45,90,158,0.5)',
            color: toast.type === 'success' ? '#4ade80' : toast.type === 'error' ? '#fb7185' : '#c5d0e6',
          }}
        >
          {toast.type === 'success' && <CheckCircle size={14} />}
          {toast.type === 'error' && <AlertCircle size={14} />}
          {toast.message}
        </motion.div>
      )}

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-bold text-white">
          Welcome back{auth.email ? `, ${auth.email.split('@')[0]}` : ''}
        </h1>
        <p className="text-sm mt-1" style={{ color: '#7491c4' }}>
          Manage your video bulk uploads for Elite Insurance Partners
        </p>
      </motion.div>

      {/* Stats Grid */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-4 gap-4 mb-6"
      >
        {stats.map(({ label, value, icon: Icon, iconStyle, iconBgStyle }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            className="card"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={iconBgStyle}>
                <Icon size={18} style={iconStyle} />
              </div>
            </div>
            <div className="text-2xl font-bold text-white mb-0.5 tabular-nums">{value}</div>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#7491c4' }}>{label}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* Main Grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="col-span-1"
        >
          <div className="card h-full">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <span style={{ color: '#C9A961', display: 'flex' }}><Zap size={14} /></span>
              Quick Actions
            </h3>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => navigate('/upload')}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-white font-semibold transition-all duration-200"
                style={{ background: 'linear-gradient(135deg, #B22234, #e11d48)', boxShadow: '0 0 16px rgba(178,34,52,0.35)' }}
              >
                <Upload size={16} />
                <span className="text-sm">Start New Upload</span>
                <ChevronRight size={14} className="ml-auto" />
              </button>

              <button
                onClick={() => navigate('/upload')}
                className="flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200"
                style={{ background: 'rgba(26,68,128,0.3)', border: '1px solid rgba(45,90,158,0.4)', color: '#c5d0e6' }}
              >
                <span style={{ color: '#7491c4', display: 'flex' }}><FileSpreadsheet size={16} /></span>
                <span className="text-sm">Import Excel File</span>
              </button>

              <button
                onClick={() => navigate('/history')}
                className="flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200"
                style={{ background: 'rgba(26,68,128,0.3)', border: '1px solid rgba(45,90,158,0.4)', color: '#c5d0e6' }}
              >
                <span style={{ color: '#7491c4', display: 'flex' }}><HistoryIcon size={16} /></span>
                <span className="text-sm">View Upload History</span>
              </button>

              <button
                onClick={refreshChannels}
                className="flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200"
                style={{ background: 'rgba(26,68,128,0.3)', border: '1px solid rgba(45,90,158,0.4)', color: '#c5d0e6' }}
              >
                <RefreshCw size={16} style={{ color: '#7491c4' }} />
                <span className="text-sm">Refresh Channels</span>
              </button>

              <button
                onClick={handleExportChannelVideos}
                disabled={exportingVideos}
                className="flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'rgba(26,68,128,0.3)', border: '1px solid rgba(45,90,158,0.4)', color: '#c5d0e6' }}
              >
                {exportingVideos ? (
                  <Loader2 size={16} className="animate-spin" style={{ color: '#7491c4' }} />
                ) : (
                  <Download size={16} style={{ color: '#7491c4' }} />
                )}
                <span className="text-sm">
                  {exportingVideos ? (exportStatus || 'Exporting...') : 'Export Channel Videos'}
                </span>
              </button>
            </div>

            {/* Upload Progress */}
            {isUploading && (
              <div className="mt-4 p-3 rounded-lg" style={{ background: 'rgba(178,34,52,0.12)', border: '1px solid rgba(178,34,52,0.3)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <motion.div
                    className="w-2 h-2 rounded-full"
                    style={{ background: '#f43f5e' }}
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                  <span className="text-xs font-semibold" style={{ color: '#fb7185' }}>Upload in progress</span>
                </div>
                <div className="text-xs mb-2" style={{ color: '#9db1d5' }}>
                  {uploadJobs.filter(j => j.status === 'complete').length} of {uploadJobs.length} videos uploaded
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${(uploadJobs.filter(j => j.status === 'complete').length / uploadJobs.length) * 100}%`
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Connected Channels */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="col-span-1"
        >
          <div className="card h-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">
                Connected Channels
              </h3>
              <button
                onClick={refreshChannels}
                className="p-1 rounded transition-colors"
                style={{ color: '#4f73b3' }}
              >
                <RefreshCw size={12} />
              </button>
            </div>

            {channels.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Tv size={32} style={{ color: '#1a4480' }} className="mb-2" />
                <p className="text-xs" style={{ color: '#4f73b3' }}>No channels loaded yet</p>
                <button
                  onClick={refreshChannels}
                  className="mt-2 text-xs font-medium" style={{ color: '#7491c4' }}
                >
                  Load channels
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 overflow-auto max-h-64 scrollbar-thin">
                {channels.map(channel => (
                  <div
                    key={channel.id}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-cream transition-colors"
                  >
                    {channel.snippet.thumbnails?.default?.url ? (
                      <img
                        src={channel.snippet.thumbnails.default.url}
                        alt={channel.snippet.title}
                        className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-600 to-brand-400 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-white">
                          {channel.snippet.title[0]}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-white truncate">
                        {channel.snippet.title}
                      </div>
                      {channel.snippet.customUrl && (
                        <div className="text-[10px] truncate" style={{ color: '#4f73b3' }}>
                          {channel.snippet.customUrl}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* Recent Uploads */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="col-span-1"
        >
          <div className="card h-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <CheckCircle size={14} style={{ color: '#4ade80' }} />
                Recent Uploads
              </h3>
              <button
                onClick={() => navigate('/history')}
                className="text-xs font-medium" style={{ color: '#7491c4' }}
              >
                View all
              </button>
            </div>

            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Play size={32} style={{ color: '#1a4480' }} className="mb-2" />
                <p className="text-xs" style={{ color: '#4f73b3' }}>No uploads yet</p>
                <p className="text-[10px] mt-1" style={{ color: '#2d5a9e' }}>Start uploading to see history</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 overflow-auto max-h-64 scrollbar-thin">
                {history.slice(0, 8).map(item => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2 px-2 py-2 rounded-lg transition-colors group"
                    style={{ cursor: 'default' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(26,68,128,0.2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                         style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.25)' }}>
                      <CheckCircle size={12} style={{ color: '#4ade80' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-white truncate">{item.title}</div>
                      <div className="text-[10px] truncate" style={{ color: '#4f73b3' }}>{item.channel}</div>
                    </div>
                    <a
                      href={item.youtubeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={e => e.stopPropagation()}
                    >
                      <ExternalLink size={11} style={{ color: '#7491c4' }} />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* EIP Channels Banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mt-4 p-4 rounded-xl"
        style={{ background: 'linear-gradient(135deg, #0a2050, #0f2f61)', border: '1px solid rgba(45,90,158,0.5)', boxShadow: '0 0 20px rgba(26,68,128,0.2)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                 style={{ background: 'rgba(178,34,52,0.2)', border: '1px solid rgba(178,34,52,0.35)' }}>
              <Video size={16} style={{ color: '#fb7185' }} />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">EIP Brand Channels</div>
              <div className="text-xs" style={{ color: '#4f73b3' }}>11 channels configured for bulk upload</div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end max-w-lg">
            {['@MedicareCompared', '@eliteinsurancepartners', '@applyformedicare', '@HealthCompared', '@LifeCompared', '@TheEliteBrokerage'].map(handle => (
              <span key={handle} className="text-[10px] px-2 py-0.5 rounded-full text-white"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
                {handle}
              </span>
            ))}
            <span className="text-[10px]" style={{ color: '#4f73b3' }}>+5 more</span>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ── Local icon helpers ────────────────────────────────────────────────────────
function Zap({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

function FileSpreadsheet({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="13"/>
      <line x1="8" y1="17" x2="16" y2="17"/>
      <line x1="8" y1="9" x2="10" y2="9"/>
    </svg>
  )
}

function HistoryIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 3v5h5"/>
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/>
      <path d="M12 7v5l4 2"/>
    </svg>
  )
}
