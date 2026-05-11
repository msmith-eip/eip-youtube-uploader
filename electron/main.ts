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
  },
})

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

    // ── Duplicate filename check ────────────────────────────────────────────
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
    mainWindow?.webContents.send('upload:job-start', { index: i, job })

    const attemptUpload = async (attempt: number): Promise<void> => {
      // Refresh token if needed
      const tokens = store.get('tokens') as any
      if (tokens) oauth2Client.setCredentials(tokens)

      const youtube = google.youtube({ version: 'v3', auth: oauth2Client })

      // Normalize file path - trim whitespace for Windows paths with spaces
      const normalizedPath = job.filePath.trim()
      // ── OneDrive Files-On-Demand: detect placeholder and trigger download ──
      if (isOneDrivePlaceholder(normalizedPath)) {
        mainWindow?.webContents.send('upload:job-syncing', { index: i, message: 'Syncing from OneDrive...' })
        addLog('info', 'OneDrive', `Placeholder detected for job ${i}: ${normalizedPath}`)
        await hydrateOneDriveFile(normalizedPath, (msg) => {
          mainWindow?.webContents.send('upload:job-syncing', { index: i, message: msg })
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
              defaultLanguage: job.language || 'en',
              defaultAudioLanguage: job.language || 'en',
            },
            status: {
              privacyStatus: job.privacy || 'unlisted',
              // Per-job values from spreadsheet; defaults: not made for kids, contains synthetic media
              selfDeclaredMadeForKids: job.selfDeclaredMadeForKids ?? false,
              containsSyntheticMedia: job.containsSyntheticMedia ?? true,
            } as any,
            recordingDetails: {
              recordingDate: new Date().toISOString().split('T')[0],
              ...(job.location ? { locationDescription: job.location } : {}),
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
              progress,
              bytesUploaded: evt.bytesRead,
              totalBytes: fileStat.size,
            })
          },
        }
      )

      const videoId = response.data.id
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

const appLogs: LogEntry[] = []
const MAX_LOGS = 2000

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
  try {
    const res = await youtube.videos.list({ part: ['status'], id: [videoId] })
    const actual = res?.data?.items?.[0]?.status?.privacyStatus
    if (actual && actual === 'private' && intendedPrivacy !== 'private') {
      addLog('warn', 'Upload',
        `Video ${videoId} was forced to private by YouTube (unverified API project)`,
        `Intended: ${intendedPrivacy} | Actual: private`)
      mainWindow?.webContents.send('upload:privacy-warning', {
        index: jobIndex,
        videoId,
        intendedPrivacy,
        actualPrivacy: actual,
      })
    }
  } catch (err: any) {
    addLog('warn', 'Upload', `Could not verify privacy status for ${videoId}: ${err.message}`)
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
