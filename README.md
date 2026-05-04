# EIP YouTube Uploader

**Elite Insurance Partners** — Bulk YouTube Video Upload Desktop Application

A beautiful, cross-platform desktop app (Windows + Mac) for uploading 600+ videos per day to EIP's YouTube brand channels, with Excel-based metadata management, privacy controls, and a polished dark UI.

---

## Features

- **Bulk Upload** — Upload 600+ videos per day to any of EIP's 11 YouTube sub-channels
- **Excel Metadata Import** — Pre-fill titles, descriptions, tags, privacy, and channel assignments via Excel
- **Excel Template Generator** — Download a pre-built template with all EIP channels and instructions
- **Privacy Controls** — Set Unlisted (default), Private, or Public per video or in bulk
- **Per-Video Editing** — Edit title, description, tags, channel, category, and privacy inline
- **Bulk Edit** — Apply privacy/channel settings to multiple videos at once
- **Real-time Progress** — Live upload progress bars per video and overall
- **Upload History** — Persistent log of all uploaded videos with YouTube links
- **Channel Management** — Auto-loads all connected YouTube channels from your account
- **Error Recovery** — Failed uploads are logged with error details; queue continues
- **Export Results** — Export upload results (including video IDs and YouTube URLs) to Excel

---

## Installation

### Prerequisites

- Node.js 18+ (https://nodejs.org)
- npm or pnpm

### Setup

```bash
# Clone or extract the project
cd eip-uploader

# Install dependencies
npm install

# Start in development mode
npm run dev
```

### Build for Production

```bash
# Build for Windows (.exe installer)
npm run dist:win

# Build for macOS (.dmg)
npm run dist:mac

# Build for Linux (.AppImage)
npm run dist
```

Built files are output to the `release/` folder.

---

## First-Time Setup

1. **Launch the app** — You'll see the sign-in screen
2. **Click "Sign in with Google"** — A browser window opens for OAuth authentication
3. **Log in with your Google account** — The account that owns the EIP YouTube channels
4. **Grant permissions** — Allow YouTube upload access
5. **Return to the app** — You're authenticated and channels are loaded automatically

Your OAuth token is saved locally and auto-refreshes. You won't need to sign in again.

---

## Using the Excel Template

### Download the Template

1. Go to **Upload Queue** page
2. Click **Download Template**
3. Save as `EIP_Upload_Template.xlsx`

### Fill Out the Template

The template has 5 sheets:

| Sheet | Purpose |
|-------|---------|
| **Upload Queue** | Your video metadata — fill this out |
| **EIP Channels** | Reference for all 11 EIP channel handles |
| **Privacy Options** | Explanation of unlisted/private/public |
| **YouTube Categories** | Category IDs reference |
| **Instructions** | Column-by-column guide |

### Template Columns

| Column | Required | Description |
|--------|----------|-------------|
| `filename` | **YES** | Exact video filename (e.g., `florida_16x9.mp4`) |
| `title` | **YES** | YouTube video title (max 100 chars) |
| `description` | No | Video description (max 5000 chars) |
| `tags` | No | Comma-separated tags |
| `privacy` | No | `unlisted` (default), `private`, or `public` |
| `channel` | **YES** | Channel handle (e.g., `@MedicareCompared`) |
| `channel_id` | No | YouTube Channel ID (auto-matched from handle) |
| `category_id` | No | YouTube category ID (default: `22` = People & Blogs) |

### Import the Template

1. Place your video files in a folder
2. In the app, click **Add Folder** and select your videos folder
3. Click **Import Excel** and select your filled template
4. Videos are matched to files by filename
5. Review and edit any entries, then click **Start Upload**

---

## EIP YouTube Channels

| Handle | Channel Name |
|--------|-------------|
| `@eliteinsurancepartners` | Elite Insurance Partners |
| `@elpyoutube` | EIP YouTube |
| `@MedicareCompared` | MedicareCompared |
| `@applyformedicare` | Apply For Medicare |
| `@MedicareCompared01` | Medicare Compared |
| `@TheEliteBrokerage` | The Elite Brokerage |
| `@HealthCompared` | Health Compared |
| `@medicareplang` | Medicare Plan G |
| `@LifeCompared` | Life Compared |
| `@MedicarePlanN-zc3zh` | Medicare Plan N |
| `@elpinternal8920` | EIP Internal |

---

## API Quota Information

| Parameter | Value |
|-----------|-------|
| Videos per campaign | ~600 |
| Units per upload | ~1,600 |
| Base units required/day | ~960,000 |
| Requested daily quota | 1,200,000 units |

> **Note:** The default YouTube API quota is 10,000 units/day (~6 uploads). EIP has submitted a quota increase request to Google for 1,200,000 units/day. Until approved, uploads may be limited.

---

## Privacy Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Unlisted** | Accessible via direct link only | ✅ YES |
| **Private** | Only visible to you | |
| **Public** | Visible to everyone | |

All videos default to **Unlisted** per EIP's compliance policy.

---

## Workflow for 600 Videos/Day

1. **Prepare videos** — Export all 600 MP4 files to a single folder
2. **Fill Excel template** — One row per video with title, description, tags, channel
3. **Open app** → **Upload Queue**
4. **Add Folder** — Select your videos folder
5. **Import Excel** — Select your metadata file
6. **Review queue** — Spot-check a few entries, use Bulk Edit if needed
7. **Start Upload** — Click the green Start button
8. **Monitor progress** — Real-time progress bars for each video
9. **Export results** — Download Excel with all video IDs and YouTube URLs

---

## Technical Details

- **Framework**: Electron 31 + React 18 + TypeScript
- **UI**: TailwindCSS + Framer Motion
- **YouTube API**: googleapis v3 (videos.insert with resumable upload)
- **Auth**: OAuth 2.0 Desktop App flow
- **Excel**: SheetJS (xlsx)
- **Storage**: electron-store (local JSON)
- **Platforms**: Windows (NSIS installer), macOS (DMG), Linux (AppImage)

---

## Security

- OAuth tokens stored locally only (`electron-store`)
- No credentials transmitted to third parties
- No YouTube data read or scraped
- Internal use only — not publicly distributed

---

*Elite Insurance Partners — Internal Use Only*  
*8745 Henderson Rd, STE 220, Tampa, FL 33634*  
*marketing@teameip.com*
