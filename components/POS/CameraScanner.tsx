import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X } from 'lucide-react';

interface CameraScannerProps {
  onDetect: (value: string) => void;
  onClose: () => void;
}

// Chrome/Android expose a native BarcodeDetector — no dependency needed there.
// iOS Safari (and any browser without it) fall back to zxing-wasm, sampling
// video frames on an interval instead of a per-frame native detector.
const CANONICAL_FORMATS = ['EAN13', 'EAN8', 'UPCA', 'UPCE', 'Code128', 'Code39', 'QRCode'];
const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];

const CameraScanner: React.FC<CameraScannerProps> = ({ onDetect, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'starting' | 'scanning'>('starting');

  // Kept in a ref so the scan loop below can start once on mount without
  // restarting the camera every time the parent re-renders with a new
  // onDetect reference.
  const onDetectRef = useRef(onDetect);
  useEffect(() => { onDetectRef.current = onDetect; }, [onDetect]);

  const handleDetected = useCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed) onDetectRef.current(trimmed);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let canvas: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;

    const stop = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('scanning');

        if ('BarcodeDetector' in window) {
          const Detector = (window as any).BarcodeDetector;
          const detector = new Detector({ formats: NATIVE_FORMATS });

          const loop = async () => {
            if (cancelled) return;
            if (detectingRef.current || !videoRef.current || videoRef.current.readyState < 2) {
              rafRef.current = requestAnimationFrame(loop);
              return;
            }
            detectingRef.current = true;
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes.length > 0 && !cancelled) {
                handleDetected(codes[0].rawValue);
                return;
              }
            } catch {
              // transient decode failures are expected mid-frame — keep scanning
            }
            detectingRef.current = false;
            if (!cancelled) rafRef.current = requestAnimationFrame(loop);
          };
          rafRef.current = requestAnimationFrame(loop);
        } else {
          const { readBarcodes, prepareZXingModule } = await import('zxing-wasm/reader');
          const wasmUrl = new URL('zxing-wasm/reader/zxing_reader.wasm', import.meta.url).href;
          prepareZXingModule({ overrides: { locateFile: () => wasmUrl } });

          canvas = document.createElement('canvas');
          ctx = canvas.getContext('2d');

          intervalRef.current = setInterval(async () => {
            if (cancelled || detectingRef.current || !videoRef.current || !ctx || !canvas) return;
            const video = videoRef.current;
            if (video.readyState < 2 || video.videoWidth === 0) return;
            detectingRef.current = true;
            try {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const results = await readBarcodes(imageData, { tryHarder: true, formats: CANONICAL_FORMATS as any });
              if (results.length > 0 && !cancelled) {
                handleDetected(results[0].text);
                return;
              }
            } catch {
              // ignore decode errors on this frame, keep sampling
            }
            detectingRef.current = false;
          }, 350);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Camera access failed');
        }
      }
    };

    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [handleDetected]);

  return (
    <div className="fixed inset-0 bg-black z-[70] flex flex-col">
      <div className="flex items-center justify-between p-4" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
        <h3 className="text-white font-bold">Scan Barcode</h3>
        <button onClick={onClose} className="text-white p-2 -mr-2" aria-label="Close scanner">
          <X size={24} />
        </button>
      </div>
      <div className="flex-1 relative overflow-hidden">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-40 border-4 border-amber-400 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        </div>
        {status === 'starting' && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-white text-sm">Starting camera&hellip;</div>
        )}
        {error && (
          <div className="absolute inset-x-4 bottom-8 bg-red-600 text-white text-sm p-3 rounded-lg text-center">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default CameraScanner;
