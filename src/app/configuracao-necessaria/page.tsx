import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Configuração necessária | Apontamento" };

export default function SetupPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Falta conectar o Supabase</CardTitle>
          <CardDescription>
            Crie um projeto no Supabase, copie as chaves em <em>Project Settings → API</em> e crie o arquivo{" "}
            <code className="rounded bg-muted px-1">.env.local</code> na raiz do projeto.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
            {`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...`}
          </pre>
          <p className="text-muted-foreground">
            Depois aplique as migrations com <code className="rounded bg-muted px-1">npx supabase link</code> e{" "}
            <code className="rounded bg-muted px-1">npm run db:push</code>, e reinicie o servidor.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
