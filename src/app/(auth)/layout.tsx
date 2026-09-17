import { ClockIcon } from "lucide-react";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-6">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ClockIcon className="size-5" />
        </span>
        Apontamento
      </div>
      <div className="w-full max-w-sm">{children}</div>
      <p className="text-xs text-muted-foreground">Horas, custos e rentabilidade de contratos</p>
    </div>
  );
}
