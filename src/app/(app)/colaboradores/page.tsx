import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatHours } from "@/lib/format";
import type { Tables } from "@/lib/database.types";
import { NewEmployeeForm } from "./employees-client";

export const metadata = { title: "Colaboradores | Apontamento" };

type EmployeeRow = Tables<"employees"> & {
  employee_costs: Pick<Tables<"employee_costs">, "hourly_cost" | "valid_from" | "valid_to">[];
};

export default async function EmployeesPage() {
  const { tenant, profile } = await requireRole(["admin", "gestor"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("employees")
    .select("*, employee_costs(hourly_cost, valid_from, valid_to)")
    .order("full_name");

  const employees = (data ?? []) as EmployeeRow[];
  const canSeeCosts = profile.role === "admin" || profile.can_view_costs;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Colaboradores"
        description="Quem aponta horas. O custo hora vigente é usado para calcular a rentabilidade dos contratos."
      />

      <Card>
        <CardHeader>
          <CardTitle>Novo colaborador</CardTitle>
          <CardDescription>
            Cadastre a pessoa e depois defina áreas, custo e acesso ao sistema na página dela.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewEmployeeForm defaultMonthlyHours={Number(tenant.monthly_hours)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Equipe</CardTitle>
          <CardDescription>
            {canSeeCosts
              ? "Custo hora vigente hoje."
              : "Você não tem permissão para ver custos individuais — fale com o administrador."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {employees.length === 0 ? (
            <EmptyState>Nenhum colaborador cadastrado ainda.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Horas/mês</TableHead>
                  {canSeeCosts ? <TableHead>Custo hora</TableHead> : null}
                  <TableHead>Acesso</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => {
                  const current = employee.employee_costs?.find((c) => c.valid_to === null);
                  return (
                    <TableRow key={employee.id}>
                      <TableCell>
                        <Link href={`/colaboradores/${employee.id}`} className="font-medium hover:underline">
                          {employee.full_name}
                        </Link>
                        {!employee.active ? (
                          <Badge variant="secondary" className="ml-2">
                            inativo
                          </Badge>
                        ) : null}
                        {employee.email ? (
                          <p className="text-xs text-muted-foreground">{employee.email}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{employee.job_title ?? "—"}</TableCell>
                      <TableCell>
                        {formatHours(Number(employee.monthly_hours ?? tenant.monthly_hours))}
                        {employee.monthly_hours === null ? (
                          <span className="ml-1 text-xs text-muted-foreground">(padrão)</span>
                        ) : null}
                      </TableCell>
                      {canSeeCosts ? (
                        <TableCell>
                          {current ? (
                            formatCurrency(Number(current.hourly_cost))
                          ) : (
                            <span className="text-muted-foreground">sem custo</span>
                          )}
                        </TableCell>
                      ) : null}
                      <TableCell>
                        {employee.profile_id ? (
                          <Badge variant="secondary">com login</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">sem acesso</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/colaboradores/${employee.id}`} aria-label={`Abrir ${employee.full_name}`}>
                          <ChevronRightIcon className="size-4 text-muted-foreground" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
