// Centralized file extension definitions to eliminate duplication across components
// This file provides O(1) lookup performance and maintains consistency

export const FILE_EXTENSIONS = {
  // Images
  IMAGES: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tiff', 'tif', 'raw', 'arw', 'cr2', 'nef', 'orf', 'dng'],
  
  // Videos
  VIDEOS: ['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi', 'mpg', 'mpeg', 'wmv', 'flv', '3gp', '3g2', 'm4v', 'f4v', 'f4p', 'ogv', 'webm', 'mts', 'm2ts', 'ts'],
  
  // Audio
  AUDIO: ['mp3', 'wav', 'aac', 'flac', 'm4a', 'opus', 'ogg', 'wma', 'rm', 'au', 'dts', 'aiff', 'aif', 'dsf', 'dsd', 'mqa', 'tak', 'tak', 'weba'],
  
  // PDFs (separate category for PDF handling)
  PDFS: ['pdf'],
  
  // Documents
  DOCUMENTS: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'txt', 'rtf', 'tex', 'csv', 'tsv', 'docm', 'dotx', 'dotm', 'xps'],
  
  // Archives
  ARCHIVES: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'lz', 'lzma', 'z', 'deb', 'rpm', 'apk', 'dmg', 'pkg', 'msix', 'msixbundle'],
  
  // Code files
  CODE: ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'scss', 'sass', 'less', 'xml', 'json', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'php', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'go', 'rb', 'swift', 'kt', 'rust', 'r', 'm', 'mm', 'sql', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd'],
  
  // Ebooks
  EBOOKS: ['epub', 'mobi', 'azw', 'azw3', 'fb2', 'djvu', 'djv', 'cbr', 'cbz', 'cb7', 'cbt', 'cba', 'ibooks'],
  
  // Spreadsheets
  SPREADSHEETS: ['xls', 'xlsx', 'xlsm', 'xlsb', 'ods', 'fods', 'csv', 'tsv'],
  
  // Presentations
  PRESENTATIONS: ['ppt', 'pptx', 'pptm', 'pps', 'ppsx', 'odp', 'fodp'],
  
  // Text files
  TEXT: ['txt', 'md', 'markdown', 'rst', 'org', 'tex', 'nfo', 'log'],
  
  // Fonts
  FONTS: ['ttf', 'otf', 'woff', 'woff2', 'eot', 'fon', 'fnt'],
  
  // 3D models
  MODELS: ['obj', 'fbx', '3ds', 'dae', 'ply', 'stl', 'gltf', 'glb', 'x3d', 'vrml', 'wrl'],
  
  // Database files
  DATABASE: ['db', 'sqlite', 'sqlite3', 'mdb', 'accdb', 'frm', 'myd', 'myi', 'ibd', 'dbf'],
  
  // CAD files
  CAD: ['dwg', 'dxf', 'dgn', 'iges', 'igs', 'step', 'stp', 'sldprt', 'sldasm'],
  
  // Executable files
  EXECUTABLES: ['exe', 'msi', 'deb', 'rpm', 'dmg', 'pkg', 'app', 'apk', 'ipa', 'xap', 'msix', 'appx'],
  
  // Vector graphics
  VECTORS: ['svg', 'ai', 'eps', 'cdr', 'emf', 'wmf']
} as const;

// Create a reverse lookup map for O(1) extension-to-category mapping
const EXTENSION_TO_TYPE = new Map<string, string>();

// Build the reverse lookup map
Object.entries(FILE_EXTENSIONS).forEach(([category, extensions]) => {
  extensions.forEach(ext => {
    EXTENSION_TO_TYPE.set(ext.toLowerCase(), category.toLowerCase());
  });
});

/**
 * Get the file type category for a given extension
 * @param ext - File extension (can include the dot)
 * @returns Category name or 'other' if not found
 */
export function getFileType(ext: string): string {
  const cleanExt = ext.toLowerCase().replace(/^\./, ''); // Remove leading dot if present
  return EXTENSION_TO_TYPE.get(cleanExt) || 'other';
}

/**
 * Check if a file extension belongs to a specific category
 * @param ext - File extension to check
 * @param category - Category to check against
 * @returns Boolean indicating membership
 */
export function isFileType(ext: string, category: keyof typeof FILE_EXTENSIONS): boolean {
  const cleanExt = ext.toLowerCase().replace(/^\./, '');
  const extensions = FILE_EXTENSIONS[category] as readonly string[];
  return extensions.includes(cleanExt);
}

/**
 * Get all extensions for a specific category
 * @param category - Category name
 * @returns Array of extensions
 */
export function getExtensionsForCategory(category: keyof typeof FILE_EXTENSIONS): readonly string[] {
  return FILE_EXTENSIONS[category];
}

/**
 * Create a Set of extensions for fast O(1) membership checking
 * @param categories - Array of categories to include
 * @returns Set of lowercase extensions
 */
export function createExtensionSet(...categories: (keyof typeof FILE_EXTENSIONS)[]): Set<string> {
  const extensions = new Set<string>();
  categories.forEach(category => {
    const extArray = FILE_EXTENSIONS[category] as readonly string[];
    extArray.forEach(ext => {
      extensions.add(ext.toLowerCase());
    });
  });
  return extensions;
}

/**
 * Common extension sets for frequently used checks
 */
export const COMMON_EXTENSION_SETS = {
  MEDIA: createExtensionSet('IMAGES', 'VIDEOS', 'AUDIO'),
  IMAGES: createExtensionSet('IMAGES'),
  VIDEOS: createExtensionSet('VIDEOS'),
  AUDIO: createExtensionSet('AUDIO'),
  ARCHIVES: createExtensionSet('ARCHIVES'),
  DOCUMENTS: createExtensionSet('DOCUMENTS'),
  PDFS: createExtensionSet('PDFS'),
  CODE: createExtensionSet('CODE'),
  TEXT: createExtensionSet('TEXT'),
  EXECUTABLES: createExtensionSet('EXECUTABLES')
} as const;

/**
 * Get icon type based on file extension
 * @param filename - File name with extension
 * @returns Icon type string suitable for CSS classes
 */
export function getIconType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() || '';
  
  if (COMMON_EXTENSION_SETS.IMAGES.has(ext)) return 'image';
  if (COMMON_EXTENSION_SETS.VIDEOS.has(ext)) return 'video';
  if (COMMON_EXTENSION_SETS.AUDIO.has(ext)) return 'audio';
  if (COMMON_EXTENSION_SETS.PDFS.has(ext)) return 'document';
  if (COMMON_EXTENSION_SETS.ARCHIVES.has(ext)) return 'archive';
  if (COMMON_EXTENSION_SETS.CODE.has(ext)) return 'code';
  if (COMMON_EXTENSION_SETS.EXECUTABLES.has(ext)) return 'executable';
  if (COMMON_EXTENSION_SETS.TEXT.has(ext)) return 'text';
  
  // Default to generic file icon
  return 'file';
}

/**
 * Check if a file can be previewed
 * @param filename - File name to check
 * @returns Boolean indicating preview support
 */
export function canPreview(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop() || '';
  
  // Check if the extension exists in any of the previewable categories
  return (
    COMMON_EXTENSION_SETS.IMAGES.has(ext) ||
    COMMON_EXTENSION_SETS.VIDEOS.has(ext) ||
    COMMON_EXTENSION_SETS.AUDIO.has(ext) ||
    COMMON_EXTENSION_SETS.PDFS.has(ext) ||
    COMMON_EXTENSION_SETS.TEXT.has(ext)
  );
}

export default {
  FILE_EXTENSIONS,
  COMMON_EXTENSION_SETS,
  getFileType,
  isFileType,
  getExtensionsForCategory,
  createExtensionSet,
  getIconType,
  canPreview
};