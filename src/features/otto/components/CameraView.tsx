import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface CameraViewProps {
  active: boolean;
  flashTrigger: number;
  onStatusChange?: (status: CameraStatus) => void;
}

export interface CameraViewHandle {
  captureFrame: () => string | null;
  isReady: () => boolean;
}

type CameraStatus = "idle" | "requesting" | "ready" | "denied" | "unavailable";

const PRIMARY_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: { ideal: "environment" },
  width: { ideal: 2560 },
  height: { ideal: 1440 },
  aspectRatio: { ideal: 4 / 3 },
};

const FALLBACK_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
};

async function enhanceTrack(track: MediaStreamTrack) {
  const capabilities = (typeof track.getCapabilities === "function"
    ? track.getCapabilities()
    : {}) as Record<string, unknown>;
  const advanced: Record<string, unknown> = {};
  const focusMode = capabilities.focusMode;
  const exposureMode = capabilities.exposureMode;
  const whiteBalanceMode = capabilities.whiteBalanceMode;
  const zoom = capabilities.zoom as { max?: number } | undefined;

  if (Array.isArray(focusMode) && focusMode.includes("continuous")) {
    advanced.focusMode = "continuous";
  }

  if (Array.isArray(exposureMode) && exposureMode.includes("continuous")) {
    advanced.exposureMode = "continuous";
  }

  if (Array.isArray(whiteBalanceMode) && whiteBalanceMode.includes("continuous")) {
    advanced.whiteBalanceMode = "continuous";
  }

  if (typeof zoom?.max === "number" && zoom.max >= 1) {
    advanced.zoom = 1;
  }

  const advancedEntries = Object.keys(advanced).length > 0 ? [advanced] : [];

  await track.applyConstraints({
    width: { ideal: 2560 },
    height: { ideal: 1440 },
    aspectRatio: { ideal: 4 / 3 },
    advanced: advancedEntries,
  }).catch(() => undefined);
}

const CameraView = forwardRef<CameraViewHandle, CameraViewProps>(({ active, flashTrigger, onStatusChange }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");

  useImperativeHandle(ref, () => ({
    captureFrame: () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) {
        return null;
      }

      const maxDimension = 2048;
      const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return null;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      return dataUrl.split(",")[1];
    },
    isReady: () => cameraStatus === "ready",
  }), [cameraStatus]);

  useEffect(() => {
    onStatusChange?.(cameraStatus);
  }, [cameraStatus, onStatusChange]);

  useEffect(() => {
    let cancelled = false;

    const stopStream = () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    if (!active) {
      setCameraStatus("idle");
      stopStream();
      return stopStream;
    }

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setCameraStatus("unavailable");
      return stopStream;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("unavailable");
      return stopStream;
    }

    setCameraStatus("requesting");

    const requestStream = async () => {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: PRIMARY_VIDEO_CONSTRAINTS,
          audio: false,
        });
      } catch (error) {
        const domError = error as DOMException;

        if (
          domError?.name === "OverconstrainedError" ||
          domError?.name === "NotFoundError" ||
          domError?.name === "AbortError"
        ) {
          return await navigator.mediaDevices.getUserMedia({ video: FALLBACK_VIDEO_CONSTRAINTS, audio: false });
        }

        throw error;
      }
    };

    requestStream()
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const [videoTrack] = stream.getVideoTracks();

        if (videoTrack) {
          void enhanceTrack(videoTrack);
        }

        const video = videoRef.current;

        if (!video) {
          setCameraStatus("unavailable");
          return;
        }

        video.srcObject = stream;
        video.onloadedmetadata = () => {
          void video.play().catch(() => {
            // Mobile Safari may reject play() without user-visible failure; metadata readiness is enough for capture.
          });

          if (!cancelled) {
            setCameraStatus("ready");
          }
        };
      })
      .catch((error: DOMException) => {
        if (cancelled) {
          return;
        }

        console.error("Camera access error:", error);
        setCameraStatus(
          error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError"
            ? "denied"
            : "unavailable"
        );
      });

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [active]);

  const statusMessage =
    cameraStatus === "requesting"
      ? "Requesting rear camera access..."
      : cameraStatus === "denied"
        ? "Camera access was denied. Enable it in browser settings to use visual lookup."
        : cameraStatus === "unavailable"
          ? "Camera requires HTTPS or localhost on mobile, or this browser/device does not expose a camera."
          : null;

  return (
    <>
      <canvas ref={canvasRef} className="hidden" />
      <AnimatePresence>
        {active && (
          <motion.div
            className="fixed inset-0 z-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full object-cover ${cameraStatus === "ready" ? "opacity-100" : "opacity-0"}`}
              style={{
                imageRendering: "auto",
                transform: "translateZ(0)",
                backfaceVisibility: "hidden",
              }}
            />

            {cameraStatus !== "ready" && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/60 px-6 text-center">
                <p className="max-w-sm text-sm text-secondary-otto">
                  {statusMessage ?? "Point your phone at the world to let Otto inspect the scene."}
                </p>
              </div>
            )}

            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse at center, transparent 40%, hsl(0 0% 0% / 0.6) 100%)",
              }}
            />

            {statusMessage && (
              <div
                className="pointer-events-none absolute inset-x-0 flex justify-center px-4"
                style={{ top: "max(1rem, env(safe-area-inset-top))" }}
              >
                <div className="glass rounded-full px-4 py-2 text-xs text-secondary-otto">
                  {statusMessage}
                </div>
              </div>
            )}

            <AnimatePresence>
              {flashTrigger > 0 && (
                <motion.div
                  key={flashTrigger}
                  className="absolute inset-0 bg-foreground"
                  initial={{ opacity: 0.7 }}
                  animate={{ opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});

CameraView.displayName = "CameraView";

export default CameraView;
