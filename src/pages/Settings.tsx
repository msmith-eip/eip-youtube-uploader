import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Settings as SettingsIcon, Save, Shield, Clock,
  Youtube, Info, CheckCircle, RefreshCw, LogOut
} from 'lucide-react'
import { useApp } from '../App'
import type { PrivacyStatus, AppSettings } from '../types'
import { EIP_CHANNELS } from '../utils/excelParser'

export default function Settings() {
  const { auth, settings, setSettings, setAuth, channels, refreshChannels } = useApp()
  const [localSettings, setLocalSettings] = useState<AppSettings>({ ...settings })
  const [saved, setSaved] = useState(false)
  const [refreshingChannels, setRefreshingChannels] = useState(false)

  const handleSave = async () => {
    await setSettings(localSettings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleLogout = async () => {
    if (window.electronAPI) {
      await window.electronAPI.auth.logout()
    }
    setAuth({ authenticated: false })
  }

  const handleRefreshChannels = async () => {
    setRefreshingChannels(true)
    await refreshChannels()
    setRefreshingChannels(false)
  }

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h2 className="text-xl font-bold text-surface-ink">Settings</h2>
          <p className="text-sm text-surface-muted mt-1">Configure upload defaults and account settings</p>
        </motion.div>

        {/* Account */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="card mb-4"
        >
          <div className="flex items-center gap-2 mb-4">
            <Shield size={16} className="text-brand-600" />
            <h3 className="text-sm font-bold text-surface-ink">Account</h3>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-surface-cream border border-surface-divider mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-600 to-brand-400 flex items-center justify-center">
                <span className="text-sm font-bold text-white">
                  {auth.email ? auth.email[0].toUpperCase() : 'E'}
                </span>
              </div>
              <div>
                <div className="text-sm font-semibold text-surface-ink">{auth.email || 'Connected'}</div>
                <div className="text-xs text-green-700 flex items-center gap-1 font-medium">
                  <CheckCircle size={10} />
                  Authenticated with Google
                </div>
              </div>
            </div>
            <button onClick={handleLogout} className="btn-danger text-xs py-1.5">
              <LogOut size={13} />
              Sign Out
            </button>
          </div>
        </motion.div>

        {/* Upload Defaults */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card mb-4"
        >
          <div className="flex items-center gap-2 mb-4">
            <Zap size={16} className="text-brand-600" />
            <h3 className="text-sm font-bold text-surface-ink">Upload Defaults</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Default Privacy</label>
              <select
                value={localSettings.defaultPrivacy}
                onChange={e => setLocalSettings(prev => ({ ...prev, defaultPrivacy: e.target.value as PrivacyStatus }))}
                className="input"
              >
                <option value="unlisted">Unlisted (Recommended)</option>
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
              <p className="text-[10px] text-surface-muted mt-1">
                Applied to new videos without explicit privacy setting
              </p>
            </div>

            <div>
              <label className="label">Default Category</label>
              <select
                value={localSettings.defaultCategory}
                onChange={e => setLocalSettings(prev => ({ ...prev, defaultCategory: e.target.value }))}
                className="input"
              >
                <option value="22">People & Blogs (Default)</option>
                <option value="27">Education</option>
                <option value="25">News & Politics</option>
                <option value="26">Howto & Style</option>
                <option value="28">Science & Technology</option>
                <option value="24">Entertainment</option>
              </select>
            </div>

            <div>
              <label className="label">Delay Between Uploads (ms)</label>
              <input
                type="number"
                min={500}
                max={10000}
                step={500}
                value={localSettings.delayBetweenUploads}
                onChange={e => setLocalSettings(prev => ({ ...prev, delayBetweenUploads: parseInt(e.target.value) }))}
                className="input"
              />
              <p className="text-[10px] text-surface-muted mt-1">
                Delay between uploads to prevent API throttling (min: 500ms)
              </p>
            </div>

            <div>
              <label className="label">Concurrent Uploads</label>
              <select
                value={localSettings.concurrentUploads}
                onChange={e => setLocalSettings(prev => ({ ...prev, concurrentUploads: parseInt(e.target.value) }))}
                className="input"
              >
                <option value={1}>1 (Sequential — Recommended)</option>
                <option value={2}>2 (Parallel)</option>
                <option value={3}>3 (Parallel)</option>
              </select>
              <p className="text-[10px] text-surface-muted mt-1">
                Higher values may hit API quota limits faster
              </p>
            </div>
          </div>
        </motion.div>

        {/* YouTube Channels */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="card mb-4"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Youtube size={16} className="text-danger-600" />
              <h3 className="text-sm font-bold text-surface-ink">Connected Channels</h3>
            </div>
            <button
              onClick={handleRefreshChannels}
              disabled={refreshingChannels}
              className="btn-secondary text-xs py-1.5"
            >
              <RefreshCw size={13} className={refreshingChannels ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {channels.length === 0 ? (
            <div className="p-4 rounded-xl bg-surface-cream border border-surface-divider text-center">
              <p className="text-xs text-surface-muted mb-2">No channels loaded</p>
              <button onClick={handleRefreshChannels} className="text-xs text-brand-600 hover:text-brand-700 font-semibold">
                Load channels from YouTube
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {channels.map(channel => (
                <div
                  key={channel.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-cream border border-surface-divider hover:border-brand-300 transition-colors"
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
                    <div className="text-xs font-semibold text-surface-ink">{channel.snippet.title}</div>
                    <div className="text-[10px] text-surface-muted">{channel.snippet.customUrl || channel.id}</div>
                  </div>
                  <CheckCircle size={13} className="text-green-600 flex-shrink-0" />
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 p-3 rounded-lg bg-surface-cream border border-surface-divider">
            <p className="text-xs font-bold text-surface-body mb-2">EIP Configured Channels</p>
            <div className="flex flex-wrap gap-1.5">
              {EIP_CHANNELS.map(c => (
                <span key={c.handle} className="text-[10px] px-2 py-0.5 rounded-full bg-white text-surface-body border border-surface-divider font-medium">
                  {c.handle}
                </span>
              ))}
            </div>
          </div>
        </motion.div>

        {/* API Info */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card mb-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Info size={16} className="text-brand-600" />
            <h3 className="text-sm font-bold text-surface-ink">API Information</h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Google Cloud Project', value: 'hidden-ensign-335216' },
              { label: 'Project Number',        value: '786706448902' },
              { label: 'API',                   value: 'YouTube Data API v3' },
              { label: 'Auth Method',            value: 'OAuth 2.0 Desktop App' },
              { label: 'Requested Daily Quota',  value: '1,200,000 units' },
              { label: 'Units per Upload',       value: '~100 units' },
            ].map(({ label, value }) => (
              <div key={label} className="p-2.5 rounded-lg bg-surface-cream border border-surface-divider">
                <div className="text-[10px] text-surface-muted uppercase tracking-wider mb-0.5 font-semibold">{label}</div>
                <div className="text-xs text-surface-ink font-mono font-semibold">{value}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Save Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="flex justify-end"
        >
          <button
            onClick={handleSave}
            className={saved
              ? 'inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-green-50 border border-green-300 text-green-700 font-semibold text-sm transition-all'
              : 'btn-primary'
            }
          >
            {saved ? (
              <>
                <CheckCircle size={16} />
                Settings Saved!
              </>
            ) : (
              <>
                <Save size={16} />
                Save Settings
              </>
            )}
          </button>
        </motion.div>
      </div>
    </div>
  )
}

// Inline icon
function Zap({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}
