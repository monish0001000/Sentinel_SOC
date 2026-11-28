import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface RiskScoreGaugeProps {
  score: number;
  hasData?: boolean;
  className?: string;
}

export const RiskScoreGauge = ({
  score,
  hasData = true,
  className,
}: RiskScoreGaugeProps) => {
  const getScoreLevel = (value: number) => {
    if (!hasData) {
      return { label: "NO DATA", color: "text-muted-foreground", bg: "bg-muted-foreground/40" };
    }
    if (value >= 75) return { label: "CRITICAL", color: "text-destructive", bg: "bg-destructive" };
    if (value >= 50) return { label: "HIGH", color: "text-threat-high", bg: "bg-threat-high" };
    if (value >= 25) return { label: "MEDIUM", color: "text-warning", bg: "bg-warning" };
    return { label: "LOW", color: "text-success", bg: "bg-success" };
  };

  const level = getScoreLevel(score);
  const percentage = hasData ? Math.min(100, Math.max(0, score)) : 0;

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex flex-col items-end">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
          Risk Score
        </span>
        <div className="flex items-baseline gap-1">
          <motion.span
            key={hasData ? score : "no-data"}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("text-lg font-bold font-mono", level.color)}
          >
            {hasData ? score : "—"}
          </motion.span>
          {hasData && <span className="text-xs text-muted-foreground">/100</span>}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="w-24 h-2 bg-muted/40 rounded-full overflow-hidden">
          <motion.div
            className={cn("h-full rounded-full", level.bg)}
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ type: "spring", stiffness: 100, damping: 15 }}
          />
        </div>
        <span className={cn("text-[9px] font-mono font-bold", level.color)}>
          {level.label}
        </span>
      </div>
    </div>
  );
};
