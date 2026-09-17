import { EmptyState, PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatHours } from "@/lib/format";
import type { Tables } from "@/lib/database.types";
import { ApprovalList } from "./approval-list";

export const metadata = { title: "Aprovações | Apontamento" };

export type PendingEntry = Tables<"time_entries"> & {
  employees: Pick<Tables<"employees">, "id" | "full_name"> | null;
  activities: Pick<Tables<"activities">, "id" | "name"> | null;
  contracts: (Pick<Tables<"contracts">, "id" | "name"> & {
    clients: Pick<Tables<"clients">, "legal_name" | "trade_name"> | null;
  }) | null;
};

export default async function ApprovalsPage() {
  await requireRole(["admin", "gestor"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("time_entries")
    .select(
      "*, employees(id, full_name), activities(id, name), contracts(id, name, clients(legal_name, trade_name))",
    )
    .eq("status", "pendente")
    .order("entry_date", { ascending: false })
    .limit(300);

  const entries = (data ?? []) as unknown as PendingEntry[];
  const totalMinutes = entries.reduce((sum, e) => sum + e.minutes, 0);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Aprovações"
        description="Apontamentos pendentes de revisão. Aprovar ou rejeitar não altera as horas lançadas."
      />

      <Card>
        <CardHeader>
          <CardTitle>
            {entries.length} pendente(s) · {formatHours(totalMinutes / 60)}
          </CardTitle>
          <CardDescription>Selecione os apontamentos e escolha a ação.</CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <EmptyState>Nada pendente. Tudo revisado por aqui.</EmptyState>
          ) : (
            <ApprovalList entries={entries} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
