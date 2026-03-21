import { Toaster } from "sonner";
import OttoPage from "@/features/otto/screens/OttoPage";

export default function App() {
  return (
    <>
      <Toaster
        position="top-center"
        theme="dark"
        toastOptions={{
          classNames: {
            toast: "border-border bg-card text-card-foreground shadow-lg",
            description: "text-muted-foreground",
            actionButton: "bg-primary text-primary-foreground",
            cancelButton: "bg-muted text-muted-foreground",
          },
        }}
      />
      <OttoPage />
    </>
  );
}
