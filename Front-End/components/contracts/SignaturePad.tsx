"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Draw-with-finger/mouse pad. The signer draws, then taps "Confirm signature"; only then is onChange
 * called with a PNG data URL, and the box shows the confirmed signature. Redo (or a parent's reset)
 * sends null. A drawn signature is required to sign.
 */
export default function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [confirmed, setConfirmed] = useState<string | null>(null);

  // the canvas is (re)mounted whenever the pad is shown again after Redo
  useEffect(() => {
    if (confirmed) return;
    const canvas = canvasRef.current;
    // canvas can be unavailable (privacy settings, tests)
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, [confirmed]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!drawing.current || !ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasInk(true);
  };

  const end = () => {
    drawing.current = false;
  };

  const clear = () => {
    const c = canvasRef.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  const confirm = () => {
    const c = canvasRef.current;
    if (!c || !hasInk) return;
    const dataUrl = c.toDataURL("image/png");
    setConfirmed(dataUrl);
    onChange(dataUrl);
  };

  const redo = () => {
    setConfirmed(null);
    setHasInk(false);
    onChange(null);
  };

  if (confirmed) {
    return (
      <div>
        <div className="flex h-32 items-center justify-center rounded-xl border border-gray-300 dark:border-gray-600 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, not an optimisable asset */}
          <img src={confirmed} alt="Your signature" className="max-h-28 max-w-full object-contain" />
        </div>
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className="text-green-700 dark:text-green-400">Signature added</span>
          <button type="button" onClick={redo} className="text-gray-500 hover:text-gray-800 underline dark:text-gray-400">
            Redo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="relative rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
        <canvas
          ref={canvasRef}
          className="w-full h-32 touch-none cursor-crosshair rounded-xl"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          aria-label="Draw your signature"
        />
        {!hasInk && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            Draw your signature here
          </span>
        )}
      </div>
      {hasInk && (
        <div className="mt-2 flex items-center justify-end gap-3">
          <button type="button" onClick={clear} className="text-xs text-gray-500 hover:text-gray-800 underline dark:text-gray-400">
            Clear
          </button>
          <button
            type="button"
            onClick={confirm}
            className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 dark:bg-white dark:text-gray-900"
          >
            Confirm signature
          </button>
        </div>
      )}
    </div>
  );
}
