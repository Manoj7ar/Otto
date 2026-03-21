import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface CameraViewProps {
  active: boolean;
  flashTrigger: number;
}

export interface CameraViewHandle {
  captureFrame: () => string | null;
}

type CameraStatus = "idle" | "requesting" | "ready" | "denied" | "unavailable";

const CameraView = forwardRef<CameraViewHandle, CameraViewProps>(({ active, flashTrigger }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");

  useImperativeHandle(ref, () => ({
    captureFrame: () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || !video.videoWidth) {
        return null;
      }

      canvas.width = Math.min(video.videoWidth, 1280);
      canvas.height = Math.min(video.videoHeight, 960);

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return null;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      return dataUrl.split(",")[1];
    },
  }));

  useEffect(() => {
    const stopStream = () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };

    if (!active) {
      setCameraStatus("idle");
      stopStream();
      return stopStream;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("unavailable");
      return stopStream;
    }

    setCameraStatus("requesting");

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        setCameraStatus("ready");

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch((error: DOMException) => {
        console.error("Camera access error:", error);
        setCameraStatus(
          error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError"
            ? "denied"
            : "unavailable"
        );
      });

    return stopStream;
  }, [active]);

  const statusMessage =
    cameraStatus === "requesting"
      ? "Requesting rear camera access..."
      : cameraStatus === "denied"
        ? "Camera access was denied. Enable it in browser settings to use visual lookup."
        : cameraStatus === "unavailable"
          ? "Camera not available on this device or browser."
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
            {cameraStatus === "ready" ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted/60 px-6 text-center">
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
              <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center px-4">
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
