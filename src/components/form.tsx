"use client";

import { useFormStatus } from "react-dom";
import { AlertCircleIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/lib/actions";

export function SubmitButton({ children, ...props }: React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? <Loader2Icon className="animate-spin" /> : null}
      {children}
    </Button>
  );
}

export function FormAlert({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
        <CheckCircle2Icon className="mt-0.5 size-4 shrink-0" />
        {state.success}
      </p>
    );
  }
  return null;
}

export function Field({
  label,
  htmlFor,
  hint,
  errors,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  errors?: string[];
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {errors?.length ? <p className="text-xs text-destructive">{errors[0]}</p> : null}
    </div>
  );
}
