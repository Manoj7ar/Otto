import { motion } from "framer-motion";

export type OttoOrbMode = "idle" | "listening" | "processing" | "speaking";

interface OttoOrbProps {
  mode: OttoOrbMode;
  mini?: boolean;
}

export default function OttoOrb({ mode, mini = false }: OttoOrbProps) {
  const size = mini ? 48 : 160;
  const isActive = mode === "processing" || mode === "speaking";

  return (
    <motion.div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      layout
      transition={{ type: "spring", stiffness: 200, damping: 25 }}
    >
      {!mini && (
        <>
          <div
            className="absolute inset-0 rounded-full animate-pulse-ring"
            style={{
              background: "radial-gradient(circle, hsl(var(--otto-glow) / 0.15), transparent 70%)",
            }}
          />
          <div
            className="absolute inset-0 rounded-full animate-pulse-ring"
            style={{
              background: "radial-gradient(circle, hsl(var(--otto-glow-secondary) / 0.1), transparent 70%)",
              animationDelay: "1.2s",
            }}
          />
        </>
      )}

      <motion.div
        className={`relative rounded-full ${isActive ? "animate-orb-spin" : "animate-orb-breathe"}`}
        style={{
          width: size,
          height: size,
          background: `
            radial-gradient(circle at 35% 35%,
              hsl(197 100% 65% / 0.8),
              hsl(197 100% 45% / 0.4) 40%,
              hsl(260 60% 50% / 0.3) 70%,
              transparent 100%
            )
          `,
          boxShadow: mini
            ? "0 0 12px hsl(197 100% 50% / 0.4)"
            : `
              0 0 30px hsl(197 100% 50% / 0.4),
              0 0 80px hsl(197 100% 50% / 0.2),
              0 0 120px hsl(260 60% 50% / 0.1),
              inset 0 0 40px hsl(197 100% 60% / 0.3)
            `,
        }}
        animate={mode === "speaking" ? { scale: [1, 1.08, 0.96, 1.05, 1] } : undefined}
        transition={mode === "speaking" ? { duration: 0.8, repeat: Infinity, ease: "easeInOut" } : undefined}
      >
        <div
          className="absolute inset-2 rounded-full animate-orb-inner opacity-60"
          style={{
            background: `
              conic-gradient(
                from 0deg,
                hsl(197 100% 60% / 0.6),
                hsl(260 60% 55% / 0.4),
                hsl(197 100% 50% / 0.2),
                hsl(260 60% 60% / 0.5),
                hsl(197 100% 60% / 0.6)
              )
            `,
          }}
        />

        <div
          className="absolute rounded-full"
          style={{
            top: "12%",
            left: "18%",
            width: "35%",
            height: "25%",
            background: "linear-gradient(135deg, hsl(0 0% 100% / 0.25), transparent)",
            filter: "blur(4px)",
          }}
        />
      </motion.div>
    </motion.div>
  );
}
