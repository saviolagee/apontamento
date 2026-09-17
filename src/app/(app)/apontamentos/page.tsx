import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";
import { startOfWeek, weekDays } from "@/lib/time";
import type { Tables } from "@/lib/database.types";
import { EntryForm } from "./entry-form";
import { TimerCard } from "./timer-card";
import { WeekEntries } from "./week-entries";

export const metadata = { title: "Apontamentos | Apontamento" };

export type ContractOption = {
  id: string;
  name: string;
  clientName: string;
};

export default async function TimeEntriesPage({ searchParams }: PageProps<"/apontamentos">) {
  const { semana } = await searchParams;
  const { tenant, employeeId } = await requireContext();
  const today = todayISO();
  const weekStart = startOfWeek(typeof semana === "string" && /^\d{4}-\d{2}-\d{2}$/.test(semana) ? semana : today);
  const days = weekDays(weekStart);
  const supabase = await createClient();

  const [{ data: contracts }, { data: clients }, { data: activities }, { data: lock }, { data: entries }] =
    await Promise.all([
      supabase.from("contract_options").select("id, name, client_id, status").eq("status", "ativo").order("name"),
      supabase.from("clients").select("id, legal_name, trade_name").eq("active", true),
      supabase.from("activities").select("id, name, billable, area_id").eq("active", true).order("name"),
      supabase.from("period_locks").select("locked_through").maybeSingle(),
      employeeId
        ? supabase
            .from("time_entries")
            .select("*")
            .eq("employee_id", employeeId)
            .gte("entry_date", days[0])
            .lte("entry_date", days[6])
            .order("entry_date")
        : Promise.resolve({ data: [] }),
    ]);

  const clientNames = new Map((clients ?? []).map((c) => [c.id, c.trade_name || c.legal_name]));
  const contractOptions: ContractOption[] = (contracts ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    clientName: clientNames.get(c.client_id) ?? "Cliente",
  }));
  const activityOptions = (activities ?? []) as Pick<Tables<"activities">, "id" | "name" | "billable" | "area_id">[];
  const lockedThrough = lock?.locked_through ?? null;

  if (!employeeId) {
    return (
      <div className="grid gap-6">
        <PageHeader title="Apontamentos" />
        <Card>
          <CardHeader>
            <CardTitle>Sem cadastro de colaborador</CardTitle>
            <CardDescription>
              Seu login ainda não está vinculado a um colaborador, então não é possível apontar horas. Peça ao
              administrador para vincular seu cadastro em Colaboradores.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Apontamentos"
        description="Lance suas horas por cliente, contrato e atividade. Enquanto estiverem pendentes, você pode editar."
      />

      <TimerCard contracts={contractOptions} activities={activityOptions} today={today} />

      <Card>
        <CardHeader>
          <CardTitle>Lançamento manual</CardTitle>
          <CardDescription>
            Informe a duração (1:30, 1,5 ou 90m) ou o intervalo de horas.
            {lockedThrough ? " Períodos fechados aparecem bloqueados." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EntryForm contracts={contractOptions} activities={activityOptions} today={today} />
        </CardContent>
      </Card>

      <WeekEntries
        weekStart={weekStart}
        days={days}
        entries={(entries ?? []) as Tables<"time_entries">[]}
        contracts={contractOptions}
        activities={activityOptions}
        monthlyHours={Number(tenant.monthly_hours)}
        lockedThrough={lockedThrough}
        today={today}
      />
    </div>
  );
}
