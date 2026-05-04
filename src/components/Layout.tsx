import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Upload, History, Settings, LogOut,
  Youtube, ChevronRight, Wifi, Terminal,
  Download, RefreshCw, Sparkles, X, ArrowDownToLine
} from 'lucide-react'
import { useApp } from '../App'

interface LayoutProps {
  children: React.ReactNode
}

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/upload', icon: Upload, label: 'Upload Queue' },
  { path: '/history', icon: History, label: 'Upload History' },
  { path: '/logs', icon: Terminal, label: 'Activity Logs' },
  { path: '/settings', icon: Settings, label: 'Settings' },
]

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { auth, setAuth, uploadJobs, isUploading } = useApp()

  const pendingCount = uploadJobs.filter(j => j.status === 'pending').length
  const uploadingCount = uploadJobs.filter(j => j.status === 'uploading').length

  // ── Auto-updater state ────────────────────────────────────────────────────────
  const [updateState, setUpdateState] = useState<
    'idle' | 'checking' | 'available' | 'downloading' | 'ready'
  >('idle')
  const [updateInfo, setUpdateInfo] = useState<{ version?: string; percent?: number } | null>(null)
  const [showUpdateBanner, setShowUpdateBanner] = useState(false)

  useEffect(() => {
    if (!window.electronAPI?.updater) return
    const api = (window.electronAPI as any).updater
    api.onChecking(() => setUpdateState('checking'))
    api.onAvailable((info: any) => {
      setUpdateState('available')
      setUpdateInfo({ version: info.version })
      setShowUpdateBanner(true)
    })
    api.onNotAvailable(() => setUpdateState('idle'))
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

  const handleDownloadUpdate = async () => {
    setUpdateState('downloading')
    await (window.electronAPI as any)?.updater.download()
  }

  const handleInstallUpdate = async () => {
    await (window.electronAPI as any)?.updater.install()
  }

  const handleCheckForUpdates = async () => {
    setUpdateState('checking')
    const result = await (window.electronAPI as any)?.updater.check()
    if (result && !result.success) {
      setUpdateState('idle')
    }
  }

  const handleLogout = async () => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      await window.electronAPI.auth.logout()
    }
    setAuth({ authenticated: false })
  }

  return (
    <div className="flex w-full h-full bg-dark-950">
      {/* ── Sidebar ── */}
      <div className="w-60 flex-shrink-0 flex flex-col bg-dark-900 border-r border-dark-700">
        {/* Logo / Titlebar area */}
        <div className="titlebar-drag h-10 flex items-center px-4 border-b border-dark-700 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-600 to-accent-purple flex items-center justify-center shadow-glow-sm flex-shrink-0">
              <Youtube size={14} className="text-white" />
            </div>
            <div>
              <div className="text-xs font-bold text-dark-50 leading-tight">EIP Uploader</div>
              <div className="text-[10px] text-dark-400 leading-tight">YouTube Bulk Upload</div>
            </div>
          </div>
        </div>

        {/* Account Info */}
        <div className="px-3 py-3 border-b border-dark-700">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-dark-800">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-accent-purple flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-white">
                {auth.email ? auth.email[0].toUpperCase() : 'E'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-dark-100 truncate">
                {auth.email || 'Connected'}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <Wifi size={9} className="text-accent-green" />
                <span className="text-[10px] text-accent-green">Authenticated</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 flex flex-col gap-1">
          {navItems.map(({ path, icon: Icon, label }) => {
            const isActive = location.pathname === path
            const showBadge = path === '/upload' && (pendingCount > 0 || uploadingCount > 0)

            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={isActive ? 'nav-item-active' : 'nav-item'}
              >
                <Icon size={16} className="flex-shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                {showBadge && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isUploading ? 'bg-brand-600/30 text-brand-400' : 'bg-dark-600 text-dark-300'
                  }`}>
                    {isUploading ? uploadingCount + pendingCount : pendingCount}
                  </span>
                )}
                {isActive && <ChevronRight size={12} className="text-brand-400 flex-shrink-0" />}
              </button>
            )
          })}
        </nav>

        {/* Upload Status Indicator */}
        {isUploading && (
          <div className="px-3 pb-2">
            <div className="px-3 py-2.5 rounded-lg bg-brand-600/10 border border-brand-600/20">
              <div className="flex items-center gap-2 mb-1.5">
                <motion.div
                  className="w-2 h-2 rounded-full bg-brand-500"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <span className="text-xs font-medium text-brand-400">Uploading...</span>
              </div>
              <div className="text-[10px] text-dark-400">
                {uploadJobs.filter(j => j.status === 'complete').length} / {uploadJobs.length} complete
              </div>
              <div className="progress-bar mt-1.5">
                <div
                  className="progress-fill"
                  style={{
                    width: `${(uploadJobs.filter(j => j.status === 'complete').length / uploadJobs.length) * 100}%`
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Update Panel in Sidebar ── */}
        <div className="px-3 pb-2">
          <AnimatePresence mode="wait">
            {updateState === 'available' && (
              <motion.div
                key="available"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="px-3 py-2.5 rounded-lg bg-accent-green/10 border border-accent-green/30 mb-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles size={11} className="text-accent-green" />
                    <span className="text-[11px] font-bold text-accent-green">Update Available</span>
                  </div>
                  <div className="text-[10px] text-dark-400 mb-2">v{updateInfo?.version} is ready to download</div>
                  <button
                    onClick={handleDownloadUpdate}
                    className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-accent-green/20 hover:bg-accent-green/30 text-accent-green text-[11px] font-medium transition-all"
                  >
                    <Download size={11} />
                    Download Update
                  </button>
                </div>
              </motion.div>
            )}
            {updateState === 'downloading' && (
              <motion.div
                key="downloading"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="px-3 py-2.5 rounded-lg bg-brand-600/10 border border-brand-600/20 mb-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                      <Download size={11} className="text-brand-400" />
                    </motion.div>
                    <span className="text-[11px] font-bold text-brand-400">Downloading...</span>
                    <span className="ml-auto text-[10px] text-dark-400">{updateInfo?.percent ?? 0}%</span>
                  </div>
                  <div className="progress-bar mt-1">
                    <motion.div
                      className="progress-fill h-full"
                      animate={{ width: `${updateInfo?.percent ?? 0}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
              </motion.div>
            )}
            {updateState === 'ready' && (
              <motion.div
                key="ready"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="px-3 py-2.5 rounded-lg bg-accent-green/10 border border-accent-green/30 mb-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles size={11} className="text-accent-green" />
                    <span className="text-[11px] font-bold text-accent-green">Ready to Install</span>
                  </div>
                  <div className="text-[10px] text-dark-400 mb-2">v{updateInfo?.version} downloaded</div>
                  <button
                    onClick={handleInstallUpdate}
                    className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-accent-green text-dark-950 text-[11px] font-bold transition-all hover:bg-accent-green/90"
                  >
                    <ArrowDownToLine size={11} />
                    Restart &amp; Install
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Check for Updates button (always visible when idle/checking) */}
          {(updateState === 'idle' || updateState === 'checking') && (
            <button
              onClick={handleCheckForUpdates}
              disabled={updateState === 'checking'}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-dark-500 hover:text-dark-300 hover:bg-dark-800 text-[10px] transition-all disabled:opacity-50 mb-1"
            >
              <motion.div
                animate={updateState === 'checking' ? { rotate: 360 } : { rotate: 0 }}
                transition={updateState === 'checking' ? { duration: 1, repeat: Infinity, ease: 'linear' } : {}}
              >
                <RefreshCw size={10} />
              </motion.div>
              {updateState === 'checking' ? 'Checking for updates...' : 'Check for updates'}
            </button>
          )}
        </div>

        {/* Bottom: Logout */}
        <div className="px-3 pb-4 border-t border-dark-700 pt-3">
          <button
            onClick={handleLogout}
            className="nav-item w-full text-dark-400 hover:text-accent-red hover:bg-accent-red/10"
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Titlebar + Update Banner area */}
        <div className="flex-shrink-0">
          <div className="titlebar-drag h-10 bg-dark-950 border-b border-dark-800 flex items-center px-4">
            <span className="text-xs text-dark-500 font-medium">
              {navItems.find(n => n.path === location.pathname)?.label || 'EIP YouTube Uploader'}
            </span>
          </div>

          {/* Update available banner across top of content */}
          <AnimatePresence>
            {showUpdateBanner && (updateState === 'available' || updateState === 'ready') && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-3 px-4 py-2 bg-accent-green/10 border-b border-accent-green/20">
                  <Sparkles size={14} className="text-accent-green flex-shrink-0" />
                  <span className="text-xs text-accent-green font-medium flex-1">
                    {updateState === 'ready'
                      ? `v${updateInfo?.version} is downloaded and ready to install`
                      : `v${updateInfo?.version} is available — click "Download Update" in the sidebar`}
                  </span>
                  {updateState === 'ready' && (
                    <button
                      onClick={handleInstallUpdate}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-accent-green text-dark-950 text-xs font-bold hover:bg-accent-green/90 transition-all"
                    >
                      <ArrowDownToLine size={12} />
                      Restart &amp; Install
                    </button>
                  )}
                  <button
                    onClick={() => setShowUpdateBanner(false)}
                    className="text-dark-400 hover:text-dark-200 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Page Content */}
        <div className="flex-1 overflow-auto">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
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
