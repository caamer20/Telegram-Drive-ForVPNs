import {
    File, FileText, FileImage, FileVideo, FileAudio,
    FileArchive, FileCode, FileSpreadsheet, Presentation,
    FileType
} from 'lucide-react';
import { COMMON_EXTENSION_SETS } from '../utils/fileExtensions';

// Map of specific extensions to icon + color for fine-grained control
const extensionOverrides: Record<string, { icon: typeof File; color: string }> = {
    // Documents
    pdf: { icon: FileType, color: 'text-red-400' },
    doc: { icon: FileText, color: 'text-blue-400' },
    docx: { icon: FileText, color: 'text-blue-400' },
    txt: { icon: FileText, color: 'text-gray-400' },
    rtf: { icon: FileText, color: 'text-gray-400' },
    md: { icon: FileText, color: 'text-gray-400' },

    // Spreadsheets
    xls: { icon: FileSpreadsheet, color: 'text-green-500' },
    xlsx: { icon: FileSpreadsheet, color: 'text-green-500' },
    csv: { icon: FileSpreadsheet, color: 'text-green-500' },

    // Presentations
    ppt: { icon: Presentation, color: 'text-orange-400' },
    pptx: { icon: Presentation, color: 'text-orange-400' },
    key: { icon: Presentation, color: 'text-orange-400' },

    // Code - specific colors per language
    js: { icon: FileCode, color: 'text-yellow-300' },
    ts: { icon: FileCode, color: 'text-blue-300' },
    jsx: { icon: FileCode, color: 'text-cyan-300' },
    tsx: { icon: FileCode, color: 'text-cyan-300' },
    py: { icon: FileCode, color: 'text-green-300' },
    rs: { icon: FileCode, color: 'text-orange-300' },
    go: { icon: FileCode, color: 'text-cyan-400' },
    java: { icon: FileCode, color: 'text-red-300' },
    html: { icon: FileCode, color: 'text-orange-400' },
    css: { icon: FileCode, color: 'text-blue-400' },
    json: { icon: FileCode, color: 'text-yellow-200' },
};

/**
 * Get icon and color for a given filename.
 * Uses the shared COMMON_EXTENSION_SETS for category detection,
 * then extensionOverrides for specific per-extension styling.
 */
export function getFileTypeInfo(filename: string): { icon: typeof File; color: string } {
    const ext = filename.split('.').pop()?.toLowerCase() || '';

    // Check specific overrides first (for per-extension colors)
    if (extensionOverrides[ext]) {
        return extensionOverrides[ext];
    }

    // Fall back to category-based defaults via shared sets
    if (COMMON_EXTENSION_SETS.IMAGES.has(ext)) return { icon: FileImage, color: 'text-pink-400' };
    if (COMMON_EXTENSION_SETS.VIDEOS.has(ext)) return { icon: FileVideo, color: 'text-purple-400' };
    if (COMMON_EXTENSION_SETS.AUDIO.has(ext)) return { icon: FileAudio, color: 'text-green-400' };
    if (COMMON_EXTENSION_SETS.ARCHIVES.has(ext)) return { icon: FileArchive, color: 'text-yellow-400' };
    if (COMMON_EXTENSION_SETS.CODE.has(ext)) return { icon: FileCode, color: 'text-gray-300' };
    if (COMMON_EXTENSION_SETS.TEXT.has(ext)) return { icon: FileText, color: 'text-gray-400' };

    return { icon: File, color: 'text-telegram-subtext' };
}

interface FileTypeIconProps {
    filename: string;
    className?: string;
    size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
    sm: 'w-5 h-5',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
};

export function FileTypeIcon({ filename, className, size = 'md' }: FileTypeIconProps) {
    const { icon: Icon, color } = getFileTypeInfo(filename);
    const sizeClass = className ?? sizeMap[size];
    return <Icon className={`${sizeClass} ${color} pointer-events-none select-none`} />;
}
