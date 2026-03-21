import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("service_worker_registration_error", error);
    });
  });
}
