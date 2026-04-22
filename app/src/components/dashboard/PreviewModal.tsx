import { useState, useEffect } from 'react';
import { X, File } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { TelegramFile } from '../../types';
import { COMMON_EXTENSION_SETS } from '../../utils/fileExtensions';
import PdfViewer from './PdfViewer';

interface PreviewModalProps {
    file: TelegramFile;
    onClose: () => void;
    activeFolderId: number | null;
}

function getExtension(filename: string): string {
    return filename.toLowerCase().split('.').pop() || '';
}

export function PreviewModal({ file, onClose, activeFolderId }: PreviewModalProps) {
    const [src, setSrc] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const ext = getExtension(file.name);
    const isPdf = COMMON_EXTENSION_SETS.PDFS.has(ext);
    const isImage = COMMON_EXTENSION_SETS.IMAGES.has(ext);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const path = await invoke<string>('cmd_get_preview', {
                    messageId: file.id,
                    folderId: activeFolderId
                });
                if (path) {
                    if (path.startsWith('data:')) {
                        setSrc(path);
                    } else {
                        setSrc(convertFileSrc(path));
                    }
                } else {
                    setError("Preview not available");
                }
            } catch (e) {
                setError(String(e));
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [file, activeFolderId]);

    // PDF gets its own full-screen viewer
    if (isPdf && !loading && !error && src) {
        return <PdfViewer url={src} fileName={file.name} onClose={onClose} />;
    }

    return (
        <div className="fixed inset-0 z-[150] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="relative max-w-5xl w-full max-h-screen flex flex-col items-center justify-center" onClick={e => e.stopPropagation()}>
                <button
                    onClick={onClose}
                    className="absolute -top-12 right-0 p-2 bg-black/60 hover:bg-black/80 rounded-full transition-colors"
                    style={{ color: '#ffffff' }}
                >
                    <X className="w-6 h-6" />
                </button>

                {loading && (
                    <div className="flex flex-col items-center gap-4 text-white">
                        <div className="w-10 h-10 border-4 border-telegram-primary border-t-transparent rounded-full animate-spin"></div>
                        <p>Loading preview...</p>
                        <p className="text-xs text-white/50">Downloading from Telegram...</p>
                    </div>
                )}

                {error && (
                    <div className="text-red-400 bg-white/10 p-4 rounded-lg border border-red-500/20">
                        <p className="font-bold">Preview Error</p>
                        <p className="text-sm">{error}</p>
                    </div>
                )}

                {!loading && !error && src && (
                    <div className="flex flex-col items-center">
                        {isImage ? (
                            <img src={src.startsWith('data:') ? src : `${src}?t=${Date.now()}`} className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl bg-black" alt="Preview" />
                        ) : (
                            <div className="bg-[#1c1c1c] p-8 rounded-xl text-center border border-white/10 shadow-2xl">
                                <File className="w-16 h-16 text-telegram-primary mx-auto mb-4" />
                                <h3 className="text-xl text-white font-medium mb-2">{file.name}</h3>
                                <p className="text-gray-400 mb-6">Preview not supported in app.</p>
                                <p className="text-xs text-gray-500">File type: {ext}</p>
                            </div>
                        )}
                    </div>
                )}

                <div className="absolute bottom-[-3rem] text-white text-sm opacity-50">
                    {file.name}
                </div>
            </div>
        </div>
    );
}
