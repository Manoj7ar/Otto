import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { History, MessageSquareText, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import type { ProfileRow } from "@/features/account/profile";
import { approveOttoTask } from "../api/approveOttoTask";
import { fetchOttoVoice } from "../api/fetchOttoVoice";
import { submitOttoTurn } from "../api/submitOttoTurn";
import CallApprovalSheet from "../components/CallApprovalSheet";
import CameraView, { type CameraViewHandle } from "../components/CameraView";
import InputBar from "../components/InputBar";
import OttoOrb from "../components/OttoOrb";
import SessionDrawer from "../components/SessionDrawer";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { createOttoSessionContext } from "../session";
import type { OttoReplyData, OttoSessionContext } from "../types";

interface OttoPageProps {
  profile: ProfileRow;
  onOpenTasks: () => void;
  onTaskCreated: () => Promise<void> | void;
}

export default function OttoPage({ profile, onOpenTasks, onTaskCreated }: OttoPageProps) {
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<"idle" | "requesting" | "ready" | "denied" | "unavailable">("idle");
  const [capturedImageBase64, setCapturedImageBase64] = useState<string | null>(null);
  const [flashCount, setFlashCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [approvalVisible, setApprovalVisible] = useState(false);
  const [latestReply, setLatestReply] = useState<OttoReplyData | null>(null);
  const [sessionContext, setSessionContext] = useState<OttoSessionContext>(() => createOttoSessionContext());
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [latestQuery, setLatestQuery] = useState("");
  const [approvingTask, setApprovingTask] = useState(false);
  const cameraRef = useRef<CameraViewHandle>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const liveAgentPaused = isProcessing || isSpeaking || approvalVisible || approvingTask || cameraEnabled;

  const {
    isListening,
    isLiveMode,
    transcript,
    startListening,
    stopListening,
    resetTranscript,
    isSupported: isSpeechRecognitionSupported,
  } = useSpeechRecognition({
    paused: liveAgentPaused,
    onSilence: (text) => {
      void handleSubmit(text);
    },
  });

  const canSpeak = useMemo(
    () => typeof window !== "undefined" && ("Audio" in window || "speechSynthesis" in window),
    []
  );
  const hasSessionTurns = sessionContext.turns.length > 0;

  const fallbackSpeak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) {
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setIsSpeaking(false);
  }, []);

  const speakResponse = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        return;
      }

      stopSpeaking();
      setIsSpeaking(true);

      try {
        const blob = await fetchOttoVoice(text);
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioUrlRef.current = url;
        audioRef.current = audio;
        audio.onplay = () => setIsSpeaking(true);
        audio.onended = () => {
          setIsSpeaking(false);
          if (audioUrlRef.current) {
            URL.revokeObjectURL(audioUrlRef.current);
            audioUrlRef.current = null;
          }
        };
        audio.onerror = () => {
          setIsSpeaking(false);
          fallbackSpeak(text);
        };
        await audio.play();
      } catch (error) {
        console.error("otto_voice_error", error);
        setIsSpeaking(false);
        fallbackSpeak(text);
      }
    },
    [fallbackSpeak, stopSpeaking]
  );

  useEffect(() => () => stopSpeaking(), [stopSpeaking]);

  useEffect(() => {
    if (!latestReply || isMuted) {
      return;
    }

    const timer = window.setTimeout(() => {
      void speakResponse(latestReply.answer);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [isMuted, latestReply, speakResponse]);

  useEffect(() => {
    if (latestReply?.callProposal) {
      setApprovalVisible(true);
    }
  }, [latestReply]);

  const handleCameraToggle = useCallback(() => {
    setCapturedImageBase64(null);
    setCameraEnabled((enabled) => !enabled);
  }, []);

  const handleCapturePhoto = useCallback(() => {
    const frame = cameraRef.current?.captureFrame();

    if (!frame) {
      toast.error("Could not capture a photo. Try again.");
      return;
    }

    setCapturedImageBase64(frame);
    setFlashCount((count) => count + 1);
  }, []);

  const handleRetakePhoto = useCallback(() => {
    setCapturedImageBase64(null);
  }, []);

  const handleSubmit = useCallback(
    async (text: string, imageOverride?: string) => {
      const query = text.trim();

      if (!query) {
        return;
      }

      stopSpeaking();

      let imageBase64: string | undefined;

      if (imageOverride) {
        imageBase64 = imageOverride;
      } else if (cameraEnabled) {
        const frame = cameraRef.current?.captureFrame();

        if (frame) {
          imageBase64 = frame;
          setFlashCount((count) => count + 1);
        }
      }

      setIsProcessing(true);
      setLatestQuery(query);
      resetTranscript();

      try {
        const data = await submitOttoTurn(query, imageBase64, sessionContext);
        setLatestReply(data.reply);
        setSessionContext(data.sessionContext);
        setCapturedImageBase64(null);
        setCameraEnabled(false);
        setDrawerVisible(true);
      } catch (error: unknown) {
        console.error("Otto analyze error:", error);
        toast.error(error instanceof Error ? error.message : "Something went wrong. Please try again.");
      } finally {
        setIsProcessing(false);
      }
    },
    [cameraEnabled, resetTranscript, sessionContext, stopSpeaking]
  );

  const handleMicToggle = useCallback(
    (listening: boolean) => {
      if (listening) {
        if (!isSpeechRecognitionSupported) {
          toast.error("Speech input is not supported on this browser.");
          return;
        }

        stopSpeaking();
        resetTranscript();
        startListening();
        return;
      }

      stopListening();
    },
    [isSpeechRecognitionSupported, resetTranscript, startListening, stopListening, stopSpeaking]
  );

  const handleReplay = useCallback(() => {
    if (!latestReply) {
      return;
    }

    if (!canSpeak) {
      toast.error("Audio replies are not supported on this browser.");
      return;
    }

    setIsMuted(false);
    void speakResponse(latestReply.answer);
  }, [canSpeak, latestReply, speakResponse]);

  const handleToggleMute = useCallback(() => {
    setIsMuted((muted) => {
      const nextMuted = !muted;

      if (nextMuted) {
        stopSpeaking();
      } else if (latestReply) {
        void speakResponse(latestReply.answer);
      }

      return nextMuted;
    });
  }, [latestReply, speakResponse, stopSpeaking]);

  const handleHideDrawer = useCallback(() => {
    stopSpeaking();
    setDrawerVisible(false);
  }, [stopSpeaking]);

  const handleResetSession = useCallback(() => {
    stopListening();
    stopSpeaking();
    resetTranscript();
    setCapturedImageBase64(null);
    setCameraEnabled(false);
    setLatestReply(null);
    setDrawerVisible(false);
    setApprovalVisible(false);
    setLatestQuery("");
    setSessionContext(createOttoSessionContext());
    toast.success("Walk session reset.");
  }, [resetTranscript, stopListening, stopSpeaking]);

  const handleApproveTask = useCallback(async () => {
    if (!latestReply?.callProposal) {
      return;
    }

    if (!profile.callback_phone) {
      toast.error("Add a callback phone number in your profile before starting cloud calls.");
      return;
    }

    setApprovingTask(true);

    try {
      await approveOttoTask(latestQuery, latestReply.subject, latestReply.callProposal);
      await onTaskCreated();
      setApprovalVisible(false);
      toast.success("Cloud call started. You can leave the app.");
      onOpenTasks();
    } catch (error) {
      console.error("otto_task_approval_error", error);
      toast.error(error instanceof Error ? error.message : "Could not start the cloud call.");
    } finally {
      setApprovingTask(false);
    }
  }, [latestQuery, latestReply, onOpenTasks, onTaskCreated, profile.callback_phone]);

  const showGreeting = !cameraEnabled && !hasSessionTurns && !isProcessing;
  const showMiniOrb = hasSessionTurns || isProcessing || isSpeaking || isListening;
  const orbMode = isProcessing
    ? "processing"
    : isSpeaking
      ? "speaking"
      : isListening
        ? "listening"
        : "idle";
  const capturedPreviewUrl = capturedImageBase64 ? `data:image/jpeg;base64,${capturedImageBase64}` : null;
  const canCapturePhoto = cameraEnabled && cameraStatus === "ready" && !capturedImageBase64;

  return (
    <div className="relative flex min-h-[calc(100dvh-5rem)] flex-col items-center justify-center overflow-hidden bg-background">
      <CameraView
        ref={cameraRef}
        active={cameraEnabled}
        flashTrigger={flashCount}
        onStatusChange={setCameraStatus}
      />

      <AnimatePresence>
        {cameraEnabled && !isProcessing && (
          <motion.button
            type="button"
            onClick={handleCameraToggle}
            className="glass fixed right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full"
            style={{ top: "max(1rem, env(safe-area-inset-top))" }}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            aria-label="Close camera"
          >
            <X size={18} />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMiniOrb && (
          <motion.div
            className="fixed right-5 top-[5.75rem] z-20"
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.3 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            <OttoOrb mode={orbMode} mini />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {cameraEnabled && capturedPreviewUrl && !isProcessing && (
          <motion.div
            className="pointer-events-none fixed left-1/2 top-1/2 z-20 w-[min(72vw,18rem)] -translate-x-1/2 -translate-y-1/2"
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
          >
            <div className="glass-strong overflow-hidden rounded-[1.75rem] p-2 shadow-[0_18px_50px_hsl(28_28%_42%_/_0.14)]">
              <img
                src={capturedPreviewUrl}
                alt="Captured preview"
                className="aspect-[3/4] w-full rounded-[1.25rem] object-cover"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {hasSessionTurns && !cameraEnabled && (
          <motion.div
            className="fixed left-4 top-[5.75rem] z-20 max-w-[calc(100vw-7rem)]"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            <div className="glass-strong flex items-center gap-3 rounded-full px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-xs uppercase tracking-[0.2em] text-secondary-otto">Current walk</p>
                <p className="truncate text-sm text-foreground">{sessionContext.activeSubject || "Live session"}</p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerVisible(true)}
                className="glass flex h-9 w-9 items-center justify-center rounded-full"
                aria-label="Open conversation"
              >
                <MessageSquareText size={16} />
              </button>
              <button
                type="button"
                onClick={onOpenTasks}
                className="glass flex h-9 w-9 items-center justify-center rounded-full"
                aria-label="Open tasks"
              >
                <History size={16} />
              </button>
              <button
                type="button"
                onClick={handleResetSession}
                className="glass flex h-9 w-9 items-center justify-center rounded-full"
                aria-label="Reset session"
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {showGreeting && <motion.div key="greeting" className="relative z-10" />}
      </AnimatePresence>

      <AnimatePresence>
        {isProcessing && (
          <motion.div
            className="fixed inset-0 z-10 flex flex-col items-center justify-center px-6 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <OttoOrb mode="processing" />
            <motion.p
              className="mt-8 text-sm font-light tracking-wide text-secondary-otto"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: [0, 1, 1, 0.6] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              Planning with Gemini, pulling Firecrawl research, and preparing the cloud workflow...
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      <SessionDrawer
        visible={drawerVisible}
        onClose={handleHideDrawer}
        onResetSession={handleResetSession}
        latestReply={latestReply}
        sessionContext={sessionContext}
        canSpeak={canSpeak}
        isMuted={isMuted}
        isSpeaking={isSpeaking}
        onReplay={handleReplay}
        onToggleMute={handleToggleMute}
        onReviewTaskProposal={() => setApprovalVisible(true)}
      />

      <CallApprovalSheet
        proposal={latestReply?.callProposal ?? null}
        visible={approvalVisible}
        busy={approvingTask}
        onApprove={handleApproveTask}
        onClose={() => setApprovalVisible(false)}
      />

      {!cameraEnabled ? (
        <InputBar
          onSubmit={handleSubmit}
          onCameraClick={handleCameraToggle}
          onMicToggle={handleMicToggle}
          isCameraActive={cameraEnabled}
          isListening={isListening}
          isLiveMode={isLiveMode}
          isLivePaused={liveAgentPaused}
          isMicSupported={isSpeechRecognitionSupported}
          isProcessing={isProcessing}
          voiceTranscript={transcript}
        />
      ) : (
        <AnimatePresence>
          {!isProcessing && (
            <motion.div
              className="fixed inset-x-0 bottom-0 z-30 px-4 pt-4"
              style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <div className="mx-auto flex max-w-sm flex-col items-center gap-4">
                {capturedImageBase64 ? (
                  <div className="flex w-full items-center gap-3">
                    <button
                      type="button"
                      onClick={handleRetakePhoto}
                      className="glass-button flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
                      aria-label="Retake photo"
                    >
                      <RotateCcw size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSubmit("Carry out the task for me.", capturedImageBase64)}
                      className="glass-button-primary min-h-[3.5rem] flex-1 rounded-full px-6 py-4 text-sm font-medium"
                    >
                      Ask Otto to carry out the task for me
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleCapturePhoto}
                    disabled={!canCapturePhoto}
                    className="glass-strong flex h-20 w-20 items-center justify-center rounded-full disabled:opacity-45"
                    aria-label="Take photo"
                  >
                    <span className="h-16 w-16 rounded-full border border-black/10 bg-white/55" />
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
