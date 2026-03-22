import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Paperclip, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import type { ProfileRow } from "@/features/account/profile";
import { normalizeSpeechText } from "@/shared/speech/normalizeSpeechText";
import { fetchOttoVoice } from "../api/fetchOttoVoice";
import { submitOttoTurn } from "../api/submitOttoTurn";
import CameraView, { type CameraViewHandle } from "../components/CameraView";
import InputBar from "../components/InputBar";
import SourceCard from "../components/SourceCard";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { createOttoSessionContext } from "../session";
import type { OttoReplyData, OttoSessionContext } from "../types";

interface OttoPageProps {
  profile: ProfileRow;
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

function MessageDisclosure({
  label,
  children,
  compact = false,
}: {
  label: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <details className={`${compact ? "group" : "group mt-3 sm:mt-4"} rounded-[1rem] border border-black/10 bg-white/20 open:bg-white/28 sm:rounded-[1.2rem]`}>
      <summary className={`flex cursor-pointer list-none items-center justify-between px-3 ${compact ? "py-2 text-[10px]" : "py-2.5 text-[11px] sm:py-3 sm:text-xs"} font-medium uppercase tracking-[0.18em] text-secondary-otto sm:px-4 sm:tracking-[0.2em]`}>
        <span>{label}</span>
        <span className="text-[10px] transition-transform duration-200 group-open:rotate-45">+</span>
      </summary>
      <div className={`border-t border-black/10 px-3 ${compact ? "py-2.5 text-xs" : "py-3 text-sm sm:py-4"} text-foreground/85 sm:px-4`}>
        {children}
      </div>
    </details>
  );
}

function ThinkingBubble() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex w-full justify-start"
    >
      <div className="glass-panel rounded-full px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/75 sm:h-2.5 sm:w-2.5" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/55 [animation-delay:160ms] sm:h-2.5 sm:w-2.5" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/35 [animation-delay:320ms] sm:h-2.5 sm:w-2.5" />
        </div>
      </div>
    </motion.div>
  );
}

export default function OttoPage({ profile }: OttoPageProps) {
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<"idle" | "requesting" | "ready" | "denied" | "unavailable">("idle");
  const [capturedImageBase64, setCapturedImageBase64] = useState<string | null>(null);
  const [flashCount, setFlashCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [latestReply, setLatestReply] = useState<OttoReplyData | null>(null);
  const [sessionContext, setSessionContext] = useState<OttoSessionContext>(() => createOttoSessionContext());
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [latestQuery, setLatestQuery] = useState("");
  const cameraRef = useRef<CameraViewHandle>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const liveAgentPaused = isProcessing || isSpeaking || cameraEnabled;
  const speechRecognitionLanguage = useMemo(() => {
    const normalizedLanguage = profile.language_code.trim().toLowerCase();

    if (normalizedLanguage.includes("-")) {
      return normalizedLanguage;
    }

    if (normalizedLanguage === "en") {
      return profile.timezone.startsWith("Europe/") ? "en-GB" : "en-US";
    }

    if (normalizedLanguage === "pt") {
      return "pt-PT";
    }

    return normalizedLanguage || "en-US";
  }, [profile.language_code, profile.timezone]);

  const {
    isListening,
    isLiveMode,
    transcript,
    startListening,
    stopListening,
    resetTranscript,
    submitTranscript,
    isSupported: isSpeechRecognitionSupported,
  } = useSpeechRecognition({
    paused: liveAgentPaused,
    language: speechRecognitionLanguage,
    silenceMs: 2600,
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
    const spokenText = normalizeSpeechText(text);

    if (typeof window === "undefined" || !("speechSynthesis" in window) || !spokenText.trim()) {
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spokenText);
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
    const viewport = scrollViewportRef.current;

    if (!viewport) {
      return;
    }

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: "smooth",
    });
  }, [isProcessing, sessionContext.turns.length]);

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
    setCameraEnabled(false);
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
      } else if (capturedImageBase64) {
        imageBase64 = capturedImageBase64;
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
        const data = await submitOttoTurn(query, profile, imageBase64, sessionContext);
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
    [cameraEnabled, capturedImageBase64, profile, resetTranscript, sessionContext, stopSpeaking]
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

      if (transcript.trim()) {
        submitTranscript();
        return;
      }

      stopListening();
    },
    [isSpeechRecognitionSupported, resetTranscript, startListening, stopListening, stopSpeaking, submitTranscript, transcript]
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
    setLatestQuery("");
    setSessionContext(createOttoSessionContext());
    toast.success("Walk session reset.");
  }, [resetTranscript, stopListening, stopSpeaking]);

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

      {!cameraEnabled && (
        <div className="mx-auto flex h-full w-full max-w-5xl flex-1 flex-col overflow-hidden px-3 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-[calc(7rem+env(safe-area-inset-bottom))] sm:pt-6">
          <div className="mb-3 flex items-center justify-end sm:mb-5">
            <button
              type="button"
              onClick={handleResetSession}
              className="glass-button inline-flex h-10 w-10 items-center justify-center rounded-full sm:h-11 sm:w-11"
              aria-label="Reset session"
            >
              <RotateCcw size={16} />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div
              ref={scrollViewportRef}
              className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-0.5 py-1 sm:space-y-5 sm:px-3 sm:py-3"
            >
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
                          className="ml-auto flex w-full max-w-[88%] flex-col items-end gap-1 sm:max-w-xl sm:gap-2"
                        >
                          <span className="hidden px-2 text-[10px] uppercase tracking-[0.18em] text-secondary-otto sm:block sm:text-[11px] sm:tracking-[0.22em]">You</span>
                          <div className="glass w-full rounded-[1.3rem] rounded-br-md px-4 py-3 text-sm leading-6 text-foreground sm:rounded-[1.8rem] sm:px-5 sm:py-4 sm:leading-7">
                            {turn.content}
                          </div>
                          <span className="px-1 text-[10px] text-secondary-otto sm:px-2 sm:text-[11px]">{formatBubbleTime(turn.createdAt)}</span>
                        </motion.div>
                      );
                    }

                    return (
                      <motion.div
                        key={turn.id}
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex w-full max-w-[94%] flex-col items-start sm:max-w-2xl"
                      >
                        <div className="min-w-0 w-full">
                          <span className="hidden px-2 text-[10px] uppercase tracking-[0.18em] text-secondary-otto sm:block sm:text-[11px] sm:tracking-[0.22em]">Otto</span>
                          <div className="glass-panel rounded-[1.3rem] rounded-bl-md px-4 py-3 text-sm leading-6 text-foreground sm:mt-2 sm:rounded-[1.8rem] sm:px-5 sm:py-4 sm:leading-7">
                            <p>{turn.content}</p>

                            {((turn.reply.structuredDetails.length > 0 || turn.reply.usedVision || turn.reply.usedWebSearch) ||
                              turn.reply.sources.length > 0 ||
                              turn.reply.suggestedFollowUps.length > 0 ||
                              turn.reply.actions.length > 0 ||
                              (latestReply?.messageId === turn.reply.messageId && canSpeak)) && (
                              <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">
                                {(turn.reply.structuredDetails.length > 0 || turn.reply.usedVision || turn.reply.usedWebSearch) && (
                                  <div className="min-w-[7rem] flex-1 sm:flex-none">
                                    <MessageDisclosure label="Context" compact>
                                      <div className="space-y-3">
                                        <div className="flex flex-wrap gap-2">
                                          {turn.reply.usedVision && (
                                            <span className="rounded-full border border-black/10 bg-white/30 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-secondary-otto">
                                              Vision
                                            </span>
                                          )}
                                          {turn.reply.usedWebSearch && (
                                            <span className="rounded-full border border-black/10 bg-white/30 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-secondary-otto">
                                              Web
                                            </span>
                                          )}
                                        </div>

                                        {turn.reply.structuredDetails.length > 0 && turn.reply.subjectType !== "assistant" && (
                                          <div className="grid gap-2">
                                            {turn.reply.structuredDetails.slice(0, 4).map((detail) => (
                                              <div key={`${detail.label}-${detail.value}`} className="rounded-[0.9rem] border border-black/10 bg-white/30 px-3 py-2.5">
                                                <p className="text-[10px] uppercase tracking-[0.16em] text-secondary-otto">{detail.label}</p>
                                                <p className="mt-1.5 text-xs leading-5 text-foreground/88 sm:text-sm">{detail.value}</p>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </MessageDisclosure>
                                  </div>
                                )}

                                {turn.reply.sources.length > 0 && (
                                  <div className="min-w-[7rem] flex-1 sm:flex-none">
                                    <MessageDisclosure label={`Sources (${turn.reply.sources.length})`} compact>
                                      <div className="space-y-2.5">
                                        {turn.reply.sources.map((source) => (
                                          <SourceCard key={source.url} source={source} />
                                        ))}
                                      </div>
                                    </MessageDisclosure>
                                  </div>
                                )}

                                {turn.reply.suggestedFollowUps.length > 0 && (
                                  <div className="min-w-[7rem] flex-1 sm:flex-none">
                                    <MessageDisclosure label="Follow ups" compact>
                                      <div className="flex flex-wrap gap-2">
                                        {turn.reply.suggestedFollowUps.map((item) => (
                                          <span key={item} className="rounded-full border border-black/10 bg-white/30 px-3 py-1.5 text-[11px] text-secondary-otto">
                                            {item}
                                          </span>
                                        ))}
                                      </div>
                                    </MessageDisclosure>
                                  </div>
                                )}

                                {turn.reply.actions.length > 0 && (
                                  <div className="min-w-[7rem] flex-1 sm:flex-none">
                                    <MessageDisclosure label="Actions" compact>
                                      <div className="flex flex-col gap-2">
                                        {turn.reply.actions.map((action, index) => {
                                          const className = index === 0 ? "glass-button-primary" : "glass-button";

                                          if (!action.url) {
                                            return (
                                              <button
                                                key={`${action.type}-${action.label}`}
                                                type="button"
                                                className={`${className} w-full rounded-full px-4 py-2 text-xs font-medium opacity-60`}
                                                disabled
                                              >
                                                {action.label}
                                              </button>
                                            );
                                          }

                                          return (
                                            <a
                                              key={`${action.type}-${action.label}`}
                                              href={action.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className={`${className} inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-medium`}
                                            >
                                              {action.label}
                                              <ExternalLink size={13} />
                                            </a>
                                          );
                                        })}
                                      </div>
                                    </MessageDisclosure>
                                  </div>
                                )}

                                {latestReply?.messageId === turn.reply.messageId && canSpeak && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={handleReplay}
                                      className="glass-button rounded-full px-4 py-2 text-[10px] font-medium uppercase tracking-[0.18em] sm:text-xs"
                                    >
                                      {isSpeaking ? "Speaking" : "Reply audio"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setIsMuted((value) => !value)}
                                      className="glass-button rounded-full px-4 py-2 text-[10px] font-medium uppercase tracking-[0.18em] sm:text-xs"
                                    >
                                      {isMuted ? "Auto voice off" : "Auto voice on"}
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          <span className="mt-1 block px-1 text-[10px] text-secondary-otto sm:mt-2 sm:px-2 sm:text-[11px]">{formatBubbleTime(turn.createdAt)}</span>
                        </div>
                      </motion.div>
                    );
                  })}

                  {pendingUserMessage && (
                    <>
                      <motion.div
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="ml-auto flex w-full max-w-[88%] flex-col items-end gap-1 sm:max-w-xl sm:gap-2"
                      >
                        <span className="hidden px-2 text-[10px] uppercase tracking-[0.18em] text-secondary-otto sm:block sm:text-[11px] sm:tracking-[0.22em]">You</span>
                        <div className="glass w-full rounded-[1.3rem] rounded-br-md px-4 py-3 text-sm leading-6 text-foreground sm:rounded-[1.8rem] sm:px-5 sm:py-4 sm:leading-7">
                          {pendingUserMessage.content}
                        </div>
                        <span className="px-1 text-[10px] text-secondary-otto sm:px-2 sm:text-[11px]">{formatBubbleTime(pendingUserMessage.createdAt)}</span>
                      </motion.div>

                      <ThinkingBubble />
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {!cameraEnabled && capturedImageBase64 && !isProcessing && (
          <motion.div
            className="fixed inset-x-0 bottom-[calc(6.75rem+env(safe-area-inset-bottom))] z-40 px-3 sm:px-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <div className="mx-auto flex max-w-xl justify-center sm:justify-start">
              <div className="glass inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs text-foreground">
                <Paperclip size={14} />
                <span>Image attached</span>
                <button
                  type="button"
                  onClick={handleRetakePhoto}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-secondary-otto"
                  aria-label="Remove attached image"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
                <button
                  type="button"
                  onClick={handleCapturePhoto}
                  disabled={!canCapturePhoto}
                  className="glass-strong flex h-20 w-20 items-center justify-center rounded-full disabled:opacity-45"
                  aria-label="Take photo"
                >
                  <span className="h-16 w-16 rounded-full border border-black/10 bg-white/55" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
