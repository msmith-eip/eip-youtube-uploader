import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Upload, History, Settings, LogOut,
  Video, ChevronRight, Wifi, Terminal,
  Download, RefreshCw, Sparkles, X, ArrowDownToLine, Gauge, Shield
} from 'lucide-react'
import { useApp } from '../App'

interface LayoutProps {
  children: React.ReactNode
}

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/upload',    icon: Upload,          label: 'Upload Queue' },
  { path: '/history',  icon: History,          label: 'Upload History' },
  { path: '/logs',     icon: Terminal,         label: 'Activity Logs' },
  { path: '/settings', icon: Settings,         label: 'Settings' },
]

// Quota thresholds
const quotaPct = (used: number, limit: number) => Math.min(100, Math.round((used / limit) * 100))
const quotaColor = (pct: number) =>
  pct >= 80 ? '#B22234' : pct >= 50 ? '#C9A961' : '#3C3B6E'
const quotaLabel = (pct: number) =>
  pct >= 80 ? 'Critical' : pct >= 50 ? 'Caution' : 'Healthy'

export default function Layout({ children }: LayoutProps) {
  const location  = useLocation()
  const navigate  = useNavigate()
  const { auth, setAuth, uploadJobs, isUploading } = useApp()

  const pendingCount   = uploadJobs.filter(j => j.status === 'pending').length
  const uploadingCount = uploadJobs.filter(j => j.status === 'uploading').length
  const completeCount  = uploadJobs.filter(j => j.status === 'complete').length

  // ── Auto-updater state ────────────────────────────────────────────────────
  const [updateState, setUpdateState] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'ready'>('idle')
  const [updateInfo,  setUpdateInfo]  = useState<{ version?: string; percent?: number } | null>(null)
  const [showUpdateBanner, setShowUpdateBanner] = useState(false)
  const [currentVersion,   setCurrentVersion]   = useState<string>('')

  // ── Quota state ───────────────────────────────────────────────────────────
  const [quota, setQuota] = useState<{ usedUnits: number; resetDate: string; dailyLimit: number } | null>(null)

  // ── Quota reset countdown ─────────────────────────────────────────────────
  const [quotaCountdown, setQuotaCountdown] = useState<string>('')
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      // Midnight Pacific Time
      const ptMidnight = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
      ptMidnight.setHours(24, 0, 0, 0)
      const diffMs = ptMidnight.getTime() - new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })).getTime()
      const h = Math.floor(diffMs / 3600000)
      const m = Math.floor((diffMs % 3600000) / 60000)
      const s = Math.floor((diffMs % 60000) / 1000)
      setQuotaCountdown(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const api = (window.electronAPI as any)?.quota
    if (!api) return
    api.get().then((data: any) => setQuota(data)).catch(() => {})
    api.onUpdate((data: any) => setQuota(data))
    return () => api.removeListeners()
  }, [])

  useEffect(() => {
    if (!window.electronAPI?.updater) return
    ;(window.electronAPI as any).updater.getVersion?.().then((res: any) => {
      if (res?.version) setCurrentVersion(res.version)
    }).catch(() => {})
    const api = (window.electronAPI as any).updater
    api.onChecking(()         => setUpdateState('checking'))
    api.onAvailable((info: any) => {
      setUpdateState('available')
      setUpdateInfo({ version: info.version })
      setShowUpdateBanner(true)
    })
    api.onNotAvailable(()    => setUpdateState('idle'))
    api.onDownloadProgress((p: any) => {
      setUpdateState('downloading')
      setUpdateInfo(prev => ({ ...prev, percent: Math.round(p.percent) }))
    })
    api.onDownloaded((info: any) => {
      setUpdateState('ready')
      setUpdateInfo(prev => ({ ...prev, version: info.version }))
      setShowUpdateBanner(true)
    })
    api.onError(() => setUpdateState('idle'))
    return () => api.removeListeners()
  }, [])

  const handleDownloadUpdate  = async () => { setUpdateState('downloading'); await (window.electronAPI as any)?.updater.download() }
  const handleInstallUpdate   = async () => { await (window.electronAPI as any)?.updater.install() }
  const handleCheckForUpdates = async () => {
    setUpdateState('checking')
    const result = await (window.electronAPI as any)?.updater.check()
    if (result && !result.success) setUpdateState('idle')
  }
  const handleLogout = async () => {
    if (typeof window !== 'undefined' && window.electronAPI) await window.electronAPI.auth.logout()
    setAuth({ authenticated: false })
  }

  const pct   = quota ? quotaPct(quota.usedUnits, quota.dailyLimit) : 0
  const qColor = quotaColor(pct)

  return (
    <div className="flex w-full h-full" style={{ background: '#FAF6EE' }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <div className="w-60 flex-shrink-0 flex flex-col border-r border-surface-divider"
           style={{ background: '#FFFFFF', boxShadow: '2px 0 8px rgba(28,25,20,0.06)' }}>

        {/* Logo / Titlebar */}
        <div className="titlebar-drag h-12 flex items-center px-4 border-b border-surface-divider flex-shrink-0"
             style={{ background: '#3C3B6E' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                 style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}>
              <Shield size={15} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-white leading-tight tracking-wide">EIP Uploader</div>
              <div className="text-[10px] leading-tight" style={{ color: 'rgba(255,255,255,0.6)' }}>Bulk Video Upload</div>
            </div>
          </div>
        </div>

        {/* Patriotic stripe */}
        <div className="stripe-accent flex-shrink-0" />

        {/* Account Info */}
        <div className="px-3 py-3 border-b border-surface-divider flex-shrink-0">
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg"
               style={{ background: '#FAF6EE', border: '1px solid #D4CFC4' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white text-sm"
                 style={{ background: '#3C3B6E' }}>
              {auth.email ? auth.email[0].toUpperCase() : 'E'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-surface-ink truncate">
                {auth.email || 'Connected'}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <Wifi size={9} style={{ color: '#16a34a' }} />
                <span className="text-[10px] font-medium" style={{ color: '#16a34a' }}>Authenticated</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 flex flex-col gap-0.5 overflow-y-auto">
          {navItems.map(({ path, icon: Icon, label }) => {
            const isActive  = location.pathname === path
            const showBadge = path === '/upload' && (pendingCount > 0 || uploadingCount > 0)

            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={isActive ? 'nav-item-active' : 'nav-item'}
              >
                <Icon size={15} className="flex-shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                {showBadge && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
                        style={{ background: isUploading ? '#3C3B6E' : '#6b6358' }}>
                    {isUploading ? uploadingCount + pendingCount : pendingCount}
                  </span>
                )}
                {isActive && <ChevronRight size={12} style={{ color: '#3C3B6E' }} className="flex-shrink-0" />}
              </button>
            )
          })}
        </nav>

        {/* Upload Status Indicator */}
        {isUploading && (
          <div className="px-3 pb-2 flex-shrink-0">
            <div className="px-3 py-2.5 rounded-lg" style={{ background: '#eef0f8', border: '1px solid #aab1de' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <motion.div
                  className="w-2 h-2 rounded-full"
                  style={{ background: '#3C3B6E' }}
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <span className="text-xs font-semibold" style={{ color: '#3C3B6E' }}>Uploading…</span>
              </div>
              <div className="text-[10px] text-surface-muted mb-1.5">
                {completeCount} / {uploadJobs.length} complete
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${uploadJobs.length ? (completeCount / uploadJobs.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Quota Widget ── */}
        {quota !== null && (
          <div className="px-3 pb-2 flex-shrink-0">
            <div className="px-3 py-2.5 rounded-lg" style={{ background: '#FAF6EE', border: '1px solid #D4CFC4' }}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Gauge size={11} style={{ color: qColor }} />
                <span className="text-[10px] font-bold text-surface-muted uppercase tracking-wider">API Quota</span>
                <span className="ml-auto text-[10px] font-bold tabular-nums" style={{ color: qColor }}>
                  {pct}% · {quotaLabel(pct)}
                </span>
              </div>
              <div className="w-full rounded-full h-2 mb-1.5" style={{ background: '#D4CFC4' }}>
                <div
                  className="h-2 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: qColor }}
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[9px] text-surface-subtle tabular-nums">
                  {quota.usedUnits.toLocaleString()} / {quota.dailyLimit.toLocaleString()} units
                </span>
                <span className="text-[9px] text-surface-subtle tabular-nums">
                  resets {quotaCountdown}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Update Panel ── */}
        <div className="px-3 pb-2 flex-shrink-0">
          <AnimatePresence mode="wait">
            {updateState === 'available' && (
              <motion.div key="available" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-2">
                <div className="px-3 py-2.5 rounded-lg" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles size={11} style={{ color: '#16a34a' }} />
                    <span className="text-[11px] font-bold" style={{ color: '#16a34a' }}>Update Available</span>
                  </div>
                  <div className="text-[10px] text-surface-muted mb-2">v{updateInfo?.version} is ready to download</div>
                  <button onClick={handleDownloadUpdate}
                    className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-white text-[11px] font-semibold transition-all"
                    style={{ background: '#16a34a' }}>
                    <Download size={11} /> Download Update
                  </button>
                </div>
              </motion.div>
            )}
            {updateState === 'downloading' && (
              <motion.div key="downloading" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-2">
                <div className="px-3 py-2.5 rounded-lg" style={{ background: '#eef0f8', border: '1px solid #aab1de' }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                      <Download size={11} style={{ color: '#3C3B6E' }} />
                    </motion.div>
                    <span className="text-[11px] font-bold" style={{ color: '#3C3B6E' }}>Downloading…</span>
                    <span className="ml-auto text-[10px] text-surface-muted tabular-nums">{updateInfo?.percent ?? 0}%</span>
                  </div>
                  <div className="progress-bar mt-1">
                    <motion.div className="progress-fill h-full" animate={{ width: `${updateInfo?.percent ?? 0}%` }} transition={{ duration: 0.3 }} />
                  </div>
                </div>
              </motion.div>
            )}
            {updateState === 'ready' && (
              <motion.div key="ready" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-2">
                <div className="px-3 py-2.5 rounded-lg" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles size={11} style={{ color: '#16a34a' }} />
                    <span className="text-[11px] font-bold" style={{ color: '#16a34a' }}>Ready to Install</span>
                  </div>
                  <div className="text-[10px] text-surface-muted mb-2">v{updateInfo?.version} downloaded</div>
                  <button onClick={handleInstallUpdate}
                    className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-white text-[11px] font-bold transition-all"
                    style={{ background: '#16a34a' }}>
                    <ArrowDownToLine size={11} /> Restart &amp; Install
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {(updateState === 'idle' || updateState === 'checking') && (
            <button
              onClick={handleCheckForUpdates}
              disabled={updateState === 'checking'}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all disabled:opacity-50 mb-0.5"
              style={{ color: '#8c8476' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#FAF6EE')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <motion.div
                animate={updateState === 'checking' ? { rotate: 360 } : { rotate: 0 }}
                transition={updateState === 'checking' ? { duration: 1, repeat: Infinity, ease: 'linear' } : {}}
              >
                <RefreshCw size={10} />
              </motion.div>
              {updateState === 'checking' ? 'Checking for updates…' : 'Check for updates'}
            </button>
          )}
          {currentVersion && (
            <p className="text-center text-[9px] mt-0.5 mb-1" style={{ color: '#b5ae9f' }}>v{currentVersion}</p>
          )}
        </div>

        {/* Sign Out */}
        <div className="px-3 pb-4 border-t border-surface-divider pt-3 flex-shrink-0">
          <button
            onClick={handleLogout}
            className="nav-item w-full"
            onMouseEnter={e => { e.currentTarget.style.color = '#B22234'; e.currentTarget.style.background = '#fdf2f4' }}
            onMouseLeave={e => { e.currentTarget.style.color = ''; e.currentTarget.style.background = '' }}
          >
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* ── Main Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Title bar */}
        <div className="flex-shrink-0">
          <div className="titlebar-drag h-10 border-b border-surface-divider flex items-center px-5"
               style={{ background: '#FFFFFF' }}>
            <span className="text-xs font-semibold text-surface-muted tracking-wide uppercase">
              {navItems.find(n => n.path === location.pathname)?.label || 'EIP Video Uploader'}
            </span>
          </div>

          {/* Update banner */}
          <AnimatePresence>
            {showUpdateBanner && (updateState === 'available' || updateState === 'ready') && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-2 border-b" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                  <Sparkles size={14} style={{ color: '#16a34a' }} className="flex-shrink-0" />
                  <span className="text-xs font-medium flex-1" style={{ color: '#16a34a' }}>
                    {updateState === 'ready'
                      ? `v${updateInfo?.version} is downloaded and ready to install`
                      : `v${updateInfo?.version} is available — click "Download Update" in the sidebar`}
                  </span>
                  {updateState === 'ready' && (
                    <button onClick={handleInstallUpdate}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-white text-xs font-bold transition-all"
                      style={{ background: '#16a34a' }}>
                      <ArrowDownToLine size={12} /> Restart &amp; Install
                    </button>
                  )}
                  <button onClick={() => setShowUpdateBanner(false)} className="text-surface-muted hover:text-surface-ink transition-colors">
                    <X size={14} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-auto" style={{ background: '#FAF6EE' }}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="h-full"
          >
            {children}
          </motion.div>
        </div>
      </div>
    </div>
  )
}
