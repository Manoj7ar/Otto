import { useCallback, useRef, useState } from "react";

interface BrowserSpeechRecognitionResult {
  isFinal: boolean;
  0: {
    transcript: string;
  };
}

interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: ArrayLike<BrowserSpeechRecognitionResult>;
}

interface BrowserSpeechRecognitionErrorEvent {
  error: string;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface BrowserSpeechRecognitionWindow {
  SpeechRecognition?: new () => BrowserSpeechRecognition;
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
}

interface SpeechRecognitionHook {
  isListening: boolean;
  transcript: string;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  isSupported: boolean;
}

export function useSpeechRecognition(): SpeechRecognitionHook {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const finalTranscriptRef = useRef("");

  const SpeechRecognition =
    typeof window !== "undefined"
      ? (window as unknown as BrowserSpeechRecognitionWindow).SpeechRecognition ||
        (window as unknown as BrowserSpeechRecognitionWindow).webkitSpeechRecognition
      : null;

  const isSupported = Boolean(SpeechRecognition);

  const startListening = useCallback(() => {
    if (!SpeechRecognition || recognitionRef.current) {
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: BrowserSpeechRecognitionEvent) => {
      let nextFinalTranscript = finalTranscriptRef.current;
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const text = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          nextFinalTranscript = `${nextFinalTranscript} ${text}`.trim();
        } else {
          interimTranscript = `${interimTranscript} ${text}`.trim();
        }
      }

      finalTranscriptRef.current = nextFinalTranscript;
      setTranscript([nextFinalTranscript, interimTranscript].filter(Boolean).join(" ").trim());
    };

    recognition.onerror = (event: BrowserSpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      setIsListening(true);
    } catch (error) {
      console.error("Speech recognition start error:", error);
      recognitionRef.current = null;
      setIsListening(false);
    }
  }, [SpeechRecognition]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    setIsListening(false);
  }, []);

  const resetTranscript = useCallback(() => {
    finalTranscriptRef.current = "";
    setTranscript("");
  }, []);

  return { isListening, transcript, startListening, stopListening, resetTranscript, isSupported };
}
