import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Shield, Zap, Upload, CheckCircle, AlertCircle, Loader2, Star } from 'lucide-react'
import { useApp } from '../App'

export default function AuthScreen() {
  const { setAuth } = useApp()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

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
    { icon: Zap,    text: 'Bulk Excel metadata import' },
    { icon: Shield, text: 'Secure OAuth 2.0 authentication' },
  ]

  return (
    <div className="w-full h-full flex overflow-hidden" style={{ background: '#FAF6EE' }}>
      {/* Titlebar drag area */}
      <div className="titlebar-drag fixed top-0 left-0 right-0 h-10 z-50" />

      {/* ── Left Panel — Branding ─────────────────────────────────────────── */}
      <div className="flex-1 relative flex flex-col items-center justify-center p-12 overflow-hidden">

        {/* Subtle star pattern background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-5">
          {[...Array(24)].map((_, i) => (
            <Star
              key={i}
              size={i % 3 === 0 ? 14 : 10}
              fill="#3C3B6E"
              stroke="none"
              style={{
                position: 'absolute',
                top:  `${(i * 37 + 11) % 95}%`,
                left: `${(i * 53 + 7)  % 95}%`,
              }}
            />
          ))}
        </div>

        {/* Patriotic gradient orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-32 w-80 h-80 rounded-full blur-3xl opacity-10"
               style={{ background: '#3C3B6E' }} />
          <div className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full blur-3xl opacity-10"
               style={{ background: '#B22234' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 rounded-full blur-2xl opacity-5"
               style={{ background: '#C9A961' }} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 flex flex-col items-center text-center max-w-md"
        >
          {/* Logo mark */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="mb-6"
          >
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-glow"
                 style={{ background: 'linear-gradient(135deg, #3C3B6E 0%, #B22234 100%)' }}>
              <Shield size={36} className="text-white" />
            </div>
            {/* Gold accent bar */}
            <div className="mt-2 mx-auto h-1 w-12 rounded-full" style={{ background: '#C9A961' }} />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-3xl font-bold mb-1"
            style={{ color: '#1C1C1C', fontFamily: 'Georgia, serif' }}
          >
            EIP Video Uploader
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="text-xs font-semibold uppercase tracking-widest mb-4"
            style={{ color: '#C9A961' }}
          >
            Elite Insurance Partners
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-sm mb-8 leading-relaxed"
            style={{ color: '#6B6B6B' }}
          >
            Bulk video upload platform for EIP brand channels.
            Upload hundreds of state-specific ad creatives with ease.
          </motion.p>

          {/* Feature list */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col gap-2.5 w-full mb-8"
          >
            {features.map(({ icon: Icon, text }, i) => (
              <motion.div
                key={text}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.1 }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background: '#FFFFFF', border: '1px solid #D4CFC4', boxShadow: '0 1px 4px rgba(28,25,20,0.06)' }}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                     style={{ background: '#eef0f8' }}>
                  <Icon size={15} style={{ color: '#3C3B6E' }} />
                </div>
                <span className="text-sm font-medium flex-1 text-left" style={{ color: '#1C1C1C' }}>{text}</span>
                <CheckCircle size={14} style={{ color: '#16a34a' }} className="flex-shrink-0" />
              </motion.div>
            ))}
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-xs"
            style={{ color: '#9B9B9B' }}
          >
            Supports 11 EIP brand channels including @MedicareCompared, @eliteinsurancepartners, and more
          </motion.p>
        </motion.div>
      </div>

      {/* Vertical divider with flag stripe */}
      <div className="flex-shrink-0 w-px relative">
        <div className="absolute inset-0" style={{ background: '#D4CFC4' }} />
        <div className="absolute top-0 bottom-0 left-0 w-px"
             style={{ background: 'linear-gradient(180deg, #3C3B6E 33%, #FFFFFF 33% 66%, #B22234 66%)' }} />
      </div>

      {/* ── Right Panel — Login ───────────────────────────────────────────── */}
      <div className="w-96 flex-shrink-0 flex flex-col items-center justify-center p-8"
           style={{ background: '#FFFFFF', borderLeft: '1px solid #D4CFC4' }}>
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-full max-w-sm"
        >
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-5 w-1 rounded-full" style={{ background: '#B22234' }} />
              <h2 className="text-xl font-bold" style={{ color: '#1C1C1C', fontFamily: 'Georgia, serif' }}>
                Sign in to continue
              </h2>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: '#6B6B6B' }}>
              Connect your Google account to access your YouTube brand channels.
            </p>
          </div>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 p-3 rounded-lg mb-4"
              style={{ background: '#fdf2f4', border: '1px solid #f8c9d0' }}
            >
              <AlertCircle size={16} style={{ color: '#B22234' }} className="flex-shrink-0 mt-0.5" />
              <p className="text-xs" style={{ color: '#B22234' }}>{error}</p>
            </motion.div>
          )}

          {/* Google Sign-In Button */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl font-semibold transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed mb-6"
            style={{
              background: loading ? '#322f5c' : '#3C3B6E',
              color: '#FFFFFF',
              boxShadow: '0 2px 8px rgba(60,59,110,0.3)',
            }}
            onMouseEnter={e => !loading && (e.currentTarget.style.background = '#322f5c')}
            onMouseLeave={e => !loading && (e.currentTarget.style.background = '#3C3B6E')}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Opening browser…</span>
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

          {/* Security note */}
          <div className="p-4 rounded-xl" style={{ background: '#FAF6EE', border: '1px solid #D4CFC4' }}>
            <div className="flex items-start gap-2.5">
              <Shield size={15} style={{ color: '#3C3B6E' }} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: '#1C1C1C' }}>Secure &amp; Private</p>
                <p className="text-xs leading-relaxed" style={{ color: '#6B6B6B' }}>
                  OAuth 2.0 authentication. Your credentials are stored locally and never transmitted to third parties.
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="h-px flex-1" style={{ background: '#D4CFC4' }} />
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full" style={{ background: '#3C3B6E' }} />
                <div className="w-2 h-2 rounded-full" style={{ background: '#FFFFFF', border: '1px solid #D4CFC4' }} />
                <div className="w-2 h-2 rounded-full" style={{ background: '#B22234' }} />
              </div>
              <div className="h-px flex-1" style={{ background: '#D4CFC4' }} />
            </div>
            <p className="text-xs" style={{ color: '#9B9B9B' }}>
              Elite Insurance Partners &copy; 2025
            </p>
            <p className="text-xs mt-1" style={{ color: '#9B9B9B' }}>
              Internal use only &mdash; not for distribution
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
