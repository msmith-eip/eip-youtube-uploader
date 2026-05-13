import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import Store from 'electron-store'
import { Readable } from 'stream'
import { autoUpdater } from 'electron-updater'
import { CLIENT_ID, CLIENT_SECRET } from './oauth.config'

const isDev = process.env.NODE_ENV === 'development'

// ─── OneDrive Placeholder Detection & Hydration ───────────────────────────────
// FILE_ATTRIBUTE_OFFLINE = 0x1000 | FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS = 0x400000
// These flags indicate a OneDrive Files-On-Demand placeholder (cloud-only file)
function isOneDrivePlaceholder(filePath: string): boolean {
  if (process.platform !== 'win32') return false
  try {
    const { execFileSync } = require('child_process')
    // Pass path as a variable to avoid quoting issues
    const script = `$p = [System.Uri]::UnescapeDataString('${encodeURIComponent(filePath)}'); [int][System.IO.File]::GetAttributes($p)`
    const result = execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command', script,
    ], { timeout: 5000, encoding: 'utf8' }).trim()
    const attrs = parseInt(result, 10)
    if (isNaN(attrs)) return false
    const OFFLINE = 0x1000
    const RECALL_ON_DATA_ACCESS = 0x400000
    return (attrs & OFFLINE) !== 0 || (attrs & RECALL_ON_DATA_ACCESS) !== 0
  } catch {
    return false
  }
}

async function hydrateOneDriveFile(
  filePath: string,
  onProgress: (msg: string) => void,
  timeoutMs = 300000
): Promise<void> {
  const basename = require('path').basename(filePath)
  onProgress(`Syncing from OneDrive: ${basename}`)
  addLog('info', 'OneDrive', `Triggering OneDrive download for: ${filePath}`)
  // Trigger hydration by attempting a small read — this wakes up OneDrive sync
  await new Promise<void>((resolve) => {
    const { execFile: execFileCb } = require('child_process')
    execFileCb('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `$p = [System.Uri]::UnescapeDataString('${encodeURIComponent(filePath)}'); try { $s = [System.IO.File]::OpenRead($p); $b = New-Object byte[] 1; $s.Read($b,0,1)|Out-Null; $s.Close() } catch {}`,
    ], { timeout: 30000 }, () => resolve())
  })
  // Poll until the file is no longer a placeholder
  const pollInterval = 3000
  const startTime = Date.now()
  while (Date.now() - startTime < timeoutMs) {
    if (!isOneDrivePlaceholder(filePath)) {
      try {
        const stat = require('fs').statSync(filePath)
        if (stat.size > 0) {
          addLog('success', 'OneDrive', `File synced: ${basename}`)
          return
        }
      } catch { /* keep polling */ }
    }
    const elapsed = Math.round((Date.now() - startTime) / 1000)
    onProgress(`Waiting for OneDrive sync... (${elapsed}s elapsed)`)
    await new Promise(r => setTimeout(r, pollInterval))
  }
  throw new Error(`OneDrive sync timed out after ${timeoutMs / 1000}s for: ${basename}`)
}

// ─── Store ────────────────────────────────────────────────────────────────────
const store = new Store({
  name: 'eip-uploader-config',
  defaults: {
    tokens: null,
    uploadHistory: [],
    settings: {
      defaultPrivacy: 'unlisted',
      defaultCategory: '22',
      concurrentUploads: 1,
      delayBetweenUploads: 2000,
    },
    quota: {
      usedUnits: 0,
      resetDate: '',  // ISO date string YYYY-MM-DD (Pacific Time)
    },
  },
})

// ─── Quota Tracking ───────────────────────────────────────────────────────────
// YouTube Data API v3 quota costs (verified from Google docs, updated 2026-04-28):
//   videos.insert          = 100 units per upload
//   videos.list            = 1 unit
//   videos.update          = 50 units
//   thumbnails.set         = 50 units
//   captions.insert        = 400 units
//   playlistItems.insert   = 50 units
//   channels.list          = 1 unit
//   playlistItems.list     = 1 unit
//   search.list            = 100 units
// Daily limit: 10,000 units default (resets at midnight Pacific Time / 08:00 UTC)
export const QUOTA_COSTS = {
  VIDEOS_INSERT: 100,
  VIDEOS_LIST: 1,
  VIDEOS_UPDATE: 50,
  THUMBNAILS_SET: 50,
  CAPTIONS_INSERT: 400,
  PLAYLIST_ITEMS_INSERT: 50,
  CHANNELS_LIST: 1,
  PLAYLIST_ITEMS_LIST: 1,
  SEARCH_LIST: 100,
} as const
const QUOTA_DAILY_LIMIT = 10000

function getQuotaResetDatePT(): string {
  // Returns today's date in Pacific Time as YYYY-MM-DD
  const now = new Date()
  const ptStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  return ptStr
}

function addQuota(units: number, operation: string): void {
  const today = getQuotaResetDatePT()
  const quota = store.get('quota') as { usedUnits: number; resetDate: string }
  // Reset if it's a new day (or if resetDate is missing/invalid)
  if (!quota.resetDate || quota.resetDate !== today) {
    // Reset to 0 first, then add the current units
    store.set('quota', { usedUnits: units, resetDate: today })
  } else {
    store.set('quota.usedUnits', (quota.usedUnits || 0) + units)
  }
  const updated = store.get('quota') as { usedUnits: number; resetDate: string }
  const pct = Math.min(100, Math.round((updated.usedUnits / QUOTA_DAILY_LIMIT) * 100))
  addLog('info', 'Quota', `+${units} units (${operation}) — ${updated.usedUnits.toLocaleString()} / ${QUOTA_DAILY_LIMIT.toLocaleString()} used (${pct}%)`)
  // Push update to renderer
  mainWindow?.webContents.send('quota:update', { usedUnits: updated.usedUnits, resetDate: updated.resetDate, dailyLimit: QUOTA_DAILY_LIMIT })
}

// ─── OAuth2 Setup ─────────────────────────────────────────────────────────────
const REDIRECT_URI = 'http://localhost:8765'

let oauth2Client: OAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)

// Load saved tokens
const savedTokens = store.get('tokens') as any
if (savedTokens) {
  oauth2Client.setCredentials(savedTokens)
}

// ─── Upload State ─────────────────────────────────────────────────────────────
let uploadQueue: any[] = []
let isUploading = false
let currentUploadIndex = 0
let cancelUpload = false
let mainWindow: BrowserWindow | null = null

// ─── Window Creation ──────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0c0e1a',
      symbolColor: '#6272f1',
      height: 38,
    },
    backgroundColor: '#0c0e1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    icon: path.join(__dirname, '../public/icon.png'),
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ─── IPC: Auth ────────────────────────────────────────────────────────────────
ipcMain.handle('auth:get-status', async () => {
  try {
    const tokens = store.get('tokens') as any
    if (!tokens) return { authenticated: false }
    oauth2Client.setCredentials(tokens)
    const tokenInfo = await oauth2Client.getTokenInfo(tokens.access_token)
    return { authenticated: true, email: tokenInfo.email }
  } catch {
    return { authenticated: false }
  }
})

ipcMain.handle('auth:login', async () => {
  return new Promise((resolve) => {
    const http = require('http')
    const url = require('url')

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      prompt: 'consent',
    })

    // Start local server to catch redirect
    const server = http.createServer(async (req: any, res: any) => {
      const parsedUrl = url.parse(req.url, true)
      if (parsedUrl.pathname === '/') {
        const code = parsedUrl.query.code
        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(`
            <html><body style="background:#0c0e1a;color:#6272f1;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
              <div style="text-align:center;">
                <h2 style="font-size:24px;margin-bottom:8px;">Authentication Successful!</h2>
                <p style="color:#9aa1b1;">You can close this window and return to EIP Uploader.</p>
              </div>
            </body></html>
          `)
          server.close()
          try {
            const { tokens } = await oauth2Client.getToken(code as string)
            oauth2Client.setCredentials(tokens)
            store.set('tokens', tokens)
            resolve({ success: true })
          } catch (err: any) {
            resolve({ success: false, error: err.message })
          }
        }
      }
    })

    server.listen(8765, () => {
      shell.openExternal(authUrl)
    })

    server.on('error', (err: any) => {
      resolve({ success: false, error: err.message })
    })
  })
})

ipcMain.handle('auth:logout', async () => {
  store.set('tokens', null)
  oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)
  return { success: true }
})

// ─── IPC: Channels ────────────────────────────────────────────────────────────
ipcMain.handle('youtube:get-channels', async () => {
  try {
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client })
    const response = await youtube.channels.list({
      part: ['snippet', 'contentDetails'],
      mine: true,
      maxResults: 50,
    })
    addQuota(QUOTA_COSTS.CHANNELS_LIST, 'channels.list')
    return { success: true, channels: response.data.items || [] }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// ─── IPC: File Dialog ─────────────────────────────────────────────────────────
ipcMain.handle('dialog:open-videos', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Select Video Files',
    filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv'] }],
    properties: ['openFile', 'multiSelections'],
  })
  return result
})

ipcMain.handle('dialog:open-excel', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Select Metadata Excel File',
    filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls', 'csv'] }],
    properties: ['openFile'],
  })
  return result
})

ipcMain.handle('dialog:save-excel', async () => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Save Excel Template',
    defaultPath: 'EIP_Upload_Template.xlsx',
    filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
  })
  return result
})

ipcMain.handle('dialog:open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Select Videos Folder',
    properties: ['openDirectory'],
  })
  return result
})

// ─── IPC: File System ─────────────────────────────────────────────────────────
ipcMain.handle('fs:read-file', async (_, filePath: string) => {
  try {
    const buffer = fs.readFileSync(filePath)
    return { success: true, data: buffer.toString('base64') }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('fs:get-file-info', async (_, filePath: string) => {
  try {
    const stat = fs.statSync(filePath)
    return { success: true, size: stat.size, name: path.basename(filePath) }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('fs:list-folder', async (_, folderPath: string) => {
  try {
    const files = fs.readdirSync(folderPath)
    const videoExts = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv']
    const videos = files
      .filter(f => videoExts.includes(path.extname(f).toLowerCase()))
      .map(f => ({
        name: f,
        path: path.join(folderPath, f),
        size: fs.statSync(path.join(folderPath, f)).size,
      }))
    return { success: true, files: videos }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// ─── IPC: Drop File Resolution ──────────────────────────────────────────────
ipcMain.handle('fs:resolve-dropped-files', async (_, filePaths: string[]) => {
  const videoExts = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv']
  const excelExts = ['.xlsx', '.xls', '.csv']
  const videos: { name: string; path: string; size: number }[] = []
  const excels: { name: string; path: string }[] = []
  for (const filePath of filePaths) {
    try {
      const stat = fs.statSync(filePath)
      const ext = path.extname(filePath).toLowerCase()
      if (stat.isDirectory()) {
        // Expand folder to videos
        const files = fs.readdirSync(filePath)
        for (const f of files) {
          if (videoExts.includes(path.extname(f).toLowerCase())) {
            const fullPath = path.join(filePath, f)
            videos.push({ name: f, path: fullPath, size: fs.statSync(fullPath).size })
          }
        }
      } else if (videoExts.includes(ext)) {
        videos.push({ name: path.basename(filePath), path: filePath, size: stat.size })
      } else if (excelExts.includes(ext)) {
        excels.push({ name: path.basename(filePath), path: filePath })
      }
    } catch (err) { /* skip unreadable files */ }
  }
  return { success: true, videos, excels }
})
// ─── IPC: Settings ────────────────────────────────────────────────────────────
ipcMain.handle('settings:get', async () => {
  return store.get('settings')
})

ipcMain.handle('settings:set', async (_, settings: any) => {
  store.set('settings', settings)
  return { success: true }
})

// ─── IPC: Upload History ──────────────────────────────────────────────────────
ipcMain.handle('history:get', async () => {
  return store.get('uploadHistory') || []
})

ipcMain.handle('history:clear', async () => {
  store.set('uploadHistory', [])
  return { success: true }
})

// ─── IPC: Upload ──────────────────────────────────────────────────────────────
ipcMain.handle('upload:start', async (event, jobs: any[]) => {
  if (isUploading) return { success: false, error: 'Upload already in progress' }

  uploadQueue = jobs
  isUploading = true
  cancelUpload = false
  currentUploadIndex = 0

  const settings = store.get('settings') as any
  const delay = settings?.delayBetweenUploads || 2000
  const history = (store.get('uploadHistory') as any[]) || []

  for (let i = 0; i < uploadQueue.length; i++) {
    if (cancelUpload) break

    currentUploadIndex = i
    const job = uploadQueue[i]

    // ── Skip already-completed or skipped jobs (resume after cancel) ───────────────────────
    if (job.status === 'complete' || job.status === 'skipped') {
      addLog('info', 'Upload', `Skipping already-completed job: ${job.fileName || job.filePath}`)
      continue
    }

    // ── Duplicate filename check ───────────────────────────────────────────────────────────────
    // If this filename was already uploaded successfully, ask the user what to do
    if (!job.forceUpload) {
      const jobFileName = require('path').basename(job.filePath.trim())
      const duplicate = history.find(
        (h: any) => h.status === 'success' && h.filePath && require('path').basename(h.filePath) === jobFileName
      )
      if (duplicate) {
        addLog('info', 'Upload', `Duplicate found: ${jobFileName} — waiting for user resolution`)
        // Emit event to renderer and wait for user's choice via IPC
        mainWindow?.webContents.send('upload:duplicate-found', {
          index: i,
          fileName: jobFileName,
          existingUrl: duplicate.youtubeUrl,
          existingTitle: duplicate.title || jobFileName,
          uploadedAt: duplicate.uploadedAt,
        })
        // Wait for user to resolve (resolve-duplicate IPC invoke)
        const resolution: string = await new Promise((resolve) => {
          const handler = (_evt: any, data: any) => {
            if (data.index === i) {
              ipcMain.removeHandler('upload:resolve-duplicate')
              resolve(data.resolution)
            }
          }
          ipcMain.handleOnce('upload:resolve-duplicate', handler)
        })
        if (resolution === 'skip') {
          addLog('info', 'Upload', `User skipped duplicate: ${jobFileName}`)
          mainWindow?.webContents.send('upload:job-skipped', {
            index: i,
            jobId: job.id,
            reason: `Skipped by user (duplicate of ${jobFileName})`,
            existingUrl: duplicate.youtubeUrl,
          })
          continue
        }
        // 'replace' or 'new' — both proceed with upload; 'replace' is just informational
        addLog('info', 'Upload', `User chose '${resolution}' for duplicate: ${jobFileName} — proceeding with upload`)
      }
    }

    // Notify start
    mainWindow?.webContents.send('upload:job-start', { index: i, jobId: job.id, job })

    const attemptUpload = async (attempt: number): Promise<void> => {
      // Refresh token if needed
      const tokens = store.get('tokens') as any
      if (tokens) oauth2Client.setCredentials(tokens)

      const youtube = google.youtube({ version: 'v3', auth: oauth2Client })

      // Normalize file path - trim whitespace for Windows paths with spaces
      const normalizedPath = job.filePath.trim()
      // ── OneDrive Files-On-Demand: detect placeholder and trigger download ──
      if (isOneDrivePlaceholder(normalizedPath)) {
        mainWindow?.webContents.send('upload:job-syncing', { index: i, jobId: job.id, message: 'Syncing from OneDrive...' })
        addLog('info', 'OneDrive', `Placeholder detected for job ${i}: ${normalizedPath}`)
        await hydrateOneDriveFile(normalizedPath, (msg) => {
          mainWindow?.webContents.send('upload:job-syncing', { index: i, jobId: job.id, message: msg })
        })
      }
      // Check file exists before attempting to stream it — gives a clear error instead of ENOENT
      if (!fs.existsSync(normalizedPath)) {
        const hint = normalizedPath.includes('OneDrive') && !normalizedPath.includes('OneDrive - ')
          ? `File not found. The path may be missing "OneDrive - " — check that the FILE_PATH in your spreadsheet matches the full OneDrive path on this machine.`
          : `File not found. Check that the file exists at: ${normalizedPath}`
        throw new Error(hint)
      }
      const fileStream = fs.createReadStream(normalizedPath)
      const fileStat = fs.statSync(normalizedPath)

      const response = await youtube.videos.insert(
        {
          part: ['snippet', 'status'],
          requestBody: {
            snippet: {
              title: job.title || job.fileName.replace(/\.[^/.]+$/, ''),
              description: job.description || '',
              tags: job.tags ? job.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
              categoryId: job.categoryId || '22',
              channelId: job.channelId || undefined,
              defaultLanguage: job.language || 'en',
              defaultAudioLanguage: job.language || 'en',
            },
            status: {
              privacyStatus: job.privacy || 'unlisted',
              selfDeclaredMadeForKids: job.selfDeclaredMadeForKids ?? false,
              containsSyntheticMedia: job.containsSyntheticMedia ?? true,
            } as any,
          },
          media: {
            mimeType: 'video/mp4',
            body: fileStream,
          },
        },
        {
          onUploadProgress: (evt: any) => {
            const progress = Math.round((evt.bytesRead / fileStat.size) * 100)
            mainWindow?.webContents.send('upload:progress', {
              index: i,
              jobId: job.id,
              progress,
              bytesUploaded: evt.bytesRead,
              totalBytes: fileStat.size,
            })
          },
        }
      )

      const videoId = response.data.id
      addQuota(QUOTA_COSTS.VIDEOS_INSERT, `videos.insert (${job.fileName || job.title})`)
      const historyEntry = {
        id: videoId,
        title: job.title,
        channel: job.channelName || job.channelId,
        privacy: job.privacy,
        uploadedAt: new Date().toISOString(),
        filePath: job.filePath,
        youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
        status: 'success',
      }
      history.unshift(historyEntry)
      store.set('uploadHistory', history.slice(0, 1000))

      mainWindow?.webContents.send('upload:job-complete', {
        index: i,
        jobId: job.id,
        videoId,
        youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
      })

      // Check if YouTube silently forced the video to private (unverified API project)
      checkPrivacyForcedPrivate(youtube, videoId!, job.privacy || 'unlisted', i).catch(() => {})

      // Delay between uploads
      if (i < uploadQueue.length - 1 && !cancelUpload) {
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    try {
      await attemptUpload(1)
    } catch (err: any) {
      // Auto-retry once after 3 seconds
      mainWindow?.webContents.send('upload:job-retrying', {
        index: i,
        jobId: job.id,
        attempt: 1,
        error: err.message || 'Upload failed',
      })
      await new Promise(resolve => setTimeout(resolve, 3000))
      try {
        await attemptUpload(2)
      } catch (err2: any) {
        // Both attempts failed - mark as error with retry button
        const errMsg = err2.message || 'Upload failed after retry'
        addLog('error', 'Upload', `Failed: ${job.fileName || job.filePath}`, errMsg)
        mainWindow?.webContents.send('upload:job-error', {
          index: i,
          jobId: job.id,
          error: errMsg,
          canRetry: true,
        })
        // Save failed upload to history
        const failedEntry = {
          id: `failed-${Date.now()}-${i}`,
          title: job.title || job.fileName,
          channel: job.channelName || job.channelId,
          privacy: job.privacy,
          uploadedAt: new Date().toISOString(),
          filePath: job.filePath,
          youtubeUrl: '',
          status: 'failed',
          error: errMsg,
        }
        history.unshift(failedEntry)
        store.set('uploadHistory', history.slice(0, 1000))
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }

  isUploading = false
  mainWindow?.webContents.send('upload:all-complete', {
    total: uploadQueue.length,
    cancelled: cancelUpload,
  })

  return { success: true }
})

ipcMain.handle('upload:cancel', async () => {
  cancelUpload = true
  isUploading = false
  return { success: true }
})
ipcMain.handle('upload:retry-job', async (event, job: any) => {
  // Retry a single failed job
  mainWindow?.webContents.send('upload:job-start', { index: job._queueIndex || 0, job })
  const attemptSingle = async (): Promise<void> => {
    const tokens = store.get('tokens') as any
    if (tokens) oauth2Client.setCredentials(tokens)
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client })
    const normalizedPath = job.filePath.trim()
    // ── OneDrive Files-On-Demand: detect placeholder and trigger download ──
    const retryIndex = job._queueIndex || 0
    if (isOneDrivePlaceholder(normalizedPath)) {
      mainWindow?.webContents.send('upload:job-syncing', { index: retryIndex, message: 'Syncing from OneDrive...' })
      addLog('info', 'OneDrive', `Placeholder detected for retry: ${normalizedPath}`)
      await hydrateOneDriveFile(normalizedPath, (msg) => {
        mainWindow?.webContents.send('upload:job-syncing', { index: retryIndex, message: msg })
      })
    }
    const fileStream = fs.createReadStream(normalizedPath)
    const fileStat = fs.statSync(normalizedPath)
    const response = await youtube.videos.insert(
      {
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: job.title || job.fileName.replace(/\.[^/.]+$/, ''),
            description: job.description || '',
            tags: job.tags ? job.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
            categoryId: job.categoryId || '22',
            channelId: job.channelId || undefined,
          },
          status: {
            privacyStatus: job.privacy || 'unlisted',
            // Per-job values from spreadsheet; defaults: not made for kids, contains synthetic media
            selfDeclaredMadeForKids: job.selfDeclaredMadeForKids ?? false,
            containsSyntheticMedia: job.containsSyntheticMedia ?? true,
          } as any,
        },
        media: { mimeType: 'video/mp4', body: fileStream },
      },
      {
        onUploadProgress: (evt: any) => {
          const progress = Math.round((evt.bytesRead / fileStat.size) * 100)
          mainWindow?.webContents.send('upload:progress', {
            index: job._queueIndex || 0,
            progress,
            bytesUploaded: evt.bytesRead,
            totalBytes: fileStat.size,
          })
        },
      }
    )
    const videoId = response.data.id
    addQuota(QUOTA_COSTS.VIDEOS_INSERT, `videos.insert/retry (${job.fileName || job.title})`)
    const history = (store.get('uploadHistory') as any[]) || []
    history.unshift({
      id: videoId,
      title: job.title,
      channel: job.channelName || job.channelId,
      privacy: job.privacy,
      uploadedAt: new Date().toISOString(),
      filePath: job.filePath,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    })
    store.set('uploadHistory', history.slice(0, 1000))
    mainWindow?.webContents.send('upload:job-complete', {
      index: job._queueIndex || 0,
      videoId,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    })
    // Check if YouTube silently forced the video to private (unverified API project)
    checkPrivacyForcedPrivate(youtube, videoId!, job.privacy || 'unlisted', job._queueIndex || 0).catch(() => {})
  }
  try {
    await attemptSingle()
    return { success: true }
  } catch (err: any) {
    addLog('error', 'Upload', `Retry failed: ${job.fileName || job.filePath}`, err.message || 'Retry failed')
    mainWindow?.webContents.send('upload:job-error', {
      index: job._queueIndex,
      error: err.message || 'Retry failed',
      canRetry: true,
    })
    return { success: false, error: err.message }
  }
})

// Force-upload a previously skipped job (bypasses duplicate check)
ipcMain.handle('upload:force-upload-job', async (event, job: any) => {
  // Reuse the retry handler logic — same flow, just with forceUpload semantics
  const forceIndex = job._queueIndex || 0
  mainWindow?.webContents.send('upload:job-start', { index: forceIndex, job })
  const attemptForce = async (): Promise<void> => {
    const tokens = store.get('tokens') as any
    if (tokens) oauth2Client.setCredentials(tokens)
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client })
    const normalizedPath = job.filePath.trim()
    if (isOneDrivePlaceholder(normalizedPath)) {
      mainWindow?.webContents.send('upload:job-syncing', { index: forceIndex, message: 'Syncing from OneDrive...' })
      await hydrateOneDriveFile(normalizedPath, (msg) => {
        mainWindow?.webContents.send('upload:job-syncing', { index: forceIndex, message: msg })
      })
    }
    const fileStream = fs.createReadStream(normalizedPath)
    const fileStat = fs.statSync(normalizedPath)
    const response = await youtube.videos.insert(
      {
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: job.title || job.fileName.replace(/\.[^/.]+$/, ''),
            description: job.description || '',
            tags: job.tags ? job.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
            categoryId: job.categoryId || '22',
            channelId: job.channelId || undefined,
          },
          status: {
            privacyStatus: job.privacy || 'unlisted',
            selfDeclaredMadeForKids: job.selfDeclaredMadeForKids ?? false,
            containsSyntheticMedia: job.containsSyntheticMedia ?? true,
          } as any,
        },
        media: { mimeType: 'video/mp4', body: fileStream },
      },
      {
        onUploadProgress: (evt: any) => {
          const progress = Math.round((evt.bytesRead / fileStat.size) * 100)
          mainWindow?.webContents.send('upload:progress', {
            index: forceIndex,
            progress,
            bytesUploaded: evt.bytesRead,
            totalBytes: fileStat.size,
          })
        },
      }
    )
    const videoId = response.data.id
    addQuota(QUOTA_COSTS.VIDEOS_INSERT, `videos.insert/force (${job.fileName || job.title})`)
    const history = (store.get('uploadHistory') as any[]) || []
    history.unshift({
      id: videoId,
      title: job.title || job.fileName,
      channel: job.channelName || job.channelId,
      privacy: job.privacy,
      uploadedAt: new Date().toISOString(),
      filePath: job.filePath,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
      status: 'success',
    })
    store.set('uploadHistory', history.slice(0, 1000))
    mainWindow?.webContents.send('upload:job-complete', {
      index: forceIndex,
      videoId,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    })
    // Check if YouTube silently forced the video to private (unverified API project)
    checkPrivacyForcedPrivate(youtube, videoId!, job.privacy || 'unlisted', forceIndex).catch(() => {})
  }
  try {
    await attemptForce()
    return { success: true }
  } catch (err: any) {
    addLog('error', 'Upload', `Force upload failed: ${job.fileName || job.filePath}`, err.message || 'Force upload failed')
    mainWindow?.webContents.send('upload:job-error', {
      index: forceIndex,
      error: err.message || 'Force upload failed',
      canRetry: true,
    })
    return { success: false, error: err.message }
  }
})

ipcMain.handle('upload:get-status', async () => {
  return {
    isUploading,
    currentIndex: currentUploadIndex,
    total: uploadQueue.length,
  }
})

// ─── In-App Log System ────────────────────────────────────────────────────────
interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'success'
  category: string
  message: string
  detail?: string
}

const MAX_LOGS = 5000

// ─── Persistent Log File ─────────────────────────────────────────────────────
// Logs are stored in a plain JSON file in the user data directory so they
// survive app updates, reinstalls, and electron-store schema changes.
const LOG_FILE = path.join(app.getPath('userData'), 'activity-log.json')

function loadLogsFromDisk(): LogEntry[] {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const raw = fs.readFileSync(LOG_FILE, 'utf-8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.slice(0, MAX_LOGS)
    }
  } catch {}
  return []
}

function saveLogsToDisk(logs: LogEntry[]) {
  try {
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs.slice(0, MAX_LOGS)), 'utf-8')
  } catch {}
}

const appLogs: LogEntry[] = loadLogsFromDisk()

function addLog(level: LogEntry['level'], category: string, message: string, detail?: string) {
  const entry: LogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    detail,
  }
  appLogs.unshift(entry)
  if (appLogs.length > MAX_LOGS) appLogs.splice(MAX_LOGS)
  // Persist to disk immediately so logs survive crashes and updates
  saveLogsToDisk(appLogs)
  // Push to renderer in real-time
  mainWindow?.webContents.send('logs:new-entry', entry)
}

// ─── Post-Upload Privacy Check ───────────────────────────────────────────────
// YouTube silently forces videos to 'private' when the API project has not
// passed the YouTube Compliance Audit (required for all projects created after
// July 28, 2020 that upload via videos.insert).
async function checkPrivacyForcedPrivate(
  youtube: any,
  videoId: string,
  intendedPrivacy: string,
  jobIndex: number
): Promise<void> {
  // NOTE: Privacy check API call removed to save 1 quota unit per upload.
  // YouTube may force videos to 'private' on unverified API projects.
  // If the intended privacy is not 'private', log an informational warning.
  if (intendedPrivacy !== 'private') {
    addLog('info', 'Upload',
      `Video ${videoId} uploaded as '${intendedPrivacy}'. Note: YouTube may force to private on unverified API projects.`)
  }
}

// Intercept console methods to capture all logs
const _consoleLog = console.log.bind(console)
const _consoleWarn = console.warn.bind(console)
const _consoleError = console.error.bind(console)
console.log = (...args: any[]) => {
  _consoleLog(...args)
  addLog('info', 'App', args.map(String).join(' '))
}
console.warn = (...args: any[]) => {
  _consoleWarn(...args)
  addLog('warn', 'App', args.map(String).join(' '))
}
console.error = (...args: any[]) => {
  _consoleError(...args)
  addLog('error', 'App', args.map(String).join(' '))
}

// Capture uncaught exceptions
process.on('uncaughtException', (err) => {
  addLog('error', 'Uncaught', err.message, err.stack)
})
process.on('unhandledRejection', (reason: any) => {
  addLog('error', 'Unhandled', String(reason?.message || reason), reason?.stack)
})

// IPC: Logs
ipcMain.handle('logs:get-all', async () => {
  return appLogs
})
ipcMain.handle('logs:clear', async () => {
  appLogs.splice(0, appLogs.length)
  saveLogsToDisk(appLogs)
  return { success: true }
})
ipcMain.handle('logs:export', async () => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Export Logs',
    defaultPath: `eip-uploader-logs-${new Date().toISOString().slice(0, 10)}.txt`,
    filters: [{ name: 'Text Files', extensions: ['txt'] }],
  })
  if (result.canceled || !result.filePath) return { success: false }
  const lines = appLogs.map(e =>
    `[${e.timestamp}] [${e.level.toUpperCase()}] [${e.category}] ${e.message}${e.detail ? '\n  ' + e.detail : ''}`
  ).join('\n')
  fs.writeFileSync(result.filePath, lines, 'utf-8')
  return { success: true, filePath: result.filePath }
})

// Log app startup
addLog('info', 'App', `EIP Video Uploader started — v${app.getVersion()}`, `Platform: ${process.platform} | Electron: ${process.versions.electron} | Node: ${process.versions.node}`)

// ─── Auto Updater ─────────────────────────────────────────────────────────────
autoUpdater.autoDownload = false       // User must click "Download Update"
autoUpdater.autoInstallOnAppQuit = true // Install when app quits

// Forward all updater events to the renderer
autoUpdater.on('checking-for-update', () => {
  addLog('info', 'Updater', 'Checking for updates...')
  mainWindow?.webContents.send('updater:checking')
})

autoUpdater.on('update-available', (info) => {
  addLog('info', 'Updater', `Update available: v${info.version}`, `Release date: ${info.releaseDate}`)
  mainWindow?.webContents.send('updater:available', {
    version: info.version,
    releaseDate: info.releaseDate,
    releaseNotes: info.releaseNotes,
  })
})

autoUpdater.on('update-not-available', (info) => {
  addLog('info', 'Updater', `App is up to date (v${info.version})`)
  mainWindow?.webContents.send('updater:not-available', { version: info.version })
})

autoUpdater.on('download-progress', (progress) => {
  const pct = Math.round(progress.percent)
  addLog('info', 'Updater', `Downloading update: ${pct}% (${(progress.transferred / 1024 / 1024).toFixed(1)} MB / ${(progress.total / 1024 / 1024).toFixed(1)} MB)`)
  mainWindow?.webContents.send('updater:download-progress', {
    percent: pct,
    transferred: progress.transferred,
    total: progress.total,
    bytesPerSecond: progress.bytesPerSecond,
  })
})

autoUpdater.on('update-downloaded', (info) => {
  addLog('info', 'Updater', `Update v${info.version} downloaded — ready to install`)
  mainWindow?.webContents.send('updater:downloaded', { version: info.version })
})

autoUpdater.on('error', (err) => {
  addLog('error', 'Updater', `Update error: ${err.message}`, err.stack)
  mainWindow?.webContents.send('updater:error', { message: err.message })
})

// IPC: Check for updates manually
ipcMain.handle('updater:check', async () => {
  if (isDev) {
    return { success: false, message: 'Auto-update is disabled in development mode.' }
  }
  try {
    await autoUpdater.checkForUpdates()
    return { success: true }
  } catch (err: any) {
    return { success: false, message: err.message }
  }
})

// IPC: Start downloading the update
ipcMain.handle('updater:download', async () => {
  try {
    await autoUpdater.downloadUpdate()
    return { success: true }
  } catch (err: any) {
    return { success: false, message: err.message }
  }
})

// IPC: Quit and install the downloaded update
ipcMain.handle('updater:install', async () => {
  autoUpdater.quitAndInstall(false, true)
  return { success: true }
})

// IPC: Get current version
ipcMain.handle('updater:get-version', async () => {
  return { version: app.getVersion() }
})

// Auto-check for updates 5 seconds after app is ready (non-dev only)
app.whenReady().then(() => {
  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(err => {
        addLog('warn', 'Updater', `Auto-check failed: ${err.message}`)
      })
    }, 5000)
  }
})

// IPC: Save a file to disk (used for Excel write-back)
ipcMain.handle('fs:save-file', async (_event, { defaultPath, data }: { defaultPath: string; data: number[] }) => {
  try {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow!, {
      defaultPath,
      filters: [
        { name: 'Excel Files', extensions: ['xlsx'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    if (canceled || !filePath) return { success: false, canceled: true }
    const buffer = Buffer.from(data)
    fs.writeFileSync(filePath, buffer)
    addLog('info', 'Excel', `Write-back saved to: ${filePath}`)
    return { success: true, filePath }
  } catch (err: any) {
    addLog('error', 'Excel', `Write-back failed: ${err.message}`)
    return { success: false, error: err.message }
  }
})

// IPC: Overwrite the original Excel file in-place (no dialog)
ipcMain.handle('fs:overwrite-file', async (_event, { filePath, data }: { filePath: string; data: number[] }) => {
  try {
    const buffer = Buffer.from(data)
    fs.writeFileSync(filePath, buffer)
    addLog('info', 'Excel', `Write-back overwrote: ${filePath}`)
    return { success: true }
  } catch (err: any) {
    addLog('error', 'Excel', `Overwrite failed: ${err.message}`)
    return { success: false, error: err.message }
  }
})

// IPC: Fetch all videos from all connected channels and export to Excel
ipcMain.handle('youtube:export-all-videos', async () => {
  try {
    const tokens = store.get('tokens') as any
    if (!tokens) return { success: false, error: 'Not authenticated' }
    oauth2Client.setCredentials(tokens)
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client })

    // Step 1: Get all channels the user manages
    addLog('info', 'Export', 'Fetching channel list...')
    const channelsResp = await youtube.channels.list({
      part: ['snippet', 'contentDetails'],
      mine: true,
      maxResults: 50,
    })
    addQuota(QUOTA_COSTS.CHANNELS_LIST, 'channels.list (export)')
    const channels = channelsResp.data.items || []
    if (channels.length === 0) return { success: false, error: 'No channels found' }

    addLog('info', 'Export', `Found ${channels.length} channel(s). Fetching videos...`)

    // Step 2: For each channel, page through all videos via the uploads playlist.
    // We use ONLY playlistItems.list (1 quota unit per call) and skip the
    // videos.list detail call (saves 50% quota). snippet already contains
    // title, description, tags, and publishedAt.
    const allVideos: any[] = []
    for (const channel of channels) {
      const channelName = channel.snippet?.title || 'Unknown Channel'
      const channelId = channel.id || ''
      const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads
      if (!uploadsPlaylistId) continue

      addLog('info', 'Export', `Fetching videos for: ${channelName}`)
      let pageToken: string | undefined = undefined
      let pageCount = 0

      do {
        const playlistResp: any = await youtube.playlistItems.list({
          part: ['snippet', 'contentDetails'],
          playlistId: uploadsPlaylistId,
          maxResults: 50,
          pageToken: pageToken || undefined,
        })
        addQuota(QUOTA_COSTS.PLAYLIST_ITEMS_LIST, `playlistItems.list (${channelName} page ${pageCount + 1})`)
        const items = playlistResp.data.items || []

        for (const item of items) {
          const videoId = item.contentDetails?.videoId
          if (!videoId) continue
          const snippet = item.snippet || {}
          allVideos.push({
            channelName,
            channelId,
            videoId,
            title: snippet.title || '',
            url: `https://www.youtube.com/watch?v=${videoId}`,
            publishedAt: snippet.publishedAt || '',
            description: (snippet.description || '').substring(0, 500),
            tags: (snippet.tags || []).join(', '),
          })
        }

        pageToken = playlistResp.data.nextPageToken || undefined
        pageCount++
        // Safety: max 200 pages per channel (10,000 videos)
        if (pageCount >= 200) break
      } while (pageToken)

      addLog('info', 'Export', `  → ${channelName}: fetched ${allVideos.length} videos total`)
    }

    addLog('success', 'Export', `Total videos fetched: ${allVideos.length}. Building Excel...`)

    // Step 3: Build Excel workbook using ExcelJS (already a dependency via xlsx)
    // We'll use the xlsx library since it's already bundled
    // Return the data to the renderer to build the Excel file there
    return { success: true, videos: allVideos }
  } catch (err: any) {
    const msg = err.message || ''
    const isQuota = msg.toLowerCase().includes('quota') || (err.code === 403)
    const friendlyMsg = isQuota
      ? 'YouTube API quota exceeded. The daily quota resets at midnight Pacific Time. Try the export again tomorrow, or after midnight PT.'
      : msg
    addLog('error', 'Export', `Failed to export videos: ${friendlyMsg}`)
    return { success: false, error: friendlyMsg }
  }
})

// ─── IPC: Fetch videos for a specific channel (for Channel Videos sheet) ────────
ipcMain.handle('youtube:fetch-channel-videos', async (_event, channelId: string) => {
  try {
    const tokens = store.get('tokens') as any
    if (!tokens) return { success: false, error: 'Not authenticated' }
    oauth2Client.setCredentials(tokens)
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client })

    // Get the uploads playlist ID for this channel
    const channelResp = await youtube.channels.list({
      part: ['snippet', 'contentDetails'],
      id: [channelId],
      maxResults: 1,
    })
    addQuota(QUOTA_COSTS.CHANNELS_LIST, 'channels.list (channel videos sheet)')
    const channel = channelResp.data.items?.[0]
    if (!channel) return { success: false, error: 'Channel not found' }
    const channelName = channel.snippet?.title || 'Unknown Channel'
    const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads
    if (!uploadsPlaylistId) return { success: false, error: 'No uploads playlist found' }

    addLog('info', 'ChannelSheet', `Fetching videos for channel: ${channelName}`)
    const videos: any[] = []
    let pageToken: string | undefined = undefined
    let pageCount = 0

    do {
      const playlistResp: any = await youtube.playlistItems.list({
        part: ['snippet', 'contentDetails'],
        playlistId: uploadsPlaylistId,
        maxResults: 50,
        pageToken: pageToken || undefined,
      })
      addQuota(QUOTA_COSTS.PLAYLIST_ITEMS_LIST, `playlistItems.list (channel sheet page ${pageCount + 1})`)
      const items = playlistResp.data.items || []
      for (const item of items) {
        const videoId = item.contentDetails?.videoId
        if (!videoId) continue
        const snippet = item.snippet || {}
        videos.push({
          videoId,
          title: snippet.title || '',
          url: `https://www.youtube.com/watch?v=${videoId}`,
          publishedAt: snippet.publishedAt || '',
          channelName,
          channelId,
        })
      }
      pageToken = playlistResp.data.nextPageToken || undefined
      pageCount++
      if (pageCount >= 200) break
    } while (pageToken)

    // Fetch view counts in batches of 50 using videos.list
    const videoIds = videos.map((v: any) => v.videoId)
    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50)
      try {
        const statsResp = await youtube.videos.list({
          part: ['statistics'],
          id: batch,
        })
        addQuota(QUOTA_COSTS.VIDEOS_LIST, `videos.list stats batch ${Math.floor(i / 50) + 1}`)
        const statsItems = statsResp.data.items || []
        for (const item of statsItems) {
          const vid = videos.find((v: any) => v.videoId === item.id)
          if (vid) vid.viewCount = parseInt(item.statistics?.viewCount || '0', 10)
        }
      } catch {
        // If stats fetch fails (quota), continue without view counts
      }
    }
    addLog('info', 'ChannelSheet', `Fetched ${videos.length} videos for ${channelName}`)
    return { success: true, videos, channelName }
  } catch (err: any) {
    const msg = err.message || ''
    const isQuota = msg.toLowerCase().includes('quota') || (err.code === 403)
    const friendlyMsg = isQuota
      ? 'YouTube API quota exceeded. Try again after midnight Pacific Time.'
      : msg
    addLog('error', 'ChannelSheet', `Failed to fetch channel videos: ${friendlyMsg}`)
    return { success: false, error: friendlyMsg }
  }
})

// ─── IPC: Quota ───────────────────────────────────────────────────────────────
ipcMain.handle('quota:get', async () => {
  const today = getQuotaResetDatePT()
  const quota = store.get('quota') as { usedUnits: number; resetDate: string }
  // Auto-reset if it's a new day
  if (quota.resetDate !== today) {
    store.set('quota', { usedUnits: 0, resetDate: today })
    return { usedUnits: 0, resetDate: today, dailyLimit: QUOTA_DAILY_LIMIT }
  }
  return { usedUnits: quota.usedUnits, resetDate: quota.resetDate, dailyLimit: QUOTA_DAILY_LIMIT }
})

ipcMain.handle('quota:reset', async () => {
  const today = getQuotaResetDatePT()
  store.set('quota', { usedUnits: 0, resetDate: today })
  mainWindow?.webContents.send('quota:update', { usedUnits: 0, resetDate: today, dailyLimit: QUOTA_DAILY_LIMIT })
  return { success: true }
})
