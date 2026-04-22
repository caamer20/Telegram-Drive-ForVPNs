export interface TelegramFile {
    id: number;
    name: string;
    size: number;
    sizeStr: string; // Formatted size
    created_at?: string;
    type?: 'folder' | 'file'; // implied icon_type
    // Add other fields if backend sends them
}

/** Raw file metadata as returned by the Rust backend (before frontend transforms) */
export interface FileMetadataRaw {
    id: number;
    folder_id: number | null;
    name: string;
    size: number;
    mime_type: string | null;
    file_ext: string | null;
    created_at: string;
    icon_type: string;
}

/** Paginated response from cmd_get_files */
export interface FilePage {
    files: FileMetadataRaw[];
    has_more: boolean;
    next_offset: number;
    total_fetched: number;
}

export interface TelegramFolder {
    id: number;
    name: string;
    parent_id?: number;
}

export interface QueueItem {
    id: string;
    path: string;
    folderId: number | null;
    status: 'pending' | 'uploading' | 'success' | 'error';
    error?: string;
}

export interface BandwidthStats {
    up_bytes: number;
    down_bytes: number;
}

export interface DownloadItem {
    id: string;
    messageId: number;
    filename: string;
    folderId: number | null;
    status: 'pending' | 'downloading' | 'success' | 'error';
    error?: string;
}
