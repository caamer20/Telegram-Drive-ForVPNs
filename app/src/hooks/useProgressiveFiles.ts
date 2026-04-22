import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TelegramFile, FilePage } from '../types';
import { formatBytes } from '../utils';

const FIRST_PAGE_SIZE = 50;   // Fast initial load for VPN users
const NEXT_PAGE_SIZE = 200;   // Larger chunks for background loading

/** Transform raw backend file metadata into frontend TelegramFile */
function transformFile(f: FilePage['files'][0]): TelegramFile {
    return {
        ...f,
        sizeStr: formatBytes(f.size),
        type: f.icon_type === 'folder' ? 'folder' : 'file',
    };
}

/**
 * Progressive file loading hook optimized for VPN users.
 * 
 * Strategy:
 * 1. Fetch first 50 files immediately (renders in <2s on VPN)
 * 2. Continue loading 200 at a time in the background
 * 3. Files accumulate as they arrive — no UI blocking
 * 4. Folder switch cancels in-flight loads and starts fresh
 */
export function useProgressiveFiles(folderId: number | null, enabled: boolean) {
    const [files, setFiles] = useState<TelegramFile[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    // Track the current load session so we can cancel stale ones on folder switch
    const sessionRef = useRef(0);

    const loadFiles = useCallback(async () => {
        const session = ++sessionRef.current;
        setFiles([]);
        setError(null);
        setIsLoading(true);
        setIsLoadingMore(false);

        try {
            // Page 1: Fast initial load (50 files)
            const firstPage = await invoke<FilePage>('cmd_get_files', {
                folderId,
                offset: 0,
                limit: FIRST_PAGE_SIZE,
            });

            // Check if folder changed while we were fetching
            if (session !== sessionRef.current) return;

            const firstFiles = firstPage.files.map(transformFile);
            setFiles(firstFiles);
            setIsLoading(false);

            // If there's more, start background loading
            if (firstPage.has_more) {
                setIsLoadingMore(true);
                let offset = firstPage.next_offset;
                let hasMore = true;

                while (hasMore) {
                    if (session !== sessionRef.current) return; // Cancelled

                    const page = await invoke<FilePage>('cmd_get_files', {
                        folderId,
                        offset,
                        limit: NEXT_PAGE_SIZE,
                    });

                    if (session !== sessionRef.current) return; // Cancelled

                    if (page.files.length > 0) {
                        const newFiles = page.files.map(transformFile);
                        setFiles(prev => [...prev, ...newFiles]);
                    }

                    hasMore = page.has_more;
                    offset = page.next_offset;
                }

                if (session === sessionRef.current) {
                    setIsLoadingMore(false);
                }
            }
        } catch (err) {
            if (session === sessionRef.current) {
                setError(err instanceof Error ? err : new Error(String(err)));
                setIsLoading(false);
                setIsLoadingMore(false);
            }
        }
    }, [folderId]);

    // Trigger load when folder changes
    useEffect(() => {
        if (!enabled) return;
        loadFiles();

        // Cleanup: bump session to cancel any in-flight loads
        return () => { sessionRef.current++; };
    }, [folderId, enabled, loadFiles]);

    /** Force refresh (e.g. after upload/delete) */
    const refetch = useCallback(() => {
        if (enabled) loadFiles();
    }, [enabled, loadFiles]);

    return {
        files,
        isLoading,      // True only during first page load
        isLoadingMore,  // True while background pages are loading
        error,
        refetch,
    };
}
