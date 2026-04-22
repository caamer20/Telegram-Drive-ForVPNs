# Changelog

## [1.1.2] - 2026-04-22

### Branding Updates
- Updated application name and title to "Telegram Drive for VPNs".
- Removed emojis from changelog and release notes.

---

## [1.1.1] - 2026-04-22

### CI/CD Fixes
- Restored working GitHub Actions workflows.
- Pinned exact versions for Tauri plugins to prevent drift.

---

## [1.1.0] - 2026-04-22

### New Features

- **Progressive File Loading** — Files now load in pages (50 first, then 200 at a time in the background) instead of all-at-once, dramatically improving responsiveness for VPN users with high-latency connections.
- **PDF Viewer** — Full in-app PDF viewer with page navigation, zoom (fit-width / fit-page / manual), rotation, thumbnail sidebar, keyboard shortcuts, and download fallback for corrupted files.
- **Paginated Backend API** — `cmd_get_files` now accepts `offset` and `limit` parameters and returns a `FilePage` struct with `has_more` / `next_offset` for cursor-based pagination.

### Security

- **Content Security Policy** — Replaced the permissive `csp: null` with a strict per-directive CSP (default-src, script-src, style-src, connect-src, img-src, worker-src, object-src, base-uri, form-action).

### Improvements

- **Centralized File Extensions** — Extracted all file-extension lists into `utils/fileExtensions.ts` with O(1) Set lookups, eliminating duplicated inline arrays across `FileTypeIcon`, `PreviewModal`, `ContextMenu`, and `FileCard`.
- **Smarter Refreshes** — File operations (delete, bulk delete, move, upload) now call the progressive-loader's `refetch()` instead of blowing away the React Query cache, avoiding full re-fetches.
- **Auth Branding** — Login screen title updated to "Telegram Drive for VPNs"; auth gradient changed to green tones.

### Cleanup

- Deleted stale `commands.rs.bak` and empty `commands/menu.rs`.
- Removed dead video-preview branch from `PreviewModal` (videos already handled by `MediaPlayer`).
- Deduplicated `FileTypeIcon` by deriving icon/color from the shared extension sets instead of a 40-line inline map.

---

## [1.0.4] - 2026-02-13

### Fixes

- Finally squashed the grid overlap bug for real. Cards were using CSS `aspect-[4/3]` to size themselves, but the virtualizer was computing row heights separately — at certain window widths these disagreed and rows would bleed into each other. Now both use the same explicit pixel height, so no more overlap regardless of how you resize the window.

### Cleanup

- Went through the whole codebase and ripped out every `console.log` / `console.error` we'd left in from debugging (16 of them). The one in `ErrorBoundary` stays since that's the whole point of an error boundary.
- Got rid of all `as any` casts on the frontend — everything's properly typed now.
- Ran Clippy and fixed all 7 warnings, including a couple of `collapsible_match` ones in `fs.rs` that needed manual refactoring.
- Dropped `clsx`, `tailwind-merge`, and `@tauri-apps/plugin-opener` from `package.json` — none of them were actually imported anywhere.
- General comment cleanup throughout.

---

## [1.0.3] - 2026-02-09

### Bug Fixes

- **Grid Spacing Fix** - Fixed cards overlapping in grid view
- **Dynamic Row Height** - Grid now properly calculates row height based on window size
- **Virtualizer Re-measurement** - Grid correctly updates when resizing window

---

## [1.0.2] - 2026-02-07

### Automated Release Pipeline

- **GitHub Actions Workflow** - Automatic builds triggered on version tags
- **Cross-Platform Builds** - Windows, Linux, macOS (Intel + ARM) built in parallel
- **Signed Updates** - All builds signed with Ed25519 for secure auto-updates
- **Automatic Publishing** - Releases published to GitHub automatically

---

## [1.0.1] - 2026-02-07

### Auto-Update System

- **Automatic Update Checks** - App checks for updates 5 seconds after startup
- **Update Banner** - Beautiful animated banner when new version available
- **One-Click Updates** - Download and install updates with progress indicator
- **Cross-Platform** - Windows, Mac, and Linux users get platform-specific updates

### 🔧 Technical

- Added Tauri updater plugin with Ed25519 signing
- Created `useUpdateCheck` hook for update lifecycle management
- Added `UpdateBanner` component with download progress

---

## [1.0.0] - 2026-02-06 🎉

### First Stable Release

Telegram Drive is now production-ready! This release focuses on performance, reliability, and user experience polish.

### ✨ New Features

- **Virtual Scrolling** - Smooth performance with folders containing 1000+ files
- **Inline Thumbnails** - Image files now display thumbnails directly in the file grid
- **Thumbnail Caching** - Thumbnails are cached locally for instant loading on revisit
- **API Setup Help Guide** - Step-by-step modal explaining how to get Telegram API credentials

### 🚀 Performance Improvements

- Grid and list views now only render visible items (virtualized)
- Responsive column layout adapts to window width
- Lazy loading of thumbnails to reduce initial load time

### 🎨 UI/UX Improvements

- Refined grid spacing (6px gaps between cards)
- Gradient overlay on thumbnail cards for text readability
- Improved light mode support across all components

### 🔧 Technical

- Added `@tanstack/react-virtual` for virtualization
- Separate thumbnail cache directory (`app_data_dir/thumbnails/`)
- FileTypeIcon now supports multiple sizes

---

## [0.6.0] - 2026-02-05

### Reliability Update

- Session persistence (window state, UI state, active folder)
- Network resilience with connection status indicator
- Queue persistence for uploads/downloads
- Light mode UI fixes

---

## [0.5.0] - 2026-02-04

### Drag & Drop Update

- Stable hybrid drag-drop system
- External drop blocker
- GitHub Actions workflow fixes

---

## [0.4.0] - 2026-02-01

### Media & Performance

- Audio/Video streaming player
- Global search filter
- Internal drag & drop between folders
