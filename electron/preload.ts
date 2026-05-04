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
    onAllComplete: (callback: (data: any) => void) => {
      ipcRenderer.on('upload:all-complete', (_, data) => callback(data))
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('upload:job-start')
      ipcRenderer.removeAllListeners('upload:progress')
      ipcRenderer.removeAllListeners('upload:job-complete')
      ipcRenderer.removeAllListeners('upload:job-error')
      ipcRenderer.removeAllListeners('upload:all-complete')
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
