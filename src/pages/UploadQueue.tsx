import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, FileSpreadsheet, FolderOpen, Plus, Trash2, Play,
  Pause, X, CheckCircle, AlertCircle, Clock, ChevronDown,
  ChevronUp, Edit3, Save, RefreshCw, Download, Eye,
  ExternalLink, Loader2, Search, Filter, SortAsc, Info
} from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { useApp } from '../App'
import type { UploadJob, PrivacyStatus } from '../types'
import { parseExcelFile, generateExcelTemplate, exportJobsToExcel, writeBackToExcel, updateChannelVideosSheet, formatFileSize, EIP_CHANNELS, YOUTUBE_CATEGORIES } from '../utils/excelParser'
import type { ChannelVideoEntry } from '../utils/excelParser'

type FilterStatus = 'all' | 'pending' | 'uploading' | 'complete' | 'error' | 'syncing'

// Helper: convert ArrayBuffer to base64 safely (avoids stack overflow on large files)
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

export default function UploadQueue() {
  const { auth, channels, uploadJobs, setUploadJobs, isUploading, setIsUploading, settings } = useApp()
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [editingJob, setEditingJob] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Partial<UploadJob>>({})
  const [videoFolder, setVideoFolder] = useState<string>('')
  const [expandedJob, setExpandedJob] = useState<string | null>(null)
  const [selectAll, setSelectAll] = useState(false)
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set())
  const [bulkPrivacy, setBulkPrivacy] = useState<PrivacyStatus>('unlisted')
  const [bulkChannel, setBulkChannel] = useState('')
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [excelFilePath, setExcelFilePath] = useState<string>('')
  const [excelBase64, setExcelBase64] = useState<string>('')
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [showPrivacyWarning, setShowPrivacyWarning] = useState(false)
  const [duplicateDialog, setDuplicateDialog] = useState<{
    index: number
    fileName: string
    existingUrl: string
    existingTitle: string
    uploadedAt: string
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  // Refs so the IPC closure always has the latest Excel state
  const excelFilePathRef = useRef<string>('')
  const excelBase64Ref = useRef<string>('')
  const uploadJobsRef = useRef<UploadJob[]>([])

  const showToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }, [])

  // Register upload event listeners
  useEffect(() => {
    if (!window.electronAPI) return

    window.electronAPI.upload.onJobStart(({ index, jobId }: any) => {
      setUploadJobs(prev => prev.map((job, i) =>
        (jobId ? job.id === jobId : i === index) ? { ...job, status: 'uploading', progress: 0 } : job
      ))
    })

    window.electronAPI.upload.onProgress(({ index, jobId, progress, bytesUploaded }: any) => {
      setUploadJobs(prev => prev.map((job, i) =>
        (jobId ? job.id === jobId : i === index) ? { ...job, progress, bytesUploaded } : job
      ))
    })

    window.electronAPI.upload.onJobComplete(({ index, jobId, videoId, youtubeUrl }: any) => {
      setUploadJobs(prev => {
        const updated: UploadJob[] = prev.map((job, i) =>
          (jobId ? job.id === jobId : i === index) ? { ...job, status: 'complete' as const, progress: 100, videoId, youtubeUrl } : job
        )
        uploadJobsRef.current = updated
        // Write back to Excel immediately after each successful upload
        const _base64 = excelBase64Ref.current
        const _path = excelFilePathRef.current
        if (_base64 && _path && window.electronAPI) {
          const results = updated.map(j => ({
            filename: j.filePath || j.fileName,
            fileName: j.fileName,
            status: j.status as 'complete' | 'error' | 'pending',
            videoId: j.videoId,
            youtubeUrl: j.youtubeUrl,
            error: j.error,
            uploadedAt: new Date().toISOString(),
          }))
          try {
            const updatedBuffer = writeBackToExcel(_base64, results)
            const dataArray = Array.from(new Uint8Array(updatedBuffer))
            // Update the in-memory base64 so the next write-back builds on the latest file state
            const updatedBase64 = bufferToBase64(updatedBuffer)
            excelBase64Ref.current = updatedBase64
            window.electronAPI.fs.overwriteFile({ filePath: _path, data: dataArray }).catch(() => {})
          } catch (err: any) {
            console.error('[WriteBack] Per-job write-back failed:', err?.message)
          }

          // Update the Channel Videos sheet: add just the new video immediately (no API call)
          // The full channel sync happens once at end-of-queue to save quota
          const completedJob = updated.find(j => jobId ? j.id === jobId : j.videoId === videoId) || updated[index]
          if (completedJob && videoId && youtubeUrl) {
            const newVideoEntry: ChannelVideoEntry = {
              videoId,
              title: completedJob.title || completedJob.fileName,
              url: youtubeUrl,
              publishedAt: new Date().toISOString(),
              channelName: completedJob.channelName || '',
              channelId: completedJob.channelId || '',
            }
            const currentBase64 = excelBase64Ref.current
            const currentPath = excelFilePathRef.current
            if (currentBase64 && currentPath && window.electronAPI) {
              try {
                // Add just the new video — no API fetch, no quota cost
                const sheetBuffer = updateChannelVideosSheet(currentBase64, newVideoEntry)
                const sheetArray = Array.from(new Uint8Array(sheetBuffer))
                const sheetBase64 = bufferToBase64(sheetBuffer)
                excelBase64Ref.current = sheetBase64
                window.electronAPI.fs.overwriteFile({ filePath: currentPath, data: sheetArray }).catch(() => {})
              } catch (e: any) {
                console.error('[ChannelSheet] Failed to update Channel Videos sheet:', e?.message)
              }
            }
          }
        }
        return updated
      })
    })

    window.electronAPI.upload.onJobError(({ index, jobId, error, canRetry }: any) => {
      setUploadJobs(prev => prev.map((job, i) =>
        (jobId ? job.id === jobId : i === index) ? { ...job, status: 'error', error, canRetry: canRetry || false } : job
      ))
    })
    ;(window.electronAPI.upload as any).onJobRetrying?.(({ index, jobId, attempt, error }: any) => {
      setUploadJobs(prev => prev.map((job, i) =>
        (jobId ? job.id === jobId : i === index) ? { ...job, status: 'retrying', error: `Retrying... (attempt ${attempt}: ${error})` } : job
      ))
    })
    ;(window.electronAPI.upload as any).onJobSyncing?.(({ index, jobId, message }: any) => {
      setUploadJobs(prev => prev.map((job, i) =>
        (jobId ? job.id === jobId : i === index) ? { ...job, status: 'syncing', error: message } : job
      ))
    })
    ;(window.electronAPI.upload as any).onJobSkipped?.(({ index, jobId, reason, existingUrl }: any) => {
      setUploadJobs(prev => prev.map((job, i) =>
        (jobId ? job.id === jobId : i === index) ? { ...job, status: 'skipped', skipReason: reason, existingUrl } : job
      ))
    })
    ;(window.electronAPI.upload as any).onJobPrivacyWarning?.(({ index, jobId }: any) => {
      setUploadJobs(prev => prev.map((job, i) =>
        (jobId ? job.id === jobId : i === index) ? { ...job, privacyForcedPrivate: true } : job
      ))
      setShowPrivacyWarning(true)
    })
    ;(window.electronAPI.upload as any).onDuplicateFound?.((data: any) => {
      setDuplicateDialog(data)
    })

    ;(window.electronAPI.upload as any).onLimitExceeded?.(() => {
      setIsUploading(false)
      showToast('error', 'YouTube channel upload limit reached — uploads stopped. The limit resets at midnight Pacific Time.')
    })

    window.electronAPI.upload.onAllComplete(async () => {
      setIsUploading(false)
      // Write back upload results to the original Excel file
      setUploadJobs(currentJobs => {
        const doWriteBack = async (jobs: typeof currentJobs) => {
          const _base64 = excelBase64Ref.current
          const _path = excelFilePathRef.current
          if (!_base64 || !_path || !window.electronAPI) return
          try {
            const results = jobs.map(j => ({
              filename: j.filePath || j.fileName,
              fileName: j.fileName,
              status: j.status as 'complete' | 'error' | 'pending',
              videoId: j.videoId,
              youtubeUrl: j.youtubeUrl,
              error: j.error,
              uploadedAt: new Date().toISOString(),
            }))
            const updatedBuffer = writeBackToExcel(_base64, results)
            const dataArray = Array.from(new Uint8Array(updatedBuffer))
            // Try to overwrite in-place first, fall back to Save As dialog
            const overwriteResult = await window.electronAPI!.fs.overwriteFile({ filePath: _path, data: dataArray })
            if (overwriteResult.success) {
              showToast('success', 'Excel updated with upload results ✓')
            } else {
              // Fall back to Save As
              await window.electronAPI!.fs.saveFile({
                defaultPath: _path.replace(/\.[^.]+$/, '_results.xlsx'),
                data: dataArray,
              })
              showToast('success', 'Upload results saved to Excel ✓')
            }
          } catch (err: any) {
            showToast('error', `Could not update Excel: ${err.message}`)
          }

          // Full channel sync at end-of-queue: fetch all videos once per unique channel
          // This replaces the per-upload fetch that was wasting ~8 quota units per video
          const completedJobs = jobs.filter(j => j.status === 'complete' && j.channelId)
          const uniqueChannelIds = [...new Set(completedJobs.map(j => j.channelId).filter(Boolean))]
          for (const channelId of uniqueChannelIds) {
            const channelJob = completedJobs.find(j => j.channelId === channelId)
            if (!channelJob || !window.electronAPI?.youtube?.fetchChannelVideos) continue
            try {
              const resp = await window.electronAPI.youtube.fetchChannelVideos(channelId)
              const allVideos: ChannelVideoEntry[] = (resp.success && resp.videos)
                ? resp.videos.map((v: any) => ({
                    videoId: v.videoId,
                    title: v.title,
                    url: v.url,
                    publishedAt: v.publishedAt,
                    channelName: v.channelName || channelJob.channelName,
                    channelId: v.channelId || channelId,
                  }))
                : []
              if (allVideos.length === 0) continue
              // Use the most recently uploaded video as the anchor entry
              const lastUploaded = completedJobs.filter(j => j.channelId === channelId).pop()
              if (!lastUploaded?.videoId || !lastUploaded?.youtubeUrl) continue
              const anchorEntry: ChannelVideoEntry = {
                videoId: lastUploaded.videoId,
                title: lastUploaded.title || lastUploaded.fileName,
                url: lastUploaded.youtubeUrl,
                publishedAt: new Date().toISOString(),
                channelName: lastUploaded.channelName || '',
                channelId: lastUploaded.channelId || '',
              }
              const currentBase64 = excelBase64Ref.current
              const currentPath = excelFilePathRef.current
              if (!currentBase64 || !currentPath || !window.electronAPI) continue
              const sheetBuffer = updateChannelVideosSheet(currentBase64, anchorEntry, allVideos)
              const sheetArray = Array.from(new Uint8Array(sheetBuffer))
              const sheetBase64 = bufferToBase64(sheetBuffer)
              excelBase64Ref.current = sheetBase64
              await window.electronAPI.fs.overwriteFile({ filePath: currentPath, data: sheetArray })
            } catch {
              // Quota or network error — skip full sync, per-upload entries already written
            }
          }
        }
        doWriteBack(currentJobs)
        return currentJobs
      })
    })

    return () => {
      window.electronAPI?.upload.removeAllListeners()
    }
  }, [setUploadJobs, setIsUploading])

  // Sync queue state on page mount — if an upload is running while the user navigated
  // away, restore the live job statuses so the UI shows the correct state on return.
  useEffect(() => {
    if (!window.electronAPI) return
    ;(window.electronAPI.upload as any).getQueueState?.().then((snapshot: any) => {
      if (!snapshot?.isUploading) return
      const { jobs, liveStates } = snapshot
      if (!jobs || jobs.length === 0) return
      setUploadJobs((prev: UploadJob[]) => {
        // Only sync if the current jobs array matches the snapshot (same length)
        if (prev.length !== jobs.length) return prev
        return prev.map((job: UploadJob, idx: number) => {
          const live = liveStates?.[idx]
          if (!live) return job
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
        })
      })
    }).catch(() => {})
  }, [setUploadJobs])

  // ── File Operations ──────────────────────────────────────────────────────────
  const handleAddVideos = async () => {
    if (!window.electronAPI) return
    const result = await window.electronAPI.dialog.openVideos()
    if (result.canceled || !result.filePaths.length) return

    const newJobs: UploadJob[] = await Promise.all(
      result.filePaths.map(async (filePath) => {
        const info = await window.electronAPI.fs.getFileInfo(filePath)
        return {
          id: uuidv4(),
          filePath,
          fileName: info.name || filePath.split('/').pop() || filePath,
          fileSize: info.size || 0,
          title: (info.name || '').replace(/\.[^.]+$/, ''),
          description: '',
          tags: '',
          privacy: settings.defaultPrivacy,
          channelId: channels[0]?.id || '',
          channelName: channels[0]?.snippet.title || '',
          categoryId: settings.defaultCategory,
          status: 'pending' as const,
          progress: 0,
          bytesUploaded: 0,
          addedAt: new Date().toISOString(),
        }
      })
    )
    setUploadJobs(prev => [...prev, ...newJobs])
  }

  const handleAddFolder = async () => {
    if (!window.electronAPI) return
    const result = await window.electronAPI.dialog.openFolder()
    if (result.canceled || !result.filePaths.length) return

    const folder = result.filePaths[0]
    setVideoFolder(folder)
    const folderResult = await window.electronAPI.fs.listFolder(folder)
    if (!folderResult.success || !folderResult.files) return

    const newJobs: UploadJob[] = folderResult.files.map(file => ({
      id: uuidv4(),
      filePath: file.path,
      fileName: file.name,
      fileSize: file.size,
      title: file.name.replace(/\.[^.]+$/, ''),
      description: '',
      tags: '',
      privacy: settings.defaultPrivacy,
      channelId: channels[0]?.id || '',
      channelName: channels[0]?.snippet.title || '',
      categoryId: settings.defaultCategory,
      status: 'pending' as const,
      progress: 0,
      bytesUploaded: 0,
      addedAt: new Date().toISOString(),
    }))
    setUploadJobs(prev => [...prev, ...newJobs])
  }

  // Shared Excel import logic used by both button and drag-drop
  const importExcelFromPath = useCallback(async (filePath: string) => {
    if (!window.electronAPI) return
    try {
      const fileResult = await window.electronAPI.fs.readFile(filePath)
      if (!fileResult.success || !fileResult.data) {
        showToast('error', `Could not read file: ${(fileResult as any).error || 'unknown error'}`)
        return
      }
      // Pass videoFolder as optional fallback — FILE_PATH column takes priority
      const jobs = parseExcelFile(fileResult.data, videoFolder || undefined)
      if (jobs.length === 0) {
        showToast('error', 'No valid rows found. Make sure the "filename" column is filled in the Upload Queue sheet.')
        return
      }
      const enriched = jobs.map(job => {
        const channelQuery = (job.channelName || '').toLowerCase().replace('@', '').trim()
        const matchedChannel = channels.find(c => {
          const customUrl = (c.snippet.customUrl || '').toLowerCase().replace('@', '')
          const title = (c.snippet.title || '').toLowerCase()
          return (
            customUrl === channelQuery ||
            title === channelQuery ||
            customUrl.includes(channelQuery) ||
            channelQuery.includes(customUrl) ||
            title.includes(channelQuery)
          )
        })
        return {
          ...job,
          channelId: matchedChannel?.id || job.channelId || channels[0]?.id || '',
          channelName: matchedChannel?.snippet.title || job.channelName || channels[0]?.snippet.title || '',
          privacy: (job.privacy || settings.defaultPrivacy) as PrivacyStatus,
        }
      })
      setUploadJobs(prev => [...prev, ...enriched])
      setExcelFilePath(filePath)
      excelFilePathRef.current = filePath
      setExcelBase64(fileResult.data)
      excelBase64Ref.current = fileResult.data
      showToast('success', `Imported ${enriched.length} video${enriched.length !== 1 ? 's' : ''} from Excel`)
    } catch (err: any) {
      showToast('error', `Excel import failed: ${err.message}`)
    }
  }, [videoFolder, channels, settings.defaultPrivacy, setUploadJobs, showToast, setExcelFilePath, setExcelBase64])

  const handleImportExcel = async () => {
    if (!window.electronAPI) return
    const result = await window.electronAPI.dialog.openExcel()
    if (result.canceled || !result.filePaths.length) return
    await importExcelFromPath(result.filePaths[0])
  }

  // Drag and Drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (!window.electronAPI) return
    const filePaths: string[] = []
    for (const file of Array.from(e.dataTransfer.files)) {
      const p = (file as any).path
      if (p) filePaths.push(p)
    }
    if (filePaths.length === 0) {
      showToast('error', 'Could not read dropped files. Try using the Add Videos button instead.')
      return
    }
    const result = await (window.electronAPI as any).fs.resolveDroppedFiles(filePaths)
    if (!result.success) { showToast('error', 'Failed to process dropped files.'); return }
    if (result.videos.length > 0) {
      const newJobs: UploadJob[] = result.videos.map((file: any) => ({
        id: uuidv4(),
        filePath: file.path,
        fileName: file.name,
        fileSize: file.size,
        title: file.name.replace(/\.[^.]+$/, ''),
        description: '',
        tags: '',
        privacy: settings.defaultPrivacy,
        channelId: channels[0]?.id || '',
        channelName: channels[0]?.snippet.title || '',
        categoryId: settings.defaultCategory,
        status: 'pending' as const,
        progress: 0,
        bytesUploaded: 0,
        addedAt: new Date().toISOString(),
      }))
      setUploadJobs(prev => [...prev, ...newJobs])
      showToast('success', `Added ${result.videos.length} video${result.videos.length !== 1 ? 's' : ''} to queue`)
    }
    for (const excel of result.excels) {
      await importExcelFromPath(excel.path)
    }
    if (result.videos.length === 0 && result.excels.length === 0) {
      showToast('info', 'No supported files found. Drop MP4/MOV video files or an Excel (.xlsx) file.')
    }
  }, [channels, settings, setUploadJobs, importExcelFromPath, showToast])

  const handleDownloadTemplate = async () => {
    if (!window.electronAPI) return
    const result = await window.electronAPI.dialog.saveExcel()
    if (result.canceled || !result.filePath) return

    const buffer = generateExcelTemplate()
    const base64 = bufferToBase64(buffer)

    // Use a data URL approach via a link
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'EIP_Upload_Template.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportResults = () => {
    if (uploadJobs.length === 0) return
    const buffer = exportJobsToExcel(uploadJobs)
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `EIP_Upload_Results_${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Upload Control ───────────────────────────────────────────────────────────
  const handleStartUpload = async () => {
    const pendingJobs = uploadJobs.filter(j => j.status === 'pending')
    if (pendingJobs.length === 0) return

    setIsUploading(true)
    if (window.electronAPI) {
      // ── Pre-upload: Build channel master list BEFORE uploading ──────────────────
      // Fetch all existing videos for each unique channel and write to Channel Videos sheet
      // This ensures we have a complete record even if quota runs out mid-upload
      if (excelBase64Ref.current && excelFilePathRef.current && window.electronAPI.youtube?.fetchChannelVideos) {
        const uniqueChannelIds = [...new Set(pendingJobs.map(j => j.channelId).filter(Boolean))] as string[]
        for (const channelId of uniqueChannelIds) {
          try {
            showToast('info', 'Building channel video master list before upload...')
            const resp = await window.electronAPI.youtube.fetchChannelVideos(channelId)
            if (resp.success && resp.videos && resp.videos.length > 0) {
              const channelJob = pendingJobs.find(j => j.channelId === channelId)
              const allVideos: ChannelVideoEntry[] = resp.videos.map((v: any) => ({
                videoId: v.videoId,
                title: v.title,
                url: v.url,
                publishedAt: v.publishedAt,
                channelName: v.channelName || channelJob?.channelName || '',
                channelId: v.channelId || channelId,
                viewCount: v.viewCount,
              }))
              // Use a placeholder anchor entry (will be replaced by real uploads)
              const anchorEntry: ChannelVideoEntry = allVideos[0]
              const sheetBuffer = updateChannelVideosSheet(excelBase64Ref.current, anchorEntry, allVideos)
              const sheetArray = Array.from(new Uint8Array(sheetBuffer))
              const sheetBase64 = bufferToBase64(sheetBuffer)
              excelBase64Ref.current = sheetBase64
              await window.electronAPI.fs.overwriteFile({ filePath: excelFilePathRef.current, data: sheetArray })
              showToast('success', `Channel master list built: ${resp.videos.length} videos logged`)
            }
          } catch {
            // If quota is exhausted, skip pre-upload sync and proceed with uploads
            showToast('info', 'Quota limit reached — skipping pre-upload master list. Uploads will proceed.')
          }
        }
      }
      await window.electronAPI.upload.start(pendingJobs)
    } else {
      // Demo mode simulation
      for (let i = 0; i < pendingJobs.length; i++) {
        const job = pendingJobs[i]
        setUploadJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'uploading' } : j))
        await new Promise(r => setTimeout(r, 500))
        for (let p = 0; p <= 100; p += 20) {
          setUploadJobs(prev => prev.map(j => j.id === job.id ? { ...j, progress: p } : j))
          await new Promise(r => setTimeout(r, 100))
        }
        setUploadJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'complete', progress: 100, videoId: 'demo_' + j.id } : j))
      }
      setIsUploading(false)
    }
  }

  const handleCancelUpload = async () => {
    if (window.electronAPI) {
      await window.electronAPI.upload.cancel()
    }
    setIsUploading(false)
    setUploadJobs(prev => prev.map(j => j.status === 'uploading' ? { ...j, status: 'pending', progress: 0 } : j))
  }

  const handleRemoveJob = (id: string) => {
    setUploadJobs(prev => prev.filter(j => j.id !== id))
  }

  const handleRemoveSelected = () => {
    setUploadJobs(prev => prev.filter(j => !selectedJobs.has(j.id)))
    setSelectedJobs(new Set())
  }

  const handleClearCompleted = () => {
    setUploadJobs(prev => prev.filter(j => j.status !== 'complete'))
  }

  // ── Editing ──────────────────────────────────────────────────────────────────
  const startEdit = (job: UploadJob) => {
    setEditingJob(job.id)
    setEditValues({
      title: job.title,
      description: job.description,
      tags: job.tags,
      privacy: job.privacy,
      channelId: job.channelId,
      channelName: job.channelName,
      categoryId: job.categoryId,
    })
  }

  const saveEdit = (id: string) => {
    setUploadJobs(prev => prev.map(j => j.id === id ? { ...j, ...editValues } : j))
    setEditingJob(null)
    setEditValues({})
  }

  const cancelEdit = () => {
    setEditingJob(null)
    setEditValues({})
  }

  // ── Bulk Edit ────────────────────────────────────────────────────────────────
  const applyBulkEdit = () => {
    setUploadJobs(prev => prev.map(j => {
      if (selectedJobs.has(j.id) || (selectedJobs.size === 0 && j.status === 'pending')) {
        const updates: Partial<UploadJob> = { privacy: bulkPrivacy }
        if (bulkChannel) {
          const ch = channels.find(c => c.id === bulkChannel)
          updates.channelId = bulkChannel
          updates.channelName = ch?.snippet.title || bulkChannel
        }
        return { ...j, ...updates }
      }
      return j
    }))
    setShowBulkEdit(false)
  }

  // ── Filtering ────────────────────────────────────────────────────────────────
  const filteredJobs = uploadJobs.filter(job => {
    if (filterStatus !== 'all') {
      // 'syncing' and 'retrying' are sub-states of uploading — show them under the uploading filter
      // 'skipped' shows under the 'error' filter tab
      const effectiveStatus = (job.status === 'syncing' || job.status === 'retrying') ? 'uploading'
        : job.status === 'skipped' ? 'error'
        : job.status
      if (effectiveStatus !== filterStatus) return false
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        job.fileName.toLowerCase().includes(q) ||
        job.title.toLowerCase().includes(q) ||
        job.channelName.toLowerCase().includes(q)
      )
    }
    return true
  })

  // ── Stats ────────────────────────────────────────────────────────────────────
  const stats = {
    total: uploadJobs.length,
    pending: uploadJobs.filter(j => j.status === 'pending').length,
    uploading: uploadJobs.filter(j => j.status === 'uploading' || j.status === 'syncing').length,
    complete: uploadJobs.filter(j => j.status === 'complete').length,
    error: uploadJobs.filter(j => j.status === 'error' || j.status === 'skipped').length,
    syncing: uploadJobs.filter(j => j.status === 'syncing').length,
  }

  const overallProgress = stats.total > 0
    ? Math.round(((stats.complete + stats.uploading * 0.5) / stats.total) * 100)
    : 0

  const toastColors = {
    success: 'bg-accent-green/10 border-accent-green/30 text-accent-green',
    error: 'bg-accent-red/10 border-accent-red/30 text-accent-red',
    info: 'bg-brand-500/10 border-brand-500/30 text-brand-400',
  }
  const toastIcons = {
    success: CheckCircle,
    error: AlertCircle,
    info: Info,
  }

  return (
    <div
      ref={dropZoneRef}
      className="flex flex-col h-full relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* ── Drag Overlay ── */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-dark-950/90 border-2 border-dashed border-brand-500 rounded-xl pointer-events-none"
          >
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="w-20 h-20 rounded-2xl bg-brand-600/20 flex items-center justify-center mb-4"
            >
              <Upload size={36} className="text-brand-400" />
            </motion.div>
            <p className="text-xl font-bold text-brand-300">Drop files here</p>
            <p className="text-sm text-dark-400 mt-2">Videos (MP4, MOV, AVI) or Excel (.xlsx) files</p>
            <p className="text-xs text-dark-500 mt-1">You can also drop entire folders of videos</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toast Notification ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.95 }}
            className={`absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl border shadow-lg text-sm font-medium ${toastColors[toast.type]}`}
          >
            {React.createElement(toastIcons[toast.type], { size: 15 })}
            {toast.message}
            <button onClick={() => setToast(null)} className="ml-2 opacity-60 hover:opacity-100">
              <X size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── YouTube Compliance Audit Warning Banner ── */}
      <AnimatePresence>
        {showPrivacyWarning && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex-shrink-0 mx-6 mt-4 rounded-xl border border-yellow-600/40 bg-yellow-950/40 px-4 py-3"
          >
            <div className="flex items-start gap-3">
              <AlertCircle size={18} className="text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-yellow-400">Videos forced to Private by YouTube</p>
                <p className="text-xs text-yellow-600 mt-1 leading-relaxed">
                  YouTube automatically restricts videos uploaded via API to <strong>Private</strong> when the Google Cloud project has not completed the <strong>YouTube Compliance Audit</strong>. This affects all API projects created after July 28, 2020.
                </p>
                <p className="text-xs text-yellow-600 mt-1 leading-relaxed">
                  To fix this, submit the YouTube API Compliance Audit request. Even for internal/personal tools, this audit is required to upload unlisted or public videos via the API.
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <a
                    href="https://support.google.com/youtube/contact/yt_api_form"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-600/20 hover:bg-yellow-600/35 border border-yellow-600/40 text-yellow-400 text-xs font-medium transition-colors"
                  >
                    <ExternalLink size={12} />
                    Submit Compliance Audit Request
                  </a>
                  <button
                    onClick={() => setShowPrivacyWarning(false)}
                    className="text-xs text-yellow-700 hover:text-yellow-500 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Duplicate File Dialog ── */}
      <AnimatePresence>
        {duplicateDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md mx-4 rounded-2xl border border-dark-700 bg-dark-900 shadow-2xl overflow-hidden"
            >
              <div className="px-6 pt-6 pb-4">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-yellow-500/15 border border-yellow-500/30 flex items-center justify-center flex-shrink-0">
                    <AlertCircle size={20} className="text-yellow-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-dark-50">Duplicate Video Found</h3>
                    <p className="text-xs text-dark-400 mt-0.5">This file was already uploaded to YouTube.</p>
                  </div>
                </div>
                <div className="rounded-xl bg-dark-800 border border-dark-700 px-4 py-3 mb-5">
                  <p className="text-xs text-dark-400 mb-1">File</p>
                  <p className="text-sm font-medium text-dark-100 truncate">{duplicateDialog.fileName}</p>
                  <p className="text-xs text-dark-400 mt-2 mb-1">Previously uploaded as</p>
                  <p className="text-sm text-dark-200 truncate">{duplicateDialog.existingTitle}</p>
                  <a
                    href={duplicateDialog.existingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-1 transition-colors"
                  >
                    <ExternalLink size={11} />
                    View on YouTube
                  </a>
                  <p className="text-xs text-dark-500 mt-2">
                    Uploaded {new Date(duplicateDialog.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <p className="text-sm text-dark-300 mb-4">What would you like to do?</p>
                <div className="flex flex-col gap-2">
                  {/* Upload as New Version — this one only */}
                  <button
                    onClick={async () => {
                      await (window.electronAPI.upload as any).resolveDuplicate?.({ index: duplicateDialog.index, resolution: 'new' })
                      setDuplicateDialog(null)
                    }}
                    className="w-full px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors text-left flex items-start gap-3"
                  >
                    <div>
                      <div>Upload as New Version</div>
                      <div className="text-xs font-normal text-blue-200 mt-0.5">Upload this one — both videos will exist on YouTube</div>
                    </div>
                  </button>
                  {/* Upload ALL remaining duplicates as new versions */}
                  <button
                    onClick={async () => {
                      await (window.electronAPI.upload as any).resolveDuplicate?.({ index: duplicateDialog.index, resolution: 'new-all' })
                      setDuplicateDialog(null)
                    }}
                    className="w-full px-4 py-3 rounded-xl bg-blue-900/60 hover:bg-blue-800/60 text-blue-200 text-sm font-semibold transition-colors text-left flex items-start gap-3 border border-blue-700/40"
                  >
                    <div>
                      <div>Upload All as New Version</div>
                      <div className="text-xs font-normal text-blue-300/70 mt-0.5">Apply to all remaining duplicates this session — no more prompts</div>
                    </div>
                  </button>
                  {/* Skip this one only */}
                  <button
                    onClick={async () => {
                      await (window.electronAPI.upload as any).resolveDuplicate?.({ index: duplicateDialog.index, resolution: 'skip' })
                      setDuplicateDialog(null)
                    }}
                    className="w-full px-4 py-3 rounded-xl bg-dark-800 hover:bg-dark-700 text-dark-300 text-sm font-medium transition-colors border border-dark-700 text-left"
                  >
                    <div>
                      <div>Skip This Video</div>
                      <div className="text-xs font-normal text-dark-500 mt-0.5">Skip this one, ask again for the next duplicate</div>
                    </div>
                  </button>
                  {/* Skip ALL remaining duplicates */}
                  <button
                    onClick={async () => {
                      await (window.electronAPI.upload as any).resolveDuplicate?.({ index: duplicateDialog.index, resolution: 'skip-all' })
                      setDuplicateDialog(null)
                    }}
                    className="w-full px-4 py-3 rounded-xl bg-dark-900 hover:bg-dark-800 text-dark-400 text-sm font-medium transition-colors border border-dark-700 text-left"
                  >
                    <div>
                      <div>Skip All Duplicates</div>
                      <div className="text-xs font-normal text-dark-500 mt-0.5">Skip all remaining duplicates this session — no more prompts</div>
                    </div>
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toolbar ── */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-dark-800 bg-dark-950">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-dark-50">Upload Queue</h2>
            <p className="text-xs text-dark-500 mt-0.5">
              {stats.total} videos &bull; {stats.complete} complete &bull; {stats.pending} pending
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Export */}
            {stats.complete > 0 && (
              <button onClick={handleExportResults} className="btn-secondary text-xs py-1.5">
                <Download size={14} />
                Export Results
              </button>
            )}

            {/* Template */}
            <button onClick={handleDownloadTemplate} className="btn-secondary text-xs py-1.5">
              <FileSpreadsheet size={14} />
              Download Template
            </button>

            {/* Cancel / Start */}
            {isUploading ? (
              <button onClick={handleCancelUpload} className="btn-danger text-xs py-1.5">
                <X size={14} />
                Cancel Upload
              </button>
            ) : (
              <button
                onClick={handleStartUpload}
                disabled={stats.pending === 0}
                className="btn-primary text-xs py-1.5 disabled:opacity-40"
              >
                <Play size={14} />
                Start Upload ({stats.pending})
              </button>
            )}
          </div>
        </div>

        {/* Progress bar (when uploading) */}
        {(isUploading || stats.complete > 0) && stats.total > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-dark-400 mb-1">
              <span>
                {isUploading ? 'Uploading...' : 'Upload complete'}
              </span>
              <span>{overallProgress}%</span>
            </div>
            <div className="progress-bar h-2">
              <motion.div
                className="progress-fill h-full"
                initial={{ width: 0 }}
                animate={{ width: `${overallProgress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        )}

        {/* Add files row */}
        <div className="flex items-center gap-2 mb-3">
          <button onClick={handleAddVideos} className="btn-secondary text-xs py-1.5">
            <Plus size={14} />
            Add Videos
          </button>
          <button onClick={handleAddFolder} className="btn-secondary text-xs py-1.5">
            <FolderOpen size={14} />
            Add Folder
          </button>
          <button onClick={handleImportExcel} className="btn-secondary text-xs py-1.5">
            <FileSpreadsheet size={14} />
            Import Excel
          </button>

          {videoFolder ? (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-dark-800 border border-dark-700 max-w-xs">
              <FolderOpen size={12} className="text-accent-green flex-shrink-0" />
              <span className="text-xs text-accent-green truncate" title={videoFolder}>
                {videoFolder.split('\\').pop() || videoFolder.split('/').pop()}
              </span>
              <button
                onClick={handleAddFolder}
                className="text-dark-500 hover:text-dark-300 ml-1 flex-shrink-0"
                title="Change video folder"
              >
                <RefreshCw size={10} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleAddFolder}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs hover:bg-amber-500/20 transition-all"
            >
              <FolderOpen size={12} />
              Set Video Folder
            </button>
          )}

          <div className="flex-1" />

          {/* Bulk edit toggle */}
          {uploadJobs.length > 0 && (
            <button
              onClick={() => setShowBulkEdit(!showBulkEdit)}
              className={`btn-secondary text-xs py-1.5 ${showBulkEdit ? 'border-brand-500 text-brand-400' : ''}`}
            >
              <Edit3 size={14} />
              Bulk Edit
            </button>
          )}

          {selectedJobs.size > 0 && (
            <button onClick={handleRemoveSelected} className="btn-danger text-xs py-1.5">
              <Trash2 size={14} />
              Remove ({selectedJobs.size})
            </button>
          )}

          {stats.complete > 0 && (
            <button onClick={handleClearCompleted} className="btn-secondary text-xs py-1.5 text-dark-400">
              <X size={14} />
              Clear Completed
            </button>
          )}
        </div>

        {/* Bulk Edit Panel */}
        <AnimatePresence>
          {showBulkEdit && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="p-3 rounded-xl bg-dark-800 border border-dark-700 mb-3 flex items-end gap-3">
                <div className="flex-1">
                  <label className="label">Apply Privacy to {selectedJobs.size > 0 ? `${selectedJobs.size} selected` : 'all pending'}</label>
                  <select
                    value={bulkPrivacy}
                    onChange={e => setBulkPrivacy(e.target.value as PrivacyStatus)}
                    className="input"
                  >
                    <option value="unlisted">Unlisted (Default)</option>
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="label">Apply Channel</label>
                  <select
                    value={bulkChannel}
                    onChange={e => setBulkChannel(e.target.value)}
                    className="input"
                  >
                    <option value="">— Keep existing —</option>
                    {channels.map(c => (
                      <option key={c.id} value={c.id}>{c.snippet.title}</option>
                    ))}
                  </select>
                </div>
                <button onClick={applyBulkEdit} className="btn-primary text-xs py-2">
                  <Save size={14} />
                  Apply
                </button>
                <button onClick={() => setShowBulkEdit(false)} className="btn-secondary text-xs py-2">
                  <X size={14} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filter / Search row */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
            <input
              type="text"
              placeholder="Search videos..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input pl-8 py-1.5 text-xs"
            />
          </div>

          <div className="flex items-center gap-1">
            {(['all', 'pending', 'uploading', 'complete', 'error'] as FilterStatus[]).map(status => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  filterStatus === status
                    ? 'bg-brand-600/20 text-brand-400 border border-brand-500/30'
                    : 'text-dark-400 hover:text-dark-200 hover:bg-dark-700'
                }`}
              >
                {status === 'all' ? `All (${stats.total})` :
                 status === 'pending' ? `Pending (${stats.pending})` :
                 status === 'uploading' ? `Uploading (${stats.uploading})` :
                 status === 'complete' ? `Done (${stats.complete})` :
                 `Errors (${stats.error})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Job List ── */}
      <div className="flex-1 overflow-auto px-6 py-3">
        {filteredJobs.length === 0 ? (
          <EmptyState onAddVideos={handleAddVideos} onImportExcel={handleImportExcel} onDownloadTemplate={handleDownloadTemplate} />
        ) : (
          <div className="flex flex-col gap-2">
            {/* Select All */}
            <div className="flex items-center gap-2 px-2 py-1">
              <input
                type="checkbox"
                checked={selectAll}
                onChange={e => {
                  setSelectAll(e.target.checked)
                  if (e.target.checked) {
                    setSelectedJobs(new Set(filteredJobs.map(j => j.id)))
                  } else {
                    setSelectedJobs(new Set())
                  }
                }}
                className="w-3.5 h-3.5 accent-brand-500"
              />
              <span className="text-xs text-dark-500">Select all ({filteredJobs.length})</span>
            </div>

            <AnimatePresence mode="popLayout">
              {filteredJobs.map((job, index) => (
                <JobRow
                  key={job.id}
                  job={job}
                  index={index}
                  channels={channels}
                  isEditing={editingJob === job.id}
                  editValues={editValues}
                  isExpanded={expandedJob === job.id}
                  isSelected={selectedJobs.has(job.id)}
                  onSelect={checked => {
                    const next = new Set(selectedJobs)
                    if (checked) next.add(job.id)
                    else next.delete(job.id)
                    setSelectedJobs(next)
                  }}
                  onExpand={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                  onRetry={async () => {
                    const queueIndex = filteredJobs.findIndex(j => j.id === job.id)
                    setUploadJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'uploading', error: undefined, canRetry: false, progress: 0 } : j))
                    if (window.electronAPI) {
                      await (window.electronAPI.upload as any).retryJob({ ...job, _queueIndex: queueIndex })
                    }
                  }}
                  onBrowseFile={async () => {
                    if (!window.electronAPI) return
                    // Small delay to ensure window focus before opening native dialog
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
                    let info: any = { name: newPath.split(/[/\\]/).pop(), size: 0 }
                    try {
                      info = await window.electronAPI.fs.getFileInfo(newPath)
                    } catch (e) {}
                    setUploadJobs(prev => prev.map(j => j.id === job.id ? {
                      ...j,
                      filePath: newPath,
                      fileName: info.name || newPath.split(/[/\\]/).pop() || newPath,
                      fileSize: info.size || j.fileSize,
                      status: 'pending',
                      error: undefined,
                      canRetry: false,
                      progress: 0,
                    } : j))
                  }}
                  onEdit={() => startEdit(job)}
                  onSave={() => saveEdit(job.id)}
                  onCancelEdit={cancelEdit}
                  onRemove={() => handleRemoveJob(job.id)}
                  onEditChange={updates => setEditValues(prev => ({ ...prev, ...updates }))}
                  onForceUpload={async () => {
                    const queueIndex = filteredJobs.findIndex(j => j.id === job.id)
                    setUploadJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'uploading', error: undefined, skipReason: undefined, existingUrl: undefined, progress: 0 } : j))
                    if (window.electronAPI) {
                      await (window.electronAPI.upload as any).forceUploadJob?.({ ...job, _queueIndex: queueIndex })
                    }
                  }}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Job Row Component ────────────────────────────────────────────────────────
interface JobRowProps {
  job: UploadJob
  index: number
  channels: any[]
  isEditing: boolean
  editValues: Partial<UploadJob>
  isExpanded: boolean
  isSelected: boolean
  onSelect: (checked: boolean) => void
  onExpand: () => void
  onRetry?: () => void
  onForceUpload?: () => void
  onBrowseFile?: () => void
  onEdit: () => void
  onSave: () => void
  onCancelEdit: () => void
  onRemove: () => void
  onEditChange: (updates: Partial<UploadJob>) => void
}

function JobRow({
  job, index, channels, isEditing, editValues, isExpanded,
  isSelected, onSelect, onExpand, onEdit, onSave, onCancelEdit, onRemove, onEditChange,
  onRetry, onForceUpload, onBrowseFile
}: JobRowProps) {
  const statusColors = {
    pending: 'text-dark-400',
    uploading: 'text-brand-400',
    syncing: 'text-yellow-400',
    complete: 'text-accent-green',
    error: 'text-accent-red',
    cancelled: 'text-dark-500',
    skipped: 'text-yellow-600',
  }

  const privacyBadge = {
    unlisted: 'badge-unlisted',
    private: 'badge-private',
    public: 'badge-public',
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2, delay: index * 0.02 }}
      className={`rounded-xl border transition-all duration-200 overflow-hidden ${
        isSelected
          ? 'border-brand-500/40 bg-brand-600/5'
          : job.status === 'error'
          ? 'border-accent-red/20 bg-dark-800'
          : job.status === 'complete'
          ? 'border-accent-green/15 bg-dark-800'
          : job.status === 'uploading'
          ? 'border-brand-500/30 bg-dark-800'
          : job.status === 'syncing'
          ? 'border-yellow-500/30 bg-dark-800'
          : job.status === 'skipped'
          ? 'border-yellow-700/30 bg-dark-800'
          : 'border-dark-700 bg-dark-800 hover:border-dark-600'
      }`}
    >
      {/* Main Row */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={e => onSelect(e.target.checked)}
          className="w-3.5 h-3.5 accent-brand-500 flex-shrink-0"
          disabled={job.status === 'uploading' || job.status === 'syncing'}
        />

        {/* Status Icon */}
        <div className="flex-shrink-0 w-6 flex items-center justify-center">
          {job.status === 'pending' && <Clock size={14} className="text-dark-500" />}
          {job.status === 'uploading' && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <Loader2 size={14} className="text-brand-400" />
            </motion.div>
          )}
          {job.status === 'syncing' && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            >
              <RefreshCw size={14} className="text-yellow-400" />
            </motion.div>
          )}
          {job.status === 'complete' && <CheckCircle size={14} className="text-accent-green" />}
          {job.status === 'error' && <AlertCircle size={14} className="text-accent-red" />}
          {job.status === 'cancelled' && <X size={14} className="text-dark-500" />}
          {job.status === 'skipped' && <AlertCircle size={14} className="text-yellow-600" />}
        </div>

        {/* File info */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              type="text"
              value={editValues.title || ''}
              onChange={e => onEditChange({ title: e.target.value })}
              className="input py-1 text-xs w-full"
              placeholder="Video title"
              autoFocus
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-dark-100 truncate">{job.title}</span>
              {job.status === 'complete' && job.youtubeUrl && (
                <a
                  href={job.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0"
                  onClick={e => e.stopPropagation()}
                >
                  <ExternalLink size={11} className="text-dark-500 hover:text-brand-400" />
                </a>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-dark-500 break-all leading-tight">{job.fileName}</span>
            {job.fileSize > 0 && (
              <span className="text-[10px] text-dark-600">{formatFileSize(job.fileSize)}</span>
            )}
          </div>
        </div>

        {/* Channel */}
        <div className="w-36 flex-shrink-0">
          {isEditing ? (
            <select
              value={editValues.channelId || ''}
              onChange={e => {
                const ch = channels.find(c => c.id === e.target.value)
                onEditChange({ channelId: e.target.value, channelName: ch?.snippet.title || e.target.value })
              }}
              className="input py-1 text-xs"
            >
              <option value="">Select channel</option>
              {channels.map(c => (
                <option key={c.id} value={c.id}>{c.snippet.title}</option>
              ))}
              {/* Fallback EIP channels if not loaded */}
              {channels.length === 0 && EIP_CHANNELS.map(c => (
                <option key={c.handle} value={c.handle}>{c.name}</option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-dark-400 truncate block">{job.channelName || '—'}</span>
          )}
        </div>

        {/* Privacy */}
        <div className="w-20 flex-shrink-0">
          {isEditing ? (
            <select
              value={editValues.privacy || 'unlisted'}
              onChange={e => onEditChange({ privacy: e.target.value as PrivacyStatus })}
              className="input py-1 text-xs"
            >
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          ) : (
            <span className={privacyBadge[job.privacy] || 'badge-pending'}>
              {job.privacy}
            </span>
          )}
        </div>

        {/* Progress */}
        <div className="w-24 flex-shrink-0">
          {job.status === 'uploading' && (
            <div>
              <div className="flex justify-between text-[10px] text-dark-500 mb-0.5">
                <span>{job.progress}%</span>
                <span>{formatFileSize(job.bytesUploaded)}</span>
              </div>
              <div className="progress-bar">
                <motion.div
                  className="progress-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${job.progress}%` }}
                  transition={{ duration: 0.3, ease: 'linear' }}
                  style={{ transformOrigin: 'left center' }}
                />
              </div>
            </div>
          )}
          {job.status === 'complete' && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-accent-green font-medium">Uploaded</span>
              {job.privacyForcedPrivate && (
                <span className="text-[9px] text-yellow-500 font-medium leading-tight" title="YouTube forced this video to Private. Your API project needs a Compliance Audit.">
                  ⚠ Forced Private
                </span>
              )}
            </div>
          )}
          {job.status === 'retrying' && (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse flex-shrink-0" />
                <span className="text-[10px] text-yellow-400 font-medium">Retrying...</span>
              </div>
            </div>
          )}
          {job.status === 'syncing' && (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse flex-shrink-0" />
                <span className="text-[10px] text-yellow-400 font-medium">Syncing...</span>
              </div>
              <span className="text-[9px] text-yellow-500/70 leading-tight">OneDrive</span>
            </div>
          )}
          {job.status === 'error' && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-accent-red font-medium">Failed</span>
              <div className="flex flex-col gap-0.5">
                {job.canRetry && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRetry?.() }}
                    className="px-2 py-0.5 rounded text-[10px] bg-accent-red/20 hover:bg-accent-red/40 text-accent-red border border-accent-red/30 transition-colors font-medium w-fit"
                    title="Retry upload"
                  >
                    Retry
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onBrowseFile?.() }}
                  className="px-2 py-0.5 rounded text-[10px] bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-dark-100 border border-dark-600 transition-colors font-medium w-fit"
                  title="Locate video file"
                >
                  Browse...
                </button>
              </div>
            </div>
          )}
          {job.status === 'pending' && (
            <span className="text-[10px] text-dark-500">Queued</span>
          )}
          {job.status === 'skipped' && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-yellow-600 font-medium">Skipped</span>
              <div className="flex flex-col gap-0.5">
                {job.existingUrl && (
                  <a
                    href={job.existingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[9px] text-yellow-700/80 hover:text-yellow-500 underline leading-tight"
                    onClick={e => e.stopPropagation()}
                  >
                    View existing
                  </a>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onForceUpload?.() }}
                  className="px-2 py-0.5 rounded text-[10px] bg-yellow-700/20 hover:bg-yellow-700/40 text-yellow-500 border border-yellow-700/30 transition-colors font-medium w-fit"
                  title="Upload anyway, ignoring duplicate check"
                >
                  Upload Anyway
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {isEditing ? (
            <>
              <button
                onClick={onSave}
                className="p-1.5 rounded-lg bg-accent-green/15 hover:bg-accent-green/25 text-accent-green transition-colors"
                title="Save"
              >
                <Save size={12} />
              </button>
              <button
                onClick={onCancelEdit}
                className="p-1.5 rounded-lg hover:bg-dark-700 text-dark-400 transition-colors"
                title="Cancel"
              >
                <X size={12} />
              </button>
            </>
          ) : (
            <>
              {job.status === 'pending' && (
                <button
                  onClick={onEdit}
                  className="p-1.5 rounded-lg hover:bg-dark-700 text-dark-500 hover:text-dark-200 transition-colors"
                  title="Edit"
                >
                  <Edit3 size={12} />
                </button>
              )}
              <button
                onClick={onExpand}
                className="p-1.5 rounded-lg hover:bg-dark-700 text-dark-500 hover:text-dark-200 transition-colors"
                title="Expand"
              >
                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {job.status !== 'uploading' && job.status !== 'syncing' && (
                <button
                  onClick={onRemove}
                  className="p-1.5 rounded-lg hover:bg-accent-red/15 text-dark-500 hover:text-accent-red transition-colors"
                  title="Remove"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Expanded Details */}
      <AnimatePresence>
        {isExpanded && !isEditing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-dark-700"
          >
            <div className="px-4 py-3 grid grid-cols-2 gap-4">
              <div>
                <label className="label">Description</label>
                <p className="text-xs text-dark-300 bg-dark-900 rounded-lg p-2 min-h-[60px] whitespace-pre-wrap">
                  {job.description || <span className="text-dark-600 italic">No description</span>}
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="label">Tags</label>
                  <div className="flex flex-wrap gap-1">
                    {job.tags ? job.tags.split(',').map(tag => (
                      <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-dark-700 text-dark-300 border border-dark-600">
                        {tag.trim()}
                      </span>
                    )) : <span className="text-xs text-dark-600 italic">No tags</span>}
                  </div>
                </div>
                <div className="flex gap-4">
                  <div>
                    <label className="label">Category</label>
                    <span className="text-xs text-dark-300">
                      {YOUTUBE_CATEGORIES.find(c => c.id === job.categoryId)?.name || job.categoryId}
                    </span>
                  </div>
                  {job.videoId && (
                    <div>
                      <label className="label">Video ID</label>
                      <span className="text-xs text-dark-300 font-mono">{job.videoId}</span>
                    </div>
                  )}
                </div>
                {job.error && (
                  <div>
                    <label className="label text-accent-red">Error</label>
                    <p className="text-xs text-accent-red bg-accent-red/5 rounded-lg p-2">{job.error}</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Expanded Edit Form */}
        {isExpanded && isEditing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-dark-700"
          >
            <div className="px-4 py-3 grid grid-cols-2 gap-4">
              <div>
                <label className="label">Description</label>
                <textarea
                  value={editValues.description || ''}
                  onChange={e => onEditChange({ description: e.target.value })}
                  className="input resize-none h-24 text-xs"
                  placeholder="Video description..."
                />
              </div>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="label">Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={editValues.tags || ''}
                    onChange={e => onEditChange({ tags: e.target.value })}
                    className="input text-xs"
                    placeholder="medicare, florida, insurance"
                  />
                </div>
                <div>
                  <label className="label">Category</label>
                  <select
                    value={editValues.categoryId || '22'}
                    onChange={e => onEditChange({ categoryId: e.target.value })}
                    className="input text-xs"
                  >
                    {YOUTUBE_CATEGORIES.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({
  onAddVideos, onImportExcel, onDownloadTemplate
}: {
  onAddVideos: () => void
  onImportExcel: () => void
  onDownloadTemplate: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center h-full py-20 text-center"
    >
      <div className="w-20 h-20 rounded-2xl bg-dark-800 border border-dark-700 flex items-center justify-center mb-6">
        <Upload size={32} className="text-dark-500" />
      </div>
      <h3 className="text-lg font-semibold text-dark-200 mb-2">No videos in queue</h3>
      <p className="text-sm text-dark-500 mb-8 max-w-md leading-relaxed">
        Add videos individually, import an entire folder, or use an Excel file to bulk-import
        videos with metadata pre-filled.
      </p>

      <div className="grid grid-cols-3 gap-3 max-w-xl">
        <button
          onClick={onAddVideos}
          className="flex flex-col items-center gap-3 p-5 rounded-xl bg-dark-800 border border-dark-700 hover:border-brand-500/40 hover:bg-dark-700 transition-all duration-200 group"
        >
          <div className="w-10 h-10 rounded-xl bg-brand-600/15 group-hover:bg-brand-600/25 flex items-center justify-center transition-colors">
            <Plus size={20} className="text-brand-400" />
          </div>
          <div>
            <div className="text-sm font-medium text-dark-200">Add Videos</div>
            <div className="text-xs text-dark-500 mt-0.5">Select MP4 files</div>
          </div>
        </button>

        <button
          onClick={onImportExcel}
          className="flex flex-col items-center gap-3 p-5 rounded-xl bg-dark-800 border border-dark-700 hover:border-accent-green/40 hover:bg-dark-700 transition-all duration-200 group"
        >
          <div className="w-10 h-10 rounded-xl bg-accent-green/10 group-hover:bg-accent-green/20 flex items-center justify-center transition-colors">
            <FileSpreadsheet size={20} className="text-accent-green" />
          </div>
          <div>
            <div className="text-sm font-medium text-dark-200">Import Excel</div>
            <div className="text-xs text-dark-500 mt-0.5">Bulk metadata import</div>
          </div>
        </button>

        <button
          onClick={onDownloadTemplate}
          className="flex flex-col items-center gap-3 p-5 rounded-xl bg-dark-800 border border-dark-700 hover:border-accent-yellow/40 hover:bg-dark-700 transition-all duration-200 group"
        >
          <div className="w-10 h-10 rounded-xl bg-accent-yellow/10 group-hover:bg-accent-yellow/20 flex items-center justify-center transition-colors">
            <Download size={20} className="text-accent-yellow" />
          </div>
          <div>
            <div className="text-sm font-medium text-dark-200">Get Template</div>
            <div className="text-xs text-dark-500 mt-0.5">Download Excel template</div>
          </div>
        </button>
      </div>

      <div className="mt-8 p-4 rounded-xl bg-dark-800/50 border border-dark-700 max-w-lg text-left">
        <p className="text-xs font-semibold text-dark-300 mb-2">Excel Template Columns:</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          {[
            ['filename', 'Video file name (required)'],
            ['title', 'YouTube video title (required)'],
            ['description', 'Video description'],
            ['tags', 'Comma-separated tags'],
            ['privacy', 'unlisted / private / public'],
            ['channel', 'Channel handle (e.g. @MedicareCompared)'],
          ].map(([col, desc]) => (
            <div key={col} className="flex items-start gap-1.5">
              <code className="text-[10px] text-brand-400 font-mono bg-brand-600/10 px-1 rounded flex-shrink-0">{col}</code>
              <span className="text-[10px] text-dark-500">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
