import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, Mic, MicOff, Paperclip, SendHorizontal, X } from "lucide-react";

interface InputBarProps {
  onSubmit: (text: string) => void;
  onCameraClick: () => void;
  onMicToggle: (liveMode: boolean) => void;
  onClearAttachment: () => void;
  isCameraActive: boolean;
  hasImageAttachment: boolean;
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
  onClearAttachment,
  isCameraActive,
  hasImageAttachment,
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
      <div className="glass-strong mx-auto max-w-xl rounded-[1.75rem] px-3 py-3 sm:rounded-[2rem] sm:px-4 sm:py-4">
        {hasImageAttachment && !isLiveMode && (
          <div className="mb-3 flex items-center justify-center sm:justify-start">
            <div className="glass inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs text-foreground">
              <Paperclip size={14} />
              <span>Image attached</span>
              <button
                type="button"
                onClick={onClearAttachment}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-secondary-otto"
                aria-label="Remove attached image"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 sm:flex sm:gap-3">
        <motion.button
          type="button"
          onClick={onCameraClick}
          disabled={isProcessing}
          className={`glass-pill flex h-14 w-14 shrink-0 items-center justify-center justify-self-start disabled:opacity-40 sm:h-12 sm:w-12 ${
            isCameraActive ? "border-amber-900/10 bg-amber-100/18" : ""
          }`}
          whileTap={{ scale: 0.92 }}
          whileHover={{ scale: 1.04 }}
          aria-label="Toggle camera"
        >
          <Camera size={20} className={isCameraActive ? "text-primary" : "text-secondary-otto"} />
        </motion.button>

        <div className="glass flex min-w-0 items-center gap-2 rounded-full px-3 py-3 sm:flex-1 sm:gap-3 sm:px-4">
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
                  : "Listening..."
                : "Type here..."
            }
            disabled={isProcessing && !isLiveMode}
            readOnly={isLiveMode}
            className="min-w-0 flex-1 bg-transparent text-center text-sm font-light tracking-[0.02em] text-foreground placeholder:text-center placeholder:text-secondary-otto outline-none disabled:opacity-50 sm:text-left sm:placeholder:text-left"
          />
        </div>

        {hasContent && !isLiveMode && (
          <motion.button
            onClick={handleSend}
            className="glass-button-primary absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-10 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full sm:static sm:bottom-auto sm:left-auto sm:z-auto sm:h-12 sm:w-12 sm:translate-x-0"
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
          onClick={handleMicClick}
          className={`flex h-14 w-14 shrink-0 items-center justify-center justify-self-end rounded-full disabled:opacity-40 sm:h-12 sm:w-12 ${
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
            <MicOff size={20} className="text-primary-foreground" />
          ) : (
            <Mic size={20} className={isMicSupported ? "text-primary-foreground" : "text-secondary-otto"} />
          )}
        </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
