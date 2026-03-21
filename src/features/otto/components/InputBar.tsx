import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, Mic, MicOff, SendHorizontal } from "lucide-react";

interface InputBarProps {
  onSubmit: (text: string) => void;
  onCameraClick: () => void;
  onMicToggle: (liveMode: boolean) => void;
  isCameraActive: boolean;
  isListening: boolean;
  isLiveMode: boolean;
  isLivePaused: boolean;
  isMicSupported: boolean;
  isProcessing: boolean;
  voiceTranscript: string;
}

export default function InputBar({
  onSubmit,
  onCameraClick,
  onMicToggle,
  isCameraActive,
  isListening,
  isLiveMode,
  isLivePaused,
  isMicSupported,
  isProcessing,
  voiceTranscript,
}: InputBarProps) {
  const [inputText, setInputText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const displayText = isLiveMode ? voiceTranscript : inputText;
  const hasContent = displayText.trim().length > 0;

  const handleSend = () => {
    const text = isLiveMode ? voiceTranscript : inputText;

    if (!text.trim()) {
      return;
    }

    onSubmit(text.trim());
    setInputText("");
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (isLiveMode) {
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleMicClick = () => {
    if (isLiveMode) {
      onMicToggle(false);
      return;
    }

    onMicToggle(true);
  };

  return (
    <motion.div
      className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-4 pt-3 sm:px-4 sm:pt-4"
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.3 }}
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div className="glass-strong mx-auto flex max-w-xl items-center gap-2 rounded-[1.75rem] px-3 py-3 sm:gap-3 sm:rounded-[2rem] sm:px-4 sm:py-4">
        <div className="glass flex flex-1 items-center gap-2 rounded-full px-3 py-3 sm:gap-3 sm:px-4">
          {isLiveMode && (
            <span
              className={`rounded-full px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] ${
                isListening ? "bg-emerald-500/10 text-emerald-950" : "bg-white/16 text-secondary-otto"
              }`}
            >
              {isListening ? "Live" : "Paused"}
            </span>
          )}
          <input
            ref={inputRef}
            type="text"
            value={displayText}
            onChange={(event) => {
              if (!isLiveMode) {
                setInputText(event.target.value);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              isLiveMode
                ? isLivePaused
                  ? "Live agent paused while Otto responds..."
                  : "Listening for your next question..."
                : "Ask Otto about what you see..."
            }
            disabled={isProcessing && !isLiveMode}
            readOnly={isLiveMode}
            className="flex-1 bg-transparent text-sm font-light tracking-[0.02em] text-foreground placeholder:text-secondary-otto outline-none disabled:opacity-50"
          />
        </div>

        {hasContent && !isLiveMode && (
          <motion.button
            onClick={handleSend}
            className="glass-button-primary flex h-12 w-12 items-center justify-center rounded-full"
            whileTap={{ scale: 0.92 }}
            whileHover={{ scale: 1.03 }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            aria-label="Send"
          >
            <SendHorizontal size={18} className="text-primary-foreground" />
          </motion.button>
        )}

        <motion.button
          onClick={onCameraClick}
          disabled={isProcessing}
          className={`glass-pill flex h-12 w-12 items-center justify-center disabled:opacity-40 ${
            isCameraActive ? "border-amber-900/10 bg-amber-100/18" : ""
          }`}
          whileTap={{ scale: 0.92 }}
          whileHover={{ scale: 1.04 }}
          aria-label="Toggle camera"
        >
          <Camera size={18} className={isCameraActive ? "text-primary" : "text-secondary-otto"} />
        </motion.button>

        <motion.button
          onClick={handleMicClick}
          className={`flex h-12 w-12 items-center justify-center rounded-full disabled:opacity-40 ${
            !isMicSupported
              ? "glass-button text-secondary-otto"
              : isLiveMode
                ? "glass-button border-red-300/16 bg-red-500/14"
                : "glass-button-primary"
          }`}
          title={isMicSupported ? "Start or stop live voice agent" : "Speech input is not supported on this browser"}
          whileTap={{ scale: 0.92 }}
          whileHover={{ scale: 1.04 }}
          aria-label={
            !isMicSupported ? "Voice input unsupported" : isLiveMode ? "Stop live agent" : "Start live agent"
          }
          animate={isLiveMode ? { scale: [1, 1.08, 1] } : {}}
          transition={isLiveMode ? { duration: 1.5, repeat: Infinity } : {}}
        >
          {isLiveMode ? (
            <MicOff size={18} className="text-primary-foreground" />
          ) : (
            <Mic size={18} className={isMicSupported ? "text-primary-foreground" : "text-secondary-otto"} />
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}
