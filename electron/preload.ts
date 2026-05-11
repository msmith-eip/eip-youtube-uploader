import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Auth
  auth: {
    getStatus: () => ipcRenderer.invoke('auth:get-status'),
    login: () => ipcRenderer.invoke('auth:login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },

  // YouTube
  youtube: {
    getChannels: () => ipcRenderer.invoke('youtube:get-channels'),
    exportAllVideos: () => ipcRenderer.invoke('youtube:export-all-videos'),
  },

  // Dialogs
  dialog: {
    openVideos: () => ipcRenderer.invoke('dialog:open-videos'),
    openExcel: () => ipcRenderer.invoke('dialog:open-excel'),
    saveExcel: () => ipcRenderer.invoke('dialog:save-excel'),
    openFolder: () => ipcRenderer.invoke('dialog:open-folder'),
  },

  // File System
  fs: {
    readFile: (filePath: string) => ipcRenderer.invoke('fs:read-file', filePath),
    getFileInfo: (filePath: string) => ipcRenderer.invoke('fs:get-file-info', filePath),
    listFolder: (folderPath: string) => ipcRenderer.invoke('fs:list-folder', folderPath),
    resolveDroppedFiles: (filePaths: string[]) => ipcRenderer.invoke('fs:resolve-dropped-files', filePaths),
    saveFile: (opts: { defaultPath: string; data: number[] }) => ipcRenderer.invoke('fs:save-file', opts),
    overwriteFile: (opts: { filePath: string; data: number[] }) => ipcRenderer.invoke('fs:overwrite-file', opts),
  },

  // Settings
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (settings: any) => ipcRenderer.invoke('settings:set', settings),
  },

  // History
  history: {
    get: () => ipcRenderer.invoke('history:get'),
    clear: () => ipcRenderer.invoke('history:clear'),
  },

  // Logs
  logs: {
    getAll: () => ipcRenderer.invoke('logs:get-all'),
    clear: () => ipcRenderer.invoke('logs:clear'),
    export: () => ipcRenderer.invoke('logs:export'),
    onNewEntry: (callback: (entry: any) => void) => {
      ipcRenderer.on('logs:new-entry', (_, entry) => callback(entry))
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners('logs:new-entry')
    },
  },

  // Upload
  upload: {
    start: (jobs: any[]) => ipcRenderer.invoke('upload:start', jobs),
    cancel: () => ipcRenderer.invoke('upload:cancel'),
    getStatus: () => ipcRenderer.invoke('upload:get-status'),
    onJobStart: (callback: (data: any) => void) => {
      ipcRenderer.on('upload:job-start', (_, data) => callback(data))
    },
    onProgress: (callback: (data: any) => void) => {
      ipcRenderer.on('upload:progress', (_, data) => callback(data))
    },
    onJobComplete: (callback: (data: any) => void) => {
      ipcRenderer.on('upload:job-complete', (_, data) => callback(data))
    },
    onJobError: (callback: (data: any) => void) => {
      ipcRenderer.on('upload:job-error', (_, data) => callback(data))
    },
    onJobRetrying: (callback: (data: any) => void) => {
      ipcRenderer.on('upload:job-retrying', (_, data) => callback(data))
    },
    onJobSyncing: (callback: (data: any) => void) => {
      ipcRenderer.on('upload:job-syncing', (_, data) => callback(data))
    },
    onJobSkipped: (callback: (data: any) => void) => {
      ipcRenderer.on('upload:job-skipped', (_, data) => callback(data))
    },
    onJobPrivacyWarning: (callback: (data: any) => void) => {
      ipcRenderer.on('upload:privacy-warning', (_, data) => callback(data))
    },
    onDuplicateFound: (callback: (data: any) => void) => {
      ipcRenderer.on('upload:duplicate-found', (_, data) => callback(data))
    },
    resolveDuplicate: (data: any) => ipcRenderer.invoke('upload:resolve-duplicate', data),
    retryJob: (job: any) => ipcRenderer.invoke('upload:retry-job', job),
    forceUploadJob: (job: any) => ipcRenderer.invoke('upload:force-upload-job', job),
    onAllComplete: (callback: (data: any) => void) => {
      ipcRenderer.on('upload:all-complete', (_, data) => callback(data))
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('upload:job-start')
      ipcRenderer.removeAllListeners('upload:progress')
      ipcRenderer.removeAllListeners('upload:job-complete')
      ipcRenderer.removeAllListeners('upload:job-error')
      ipcRenderer.removeAllListeners('upload:job-retrying')
      ipcRenderer.removeAllListeners('upload:job-syncing')
      ipcRenderer.removeAllListeners('upload:job-skipped')
      ipcRenderer.removeAllListeners('upload:privacy-warning')
      ipcRenderer.removeAllListeners('upload:duplicate-found')
      ipcRenderer.removeAllListeners('upload:all-complete')
    },
  },
  // Quota
  quota: {
    get: () => ipcRenderer.invoke('quota:get'),
    reset: () => ipcRenderer.invoke('quota:reset'),
    onUpdate: (callback: (data: any) => void) => {
      ipcRenderer.on('quota:update', (_, data) => callback(data))
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners('quota:update')
    },
  },

  // Auto Updater
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    getVersion: () => ipcRenderer.invoke('updater:get-version'),
    onChecking: (cb: () => void) => ipcRenderer.on('updater:checking', cb),
    onAvailable: (cb: (info: any) => void) => ipcRenderer.on('updater:available', (_, info) => cb(info)),
    onNotAvailable: (cb: (info: any) => void) => ipcRenderer.on('updater:not-available', (_, info) => cb(info)),
    onDownloadProgress: (cb: (progress: any) => void) => ipcRenderer.on('updater:download-progress', (_, p) => cb(p)),
    onDownloaded: (cb: (info: any) => void) => ipcRenderer.on('updater:downloaded', (_, info) => cb(info)),
    onError: (cb: (err: any) => void) => ipcRenderer.on('updater:error', (_, err) => cb(err)),
    removeListeners: () => {
      ipcRenderer.removeAllListeners('updater:checking')
      ipcRenderer.removeAllListeners('updater:available')
      ipcRenderer.removeAllListeners('updater:not-available')
      ipcRenderer.removeAllListeners('updater:download-progress')
      ipcRenderer.removeAllListeners('updater:downloaded')
      ipcRenderer.removeAllListeners('updater:error')
    },
  },
})
