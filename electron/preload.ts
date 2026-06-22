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
    fetchChannelVideos: (channelId: string) => ipcRenderer.invoke('youtube:fetch-channel-videos', channelId),
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
    getStats: () => ipcRenderer.invoke('history:get-stats'),
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
    start: (payload: any) => ipcRenderer.invoke('upload:start', payload),
    updateExcelBase64: (base64: string) => ipcRenderer.invoke('upload:update-excel-base64', base64),
    cancel: () => ipcRenderer.invoke('upload:cancel'),
    getStatus: () => ipcRenderer.invoke('upload:get-status'),
    getQueueState: () => ipcRenderer.invoke('upload:get-queue-state'),
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
    savePendingQueue: (payload: any) => ipcRenderer.invoke('upload:save-pending-queue', payload),
    onAllComplete: (callback: (data: any) => void) => {
      ipcRenderer.on('upload:all-complete', (_, data) => callback(data))
    },
    onLimitExceeded: (callback: () => void) => {
      ipcRenderer.on('upload:limit-exceeded', () => callback())
    },
    onAutoStart: (callback: (data: any) => void) => {
      ipcRenderer.on('upload:auto-start', (_, data) => callback(data))
    },
    onChannelLimitReached: (callback: (data: any) => void) => {
      ipcRenderer.on('upload:channel-limit-reached', (_, data) => callback(data))
    },
    onChannelCountsUpdate: (callback: (data: any) => void) => {
      ipcRenderer.on('upload:channel-counts-update', (_, data) => callback(data))
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
      ipcRenderer.removeAllListeners('upload:limit-exceeded')
      ipcRenderer.removeAllListeners('upload:auto-start')
      ipcRenderer.removeAllListeners('upload:channel-limit-reached')
      ipcRenderer.removeAllListeners('upload:channel-counts-update')
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

  // Duplicate Manager
  duplicates: {
    scan: (opts?: { channelIds?: string[] }) => ipcRenderer.invoke('duplicates:scan', opts || {}),
    deleteVideos: (videoIds: string[]) => ipcRenderer.invoke('duplicates:delete-videos', videoIds),
    fixDisclosure: (videoIds: string[]) => ipcRenderer.invoke('duplicates:fix-disclosure', videoIds),
    scanMissingDisclosure: (opts?: { channelIds?: string[] }) => ipcRenderer.invoke('duplicates:scan-missing-disclosure', opts || {}),
    onDeleteProgress: (callback: (data: any) => void) => {
      ipcRenderer.on('duplicates:delete-progress', (_, data) => callback(data))
    },
    removeDeleteProgressListener: () => {
      ipcRenderer.removeAllListeners('duplicates:delete-progress')
    },
  },

  // Video Manager
  videoManager: {
    search: (opts: { channelId: string; query: string }) => ipcRenderer.invoke('videoManager:search', opts),
    batchRename: (opts: any) => ipcRenderer.invoke('videoManager:batch-rename', opts),
    deleteVideos: (opts: { videoIds: string[] }) => ipcRenderer.invoke('videoManager:delete-videos', opts),
    onRenameProgress: (callback: (data: any) => void) => {
      ipcRenderer.on('videoManager:rename-progress', (_, data) => callback(data))
    },
    onDeleteProgress: (callback: (data: any) => void) => {
      ipcRenderer.on('videoManager:delete-progress', (_, data) => callback(data))
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners('videoManager:rename-progress')
      ipcRenderer.removeAllListeners('videoManager:delete-progress')
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
