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
  skipReason?: string
  existingUrl?: string
  forceUpload?: boolean
  privacyForcedPrivate?: boolean
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
      }
      settings: {
        get: () => Promise<AppSettings>
        set: (settings: AppSettings) => Promise<{ success: boolean }>
      }
      history: {
        get: () => Promise<UploadHistory[]>
        clear: () => Promise<{ success: boolean }>
      }
      upload: {
        start: (jobs: UploadJob[]) => Promise<{ success: boolean; error?: string }>
        cancel: () => Promise<{ success: boolean }>
        getStatus: () => Promise<{ isUploading: boolean; currentIndex: number; total: number }>
        onJobStart: (callback: (data: { index: number; job: UploadJob }) => void) => void
        onProgress: (callback: (data: { index: number; progress: number; bytesUploaded: number; totalBytes: number }) => void) => void
        onJobComplete: (callback: (data: { index: number; videoId: string; youtubeUrl: string }) => void) => void
        onJobError: (callback: (data: { index: number; error: string }) => void) => void
        onAllComplete: (callback: (data: { total: number; cancelled: boolean }) => void) => void
        onJobSyncing?: (callback: (data: { index: number; message: string }) => void) => void
        onJobSkipped?: (callback: (data: { index: number; reason: string; existingUrl?: string }) => void) => void
        onJobPrivacyWarning?: (callback: (data: { index: number; videoId: string; intendedPrivacy: string; actualPrivacy: string }) => void) => void
        forceUploadJob?: (job: any) => Promise<{ success: boolean; error?: string }>
        removeAllListeners: () => void
      }
    }
  }
}
