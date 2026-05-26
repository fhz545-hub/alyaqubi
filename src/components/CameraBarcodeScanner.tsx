import { useEffect, useRef, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface CameraBarcodeScannerProps {
  active: boolean;
  onDetected: (code: string) => void;
  onError?: (err: string) => void;
}

const CameraBarcodeScanner = ({ active, onDetected, onError }: CameraBarcodeScannerProps) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastCodeRef = useRef<string>("");
  const lastTimeRef = useRef<number>(0);

  const handleDetected = useCallback((decodedText: string) => {
    const now = Date.now();
    // Debounce: ignore same code within 1.5s
    if (decodedText === lastCodeRef.current && now - lastTimeRef.current < 1500) return;
    lastCodeRef.current = decodedText;
    lastTimeRef.current = now;
    onDetected(decodedText.trim());
  }, [onDetected]);

  useEffect(() => {
    if (!active || !containerRef.current) return;

    const elementId = "camera-scanner-region";
    let scanner: Html5Qrcode | null = null;

    const startScanner = async () => {
      try {
        scanner = new Html5Qrcode(elementId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: { width: 280, height: 120 },
            aspectRatio: 1.5,
            disableFlip: false,
          },
          handleDetected,
          () => {} // ignore scan failures silently
        );
      } catch (err: any) {
        console.error("Camera scanner error:", err);
        onError?.(err?.message || "فشل في تشغيل الكاميرا");
      }
    };

    startScanner();

    return () => {
      if (scanner) {
        scanner.stop().catch(() => {});
        scanner.clear();
        scannerRef.current = null;
      }
    };
  }, [active, handleDetected, onError]);

  if (!active) return null;

  return (
    <div className="relative rounded-xl overflow-hidden border-2 border-primary/30 bg-black">
      <div id="camera-scanner-region" ref={containerRef} className="w-full" style={{ minHeight: 200 }} />
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-center">
        <p className="text-xs text-white/80 font-medium">وجّه الكاميرا نحو الباركود</p>
      </div>
    </div>
  );
};

export default CameraBarcodeScanner;
