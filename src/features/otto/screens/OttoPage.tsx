import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { History, MessageSquareText, RotateCcw } from "lucide-react";
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

  const {
    isListening,
    transcript,
    startListening,
    stopListening,
    resetTranscript,
    isSupported: isSpeechRecognitionSupported,
  } = useSpeechRecognition();

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
    setCameraEnabled((enabled) => !enabled);
  }, []);

  const handleSubmit = useCallback(
    async (text: string) => {
      if (isListening) {
        stopListening();
      }

      stopSpeaking();

      let imageBase64: string | undefined;

      if (cameraEnabled) {
        const frame = cameraRef.current?.captureFrame();

        if (frame) {
          imageBase64 = frame;
          setFlashCount((count) => count + 1);
        }
      }

      setIsProcessing(true);
      setLatestQuery(text.trim());
      resetTranscript();

      try {
        const data = await submitOttoTurn(text, imageBase64, sessionContext);
        setLatestReply(data.reply);
        setSessionContext(data.sessionContext);
        setDrawerVisible(true);
      } catch (error: unknown) {
        console.error("Otto analyze error:", error);
        toast.error(error instanceof Error ? error.message : "Something went wrong. Please try again.");
      } finally {
        setIsProcessing(false);
      }
    },
    [cameraEnabled, isListening, resetTranscript, sessionContext, stopListening, stopSpeaking]
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
  const showMiniOrb = cameraEnabled || hasSessionTurns || isProcessing;
  const orbMode = isProcessing
    ? "processing"
    : isSpeaking
      ? "speaking"
      : isListening
        ? "listening"
        : "idle";

  return (
    <div className="relative flex min-h-[calc(100dvh-5rem)] flex-col items-center justify-center overflow-hidden bg-background">
      <CameraView ref={cameraRef} active={cameraEnabled} flashTrigger={flashCount} />

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
        {hasSessionTurns && (
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
        {showGreeting && (
          <motion.div
            key="greeting"
            className="relative z-10 flex flex-col items-center gap-8 px-6"
            initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -20, filter: "blur(8px)" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <OttoOrb mode={orbMode} />

            <div className="text-center">
              <motion.p
                className="text-sm font-light tracking-wide text-secondary-otto"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
              >
                Hello {profile.full_name || "there"}
              </motion.p>
              <motion.h1
                className="mt-2 text-2xl font-semibold tracking-tight"
                style={{ lineHeight: "1.2" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35, duration: 0.5 }}
              >
                Point, ask, research, and let Otto call when needed.
              </motion.h1>
              <motion.p
                className="mt-4 max-w-sm text-sm leading-6 text-secondary-otto"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.45, duration: 0.5 }}
              >
                Firecrawl does the research. Gemini decides if a call would help. Otto can call, follow up, and call you back even after you leave the app.
              </motion.p>
            </div>
          </motion.div>
        )}
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

      <InputBar
        onSubmit={handleSubmit}
        onCameraClick={handleCameraToggle}
        onMicToggle={handleMicToggle}
        isCameraActive={cameraEnabled}
        isListening={isListening}
        isMicSupported={isSpeechRecognitionSupported}
        isProcessing={isProcessing}
        voiceTranscript={transcript}
      />
    </div>
  );
}
