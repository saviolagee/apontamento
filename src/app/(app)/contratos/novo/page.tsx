import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";
import { ContractForm } from "../contract-form";

export const metadata = { title: "Novo contrato | Apontamento" };

export default async function NewContractPage({ searchParams }: PageProps<"/contratos/novo">) {
  const { cliente } = await searchParams;
  await requireRole(["admin", "gestor"]);

  const clientId = typeof cliente === "string" ? cliente : null;
  if (!clientId) notFound();

  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, legal_name, trade_name")
    .eq("id", clientId)
    .maybeSingle();

  if (!client) notFound();

  return (
    <div className="grid gap-6">
      <Link
        href={`/clientes/${client.id}`}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        {client.trade_name || client.legal_name}
      </Link>

      <PageHeader
        title="Novo contrato"
        description="O valor, a periodicidade e a margem desejada definem como a rentabilidade será medida."
      />

      <Card>
        <CardContent>
          <ContractForm clientId={client.id} today={todayISO()} />
        </CardContent>
      </Card>
    </div>
  );
}
