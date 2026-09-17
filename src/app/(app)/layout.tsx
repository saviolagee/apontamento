import { ClockIcon } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { requireContext, ROLE_LABELS } from "@/lib/auth/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { profile, tenant } = await requireContext();

  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col gap-6 border-b bg-muted/30 p-4 lg:h-svh lg:w-64 lg:border-r lg:border-b-0">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ClockIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{tenant.name}</p>
            <p className="text-xs text-muted-foreground">Apontamento</p>
          </div>
        </div>

        <div className="lg:flex-1">
          <AppNav role={profile.role} />
        </div>

        <div className="grid gap-2 border-t pt-4">
          <div className="px-2">
            <p className="truncate text-sm font-medium">{profile.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
            <Badge variant="secondary" className="mt-1">
              {ROLE_LABELS[profile.role]}
            </Badge>
          </div>
          <SignOutButton />
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden p-4 lg:p-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
