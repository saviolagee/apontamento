import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayISO } from "@/lib/format";
import { endOfMonth, startOfMonth, addDays } from "@/lib/time";
import { PeriodLockForm } from "./period-lock-form";

export const metadata = { title: "Fechamento de período | Apontamento" };

export default async function PeriodLockPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data: lock } = await supabase.from("period_locks").select("locked_through, updated_at").maybeSingle();

  const today = todayISO();
  const lastMonthEnd = addDays(startOfMonth(today), -1);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Fechamento de período"
        description="Bloqueia lançamentos e alterações de horas até a data escolhida, preservando os números já apurados."
      />

      <Card>
        <CardHeader>
          <CardTitle>
            {lock?.locked_through ? `Fechado até ${formatDate(lock.locked_through)}` : "Nenhum período fechado"}
          </CardTitle>
          <CardDescription>
            Gestores continuam podendo aprovar ou rejeitar apontamentos de períodos fechados — o que fica travado são as
            horas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PeriodLockForm
            lockedThrough={lock?.locked_through ?? null}
            suggestions={[
              { label: `Fechar mês anterior (até ${formatDate(lastMonthEnd)})`, value: lastMonthEnd },
              { label: `Fechar mês atual (até ${formatDate(endOfMonth(today))})`, value: endOfMonth(today) },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
