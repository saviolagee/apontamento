import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";
import type { Tables } from "@/lib/database.types";
import { CostHistory, EmployeeAreasForm, EmployeeDetailsForm, GrantAccessForm, NewCostForm } from "./employee-detail";

export const metadata = { title: "Colaborador | Apontamento" };

export default async function EmployeePage({ params }: PageProps<"/colaboradores/[id]">) {
  const { id } = await params;
  const { tenant, profile } = await requireRole(["admin", "gestor"]);
  const supabase = await createClient();

  const [{ data: employee }, { data: areas }, { data: employeeAreas }, { data: invitation }] = await Promise.all([
    supabase.from("employees").select("*").eq("id", id).maybeSingle(),
    supabase.from("areas").select("id, name, active").order("name"),
    supabase.from("employee_areas").select("area_id").eq("employee_id", id),
    supabase.from("invitations").select("email, role, created_at").eq("employee_id", id).is("accepted_at", null).maybeSingle(),
  ]);

  if (!employee) notFound();

  const isAdmin = profile.role === "admin";
  const canSeeCosts = isAdmin || profile.can_view_costs;

  const { data: costs } = canSeeCosts
    ? await supabase.from("employee_costs").select("*").eq("employee_id", id).order("valid_from", { ascending: false })
    : { data: [] };

  return (
    <div className="grid gap-6">
      <Link
        href="/colaboradores"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Colaboradores
      </Link>

      <PageHeader title={employee.full_name} description={employee.job_title ?? "Sem cargo definido"}>
        {employee.profile_id ? <Badge variant="secondary">com acesso ao sistema</Badge> : null}
        {!employee.active ? <Badge variant="secondary">inativo</Badge> : null}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dados</CardTitle>
          </CardHeader>
          <CardContent>
            <EmployeeDetailsForm employee={employee as Tables<"employees">} defaultMonthlyHours={Number(tenant.monthly_hours)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Áreas de atuação</CardTitle>
            <CardDescription>Usadas para filtrar análises e sugerir atividades.</CardDescription>
          </CardHeader>
          <CardContent>
            <EmployeeAreasForm
              employeeId={employee.id}
              areas={(areas ?? []) as Pick<Tables<"areas">, "id" | "name" | "active">[]}
              selected={(employeeAreas ?? []).map((a) => a.area_id)}
            />
          </CardContent>
        </Card>
      </div>

      {canSeeCosts ? (
        <Card>
          <CardHeader>
            <CardTitle>Custo e vigência</CardTitle>
            <CardDescription>
              Custo hora = (salário + encargos + benefícios) ÷ horas disponíveis. Cada alteração cria uma nova
              vigência, preservando os cálculos dos períodos anteriores.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            {isAdmin ? (
              <NewCostForm
                employeeId={employee.id}
                defaultMonthlyHours={Number(employee.monthly_hours ?? tenant.monthly_hours)}
                today={todayISO()}
              />
            ) : null}
            <CostHistory costs={(costs ?? []) as Tables<"employee_costs">[]} />
          </CardContent>
        </Card>
      ) : null}

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Acesso ao sistema</CardTitle>
            <CardDescription>
              {employee.profile_id
                ? "Esta pessoa já tem login. Gerencie o perfil em Configurações → Usuários e acessos."
                : "Convide a pessoa para apontar as próprias horas."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {employee.profile_id ? (
              <Link href="/configuracoes/usuarios" className="text-sm font-medium underline">
                Ir para usuários e acessos
              </Link>
            ) : invitation ? (
              <p className="text-sm text-muted-foreground">
                Convite pendente para <span className="font-medium text-foreground">{invitation.email}</span>. A pessoa
                entra na empresa ao se cadastrar com esse e-mail.
              </p>
            ) : (
              <GrantAccessForm employee={employee as Tables<"employees">} />
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
