import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignOutButton } from "@/components/sign-out-button";

export const metadata = { title: "Acesso suspenso | Apontamento" };

export default function SuspendedPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Acesso suspenso</CardTitle>
          <CardDescription>
            Seu usuário está inativo nesta empresa. Fale com o administrador para reativar o acesso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutButton variant="outline" />
        </CardContent>
      </Card>
    </div>
  );
}
