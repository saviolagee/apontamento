import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Configuração necessária | Apontamento" };

export default function SetupPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Falta conectar o Supabase</CardTitle>
          <CardDescription>
            O app não encontrou as variáveis do Supabase. Copie as chaves em <em>Project Settings → API</em> do seu
            projeto no Supabase.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
            {`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...`}
          </pre>

          <div className="grid gap-1">
            <p className="font-medium">Rodando no seu computador</p>
            <p className="text-muted-foreground">
              Coloque as variáveis no arquivo <code className="rounded bg-muted px-1">.env.local</code> e reinicie o
              servidor.
            </p>
          </div>

          <div className="grid gap-1">
            <p className="font-medium">Na Vercel</p>
            <p className="text-muted-foreground">
              Cadastre em <em>Settings → Environment Variables</em> (marcando <em>Production</em>) e faça um{" "}
              <em>Redeploy</em> sem cache: variáveis <code className="rounded bg-muted px-1">NEXT_PUBLIC_</code> só
              entram no app durante o build. Se a Vercel bloquear o nome{" "}
              <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, use{" "}
              <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_ANON</code> com o mesmo valor.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
