import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Video, Shield, Zap, Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { useApp } from '../App'

export default function AuthScreen() {
  const { setAuth } = useApp()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async () => {
    setLoading(true)
    setError(null)
    try {
      if (typeof window !== 'undefined' && window.electronAPI) {
        const result = await window.electronAPI.auth.login()
        if (result.success) {
          const status = await window.electronAPI.auth.getStatus()
          setAuth(status)
        } else {
          setError(result.error || 'Authentication failed. Please try again.')
        }
      } else {
        // Demo mode for browser preview
        setAuth({ authenticated: true, email: 'marketing@teameip.com' })
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const features = [
    { icon: Upload, text: 'Upload 600+ videos per day' },
    { icon: Zap, text: 'Bulk Excel metadata import' },
    { icon: Shield, text: 'Secure OAuth 2.0 authentication' },
  ]

  return (
    <div className="w-full h-full flex bg-dark-950 overflow-hidden">
      {/* Titlebar drag area */}
      <div className="titlebar-drag fixed top-0 left-0 right-0 h-10 z-50" />

      {/* Left Panel - Branding */}
      <div className="flex-1 relative flex flex-col items-center justify-center p-12 overflow-hidden">
        {/* Background gradient orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-brand-600/10 blur-3xl" />
          <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-accent-purple/10 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-brand-500/5 blur-2xl" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 flex flex-col items-center text-center max-w-md"
        >
          {/* Logo */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-600 to-accent-purple flex items-center justify-center shadow-glow mb-6"
          >
            <Video size={36} className="text-white" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-3xl font-bold text-dark-50 mb-2"
          >
            EIP Video Uploader
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-dark-400 text-sm mb-8 leading-relaxed"
          >
            Elite Insurance Partners' bulk video upload platform for brand channels.
            Upload hundreds of state-specific ad creatives with ease.
          </motion.p>

          {/* Features */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col gap-3 w-full mb-8"
          >
            {features.map(({ icon: Icon, text }, i) => (
              <motion.div
                key={text}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.1 }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-dark-800/50 border border-dark-700"
              >
                <div className="w-8 h-8 rounded-lg bg-brand-600/20 flex items-center justify-center flex-shrink-0">
                  <Icon size={16} className="text-brand-400" />
                </div>
                <span className="text-sm text-dark-200">{text}</span>
                <CheckCircle size={14} className="text-accent-green ml-auto flex-shrink-0" />
              </motion.div>
            ))}
          </motion.div>

          {/* Channels preview */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-xs text-dark-500 text-center"
          >
            Supports 11 EIP brand channels including @MedicareCompared, @eliteinsurancepartners, and more
          </motion.div>
        </motion.div>
      </div>

      {/* Right Panel - Login */}
      <div className="w-96 flex-shrink-0 flex flex-col items-center justify-center p-8 bg-dark-900 border-l border-dark-700">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-full max-w-sm"
        >
          <div className="mb-8">
            <h2 className="text-xl font-bold text-dark-50 mb-2">Sign in to continue</h2>
            <p className="text-sm text-dark-400">
              Connect your Google account to access your YouTube brand channels.
            </p>
          </div>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 p-3 rounded-lg bg-accent-red/10 border border-accent-red/20 mb-4"
            >
              <AlertCircle size={16} className="text-accent-red flex-shrink-0 mt-0.5" />
              <p className="text-xs text-accent-red">{error}</p>
            </motion.div>
          )}

          {/* Login Button */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-semibold transition-all duration-200 shadow-glow disabled:opacity-60 disabled:cursor-not-allowed mb-4"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Opening browser...</span>
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span>Sign in with Google</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2 mb-6">
            <div className="flex-1 h-px bg-dark-700" />
            <span className="text-xs text-dark-500">or</span>
            <div className="flex-1 h-px bg-dark-700" />
          </div>

          {/* Security note */}
          <div className="p-3 rounded-lg bg-dark-800 border border-dark-700">
            <div className="flex items-start gap-2">
              <Shield size={14} className="text-brand-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-dark-200 mb-1">Secure & Private</p>
                <p className="text-xs text-dark-500 leading-relaxed">
                  OAuth 2.0 authentication. Your credentials are stored locally and never transmitted to third parties.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 text-center">
            <p className="text-xs text-dark-600">
              Elite Insurance Partners &copy; 2025
            </p>
            <p className="text-xs text-dark-600 mt-1">
              Internal use only &mdash; not for distribution
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
