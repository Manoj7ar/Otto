import { useCallback, useEffect, useRef, useState } from "react";

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
  isLiveMode: boolean;
  transcript: string;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  isSupported: boolean;
}

interface UseSpeechRecognitionOptions {
  onSilence?: (transcript: string) => void;
  silenceMs?: number;
  paused?: boolean;
}

function normalizeTranscriptSegment(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function mergeTranscriptSegments(base: string, addition: string) {
  const left = normalizeTranscriptSegment(base);
  const right = normalizeTranscriptSegment(addition);

  if (!left) {
    return right;
  }

  if (!right || left === right) {
    return left;
  }

  const leftWords = left.split(" ");
  const rightWords = right.split(" ");
  const overlapLimit = Math.min(leftWords.length, rightWords.length);
  let overlapCount = 0;

  for (let size = overlapLimit; size > 0; size -= 1) {
    const leftSuffix = leftWords.slice(-size).join(" ").toLowerCase();
    const rightPrefix = rightWords.slice(0, size).join(" ").toLowerCase();

    if (leftSuffix === rightPrefix) {
      overlapCount = size;
      break;
    }
  }

  const remainder = rightWords.slice(overlapCount).join(" ");
  return remainder ? `${left} ${remainder}` : left;
}

export function useSpeechRecognition({
  onSilence,
  silenceMs = 1600,
  paused = false,
}: UseSpeechRecognitionOptions = {}): SpeechRecognitionHook {
  const [isListening, setIsListening] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const finalTranscriptRef = useRef("");
  const transcriptRef = useRef("");
  const liveModeRef = useRef(false);
  const pausedRef = useRef(paused);
  const silenceTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const onSilenceRef = useRef(onSilence);

  const SpeechRecognition =
    typeof window !== "undefined"
      ? (window as unknown as BrowserSpeechRecognitionWindow).SpeechRecognition ||
        (window as unknown as BrowserSpeechRecognitionWindow).webkitSpeechRecognition
      : null;

  const isSupported = Boolean(SpeechRecognition);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const stopRecognitionInstance = useCallback(() => {
    clearSilenceTimer();
    clearRestartTimer();

    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    setIsListening(false);
  }, [clearRestartTimer, clearSilenceTimer]);

  const resetTranscript = useCallback(() => {
    clearSilenceTimer();
    finalTranscriptRef.current = "";
    transcriptRef.current = "";
    setTranscript("");
  }, [clearSilenceTimer]);

  const flushTranscript = useCallback(() => {
    const nextTranscript = transcriptRef.current.trim();
    const silenceHandler = onSilenceRef.current;

    clearSilenceTimer();

    if (!nextTranscript || pausedRef.current || !silenceHandler) {
      return;
    }

    stopRecognitionInstance();
    finalTranscriptRef.current = "";
    transcriptRef.current = "";
    setTranscript("");
    silenceHandler(nextTranscript);
  }, [clearSilenceTimer, stopRecognitionInstance]);

  const beginRecognition = useCallback(() => {
    if (!SpeechRecognition || recognitionRef.current || !liveModeRef.current || pausedRef.current) {
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: BrowserSpeechRecognitionEvent) => {
      let nextFinalTranscript = "";
      let interimTranscript = "";

      for (let i = 0; i < event.results.length; i += 1) {
        const text = normalizeTranscriptSegment(event.results[i][0].transcript);

        if (!text) {
          continue;
        }

        if (event.results[i].isFinal) {
          nextFinalTranscript = mergeTranscriptSegments(nextFinalTranscript, text);
        } else {
          interimTranscript = mergeTranscriptSegments(interimTranscript, text);
        }
      }

      finalTranscriptRef.current = nextFinalTranscript;
      transcriptRef.current = mergeTranscriptSegments(nextFinalTranscript, interimTranscript);
      setTranscript(transcriptRef.current);

      if (transcriptRef.current) {
        clearSilenceTimer();
        silenceTimerRef.current = window.setTimeout(() => {
          flushTranscript();
        }, silenceMs);
      }
    };

    recognition.onerror = (event: BrowserSpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      recognitionRef.current = null;
      setIsListening(false);

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        liveModeRef.current = false;
        setIsLiveMode(false);
        return;
      }

      if (liveModeRef.current && !pausedRef.current) {
        clearRestartTimer();
        restartTimerRef.current = window.setTimeout(() => {
          beginRecognition();
        }, 600);
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);

      if (liveModeRef.current && !pausedRef.current) {
        clearRestartTimer();
        restartTimerRef.current = window.setTimeout(() => {
          beginRecognition();
        }, 300);
      }
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
  }, [SpeechRecognition, clearRestartTimer, clearSilenceTimer, flushTranscript, silenceMs]);

  const startListening = useCallback(() => {
    if (!SpeechRecognition) {
      return;
    }

    liveModeRef.current = true;
    setIsLiveMode(true);
    beginRecognition();
  }, [SpeechRecognition, beginRecognition]);

  const stopListening = useCallback(() => {
    liveModeRef.current = false;
    setIsLiveMode(false);
    stopRecognitionInstance();
    resetTranscript();
  }, [resetTranscript, stopRecognitionInstance]);

  useEffect(() => {
    onSilenceRef.current = onSilence;
  }, [onSilence]);

  useEffect(() => {
    pausedRef.current = paused;

    if (paused) {
      stopRecognitionInstance();
      return;
    }

    if (liveModeRef.current) {
      beginRecognition();
    }
  }, [beginRecognition, paused, stopRecognitionInstance]);

  useEffect(() => {
    return () => {
      liveModeRef.current = false;
      stopRecognitionInstance();
      resetTranscript();
    };
  }, [resetTranscript, stopRecognitionInstance]);

  return { isListening, isLiveMode, transcript, startListening, stopListening, resetTranscript, isSupported };
}
