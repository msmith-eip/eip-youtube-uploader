import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import UploadQueue from './pages/UploadQueue'
import History from './pages/History'
import Settings from './pages/Settings'
import Logs from './pages/Logs'
import AuthScreen from './pages/AuthScreen'
import DuplicateManager from './pages/DuplicateManager'
import VideoManager from './pages/VideoManager'
import type { AuthStatus, AppSettings, Channel, UploadJob } from './types'

// ─── App Context ──────────────────────────────────────────────────────────────
interface AppContextType {
  auth: AuthStatus
  settings: AppSettings
  channels: Channel[]
  uploadJobs: UploadJob[]
  isUploading: boolean
  setAuth: (auth: AuthStatus) => void
  setSettings: (settings: AppSettings) => void
  setChannels: (channels: Channel[]) => void
  setUploadJobs: (jobs: UploadJob[] | ((prev: UploadJob[]) => UploadJob[])) => void
  setIsUploading: (v: boolean) => void
  refreshChannels: () => Promise<void>
}

const AppContext = createContext<AppContextType | null>(null)

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

// ─── Default Settings ─────────────────────────────────────────────────────────
const DEFAULT_SETTINGS: AppSettings = {
  defaultPrivacy: 'unlisted',
  defaultCategory: '22',
  concurrentUploads: 1,
  delayBetweenUploads: 2000,
}

// ─── App Component ────────────────────────────────────────────────────────────
export default function App() {
  const [auth, setAuth] = useState<AuthStatus>({ authenticated: false })
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [channels, setChannels] = useState<Channel[]>([])
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [loading, setLoading] = useState(true)

  // Check if running in Electron
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI

  useEffect(() => {
    async function init() {
      if (!isElectron) {
        setLoading(false)
        return
      }
      try {
        const [authStatus, savedSettings] = await Promise.all([
          window.electronAPI.auth.getStatus(),
          window.electronAPI.settings.get(),
        ])
        setAuth(authStatus)
        if (savedSettings) setSettingsState(savedSettings)
      } catch (err) {
        console.error('Init error:', err)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [isElectron])

  const setSettings = useCallback(async (newSettings: AppSettings) => {
    setSettingsState(newSettings)
    if (isElectron) {
      await window.electronAPI.settings.set(newSettings)
    }
  }, [isElectron])

  const refreshChannels = useCallback(async () => {
    if (!isElectron || !auth.authenticated) return
    try {
      const result = await window.electronAPI.youtube.getChannels()
      if (result.success && result.channels) {
        setChannels(result.channels)
      }
    } catch (err) {
      console.error('Failed to fetch channels:', err)
    }
  }, [isElectron, auth.authenticated])

  useEffect(() => {
    if (auth.authenticated) {
      refreshChannels()
    }
  }, [auth.authenticated, refreshChannels])

  // Global upload completion listener — always active regardless of which page is open
  useEffect(() => {
    if (!window.electronAPI) return
    const unsub = window.electronAPI.upload.onAllComplete(() => {
      setIsUploading(false)
    })
    return () => { if (typeof (unsub as any) === 'function') (unsub as any)() }
  }, [])

  // Queue state sync — on app init (and after auth), pull the live queue snapshot
  // from the main process so that navigating away and back restores correct job statuses.
  useEffect(() => {
    if (!window.electronAPI || !auth.authenticated) return
    window.electronAPI.upload.getQueueState().then((snapshot: any) => {
      if (!snapshot || !snapshot.isUploading) return
      // An upload is in progress — rebuild uploadJobs from the snapshot
      const { jobs, liveStates } = snapshot
      if (!jobs || jobs.length === 0) return
      const restoredJobs: UploadJob[] = jobs.map((job: any, idx: number) => {
        const live = liveStates?.[idx]
        if (live) {
          return {
            ...job,
            status: live.status,
            progress: live.progress ?? job.progress ?? 0,
            videoId: live.videoId ?? job.videoId,
            youtubeUrl: live.youtubeUrl ?? job.youtubeUrl,
            error: live.error ?? job.error,
            canRetry: live.canRetry ?? job.canRetry,
            skipReason: live.skipReason ?? job.skipReason,
            existingUrl: live.existingUrl ?? job.existingUrl,
          }
        }
        // Job hasn't been touched yet — keep as pending
        return { ...job, status: job.status === 'complete' || job.status === 'error' || job.status === 'skipped' ? job.status : 'pending' }
      })
      setUploadJobs(restoredJobs)
      setIsUploading(true)
    }).catch(() => {})
  }, [auth.authenticated])

  // Safety net: if all jobs are done (complete or error) but isUploading is still true, clear it
  useEffect(() => {
    if (!isUploading || uploadJobs.length === 0) return
    const allDone = uploadJobs.every(j => j.status === 'complete' || j.status === 'error')
    if (allDone) setIsUploading(false)
  }, [uploadJobs, isUploading])

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: '#030d2b' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, #B22234, #e11d48)', boxShadow: '0 0 30px rgba(178,34,52,0.5)' }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M8 8L24 16L8 24V8Z" fill="white" />
            </svg>
          </div>
          <p className="text-sm font-semibold tracking-wide" style={{ color: '#7491c4' }}>EIP Video Uploader</p>
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full"
                style={{ background: '#B22234' }}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <AppContext.Provider value={{
      auth, settings, channels, uploadJobs, isUploading,
      setAuth, setSettings, setChannels, setUploadJobs, setIsUploading,
      refreshChannels,
    }}>
      <HashRouter>
        <AnimatePresence mode="wait">
          {!auth.authenticated ? (
            <AuthScreen key="auth" />
          ) : (
            <Layout key="app">
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/upload" element={<UploadQueue />} />
                <Route path="/history" element={<History />} />
                <Route path="/duplicates" element={<DuplicateManager />} />
                <Route path="/videos" element={<VideoManager />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </Layout>
          )}
        </AnimatePresence>
      </HashRouter>
    </AppContext.Provider>
  )
}
