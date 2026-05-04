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

  return rows
    .filter(row => col(row, 'filename', 'file_name', 'video_filename'))
    .map(row => {
      const filename = col(row, 'filename', 'file_name', 'video_filename')
      const title = col(row, 'title', 'video_title') || filename
      const description = col(row, 'description', 'desc', 'video_description')
      const tags = col(row, 'tags', 'tag', 'keywords')
      const privacy = normalizePrivacy(col(row, 'privacy', 'privacy_status') || 'unlisted')
      const channelRaw = col(row, 'channel', 'channel_name', 'youtube_channel')
      const channelId = col(row, 'channel_id', 'channelid', 'youtube_channel_id')
      const categoryId = col(row, 'category_id', 'categoryid', 'category') || '22'
      // FILE_PATH column (col I) — full path to the video file on disk
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
      return {
        id: uuidv4(),
        filePath,
        fileName: filename,
        fileSize: 0,
        title: title || filename,
        description,
        tags,
        privacy,
        channelId: channelId || '',
        channelName: channelRaw || channelId || '',
        categoryId: categoryId || '22',
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
  const uploadHeaders = [
    'filename', 'title', 'description', 'tags', 'privacy', 'channel', 'channel_id', 'category_id'
  ]

  const exampleRows = [
    {
      filename: 'florida_medicare_16x9.mp4',
      title: 'Medicare Advantage Plans in Florida 2025',
      description: 'Learn about Medicare Advantage options available in Florida for 2025. Compare plans, benefits, and costs.',
      tags: 'medicare,florida,insurance,medicare advantage,2025',
      privacy: 'unlisted',
      channel: '@MedicareCompared',
      channel_id: '',
      category_id: '22',
    },
    {
      filename: 'texas_medicare_9x16.mp4',
      title: 'Texas Medicare Supplement Plans 2025',
      description: 'Discover the best Medicare Supplement plans in Texas. Get expert guidance from Elite Insurance Partners.',
      tags: 'medicare,texas,insurance,medicare supplement,medigap',
      privacy: 'unlisted',
      channel: '@eliteinsurancepartners',
      channel_id: '',
      category_id: '22',
    },
    {
      filename: 'california_health_1x1.mp4',
      title: 'Health Insurance Options in California',
      description: 'Explore health insurance options for California residents. Compare plans and find the best coverage.',
      tags: 'health insurance,california,coverage,plans',
      privacy: 'unlisted',
      channel: '@HealthCompared',
      channel_id: '',
      category_id: '22',
    },
  ]

  const uploadSheet = XLSX.utils.json_to_sheet(exampleRows, { header: uploadHeaders })

  // Style column widths
  uploadSheet['!cols'] = [
    { wch: 35 }, // filename
    { wch: 50 }, // title
    { wch: 80 }, // description
    { wch: 60 }, // tags
    { wch: 12 }, // privacy
    { wch: 30 }, // channel
    { wch: 30 }, // channel_id
    { wch: 15 }, // category_id
  ]

  XLSX.utils.book_append_sheet(workbook, uploadSheet, 'Upload Queue')

  // ── Channels Reference Sheet ───────────────────────────────────────────────
  const channelsData = EIP_CHANNELS.map(c => ({
    'Channel Handle': c.handle,
    'Channel Name': c.name,
    'Use in "channel" column': c.handle,
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
    { 'Column': 'filename', 'Required': 'YES', 'Description': 'Exact filename of the video file (e.g., florida_16x9.mp4)' },
    { 'Column': 'title', 'Required': 'YES', 'Description': 'YouTube video title (max 100 characters)' },
    { 'Column': 'description', 'Required': 'NO', 'Description': 'Video description (max 5000 characters)' },
    { 'Column': 'tags', 'Required': 'NO', 'Description': 'Comma-separated tags (e.g., medicare,florida,insurance)' },
    { 'Column': 'privacy', 'Required': 'NO', 'Description': 'Privacy status: unlisted (default), private, or public' },
    { 'Column': 'channel', 'Required': 'YES', 'Description': 'Channel handle from EIP Channels sheet (e.g., @MedicareCompared)' },
    { 'Column': 'channel_id', 'Required': 'NO', 'Description': 'YouTube Channel ID (auto-filled when you connect your account)' },
    { 'Column': 'category_id', 'Required': 'NO', 'Description': 'YouTube category ID (default: 22 = People & Blogs)' },
  ]
  const instructionsSheet = XLSX.utils.json_to_sheet(instructionsData)
  instructionsSheet['!cols'] = [{ wch: 15 }, { wch: 12 }, { wch: 70 }]
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions')

  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
}

// ─── Export Jobs to Excel ─────────────────────────────────────────────────────
export function exportJobsToExcel(jobs: UploadJob[]): ArrayBuffer {
  const workbook = XLSX.utils.book_new()

  const rows = jobs.map(job => ({
    filename: job.fileName,
    title: job.title,
    description: job.description,
    tags: job.tags,
    privacy: job.privacy,
    channel: job.channelName,
    channel_id: job.channelId,
    category_id: job.categoryId,
    status: job.status,
    video_id: job.videoId || '',
    youtube_url: job.youtubeUrl || '',
    error: job.error || '',
  }))

  const sheet = XLSX.utils.json_to_sheet(rows)
  sheet['!cols'] = [
    { wch: 35 }, { wch: 50 }, { wch: 80 }, { wch: 60 },
    { wch: 12 }, { wch: 30 }, { wch: 30 }, { wch: 15 },
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
  filename: string
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

  const statusCol    = getOrAddCol('UPLOAD_STATUS')
  const urlCol       = getOrAddCol('YOUTUBE_URL')
  const videoIdCol   = getOrAddCol('VIDEO_ID')
  const uploadedAtCol = getOrAddCol('UPLOADED_AT')
  const errorCol     = getOrAddCol('UPLOAD_ERROR')

  // Find the filename / file_path column to match rows
  const filenameColIdx = headerRow.findIndex(h =>
    h === 'FILENAME' || h === 'FILE_NAME' || h === 'FILE_PATH' || h === 'FILEPATH'
  )

  // Build lookup map: basename → result (case-insensitive)
  const resultMap = new Map<string, WriteBackResult>()
  for (const r of results) {
    const basename = r.filename.split(/[\\/]/).pop()?.toLowerCase() || r.filename.toLowerCase()
    resultMap.set(basename, r)
    resultMap.set(r.filename.toLowerCase(), r)
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
    const rowBasename = rowFile.split(/[\\/]/).pop() || rowFile

    const result = resultMap.get(rowBasename) || resultMap.get(rowFile)
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
