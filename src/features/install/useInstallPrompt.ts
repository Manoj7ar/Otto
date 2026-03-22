import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "otto-install-prompt-dismissed-v1";

type InstallPromptMode = "native" | "ios" | null;

function isStandaloneMode() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isMobileDevice() {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent.toLowerCase();
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  return /android|iphone|ipad|ipod|mobile/.test(userAgent) || (navigator.maxTouchPoints > 1 && coarsePointer);
}

function isIosSafariBrowser() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isWebKit = /WebKit/i.test(userAgent);
  const isOtherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(userAgent);

  return isIos && isWebKit && !isOtherIosBrowser;
}

function hasDismissedPrompt() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

function persistDismissal() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, "1");
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [hasDismissed, setHasDismissed] = useState(false);
  const [readyToShow, setReadyToShow] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const isMobile = useMemo(() => isMobileDevice(), []);
  const isIosSafari = useMemo(() => isIosSafariBrowser(), []);

  useEffect(() => {
    setHasDismissed(hasDismissedPrompt());
    setIsStandalone(isStandaloneMode());
  }, []);

  useEffect(() => {
    if (!isMobile || hasDismissed || isStandalone) {
      return;
    }

    const timer = window.setTimeout(() => {
      setReadyToShow(true);
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [hasDismissed, isMobile, isStandalone]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const handleBeforeInstallPrompt = (event: BeforeInstallPromptEvent) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };
    const handleAppInstalled = () => {
      persistDismissal();
      setHasDismissed(true);
      setDeferredPrompt(null);
      setIsStandalone(true);
    };
    const handleDisplayModeChange = () => {
      setIsStandalone(isStandaloneMode());
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    if ("addEventListener" in mediaQuery) {
      mediaQuery.addEventListener("change", handleDisplayModeChange);
    } else {
      mediaQuery.addListener(handleDisplayModeChange);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);

      if ("removeEventListener" in mediaQuery) {
        mediaQuery.removeEventListener("change", handleDisplayModeChange);
      } else {
        mediaQuery.removeListener(handleDisplayModeChange);
      }
    };
  }, []);

  const dismiss = useCallback(() => {
    persistDismissal();
    setHasDismissed(true);
    setDeferredPrompt(null);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) {
      return;
    }

    await deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => undefined);
    dismiss();
  }, [deferredPrompt, dismiss]);

  const mode: InstallPromptMode =
    !isMobile || hasDismissed || isStandalone || !readyToShow
      ? null
      : deferredPrompt
        ? "native"
        : isIosSafari
          ? "ios"
          : null;

  return {
    mode,
    isVisible: mode !== null,
    dismiss,
    promptInstall,
  };
}
