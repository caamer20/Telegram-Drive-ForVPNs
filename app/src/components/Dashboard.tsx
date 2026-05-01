import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

import { TelegramFile, BandwidthStats } from '../types';
import { COMMON_EXTENSION_SETS } from '../utils/fileExtensions';

// Components
import { Sidebar } from './dashboard/Sidebar';
import { TopBar } from './dashboard/TopBar';
import { FileExplorer } from './dashboard/FileExplorer';
import { UploadQueue } from './dashboard/UploadQueue';
import { DownloadQueue } from './dashboard/DownloadQueue';
import { MoveToFolderModal } from './dashboard/MoveToFolderModal';
import { PreviewModal } from './dashboard/PreviewModal';
import { MediaPlayer } from './dashboard/MediaPlayer';
import { DragDropOverlay } from './dashboard/DragDropOverlay';
import { ExternalDropBlocker } from './dashboard/ExternalDropBlocker';

// Hooks
import { useTelegramConnection } from '../hooks/useTelegramConnection';
import { useFileOperations } from '../hooks/useFileOperations';
import { useFileUpload } from '../hooks/useFileUpload';
import { useFileDownload } from '../hooks/useFileDownload';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useProgressiveFiles } from '../hooks/useProgressiveFiles';

export function Dashboard({ onLogout }: { onLogout: () => void }) {


    const {
        store, folders, activeFolderId, setActiveFolderId, isSyncing, isConnected,
        handleLogout, handleSyncFolders, handleCreateFolder, handleFolderDelete
    } = useTelegramConnection(onLogout);


    const [previewFile, setPreviewFile] = useState<TelegramFile | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState<TelegramFile[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [internalDragFileId, _setInternalDragFileId] = useState<number | null>(null);
    const internalDragRef = useRef<number | null>(null);

    const setInternalDragFileId = (id: number | null) => {
        internalDragRef.current = id;
        _setInternalDragFileId(id);
    };
    const [playingFile, setPlayingFile] = useState<TelegramFile | null>(null);

    useEffect(() => {
        if (store) {
            store.get<'grid' | 'list'>('viewMode').then((saved) => {
                if (saved) setViewMode(saved);
            });
        }
    }, [store]);

    useEffect(() => {
        if (store) {
            store.set('viewMode', viewMode).then(() => store.save());
        }
    }, [store, viewMode]);


    // Progressive file loading: 50 files immediately, then 200 at a time in background
    const { files: allFiles, isLoading, isLoadingMore, error: filesError, refetch } = useProgressiveFiles(
        activeFolderId, !!store
    );
    const error = filesError ?? null;

    const displayedFiles = searchTerm.length > 2
        ? searchResults
        : allFiles.filter((f: TelegramFile) => f.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const { data: bandwidth } = useQuery({
        queryKey: ['bandwidth'],
        queryFn: () => invoke<BandwidthStats>('cmd_get_bandwidth'),
        refetchInterval: 5000,
        enabled: !!store
    });


    const {
        handleDelete, handleBulkDelete, handleDownload, handleBulkDownload,
        handleBulkMove, handleDownloadFolder, handleGlobalSearch

    } = useFileOperations(activeFolderId, selectedIds, setSelectedIds, displayedFiles, refetch);

    const { uploadQueue, setUploadQueue, handleManualUpload, isDragging } = useFileUpload(activeFolderId, store, refetch);
    const { downloadQueue, clearFinished: clearDownloads, cancelAll: cancelAllDownloads } = useFileDownload(store);

    const handleCancelAllUploads = useCallback(() => {
        setUploadQueue((q: typeof uploadQueue) => q.map(i =>
            i.status === 'pending' || i.status === 'uploading' ? { ...i, status: 'error' as const } : i
        ));
    }, [setUploadQueue]);


    const handleSelectAll = useCallback(() => {
        setSelectedIds(displayedFiles.map(f => f.id));
    }, [displayedFiles]);

    const handleKeyboardDelete = useCallback(() => {
        if (selectedIds.length > 0) {
            handleBulkDelete();
        }
    }, [selectedIds, handleBulkDelete]);

    const handleEscape = useCallback(() => {
        setSelectedIds([]);
        setSearchTerm("");
        setPreviewFile(null);
    }, []);

    const handleFocusSearch = useCallback(() => {
        const searchInput = document.querySelector('input[placeholder="Search files..."]') as HTMLInputElement;
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
    }, []);

    const handleEnter = useCallback(() => {
        if (selectedIds.length === 1) {
            const selected = displayedFiles.find(f => f.id === selectedIds[0]);
            if (selected) {
                if (selected.type === 'folder') {
                    setActiveFolderId(selected.id);
                } else {
                    setPreviewFile(selected);
                }
            }
        }
    }, [selectedIds, displayedFiles, setActiveFolderId]);

    const handleArrowDown = useCallback(() => {
        if (displayedFiles.length === 0) return;
        if (selectedIds.length === 0) {
            setSelectedIds([displayedFiles[0].id]);
            return;
        }
        const currentIdx = displayedFiles.findIndex(f => f.id === selectedIds[selectedIds.length - 1]);
        const nextIdx = Math.min(currentIdx + 1, displayedFiles.length - 1);
        setSelectedIds([displayedFiles[nextIdx].id]);
    }, [selectedIds, displayedFiles]);

    const handleArrowUp = useCallback(() => {
        if (displayedFiles.length === 0) return;
        if (selectedIds.length === 0) {
            setSelectedIds([displayedFiles[0].id]);
            return;
        }
        const currentIdx = displayedFiles.findIndex(f => f.id === selectedIds[0]);
        const prevIdx = Math.max(currentIdx - 1, 0);
        setSelectedIds([displayedFiles[prevIdx].id]);
    }, [selectedIds, displayedFiles]);

    useKeyboardShortcuts({
        onSelectAll: handleSelectAll,
        onDelete: handleKeyboardDelete,
        onEscape: handleEscape,
        onSearch: handleFocusSearch,
        onEnter: handleEnter,
        onArrowDown: handleArrowDown,
        onArrowUp: handleArrowUp,
        enabled: !previewFile && !showMoveModal // Disable when modals are open
    });


    useEffect(() => {
        setSelectedIds([]);
        setShowMoveModal(false);
        setSearchTerm("");
        setSearchResults([]);
    }, [activeFolderId]);


    useEffect(() => {
        if (searchTerm.length <= 2) {
            setSearchResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearching(true);
            const results = await handleGlobalSearch(searchTerm);
            setSearchResults(results);
            setIsSearching(false);
        }, 500);

        return () => clearTimeout(timer);
    }, [searchTerm]);




    const handleFileClick = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        if (e.metaKey || e.ctrlKey) {
            setSelectedIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]);
        } else {
            setSelectedIds([id]);
        }
    }

    const handleToggleSelection = useCallback((id: number) => {
        setSelectedIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]);
    }, []);

    const handlePreview = (file: TelegramFile) => {
        const ext = file.name.toLowerCase().split('.').pop() || '';
        const isMedia = COMMON_EXTENSION_SETS.VIDEOS.has(ext) || COMMON_EXTENSION_SETS.AUDIO.has(ext);

        if (isMedia) {
            setPlayingFile(file);
        } else {
            setPreviewFile(file);
        }
    };

    const handleDropOnFolder = async (e: React.DragEvent, targetFolderId: number | null) => {
        e.preventDefault();
        e.stopPropagation();

        const dataTransferFileId = e.dataTransfer.getData("application/x-telegram-file-id");

        if (activeFolderId === targetFolderId) return;

        const fileId = internalDragRef.current || (dataTransferFileId ? parseInt(dataTransferFileId) : null);

        if (fileId) {
            try {
                const idsToMove = selectedIds.includes(fileId) ? selectedIds : [fileId];

                await invoke('cmd_move_files', {
                    messageIds: idsToMove,
                    sourceFolderId: activeFolderId,
                    targetFolderId: targetFolderId
                });

                refetch();

                if (selectedIds.includes(fileId)) setSelectedIds([]);

                toast.success(`Moved ${idsToMove.length} file(s).`);

                setInternalDragFileId(null);
            } catch {
                toast.error(`Failed to move file(s).`);
            }
        }
    }

    const currentFolderName = activeFolderId === null
        ? "Saved Messages"
        : folders.find(f => f.id === activeFolderId)?.name || "Folder";


    const handleRootDragOver = (e: React.DragEvent) => {
        if (internalDragRef.current) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
        }
    };

    const handleRootDragEnter = (e: React.DragEvent) => {
        if (internalDragRef.current) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
        }
    };

    return (
        <div
            className="flex h-screen w-full overflow-hidden bg-telegram-bg relative"
            onClick={() => setSelectedIds([])}
            onDragOver={handleRootDragOver}
            onDragEnter={handleRootDragEnter}
        >

            <ExternalDropBlocker onUploadClick={handleManualUpload} />

            <AnimatePresence>
                {showMoveModal && (
                    <MoveToFolderModal
                        folders={folders}
                        onClose={() => setShowMoveModal(false)}
                        onSelect={handleBulkMove}
                        activeFolderId={activeFolderId}
                        key="move-modal"
                    />
                )}
                {playingFile && (
                    <MediaPlayer
                        file={playingFile}
                        onClose={() => setPlayingFile(null)}
                        activeFolderId={activeFolderId}
                        key="media-player"
                    />
                )}
                {isDragging && internalDragFileId === null && <DragDropOverlay key="drag-drop-overlay" />}
            </AnimatePresence>

            <Sidebar
                folders={folders}
                activeFolderId={activeFolderId}
                setActiveFolderId={setActiveFolderId}
                onDrop={handleDropOnFolder}
                onDelete={handleFolderDelete}
                onCreate={handleCreateFolder}
                isSyncing={isSyncing}
                isConnected={isConnected}
                onSync={handleSyncFolders}
                onLogout={handleLogout}
                bandwidth={bandwidth || null}
            />

            <main className="flex-1 flex flex-col" onClick={(e) => { if (e.target === e.currentTarget) setSelectedIds([]); }}>
                <TopBar
                    currentFolderName={currentFolderName}
                    selectedIds={selectedIds}
                    onShowMoveModal={() => setShowMoveModal(true)}
                    onBulkDownload={handleBulkDownload}
                    onBulkDelete={handleBulkDelete}
                    onDownloadFolder={handleDownloadFolder}
                    viewMode={viewMode}
                    setViewMode={setViewMode}
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                />
                {searchTerm.length > 2 && (
                    <div className="px-6 pt-4 pb-0">
                        <h2 className="text-sm font-medium text-telegram-subtext">
                            Search Results for <span className="text-telegram-primary">"{searchTerm}"</span>
                        </h2>
                    </div>
                )}
                <FileExplorer

                    files={displayedFiles}
                    loading={isLoading || isSearching}
                    error={error}
                    viewMode={viewMode}
                    selectedIds={selectedIds}
                    activeFolderId={activeFolderId}
                    onFileClick={handleFileClick}
                    onDelete={handleDelete}
                    onDownload={handleDownload}
                    onPreview={handlePreview}
                    onManualUpload={handleManualUpload}
                    onSelectionClear={() => setSelectedIds([])}
                    onToggleSelection={handleToggleSelection}
                    onDrop={handleDropOnFolder}
                    onDragStart={(fileId) => setInternalDragFileId(fileId)}
                    onDragEnd={() => setTimeout(() => setInternalDragFileId(null), 50)}
                />
                {isLoadingMore && (
                    <div className="px-6 py-2 text-xs text-telegram-subtext flex items-center gap-2">
                        <div className="w-3 h-3 border-2 border-telegram-primary border-t-transparent rounded-full animate-spin" />
                        Loading more files… ({allFiles.length} loaded)
                    </div>
                )}
            </main>

            {previewFile && (
                <PreviewModal
                    file={previewFile}
                    activeFolderId={activeFolderId}
                    onClose={() => setPreviewFile(null)}
                />
            )}


            <UploadQueue
                items={uploadQueue}
                onClearFinished={() => setUploadQueue(q => q.filter(i => i.status !== 'success' && i.status !== 'error'))}
                onCancelAll={handleCancelAllUploads}
            />
            <DownloadQueue
                items={downloadQueue}
                onClearFinished={clearDownloads}
                onCancelAll={cancelAllDownloads}
            />
        </div>
    );
}
