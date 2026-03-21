import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, Mic, MicOff, SendHorizontal } from "lucide-react";

interface InputBarProps {
  onSubmit: (text: string) => void;
  onCameraClick: () => void;
  onMicToggle: (listening: boolean) => void;
  isCameraActive: boolean;
  isListening: boolean;
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
  isMicSupported,
  isProcessing,
  voiceTranscript,
}: InputBarProps) {
  const [inputText, setInputText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const displayText = isListening ? voiceTranscript : inputText;
  const hasContent = displayText.trim().length > 0;

  const handleSend = () => {
    const text = isListening ? voiceTranscript : inputText;

    if (!text.trim()) {
      return;
    }

    onSubmit(text.trim());
    setInputText("");
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleMicClick = () => {
    if (isListening) {
      onMicToggle(false);

      if (voiceTranscript.trim()) {
        setTimeout(() => onSubmit(voiceTranscript.trim()), 100);
      }

      return;
    }

    onMicToggle(true);
  };

  return (
    <motion.div
      className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-8 pt-4"
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.3 }}
      style={{
        background: "linear-gradient(to top, hsl(223 42% 6% / 0.9), transparent)",
      }}
    >
      <div className="glass-strong mx-auto flex max-w-xl items-center gap-3 rounded-[2rem] px-4 py-4">
        <div className="glass flex flex-1 items-center rounded-full px-4 py-3">
          <input
            ref={inputRef}
            type="text"
            value={displayText}
            onChange={(event) => {
              if (!isListening) {
                setInputText(event.target.value);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? "Listening..." : "Ask Otto about what you see..."}
            disabled={isProcessing}
            className="flex-1 bg-transparent text-sm font-light tracking-[0.02em] text-foreground placeholder:text-secondary-otto outline-none disabled:opacity-50"
          />
        </div>

        {hasContent && !isListening && (
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
            isCameraActive ? "border-white/25 bg-cyan-300/15" : ""
          }`}
          whileTap={{ scale: 0.92 }}
          whileHover={{ scale: 1.04 }}
          aria-label="Toggle camera"
        >
          <Camera size={18} className={isCameraActive ? "text-primary" : "text-secondary-otto"} />
        </motion.button>

        <motion.button
          onClick={handleMicClick}
          disabled={isProcessing}
          className={`flex h-12 w-12 items-center justify-center rounded-full disabled:opacity-40 ${
            !isMicSupported
              ? "glass-button text-secondary-otto"
              : isListening
                ? "glass-button border-red-300/30 bg-red-500/35"
                : "glass-button-primary"
          }`}
          title={isMicSupported ? "Voice input" : "Speech input is not supported on this browser"}
          whileTap={{ scale: 0.92 }}
          whileHover={{ scale: 1.04 }}
          aria-label={
            !isMicSupported ? "Voice input unsupported" : isListening ? "Stop listening" : "Voice input"
          }
          animate={isListening ? { scale: [1, 1.08, 1] } : {}}
          transition={isListening ? { duration: 1.5, repeat: Infinity } : {}}
        >
          {isListening ? (
            <MicOff size={18} className="text-primary-foreground" />
          ) : (
            <Mic size={18} className={isMicSupported ? "text-primary-foreground" : "text-secondary-otto"} />
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}
