export type PrivacyStatus = 'unlisted' | 'private' | 'public'

export interface Channel {
  id: string
  snippet: {
    title: string
    description: string
    customUrl?: string
    thumbnails?: {
      default?: { url: string }
    }
  }
}

export interface UploadJob {
  id: string
  filePath: string
  fileName: string
  fileSize: number
  title: string
  description: string
  tags: string
  privacy: PrivacyStatus
  channelId: string
  channelName: string
  categoryId: string
  status: 'pending' | 'uploading' | 'syncing' | 'retrying' | 'complete' | 'error' | 'cancelled' | 'skipped'
  progress: number
  bytesUploaded: number
  videoId?: string
  youtubeUrl?: string
  error?: string
  canRetry?: boolean
  skipReason?: string
  existingUrl?: string
  forceUpload?: boolean
  privacyForcedPrivate?: boolean
  language?: string
  location?: string
  duplicateResolution?: 'replace' | 'new' | 'skip'
  addedAt: string
}

export interface UploadHistory {
  id: string
  title: string
  channel: string
  privacy: string
  uploadedAt: string
  filePath: string
  youtubeUrl: string
  status?: 'success' | 'failed'
  error?: string
}

export interface AppSettings {
  defaultPrivacy: PrivacyStatus
  defaultCategory: string
  concurrentUploads: number
  delayBetweenUploads: number
}

export interface ExcelRow {
  filename: string
  title: string
  description: string
  tags: string
  category_id: string
  privacy: string
  channel: string
}

export interface AuthStatus {
  authenticated: boolean
  email?: string
}

export interface DuplicateVideoEntry {
  videoId: string
  title: string
  channelId: string
  channelTitle: string
  publishedAt: string
  thumbnailUrl: string
}

// Extend Window for Electron API
declare global {
  interface Window {
    electronAPI: {
      auth: {
        getStatus: () => Promise<AuthStatus>
        login: () => Promise<{ success: boolean; error?: string }>
        logout: () => Promise<{ success: boolean }>
      }
      youtube: {
        getChannels: () => Promise<{ success: boolean; channels?: Channel[]; error?: string }>
        exportAllVideos: () => Promise<{ success: boolean; videos?: any[]; error?: string }>
        fetchChannelVideos: (channelId: string) => Promise<{ success: boolean; videos?: any[]; channelName?: string; error?: string }>
      }
      dialog: {
        openVideos: () => Promise<{ canceled: boolean; filePaths: string[] }>
        openExcel: () => Promise<{ canceled: boolean; filePaths: string[] }>
        saveExcel: () => Promise<{ canceled: boolean; filePath?: string }>
        openFolder: () => Promise<{ canceled: boolean; filePaths: string[] }>
      }
      fs: {
        readFile: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>
        getFileInfo: (filePath: string) => Promise<{ success: boolean; size?: number; name?: string; error?: string }>
        listFolder: (folderPath: string) => Promise<{ success: boolean; files?: { name: string; path: string; size: number }[]; error?: string }>
        saveFile: (opts: { defaultPath: string; data: number[] }) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>
        overwriteFile: (opts: { filePath: string; data: number[] }) => Promise<{ success: boolean; error?: string }>
      }
      settings: {
        get: () => Promise<AppSettings>
        set: (settings: AppSettings) => Promise<{ success: boolean }>
      }
      history: {
        get: () => Promise<UploadHistory[]>
        clear: () => Promise<{ success: boolean }>
        getStats?: () => Promise<{ totalUploadsAllTime: number; todayByChannel: Record<string, number> }>
      }
      upload: {
        start: (payload: { jobs: UploadJob[]; excelPath?: string | null; excelBase64?: string | null; perChannelLimit?: number } | UploadJob[]) => Promise<{ success: boolean; error?: string }>
        updateExcelBase64: (base64: string) => Promise<{ success: boolean }>
        cancel: () => Promise<{ success: boolean }>
        getStatus: () => Promise<{ isUploading: boolean; currentIndex: number; total: number }>
        getQueueState: () => Promise<{ isUploading: boolean; currentIndex: number; jobs: UploadJob[]; liveStates: Record<number, any>; excelSessionPath?: string; jobUploadTimestamps?: Record<number, string> }>
        onJobStart: (callback: (data: { index: number; job: UploadJob }) => void) => void
        onProgress: (callback: (data: { index: number; progress: number; bytesUploaded: number; totalBytes: number }) => void) => void
        onJobComplete: (callback: (data: { index: number; videoId: string; youtubeUrl: string }) => void) => void
        onJobError: (callback: (data: { index: number; error: string; canRetry?: boolean }) => void) => void
        onAllComplete: (callback: (data: { total: number; cancelled: boolean }) => void) => void
        onJobSyncing?: (callback: (data: { index: number; message: string }) => void) => void
        onJobRetrying?: (callback: (data: { index: number; attempt: number; error: string }) => void) => void
        onJobSkipped?: (callback: (data: { index: number; reason: string; existingUrl?: string }) => void) => void
        onJobPrivacyWarning?: (callback: (data: { index: number; videoId: string; intendedPrivacy: string; actualPrivacy: string }) => void) => void
        onDuplicateFound?: (callback: (data: { index: number; fileName: string; existingUrl: string; existingTitle: string; uploadedAt: string }) => void) => void
        forceUploadJob?: (job: any) => Promise<{ success: boolean; error?: string }>
        resolveDuplicate?: (data: { index: number; resolution: 'replace' | 'new' | 'skip' }) => Promise<void>
        savePendingQueue?: (payload: { jobs: any[]; excelPath: string | null; excelBase64: string | null }) => Promise<{ success: boolean }>
        onAutoStart?: (callback: (data: { jobs: any[] }) => void) => void
        removeAllListeners: () => void
      }
      quota: {
        get: () => Promise<{ usedUnits: number; resetDate: string; dailyLimit: number }>
        reset: () => Promise<{ success: boolean }>
        onUpdate: (callback: (data: { usedUnits: number; resetDate: string; dailyLimit: number }) => void) => void
        removeListeners: () => void
      }
      duplicates: {
        scan: (opts?: { channelIds?: string[] }) => Promise<{ success: boolean; duplicates?: Record<string, DuplicateVideoEntry[]>; totalScanned?: number; error?: string }>
        deleteVideos: (videoIds: string[]) => Promise<{ success: boolean; results?: { videoId: string; success: boolean; error?: string }[]; error?: string }>
        fixDisclosure: (videoIds: string[]) => Promise<{ success: boolean; results?: { videoId: string; success: boolean; error?: string }[]; error?: string }>
        scanMissingDisclosure: (opts?: { channelIds?: string[] }) => Promise<{ success: boolean; videos?: DuplicateVideoEntry[]; totalScanned?: number; error?: string }>
      }
      updater: {
        check: () => Promise<any>
        download: () => Promise<any>
        install: () => Promise<any>
        getVersion: () => Promise<{ version: string }>
        onChecking: (cb: () => void) => void
        onAvailable: (cb: (info: any) => void) => void
        onNotAvailable: (cb: (info: any) => void) => void
        onDownloadProgress: (cb: (progress: any) => void) => void
        onDownloaded: (cb: (info: any) => void) => void
        onError: (cb: (err: any) => void) => void
        removeListeners: () => void
      }
    }
  }
}
