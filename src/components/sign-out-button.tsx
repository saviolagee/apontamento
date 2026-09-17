import { LogOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/sign-out";

export function SignOutButton({ variant = "ghost" }: { variant?: React.ComponentProps<typeof Button>["variant"] }) {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant={variant} className="w-full justify-start">
        <LogOutIcon />
        Sair
      </Button>
    </form>
  );
}
