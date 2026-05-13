import * as XLSX from 'xlsx'
import { v4 as uuidv4 } from 'uuid'
import type { UploadJob, ExcelRow, PrivacyStatus } from '../types'

// ─── EIP Channels Reference ───────────────────────────────────────────────────
export const EIP_CHANNELS = [
  { handle: '@eliteinsurancepartners', name: 'Elite Insurance Partners' },
  { handle: '@elpyoutube', name: 'EIP YouTube' },
  { handle: '@MedicareCompared', name: 'MedicareCompared' },
  { handle: '@applyformedicare', name: 'Apply For Medicare' },
  { handle: '@MedicareCompared01', name: 'Medicare Compared' },
  { handle: '@TheEliteBrokerage', name: 'The Elite Brokerage' },
  { handle: '@HealthCompared', name: 'Health Compared' },
  { handle: '@medicareplang', name: 'Medicare Plan G' },
  { handle: '@LifeCompared', name: 'Life Compared' },
  { handle: '@MedicarePlanN-zc3zh', name: 'Medicare Plan N' },
  { handle: '@elpinternal8920', name: 'EIP Internal' },
]

export const YOUTUBE_CATEGORIES = [
  { id: '1', name: 'Film & Animation' },
  { id: '2', name: 'Autos & Vehicles' },
  { id: '10', name: 'Music' },
  { id: '15', name: 'Pets & Animals' },
  { id: '17', name: 'Sports' },
  { id: '19', name: 'Travel & Events' },
  { id: '20', name: 'Gaming' },
  { id: '22', name: 'People & Blogs' },
  { id: '23', name: 'Comedy' },
  { id: '24', name: 'Entertainment' },
  { id: '25', name: 'News & Politics' },
  { id: '26', name: 'Howto & Style' },
  { id: '27', name: 'Education' },
  { id: '28', name: 'Science & Technology' },
  { id: '29', name: 'Nonprofits & Activism' },
]

// ─── Parse Excel File ─────────────────────────────────────────────────────────
export function parseExcelFile(base64Data: string, videoFolder?: string): UploadJob[] {
  // Browser-compatible base64 decode — Buffer is Node.js only and not available in the renderer
  const binaryStr = atob(base64Data)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }
  const workbook = XLSX.read(bytes, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

  // Case-insensitive column lookup — works with ANY capitalization (TITLE, title, Title, etc.)
  const col = (row: any, ...names: string[]): string => {
    const rowKeys = Object.keys(row)
    for (const name of names) {
      const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '')
      const match = rowKeys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized)
      if (match !== undefined && row[match] !== '' && row[match] !== undefined && row[match] !== null) {
        return String(row[match]).trim()
      }
    }
    return ''
  }

  // Parse a boolean-ish cell value — accepts YES/NO/TRUE/FALSE/1/0
  const parseBool = (row: any, ...names: string[]): boolean | undefined => {
    const raw = col(row, ...names)
    if (!raw) return undefined
    const v = raw.toLowerCase()
    if (v === 'yes' || v === 'true' || v === '1') return true
    if (v === 'no' || v === 'false' || v === '0') return false
    return undefined
  }

  return rows
    .filter(row => col(row, 'filename', 'file_name', 'video_filename'))
    .map(row => {
      const filename = col(row, 'filename', 'file_name', 'video_filename')
      // Default title = filename without extension
      const filenameWithoutExt = filename ? filename.replace(/\.[^/.]+$/, '') : ''
      const title = col(row, 'title', 'video_title') || filenameWithoutExt
      // Default description = empty string
      const description = col(row, 'description', 'desc', 'video_description') || ''
      const tags = col(row, 'tags', 'tag', 'keywords')
      const privacy = normalizePrivacy(col(row, 'privacy', 'privacy_status') || 'unlisted')
      const channelRaw = col(row, 'channel', 'channel_name', 'youtube_channel')
      const channelId = col(row, 'channel_id', 'channelid', 'youtube_channel_id')
      const categoryId = col(row, 'category_id', 'categoryid', 'category') || '22'
      // FILE_PATH column — full path to the video file on disk
      const filePathCol = col(row, 'file_path', 'filepath', 'video_path', 'full_path', 'path')
      let filePath: string
      if (filePathCol) {
        filePath = filePathCol
      } else if (videoFolder) {
        const sep = videoFolder.includes('\\') ? '\\' : '/'
        filePath = `${videoFolder}${sep}${filename}`
      } else {
        filePath = filename
      }
      // New optional columns — default to safe values when absent
      const madeForKidsRaw = parseBool(row, 'made_for_kids', 'madeForKids', 'made for kids', 'kids')
      const syntheticMediaRaw = parseBool(row, 'contains_synthetic_media', 'containsSyntheticMedia', 'synthetic_media', 'synthetic media', 'ai content')
      const language = col(row, 'language', 'lang', 'audio_language', 'default_language') || 'en'
      const location = col(row, 'location', 'recording_location', 'city', 'place') || ''
      return {
        id: uuidv4(),
        filePath,
        fileName: filename,
        fileSize: 0,
        title: title || filenameWithoutExt,
        description,
        tags,
        privacy,
        channelId: channelId || '',
        channelName: channelRaw || channelId || '',
        categoryId: categoryId || '22',
        // Default: NOT made for kids, YES contains synthetic/AI media
        selfDeclaredMadeForKids: madeForKidsRaw ?? false,
        containsSyntheticMedia: syntheticMediaRaw ?? true,
        language,
        location,
        status: 'pending' as const,
        progress: 0,
        bytesUploaded: 0,
        addedAt: new Date().toISOString(),
      }
    })
}

function normalizePrivacy(value: string): PrivacyStatus {
  const v = value.toLowerCase().trim()
  if (v === 'public') return 'public'
  if (v === 'private') return 'private'
  return 'unlisted'
}

// ─── Generate Excel Template ──────────────────────────────────────────────────
export function generateExcelTemplate(): ArrayBuffer {
  const workbook = XLSX.utils.book_new()

  // ── Main Upload Sheet ──────────────────────────────────────────────────────
  // Column headers are ALL CAPS
  const uploadHeaders = [
    'FILENAME', 'TITLE', 'DESCRIPTION', 'TAGS', 'PRIVACY', 'CHANNEL', 'CHANNEL_ID',
    'CATEGORY_ID', 'MADE_FOR_KIDS', 'CONTAINS_SYNTHETIC_MEDIA', 'LANGUAGE', 'LOCATION',
    'YOUTUBE_URL', 'UPLOAD_STATUS',
  ]

  const exampleRows = [
    {
      FILENAME: 'florida_medicare_16x9.mp4',
      TITLE: '',
      DESCRIPTION: '',
      TAGS: 'medicare,florida,insurance,medicare advantage,2025',
      PRIVACY: 'unlisted',
      CHANNEL: '@MedicareCompared',
      CHANNEL_ID: '',
      CATEGORY_ID: '22',
      MADE_FOR_KIDS: 'NO',
      CONTAINS_SYNTHETIC_MEDIA: 'YES',
      LANGUAGE: 'en',
      LOCATION: '',
      YOUTUBE_URL: '',
      UPLOAD_STATUS: '',
    },
    {
      FILENAME: 'texas_medicare_9x16.mp4',
      TITLE: '',
      DESCRIPTION: '',
      TAGS: 'medicare,texas,insurance,medicare supplement,medigap',
      PRIVACY: 'unlisted',
      CHANNEL: '@eliteinsurancepartners',
      CHANNEL_ID: '',
      CATEGORY_ID: '22',
      MADE_FOR_KIDS: 'NO',
      CONTAINS_SYNTHETIC_MEDIA: 'YES',
      LANGUAGE: 'en',
      LOCATION: '',
      YOUTUBE_URL: '',
      UPLOAD_STATUS: '',
    },
    {
      FILENAME: 'california_health_1x1.mp4',
      TITLE: '',
      DESCRIPTION: '',
      TAGS: 'health insurance,california,coverage,plans',
      PRIVACY: 'unlisted',
      CHANNEL: '@HealthCompared',
      CHANNEL_ID: '',
      CATEGORY_ID: '22',
      MADE_FOR_KIDS: 'NO',
      CONTAINS_SYNTHETIC_MEDIA: 'YES',
      LANGUAGE: 'en',
      LOCATION: '',
      YOUTUBE_URL: '',
      UPLOAD_STATUS: '',
    },
  ]

  const uploadSheet = XLSX.utils.json_to_sheet(exampleRows, { header: uploadHeaders })

  // ── Bold header row (row 1) ────────────────────────────────────────────────
  uploadHeaders.forEach((_, colIdx) => {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c: colIdx })
    if (!uploadSheet[cellAddr]) return
    uploadSheet[cellAddr].s = {
      font: { bold: true, sz: 11 },
      alignment: { horizontal: 'center', vertical: 'center' },
    }
  })

  // ── Freeze the first row ───────────────────────────────────────────────────
  uploadSheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' }

  // ── Column widths ──────────────────────────────────────────────────────────
  uploadSheet['!cols'] = [
    { wch: 35 }, // FILENAME
    { wch: 50 }, // TITLE
    { wch: 80 }, // DESCRIPTION
    { wch: 60 }, // TAGS
    { wch: 12 }, // PRIVACY
    { wch: 30 }, // CHANNEL
    { wch: 30 }, // CHANNEL_ID
    { wch: 15 }, // CATEGORY_ID
    { wch: 18 }, // MADE_FOR_KIDS
    { wch: 28 }, // CONTAINS_SYNTHETIC_MEDIA
    { wch: 12 }, // LANGUAGE
    { wch: 35 }, // LOCATION
    { wch: 45 }, // YOUTUBE_URL
    { wch: 18 }, // UPLOAD_STATUS
  ]

  XLSX.utils.book_append_sheet(workbook, uploadSheet, 'Upload Queue')

  // ── Channels Reference Sheet ───────────────────────────────────────────────
  const channelsData = EIP_CHANNELS.map(c => ({
    'Channel Handle': c.handle,
    'Channel Name': c.name,
    'Use in "CHANNEL" column': c.handle,
  }))
  const channelsSheet = XLSX.utils.json_to_sheet(channelsData)
  channelsSheet['!cols'] = [{ wch: 30 }, { wch: 35 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(workbook, channelsSheet, 'EIP Channels')

  // ── Privacy Options Sheet ──────────────────────────────────────────────────
  const privacyData = [
    { 'Privacy Value': 'unlisted', 'Description': 'Video is not listed publicly but accessible via direct link (DEFAULT)' },
    { 'Privacy Value': 'private', 'Description': 'Video is only visible to you and people you share it with' },
    { 'Privacy Value': 'public', 'Description': 'Video is visible to everyone on YouTube' },
  ]
  const privacySheet = XLSX.utils.json_to_sheet(privacyData)
  privacySheet['!cols'] = [{ wch: 15 }, { wch: 70 }]
  XLSX.utils.book_append_sheet(workbook, privacySheet, 'Privacy Options')

  // ── Categories Sheet ───────────────────────────────────────────────────────
  const categoriesData = YOUTUBE_CATEGORIES.map(c => ({
    'Category ID': c.id,
    'Category Name': c.name,
    'Recommended for EIP': c.id === '22' ? 'YES (Default)' : '',
  }))
  const categoriesSheet = XLSX.utils.json_to_sheet(categoriesData)
  categoriesSheet['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 25 }]
  XLSX.utils.book_append_sheet(workbook, categoriesSheet, 'YouTube Categories')

  // ── Instructions Sheet ─────────────────────────────────────────────────────
  const instructionsData = [
    { 'COLUMN': 'FILENAME', 'REQUIRED': 'YES', 'DESCRIPTION': 'Exact filename of the video file (e.g., florida_16x9.mp4)' },
    { 'COLUMN': 'TITLE', 'REQUIRED': 'NO', 'DESCRIPTION': 'YouTube video title (max 100 characters). If blank, defaults to the filename without extension.' },
    { 'COLUMN': 'DESCRIPTION', 'REQUIRED': 'NO', 'DESCRIPTION': 'Video description (max 5000 characters). If blank, no description is set.' },
    { 'COLUMN': 'TAGS', 'REQUIRED': 'NO', 'DESCRIPTION': 'Comma-separated tags (e.g., medicare,florida,insurance)' },
    { 'COLUMN': 'PRIVACY', 'REQUIRED': 'NO', 'DESCRIPTION': 'Privacy status: unlisted (default), private, or public' },
    { 'COLUMN': 'CHANNEL', 'REQUIRED': 'YES', 'DESCRIPTION': 'Channel handle from EIP Channels sheet (e.g., @MedicareCompared)' },
    { 'COLUMN': 'CHANNEL_ID', 'REQUIRED': 'NO', 'DESCRIPTION': 'YouTube Channel ID (auto-filled when you connect your account)' },
    { 'COLUMN': 'CATEGORY_ID', 'REQUIRED': 'NO', 'DESCRIPTION': 'YouTube category ID (default: 22 = People & Blogs)' },
    { 'COLUMN': 'MADE_FOR_KIDS', 'REQUIRED': 'NO', 'DESCRIPTION': 'YES or NO — is this video made for children? Default: NO' },
    { 'COLUMN': 'CONTAINS_SYNTHETIC_MEDIA', 'REQUIRED': 'NO', 'DESCRIPTION': 'YES or NO — does this video contain AI-generated or altered content? Default: YES' },
    { 'COLUMN': 'YOUTUBE_URL', 'REQUIRED': 'NO', 'DESCRIPTION': 'Auto-filled by the app after a successful upload. Leave blank before uploading.' },
    { 'COLUMN': 'UPLOAD_STATUS', 'REQUIRED': 'NO', 'DESCRIPTION': 'Auto-filled by the app after upload (e.g., complete, error). Leave blank before uploading.' },
  ]
  const instructionsSheet = XLSX.utils.json_to_sheet(instructionsData)
  instructionsSheet['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 80 }]
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions')

  // ── Channel Videos Sheet ───────────────────────────────────────────────────────────────
  // This sheet is auto-populated by the app after each successful upload.
  // It lists all videos on the channel with their title and YouTube URL.
  const channelVideosAoa = [
    ['VIDEO_ID', 'TITLE', 'YOUTUBE_URL', 'CHANNEL', 'PUBLISHED_AT'],
    ['', '(Auto-populated after each successful upload)', '', '', ''],
  ]
  const channelVideosSheet = XLSX.utils.aoa_to_sheet(channelVideosAoa)
  channelVideosSheet['!cols'] = [
    { wch: 16 },  // VIDEO_ID
    { wch: 60 },  // TITLE
    { wch: 45 },  // YOUTUBE_URL
    { wch: 35 },  // CHANNEL
    { wch: 24 },  // PUBLISHED_AT
  ]
  channelVideosSheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' }
  XLSX.utils.book_append_sheet(workbook, channelVideosSheet, 'Channel Videos')

  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx', cellStyles: true })
}

// ─── Export Jobs to Excel ─────────────────────────────────────────────────────
export function exportJobsToExcel(jobs: UploadJob[]): ArrayBuffer {
  const workbook = XLSX.utils.book_new()

  const rows = jobs.map(job => ({
    FILENAME: job.fileName,
    TITLE: job.title,
    DESCRIPTION: job.description,
    TAGS: job.tags,
    PRIVACY: job.privacy,
    CHANNEL: job.channelName,
    CHANNEL_ID: job.channelId,
    CATEGORY_ID: job.categoryId,
    MADE_FOR_KIDS: (job as any).selfDeclaredMadeForKids === true ? 'YES' : 'NO',
    CONTAINS_SYNTHETIC_MEDIA: (job as any).containsSyntheticMedia === false ? 'NO' : 'YES',
    STATUS: job.status,
    VIDEO_ID: job.videoId || '',
    YOUTUBE_URL: job.youtubeUrl || '',
    ERROR: job.error || '',
  }))

  const sheet = XLSX.utils.json_to_sheet(rows)
  sheet['!cols'] = [
    { wch: 35 }, { wch: 50 }, { wch: 80 }, { wch: 60 },
    { wch: 12 }, { wch: 30 }, { wch: 30 }, { wch: 15 },
    { wch: 18 }, { wch: 28 },
    { wch: 12 }, { wch: 25 }, { wch: 45 }, { wch: 40 },
  ]
  XLSX.utils.book_append_sheet(workbook, sheet, 'Upload Results')

  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
}

// ─── Format file size ─────────────────────────────────────────────────────────
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

// ─── Format duration ──────────────────────────────────────────────────────────
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// ─── Write Back Upload Results to Original Excel ──────────────────────────────
export interface WriteBackResult {
  filename: string   // full filePath
  fileName?: string  // bare filename (e.g. video.mp4)
  status: 'complete' | 'error' | 'pending'
  videoId?: string
  youtubeUrl?: string
  error?: string
  uploadedAt?: string
}

export function writeBackToExcel(
  originalBase64: string,
  results: WriteBackResult[]
): ArrayBuffer {
  // Decode original workbook
  const binaryStr = atob(originalBase64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }
  const workbook = XLSX.read(bytes, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]

  // Get all rows as array-of-arrays to preserve exact structure
  const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  if (aoa.length === 0) return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })

  // Find or add status columns at the end of the header row
  const headerRow: string[] = aoa[0].map((h: any) => String(h).trim().toUpperCase())

  const getOrAddCol = (name: string): number => {
    let idx = headerRow.findIndex(h => h === name)
    if (idx === -1) {
      idx = headerRow.length
      headerRow.push(name)
      aoa[0] = [...headerRow]
    }
    return idx
  }

  const statusCol     = getOrAddCol('UPLOAD_STATUS')
  const urlCol        = getOrAddCol('YOUTUBE_URL')
  const videoIdCol    = getOrAddCol('VIDEO_ID')
  const uploadedAtCol = getOrAddCol('UPLOADED_AT')
  const errorCol      = getOrAddCol('UPLOAD_ERROR')

  // Find the filename / file_path column to match rows
  // Find FILENAME column first, then fall back to FILE_PATH
  let filenameColIdx = headerRow.findIndex(h => h === 'FILENAME' || h === 'FILE_NAME')
  if (filenameColIdx === -1) {
    filenameColIdx = headerRow.findIndex(h => h === 'FILE_PATH' || h === 'FILEPATH' || h === 'PATH')
  }

  // Build lookup map: all possible keys → result (case-insensitive, normalized)
  // Keys stored: full path, basename from path, explicit fileName, basename without extension
  const resultMap = new Map<string, WriteBackResult>()
  const norm = (s: string) => s.trim().toLowerCase()
  const base = (s: string) => s.split(/[\\/]/).pop() || s
  for (const r of results) {
    const fullPath = norm(r.filename)
    const basenameFromPath = norm(base(r.filename))
    const explicitName = r.fileName ? norm(r.fileName) : ''
    const basenameNoExt = basenameFromPath.replace(/\.[^.]+$/, '')
    resultMap.set(fullPath, r)
    resultMap.set(basenameFromPath, r)
    if (explicitName) resultMap.set(explicitName, r)
    if (explicitName) resultMap.set(norm(base(explicitName)), r)
    resultMap.set(basenameNoExt, r)
  }

  // Update each data row
  for (let rowIdx = 1; rowIdx < aoa.length; rowIdx++) {
    const row = aoa[rowIdx]
    // Ensure row is long enough
    const maxCol = Math.max(statusCol, urlCol, videoIdCol, uploadedAtCol, errorCol)
    while (row.length <= maxCol) row.push('')

    let rowFile = ''
    if (filenameColIdx >= 0 && row[filenameColIdx]) {
      rowFile = String(row[filenameColIdx]).trim().toLowerCase()
    }
    if (!rowFile) continue
    const rowBasename = rowFile.split(/[\\/]/).pop() || rowFile
    const rowBasenameNoExt = rowBasename.replace(/\.[^.]+$/, '')

    const result =
      resultMap.get(rowBasename) ||
      resultMap.get(rowFile) ||
      resultMap.get(rowBasenameNoExt)
    if (!result) continue

    const ts = result.uploadedAt || new Date().toISOString()
    if (result.status === 'complete') {
      row[statusCol]     = 'Uploaded ✓'
      row[urlCol]        = result.youtubeUrl || ''
      row[videoIdCol]    = result.videoId || ''
      row[uploadedAtCol] = ts
      row[errorCol]      = ''
    } else if (result.status === 'error') {
      row[statusCol]     = 'Failed ✗'
      row[urlCol]        = ''
      row[videoIdCol]    = ''
      row[uploadedAtCol] = ts
      row[errorCol]      = result.error || 'Unknown error'
    }
  }

  // Write updated data back to the sheet
  const newSheet = XLSX.utils.aoa_to_sheet(aoa)

  // Set column widths
  const colWidths: any[] = newSheet['!cols'] || []
  const maxCol = Math.max(statusCol, urlCol, videoIdCol, uploadedAtCol, errorCol)
  while (colWidths.length <= maxCol) colWidths.push({ wch: 15 })
  colWidths[statusCol]     = { wch: 16 }
  colWidths[urlCol]        = { wch: 45 }
  colWidths[videoIdCol]    = { wch: 16 }
  colWidths[uploadedAtCol] = { wch: 24 }
  colWidths[errorCol]      = { wch: 50 }
  newSheet['!cols'] = colWidths

  workbook.Sheets[sheetName] = newSheet
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
}

// ─── Update / Create Channel Videos Sheet ────────────────────────────────────
// Maintains a "Channel Videos" sheet tab in the workbook.
// - If the sheet doesn't exist it is created automatically.
// - Existing rows are preserved; new videos are merged in (no duplicates by videoId).
// - Newly uploaded video is prepended at the top (row 2, below header).
export interface ChannelVideoEntry {
  videoId: string
  title: string
  url: string
  publishedAt: string
  channelName: string
  channelId?: string
  viewCount?: number
}

export function updateChannelVideosSheet(
  base64: string,
  newVideo: ChannelVideoEntry,
  allChannelVideos?: ChannelVideoEntry[]
): ArrayBuffer {
  const binaryStr = atob(base64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
  const workbook = XLSX.read(bytes, { type: 'array' })

  const SHEET_NAME = 'Channel Videos'
  const HEADERS = ['VIDEO_ID', 'TITLE', 'YOUTUBE_URL', 'CHANNEL', 'PUBLISHED_AT', 'VIEW_COUNT']

  // Read existing rows from the sheet (if it exists)
  const existingMap = new Map<string, any[]>() // videoId → row array
  if (workbook.SheetNames.includes(SHEET_NAME)) {
    const existing: any[][] = XLSX.utils.sheet_to_json(
      workbook.Sheets[SHEET_NAME], { header: 1, defval: '' }
    )
    // Skip header row (index 0), read data rows
    for (let i = 1; i < existing.length; i++) {
      const row = existing[i]
      const vid = String(row[0] || '').trim()
      if (vid) existingMap.set(vid, row)
    }
  }

  // Merge in all channel videos fetched from YouTube (if provided)
  if (allChannelVideos) {
    for (const v of allChannelVideos) {
      if (!existingMap.has(v.videoId)) {
        existingMap.set(v.videoId, [
          v.videoId,
          v.title,
          v.url,
          v.channelName,
          v.publishedAt,
          v.viewCount ?? '',
        ])
      } else {
        // Update view count if we have a fresher value
        const existing = existingMap.get(v.videoId)!
        if (v.viewCount !== undefined) existing[5] = v.viewCount
      }
    }
  }

  // Ensure the newly uploaded video is in the map (overwrite if already present)
  existingMap.set(newVideo.videoId, [
    newVideo.videoId,
    newVideo.title,
    newVideo.url,
    newVideo.channelName,
    newVideo.publishedAt,
    newVideo.viewCount ?? 0,
  ])

  // Sort: newly uploaded video first, then by publishedAt descending
  const rows = Array.from(existingMap.values()).sort((a, b) => {
    if (a[0] === newVideo.videoId) return -1
    if (b[0] === newVideo.videoId) return 1
    return (b[4] || '').localeCompare(a[4] || '')
  })

  const aoa: any[][] = [HEADERS, ...rows]
  const sheet = XLSX.utils.aoa_to_sheet(aoa)

  // Column widths
  sheet['!cols'] = [
    { wch: 16 },  // VIDEO_ID
    { wch: 60 },  // TITLE
    { wch: 45 },  // YOUTUBE_URL
    { wch: 35 },  // CHANNEL
    { wch: 24 },  // PUBLISHED_AT
    { wch: 14 },  // VIEW_COUNT
  ]

  // Freeze header row
  sheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' }

  // Replace or add the sheet
  if (workbook.SheetNames.includes(SHEET_NAME)) {
    workbook.Sheets[SHEET_NAME] = sheet
  } else {
    XLSX.utils.book_append_sheet(workbook, sheet, SHEET_NAME)
  }

  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
}
