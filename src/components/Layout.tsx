import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Upload, History, Settings, LogOut,
  Video, ChevronRight, Wifi, Terminal,
  Download, RefreshCw, Sparkles, X, ArrowDownToLine, Gauge, Shield, Copy
} from 'lucide-react'
import { useApp } from '../App'

interface LayoutProps {
  children: React.ReactNode
}

const navItems = [
  { path: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/upload',      icon: Upload,          label: 'Upload Queue' },
  { path: '/history',     icon: History,         label: 'Upload History' },
  { path: '/duplicates',  icon: Copy,            label: 'Duplicate Manager' },
  { path: '/logs',        icon: Terminal,        label: 'Activity Logs' },
  { path: '/settings',    icon: Settings,        label: 'Settings' },
]

const quotaPct   = (used: number, limit: number) => Math.min(100, Math.round((used / limit) * 100))
const quotaColor = (pct: number) =>
  pct >= 80 ? '#f43f5e' : pct >= 50 ? '#C9A961' : '#4ade80'
const quotaLabel = (pct: number) =>
  pct >= 80 ? 'Critical' : pct >= 50 ? 'Caution' : 'Healthy'
const quotaBarBg = (pct: number) =>
  pct >= 80
    ? 'linear-gradient(90deg, #B22234, #f43f5e)'
    : pct >= 50
    ? 'linear-gradient(90deg, #b08a3a, #C9A961)'
    : 'linear-gradient(90deg, #1a4480, #2d5a9e)'

export default function Layout({ children }: LayoutProps) {
  const location  = useLocation()
  const navigate  = useNavigate()
  const { auth, setAuth, uploadJobs, isUploading } = useApp()

  const pendingCount   = uploadJobs.filter(j => j.status === 'pending').length
  const uploadingCount = uploadJobs.filter(j => j.status === 'uploading').length
  const completeCount  = uploadJobs.filter(j => j.status === 'complete').length

  const [updateState,      setUpdateState]      = useState<'idle' | 'checking' | 'available' | 'downloading' | 'ready'>('idle')
  const [updateInfo,       setUpdateInfo]       = useState<{ version?: string; percent?: number } | null>(null)
  const [showUpdateBanner, setShowUpdateBanner] = useState(false)
  const [currentVersion,   setCurrentVersion]   = useState<string>('')
  const [quota,            setQuota]            = useState<{ usedUnits: number; resetDate: string; dailyLimit: number } | null>(null)
  const [quotaCountdown,   setQuotaCountdown]   = useState<string>('')

  useEffect(() => {
    const tick = () => {
      const now = new Date()
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
    api.onChecking(()            => setUpdateState('checking'))
    api.onAvailable((info: any)  => { setUpdateState('available'); setUpdateInfo({ version: info.version }); setShowUpdateBanner(true) })
    api.onNotAvailable(()        => setUpdateState('idle'))
    api.onDownloadProgress((p: any) => { setUpdateState('downloading'); setUpdateInfo(prev => ({ ...prev, percent: Math.round(p.percent) })) })
    api.onDownloaded((info: any) => { setUpdateState('ready'); setUpdateInfo(prev => ({ ...prev, version: info.version })); setShowUpdateBanner(true) })
    api.onError(()               => setUpdateState('idle'))
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

  const pct    = quota ? quotaPct(quota.usedUnits, quota.dailyLimit) : 0
  const qColor = quotaColor(pct)

  return (
    <div className="flex w-full h-full" style={{ background: '#061540' }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <div className="w-60 flex-shrink-0 flex flex-col"
           style={{ background: '#030d2b', borderRight: '1px solid rgba(45,90,158,0.35)' }}>

        {/* Logo / Titlebar */}
        <div className="titlebar-drag h-12 flex items-center px-4 flex-shrink-0"
             style={{ background: '#030d2b', borderBottom: '1px solid rgba(45,90,158,0.35)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                 style={{ background: 'linear-gradient(135deg, #B22234, #e11d48)', boxShadow: '0 0 12px rgba(178,34,52,0.4)' }}>
              <Shield size={15} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-white leading-tight tracking-wide">EIP Uploader</div>
              <div className="text-[10px] leading-tight" style={{ color: 'rgba(255,255,255,0.45)' }}>Bulk Video Upload</div>
            </div>
          </div>
        </div>

        {/* Patriotic stripe */}
        <div style={{ height: '3px', background: 'linear-gradient(90deg, #B22234 33.3%, #FFFFFF 33.3% 66.6%, #1a4480 66.6%)', flexShrink: 0 }} />

        {/* Account Info */}
        <div className="px-3 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(45,90,158,0.25)' }}>
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg"
               style={{ background: 'rgba(26,68,128,0.25)', border: '1px solid rgba(45,90,158,0.35)' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white text-sm"
                 style={{ background: 'linear-gradient(135deg, #1a4480, #2d5a9e)' }}>
              {auth.email ? auth.email[0].toUpperCase() : 'E'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-white truncate">
                {auth.email || 'Connected'}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <Wifi size={9} style={{ color: '#4ade80' }} />
                <span className="text-[10px] font-medium" style={{ color: '#4ade80' }}>Authenticated</span>
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
                        style={{ background: isUploading ? '#B22234' : 'rgba(45,90,158,0.6)' }}>
                    {isUploading ? uploadingCount + pendingCount : pendingCount}
                  </span>
                )}
                {isActive && <ChevronRight size={12} style={{ color: '#fb7185' }} className="flex-shrink-0" />}
              </button>
            )
          })}
        </nav>

        {/* Upload Status Indicator */}
        {isUploading && (
          <div className="px-3 pb-2 flex-shrink-0">
            <div className="px-3 py-2.5 rounded-lg"
                 style={{ background: 'rgba(178,34,52,0.12)', border: '1px solid rgba(178,34,52,0.3)' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <motion.div
                  className="w-2 h-2 rounded-full"
                  style={{ background: '#f43f5e' }}
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <span className="text-xs font-semibold" style={{ color: '#fb7185' }}>Uploading…</span>
              </div>
              <div className="text-[10px] mb-1.5" style={{ color: '#9db1d5' }}>
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
            <div className="px-3 py-2.5 rounded-lg"
                 style={{ background: 'rgba(15,47,97,0.6)', border: '1px solid rgba(45,90,158,0.35)' }}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Gauge size={11} style={{ color: qColor }} />
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#7491c4' }}>API Quota</span>
                <span className="ml-auto text-[10px] font-bold tabular-nums" style={{ color: qColor }}>
                  {pct}% · {quotaLabel(pct)}
                </span>
              </div>
              <div className="w-full rounded-full h-2 mb-1.5" style={{ background: 'rgba(26,68,128,0.4)' }}>
                <div
                  className="h-2 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: quotaBarBg(pct) }}
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[9px] tabular-nums" style={{ color: '#4f73b3' }}>
                  {quota.usedUnits.toLocaleString()} / {quota.dailyLimit.toLocaleString()} units
                </span>
                <span className="text-[9px] tabular-nums" style={{ color: '#4f73b3' }}>
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
              <motion.div key="available"
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden mb-2">
                <div className="px-3 py-2.5 rounded-lg"
                     style={{ background: 'rgba(26,68,128,0.3)', border: '1px solid rgba(45,90,158,0.5)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={11} style={{ color: '#C9A961' }} />
                      <span className="text-[10px] font-bold text-white">Update Available</span>
                    </div>
                    <button onClick={() => setShowUpdateBanner(false)}>
                      <X size={11} style={{ color: '#7491c4' }} />
                    </button>
                  </div>
                  <p className="text-[10px] mb-2" style={{ color: '#9db1d5' }}>v{updateInfo?.version} is ready</p>
                  <button onClick={handleDownloadUpdate}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-semibold text-white"
                    style={{ background: 'linear-gradient(135deg, #B22234, #e11d48)' }}>
                    <Download size={10} /> Download Update
                  </button>
                </div>
              </motion.div>
            )}

            {updateState === 'downloading' && (
              <motion.div key="downloading"
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden mb-2">
                <div className="px-3 py-2.5 rounded-lg"
                     style={{ background: 'rgba(26,68,128,0.3)', border: '1px solid rgba(45,90,158,0.5)' }}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                      <RefreshCw size={11} style={{ color: '#7491c4' }} />
                    </motion.div>
                    <span className="text-[10px] font-bold text-white">Downloading…</span>
                    <span className="ml-auto text-[10px] tabular-nums" style={{ color: '#C9A961' }}>
                      {updateInfo?.percent ?? 0}%
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${updateInfo?.percent ?? 0}%` }} />
                  </div>
                </div>
              </motion.div>
            )}

            {updateState === 'ready' && (
              <motion.div key="ready"
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden mb-2">
                <div className="px-3 py-2.5 rounded-lg"
                     style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <ArrowDownToLine size={11} style={{ color: '#4ade80' }} />
                    <span className="text-[10px] font-bold text-white">Ready to Install</span>
                  </div>
                  <p className="text-[10px] mb-2" style={{ color: '#9db1d5' }}>v{updateInfo?.version} downloaded</p>
                  <button onClick={handleInstallUpdate}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-semibold text-white"
                    style={{ background: 'linear-gradient(135deg, #15803d, #22c55e)' }}>
                    <ArrowDownToLine size={10} /> Restart & Install
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Check for Updates button */}
          <button
            onClick={handleCheckForUpdates}
            disabled={updateState === 'checking' || updateState === 'downloading'}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-medium transition-all duration-200"
            style={{
              background: 'rgba(26,68,128,0.25)',
              border: '1px solid rgba(45,90,158,0.4)',
              color: updateState === 'checking' ? '#7491c4' : '#9db1d5',
            }}
          >
            {updateState === 'checking' ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                  <RefreshCw size={10} />
                </motion.div>
                Checking…
              </>
            ) : (
              <>
                <RefreshCw size={10} />
                Check for Updates
              </>
            )}
          </button>

          {/* Version */}
          {currentVersion && (
            <p className="text-center text-[9px] mt-1.5 tabular-nums" style={{ color: '#2d5a9e' }}>
              v{currentVersion}
            </p>
          )}
        </div>

        {/* Sign Out */}
        <div className="px-3 pb-3 flex-shrink-0" style={{ borderTop: '1px solid rgba(45,90,158,0.25)' }}>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 mt-2"
            style={{ color: '#7491c4' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#fb7185'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(178,34,52,0.12)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#7491c4'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* ── Main Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="titlebar-drag h-10 flex items-center px-4 flex-shrink-0"
             style={{ background: '#0a2050', borderBottom: '1px solid rgba(45,90,158,0.35)' }}>
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#4f73b3' }}>
            {navItems.find(n => n.path === location.pathname)?.label ?? 'EIP Uploader'}
          </span>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-auto" style={{ background: '#061540' }}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {children}
          </motion.div>
        </div>
      </div>
    </div>
  )
}
