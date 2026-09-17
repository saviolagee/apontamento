import { AlertTriangleIcon, CheckCircle2Icon, OctagonAlertIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { HEALTH_LABELS, type HealthStatus } from "@/lib/profitability";

const STYLES: Record<HealthStatus, string> = {
  saudavel: "border-[--viz-good] text-[--viz-good] bg-[color-mix(in_oklch,var(--viz-good),transparent_88%)]",
  atencao: "border-[--viz-warning] text-[#8a6200] dark:text-[--viz-warning] bg-[color-mix(in_oklch,var(--viz-warning),transparent_85%)]",
  critico: "border-[--viz-critical] text-[--viz-critical] bg-[color-mix(in_oklch,var(--viz-critical),transparent_88%)]",
};

const ICONS: Record<HealthStatus, React.ComponentType<{ className?: string }>> = {
  saudavel: CheckCircle2Icon,
  atencao: AlertTriangleIcon,
  critico: OctagonAlertIcon,
};

/** Status sempre com ícone + texto: a cor nunca carrega o significado sozinha. */
export function StatusBadge({ status, className }: { status: HealthStatus; className?: string }) {
  const Icon = ICONS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium",
        STYLES[status],
        className,
      )}
    >
      <Icon className="size-3" />
      {HEALTH_LABELS[status]}
    </span>
  );
}
