import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { History, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import type { ProfileRow } from "@/features/account/profile";
import { approveOttoTask } from "../api/approveOttoTask";
import { fetchOttoVoice } from "../api/fetchOttoVoice";
import { submitOttoTurn } from "../api/submitOttoTurn";
import CallApprovalSheet from "../components/CallApprovalSheet";
import CameraView, { type CameraViewHandle } from "../components/CameraView";
import InputBar from "../components/InputBar";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { createOttoSessionContext } from "../session";
import type { OttoReplyData, OttoSessionContext } from "../types";

interface OttoPageProps {
  profile: ProfileRow;
  onOpenTasks: () => void;
  onTaskCreated: () => Promise<void> | void;
}

function WavingOtterGreeting() {
  return (
    <motion.div
      className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <img
        src="/otter.png"
        alt="Otter"
        className="h-auto w-[min(18rem,58vw)] object-contain"
        draggable={false}
      />

      <div className="mt-5 max-w-sm">
        <p className="text-xs uppercase tracking-[0.28em] text-secondary-otto">Otto Is Ready</p>
        <p className="mt-3 text-sm leading-6 text-foreground/80">
          Ask a question, open the camera, or start speaking to begin.
        </p>
      </div>
    </motion.div>
  );
}

function formatBubbleTime(timestamp: string) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function OttoPage({ profile, onOpenTasks, onTaskCreated }: OttoPageProps) {
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<"idle" | "requesting" | "ready" | "denied" | "unavailable">("idle");
  const [capturedImageBase64, setCapturedImageBase64] = useState<string | null>(null);
  const [flashCount, setFlashCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
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

  const handleResetSession = useCallback(() => {
    stopListening();
    stopSpeaking();
    resetTranscript();
    setCapturedImageBase64(null);
    setCameraEnabled(false);
    setLatestReply(null);
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
  const capturedPreviewUrl = capturedImageBase64 ? `data:image/jpeg;base64,${capturedImageBase64}` : null;
  const canCapturePhoto = cameraEnabled && cameraStatus === "ready" && !capturedImageBase64;
  const pendingUserMessage = isProcessing && latestQuery
    ? {
      id: "pending-user",
      content: latestQuery,
      createdAt: new Date().toISOString(),
    }
    : null;

  return (
    <div className="relative flex h-[calc(100dvh-5rem)] flex-col overflow-hidden">
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

      {!cameraEnabled && (
        <div className="mx-auto flex h-full w-full max-w-5xl flex-1 flex-col overflow-hidden px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 sm:px-6">
          <div className="mb-5 flex items-center justify-end gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenTasks}
                className="glass-button inline-flex h-11 w-11 items-center justify-center rounded-full"
                aria-label="Open tasks"
              >
                <History size={16} />
              </button>
              <button
                type="button"
                onClick={handleResetSession}
                className="glass-button inline-flex h-11 w-11 items-center justify-center rounded-full"
                aria-label="Reset session"
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </div>

          <div className="glass-strong flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem]">
            <div className="flex-1 space-y-5 overflow-hidden px-4 py-5 sm:px-6 sm:py-6">
              <AnimatePresence mode="wait">
                {showGreeting && <WavingOtterGreeting key="greeting" />}
              </AnimatePresence>

              {!showGreeting && (
                <>
                  {sessionContext.turns.map((turn) => {
                    if (turn.role === "user") {
                      return (
                        <motion.div
                          key={turn.id}
                          initial={{ opacity: 0, y: 18 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="ml-auto flex w-full max-w-xl flex-col items-end gap-2"
                        >
                          <span className="px-2 text-[11px] uppercase tracking-[0.22em] text-secondary-otto">Sent by me</span>
                          <div className="glass w-full rounded-[1.8rem] rounded-br-md px-5 py-4 text-sm leading-7 text-foreground">
                            {turn.content}
                          </div>
                          <span className="px-2 text-[11px] text-secondary-otto">{formatBubbleTime(turn.createdAt)}</span>
                        </motion.div>
                      );
                    }

                    return (
                      <motion.div
                        key={turn.id}
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex w-full max-w-2xl items-start gap-3"
                      >
                        <img
                          src="/otter.png"
                          alt="Otter"
                          className="mt-1 h-11 w-11 rounded-full border border-black/10 bg-white/45 object-cover p-1"
                        />
                        <div className="min-w-0 flex-1">
                          <span className="px-2 text-[11px] uppercase tracking-[0.22em] text-secondary-otto">Back to me</span>
                          <div className="glass-panel mt-2 rounded-[1.8rem] rounded-bl-md px-5 py-4 text-sm leading-7 text-foreground">
                            <p>{turn.content}</p>

                            {turn.reply.structuredDetails.length > 0 && turn.reply.subjectType !== "assistant" && (
                              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                {turn.reply.structuredDetails.slice(0, 4).map((detail) => (
                                  <div key={`${detail.label}-${detail.value}`} className="rounded-[1.2rem] border border-black/10 bg-white/30 px-4 py-3">
                                    <p className="text-[11px] uppercase tracking-[0.2em] text-secondary-otto">{detail.label}</p>
                                    <p className="mt-2 text-sm leading-6 text-foreground/90">{detail.value}</p>
                                  </div>
                                ))}
                              </div>
                            )}

                            {latestReply?.messageId === turn.reply.messageId && canSpeak && (
                              <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={handleReplay}
                                  className="glass-button rounded-full px-4 py-2 text-xs font-medium"
                                >
                                  {isSpeaking ? "Speaking..." : "Replay voice"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setIsMuted((value) => !value)}
                                  className="glass-button rounded-full px-4 py-2 text-xs font-medium"
                                >
                                  {isMuted ? "Unmute auto voice" : "Mute auto voice"}
                                </button>
                              </div>
                            )}
                          </div>
                          <span className="mt-2 block px-2 text-[11px] text-secondary-otto">{formatBubbleTime(turn.createdAt)}</span>
                        </div>
                      </motion.div>
                    );
                  })}

                  {pendingUserMessage && (
                    <>
                      <motion.div
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="ml-auto flex w-full max-w-xl flex-col items-end gap-2"
                      >
                        <span className="px-2 text-[11px] uppercase tracking-[0.22em] text-secondary-otto">Sent by me</span>
                        <div className="glass w-full rounded-[1.8rem] rounded-br-md px-5 py-4 text-sm leading-7 text-foreground">
                          {pendingUserMessage.content}
                        </div>
                        <span className="px-2 text-[11px] text-secondary-otto">{formatBubbleTime(pendingUserMessage.createdAt)}</span>
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex w-full max-w-xl items-start gap-3"
                      >
                        <img
                          src="/otter.png"
                          alt="Otter"
                          className="mt-1 h-11 w-11 rounded-full border border-black/10 bg-white/45 object-cover p-1"
                        />
                        <div className="min-w-0 flex-1">
                          <span className="px-2 text-[11px] uppercase tracking-[0.22em] text-secondary-otto">Otter is thinking</span>
                          <div className="glass-panel mt-2 rounded-[1.8rem] rounded-bl-md px-5 py-4 text-sm leading-7 text-foreground">
                            <div className="flex items-center gap-3">
                              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-black/75" />
                              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-black/55 [animation-delay:160ms]" />
                              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-black/35 [animation-delay:320ms]" />
                            </div>
                            <p className="mt-4 text-sm text-foreground/70">
                              Thinking through your message and preparing the reply...
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

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
