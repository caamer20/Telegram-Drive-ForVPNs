import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, RotateCcw, RotateCw, X, Columns, AlignVerticalJustifyCenter, AlignHorizontalJustifyCenter } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

// Bundle the worker locally instead of relying on CDN.
// Vite will handle this via the ?url import and static copy.
// In production Tauri builds, the worker is copied to assets/ by vite-plugin-static-copy.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href;

interface PdfViewerProps {
  url: string;
  fileName: string;
  onClose: () => void;
}

type ZoomMode = 'custom' | 'fit-width' | 'fit-page';

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.0;
const SCALE_STEP = 0.1;
const ROTATION_STEP = 90;

const PdfViewer: React.FC<PdfViewerProps> = ({ url, fileName, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<pdfjs.RenderTask | null>(null);

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-width');

  // --- Fit-width / fit-page calculation ---
  const computeFitScale = useCallback(
    (page: PDFPageProxy, mode: ZoomMode): number => {
      if (mode === 'custom' || !containerRef.current) return scale;
      const viewport = page.getViewport({ scale: 1.0, rotation });
      const container = containerRef.current;
      // Account for padding/scrollbar
      const availableWidth = container.clientWidth - 40;
      const availableHeight = container.clientHeight - 40;

      if (mode === 'fit-width') {
        return availableWidth / viewport.width;
      }
      // fit-page: fit both dimensions
      return Math.min(
        availableWidth / viewport.width,
        availableHeight / viewport.height
      );
    },
    [rotation, scale]
  );

  // --- Navigation ---
  const nextPage = useCallback(() => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  }, [totalPages]);

  const previousPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  }, []);

  // --- Zoom ---
  const zoomIn = useCallback(() => {
    setZoomMode('custom');
    setScale((prev) => Math.min(MAX_SCALE, +(prev + SCALE_STEP).toFixed(1)));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomMode('custom');
    setScale((prev) => Math.max(MIN_SCALE, +(prev - SCALE_STEP).toFixed(1)));
  }, []);

  const setFitWidth = useCallback(() => setZoomMode('fit-width'), []);
  const setFitPage = useCallback(() => setZoomMode('fit-page'), []);

  // --- Rotation ---
  const rotateLeft = useCallback(() => {
    setRotation((prev) => (prev - ROTATION_STEP + 360) % 360);
  }, []);

  const rotateRight = useCallback(() => {
    setRotation((prev) => (prev + ROTATION_STEP) % 360);
  }, []);

  // --- Download ---
  const downloadPdf = useCallback(async () => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Download failed:', err);
    }
  }, [url, fileName]);

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === 'INPUT') return;

      switch (e.key.toLowerCase()) {
        case 'escape':
          e.preventDefault();
          onClose();
          break;
        case 'arrowleft':
        case 'a':
          e.preventDefault();
          previousPage();
          break;
        case 'arrowright':
        case 'd':
          e.preventDefault();
          nextPage();
          break;
        case ' ':
          e.preventDefault();
          if (e.shiftKey) previousPage();
          else nextPage();
          break;
        case '+':
        case '=':
          e.preventDefault();
          zoomIn();
          break;
        case '-':
          e.preventDefault();
          zoomOut();
          break;
        case 'r':
          e.preventDefault();
          rotateRight();
          break;
        case 't':
          e.preventDefault();
          setShowThumbnails((prev) => !prev);
          break;
        case 'w':
          e.preventDefault();
          setFitWidth();
          break;
        case 'p':
          e.preventDefault();
          setFitPage();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, previousPage, nextPage, zoomIn, zoomOut, rotateRight, setFitWidth, setFitPage]);

  // --- Ctrl/Cmd + Scroll zoom ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) zoomIn();
        else zoomOut();
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [zoomIn, zoomOut]);

  // --- Load PDF document ---
  useEffect(() => {
    let mounted = true;
    let pdfDoc: PDFDocumentProxy | null = null;

    const loadPdf = async () => {
      try {
        setLoading(true);
        setError(null);

        const loadingTask = pdfjs.getDocument({
          url,
          withCredentials: false,
          useSystemFonts: true,
          disableFontFace: false,
          verbosity: 0,
        });

        pdfDoc = await loadingTask.promise;

        if (!mounted) {
          pdfDoc.destroy();
          return;
        }

        setPdf(pdfDoc);
        setTotalPages(pdfDoc.numPages);
        setCurrentPage(1);

        // Generate thumbnails
        await generateThumbnails(pdfDoc);
      } catch (err) {
        console.error('PDF loading error:', err);
        if (mounted) {
          const message = err instanceof Error ? err.message : 'Failed to load PDF';
          // Provide user-friendly error for common corruption scenarios
          if (message.includes('Invalid PDF') || message.includes('Missing PDF')) {
            setError('This PDF file appears to be corrupted or invalid. Try downloading it and opening with a desktop PDF reader.');
          } else if (message.includes('password')) {
            setError('This PDF is password-protected. Password-protected PDFs are not supported yet.');
          } else {
            setError(message);
          }
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadPdf();

    // Cleanup: destroy the PDFDocumentProxy to free memory
    return () => {
      mounted = false;
      if (pdfDoc) {
        pdfDoc.destroy();
      }
      setThumbnails([]);
    };
  }, [url]);

  // --- Generate thumbnails ---
  const generateThumbnails = async (pdfDoc: PDFDocumentProxy) => {
    const results: string[] = [];
    // Limit thumbnail generation to prevent memory issues on huge PDFs
    const maxThumbnails = Math.min(pdfDoc.numPages, 100);

    for (let i = 1; i <= maxThumbnails; i++) {
      try {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 0.2 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport }).promise;
        results.push(canvas.toDataURL('image/jpeg', 0.5));
      } catch {
        // Skip failed thumbnails
        results.push('');
      }
    }

    setThumbnails(results);
  };

  // --- Render current page ---
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;

    let cancelled = false;

    const renderPage = async () => {
      try {
        // Cancel any previous in-flight render
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        const page = await pdf.getPage(currentPage);

        // Compute scale for fit modes
        let activeScale = scale;
        if (zoomMode !== 'custom') {
          activeScale = computeFitScale(page, zoomMode);
          // Update the displayed scale without triggering zoomMode reset
          if (!cancelled) setScale(activeScale);
        }

        const viewport = page.getViewport({ scale: activeScale, rotation });
        const canvas = canvasRef.current!;
        const context = canvas.getContext('2d')!;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const task = page.render({ canvasContext: context, viewport });
        renderTaskRef.current = task;

        await task.promise;
      } catch (err: unknown) {
        // Cancelled renders are expected, not errors
        if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'RenderingCancelledException') return;
        if (!cancelled) {
          console.error('Page rendering error:', err);
          setError('Failed to render page');
        }
      }
    };

    renderPage();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [pdf, currentPage, scale, rotation, zoomMode, computeFitScale]);

  // --- Loading state ---
  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading PDF...</p>
        </div>
      </div>
    );
  }

  // --- Error state with corrupted PDF fallback ---
  if (error) {
    return (
      <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-red-600">PDF Loading Error</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 p-1">
              <X size={24} />
            </button>
          </div>
          <p className="text-gray-700 mb-4">{error}</p>
          <div className="flex gap-2">
            <button
              onClick={downloadPdf}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2"
            >
              <Download size={16} /> Download Instead
            </button>
            <button
              onClick={onClose}
              className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
      {/* Header toolbar */}
      <div className="bg-gray-800 text-white p-3 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-semibold truncate max-w-md">{fileName}</h2>
          <span className="text-sm text-gray-300">
            Page {currentPage} of {totalPages}
          </span>
        </div>

        <div className="flex items-center space-x-1">
          {/* Zoom controls */}
          <button onClick={zoomOut} disabled={scale <= MIN_SCALE} className="p-2 hover:bg-gray-700 rounded disabled:opacity-50" title="Zoom Out (-)">
            <ZoomOut size={18} />
          </button>
          <span className="text-sm min-w-[55px] text-center">{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} disabled={scale >= MAX_SCALE} className="p-2 hover:bg-gray-700 rounded disabled:opacity-50" title="Zoom In (+)">
            <ZoomIn size={18} />
          </button>

          <div className="w-px h-5 bg-gray-600 mx-1" />

          {/* Fit modes */}
          <button
            onClick={setFitWidth}
            className={`p-2 rounded ${zoomMode === 'fit-width' ? 'bg-gray-600' : 'hover:bg-gray-700'}`}
            title="Fit Width (W)"
          >
            <AlignVerticalJustifyCenter size={18} />
          </button>
          <button
            onClick={setFitPage}
            className={`p-2 rounded ${zoomMode === 'fit-page' ? 'bg-gray-600' : 'hover:bg-gray-700'}`}
            title="Fit Page (P)"
          >
            <AlignHorizontalJustifyCenter size={18} />
          </button>

          <div className="w-px h-5 bg-gray-600 mx-1" />

          {/* Rotation */}
          <button onClick={rotateLeft} className="p-2 hover:bg-gray-700 rounded" title="Rotate Left">
            <RotateCcw size={18} />
          </button>
          <button onClick={rotateRight} className="p-2 hover:bg-gray-700 rounded" title="Rotate Right (R)">
            <RotateCw size={18} />
          </button>

          <div className="w-px h-5 bg-gray-600 mx-1" />

          {/* Navigation */}
          <button onClick={previousPage} disabled={currentPage <= 1} className="p-2 hover:bg-gray-700 rounded disabled:opacity-50" title="Previous Page (← or A)">
            <ChevronLeft size={18} />
          </button>
          <button onClick={nextPage} disabled={currentPage >= totalPages} className="p-2 hover:bg-gray-700 rounded disabled:opacity-50" title="Next Page (→ or D)">
            <ChevronRight size={18} />
          </button>

          <div className="w-px h-5 bg-gray-600 mx-1" />

          {/* Utility */}
          <button
            onClick={() => setShowThumbnails(!showThumbnails)}
            className={`p-2 rounded ${showThumbnails ? 'bg-gray-600' : 'hover:bg-gray-700'}`}
            title="Toggle Thumbnails (T)"
          >
            <Columns size={18} />
          </button>
          <button onClick={downloadPdf} className="p-2 hover:bg-gray-700 rounded" title="Download PDF">
            <Download size={18} />
          </button>
          <button onClick={onClose} className="p-2 hover:bg-red-600 rounded" title="Close (ESC)">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main viewer area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Thumbnail sidebar */}
        {showThumbnails && (
          <div className="w-44 bg-gray-800 overflow-y-auto p-3 space-y-2 shrink-0 custom-scrollbar">
            {thumbnails.map((thumbnail, index) => (
              <button
                key={index + 1}
                onClick={() => setCurrentPage(index + 1)}
                className={`w-full p-1 rounded hover:bg-gray-700 transition-colors ${
                  currentPage === index + 1 ? 'bg-gray-600 ring-2 ring-blue-500' : ''
                }`}
              >
                {thumbnail ? (
                  <img src={thumbnail} alt={`Page ${index + 1}`} className="w-full h-auto rounded" />
                ) : (
                  <div className="w-full aspect-[3/4] bg-gray-700 rounded flex items-center justify-center text-gray-400 text-xs">
                    {index + 1}
                  </div>
                )}
                <div className="text-xs text-center text-white mt-1">{index + 1}</div>
              </button>
            ))}
          </div>
        )}

        {/* PDF canvas container */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto bg-gray-200 flex items-start justify-center p-5"
        >
          <canvas
            ref={canvasRef}
            className="shadow-lg"
            style={{ maxWidth: '100%' }}
          />
        </div>
      </div>

      {/* Footer page navigation */}
      <div className="bg-gray-800 text-white p-2 flex items-center justify-center space-x-4 shrink-0">
        <button
          onClick={previousPage}
          disabled={currentPage <= 1}
          className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          Previous
        </button>

        <div className="flex items-center space-x-2 text-sm">
          <span>Page</span>
          <input
            type="number"
            value={currentPage}
            onChange={(e) => {
              const page = parseInt(e.target.value, 10);
              if (page >= 1 && page <= totalPages) setCurrentPage(page);
            }}
            className="w-14 px-2 py-1 bg-gray-700 text-white rounded text-center"
            min="1"
            max={totalPages}
          />
          <span>of {totalPages}</span>
        </div>

        <button
          onClick={nextPage}
          disabled={currentPage >= totalPages}
          className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default PdfViewer;