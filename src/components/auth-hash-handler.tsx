"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { parseAuthHash } from "@/lib/auth/hash-tokens";

/**
 * O Supabase devolve convites e recuperações de senha com os tokens na hash
 * da URL — que só existe no navegador. Este componente fica no layout raiz:
 * em qualquer página que receba esse link, ele cria a sessão, limpa a URL e
 * encaminha para o lugar certo.
 */
function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const getSnapshot = () => window.location.hash;
const getServerSnapshot = () => "";

export function AuthHashHandler() {
  const router = useRouter();
  const hash = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const handled = useRef(false);
  const result = parseAuthHash(hash);

  useEffect(() => {
    const parsed = parseAuthHash(hash);
    if (!parsed || handled.current) return;
    handled.current = true;

    // Tira o token da barra de endereços antes de qualquer navegação
    const clean = () => window.history.replaceState(null, "", window.location.pathname + window.location.search);

    if (parsed.kind === "error") {
      clean();
      router.replace(`/login?erro=${encodeURIComponent(parsed.message)}`);
      return;
    }

    void createClient()
      .auth.setSession({ access_token: parsed.accessToken, refresh_token: parsed.refreshToken })
      .then(({ error }) => {
        clean();
        if (error) {
          router.replace("/login?erro=link-invalido");
          return;
        }
        router.replace(parsed.needsPassword ? "/redefinir-senha?convite=1" : "/inicio");
        router.refresh();
      });
  }, [hash, router]);

  if (!result) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center gap-2 bg-background text-sm text-muted-foreground">
      <Loader2Icon className="size-4 animate-spin" />
      {result.kind === "error" ? "Verificando o link…" : "Entrando…"}
    </div>
  );
}
