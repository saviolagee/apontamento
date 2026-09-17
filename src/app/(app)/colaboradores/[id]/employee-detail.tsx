"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeCheckbox, NativeSelect } from "@/components/native-select";
import { EmptyState } from "@/components/page-header";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { initialActionState } from "@/lib/actions";
import { formatCurrency, formatDate, formatHours } from "@/lib/format";
import type { Tables } from "@/lib/database.types";
import { grantAccessAction, setEmployeeAreasAction, setEmployeeCostAction, updateEmployeeAction } from "../actions";

export function EmployeeDetailsForm({
  employee,
  defaultMonthlyHours,
}: {
  employee: Tables<"employees">;
  defaultMonthlyHours: number;
}) {
  const [state, formAction] = useActionState(updateEmployeeAction, initialActionState);

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="id" value={employee.id} />
      <FormAlert state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor="fullName" errors={state.fieldErrors?.fullName}>
          <Input id="fullName" name="fullName" defaultValue={employee.full_name} required />
        </Field>
        <Field label="E-mail" htmlFor="email" errors={state.fieldErrors?.email}>
          <Input id="email" name="email" type="email" defaultValue={employee.email ?? ""} />
        </Field>
        <Field label="Cargo" htmlFor="jobTitle" errors={state.fieldErrors?.jobTitle}>
          <Input id="jobTitle" name="jobTitle" defaultValue={employee.job_title ?? ""} />
        </Field>
        <Field
          label="Horas disponíveis no mês"
          htmlFor="monthlyHours"
          hint={`Vazio usa o padrão da empresa (${defaultMonthlyHours.toLocaleString("pt-BR")}h).`}
          errors={state.fieldErrors?.monthlyHours}
        >
          <Input
            id="monthlyHours"
            name="monthlyHours"
            inputMode="decimal"
            defaultValue={employee.monthly_hours === null ? "" : Number(employee.monthly_hours).toLocaleString("pt-BR")}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <NativeCheckbox name="active" defaultChecked={employee.active} />
        Colaborador ativo
      </label>
      <div>
        <SubmitButton>Salvar dados</SubmitButton>
      </div>
    </form>
  );
}

export function EmployeeAreasForm({
  employeeId,
  areas,
  selected,
}: {
  employeeId: string;
  areas: Pick<Tables<"areas">, "id" | "name" | "active">[];
  selected: string[];
}) {
  const [state, formAction] = useActionState(setEmployeeAreasAction, initialActionState);

  if (!areas.length) {
    return <EmptyState>Cadastre áreas de atuação para vincular.</EmptyState>;
  }

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="employeeId" value={employeeId} />
      <FormAlert state={state} />
      <div className="grid gap-2 sm:grid-cols-2">
        {areas
          .filter((area) => area.active || selected.includes(area.id))
          .map((area) => (
            <label key={area.id} className="flex items-center gap-2 text-sm">
              <NativeCheckbox name="areaIds" value={area.id} defaultChecked={selected.includes(area.id)} />
              {area.name}
              {area.active ? "" : " (inativa)"}
            </label>
          ))}
      </div>
      <div>
        <SubmitButton variant="outline">Salvar áreas</SubmitButton>
      </div>
    </form>
  );
}

export function NewCostForm({
  employeeId,
  defaultMonthlyHours,
  today,
}: {
  employeeId: string;
  defaultMonthlyHours: number;
  today: string;
}) {
  const [state, formAction] = useActionState(setEmployeeCostAction, initialActionState);

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border p-4">
      <input type="hidden" name="employeeId" value={employeeId} />
      <FormAlert state={state} />
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Salário mensal" htmlFor="monthlySalary" errors={state.fieldErrors?.monthlySalary}>
          <Input id="monthlySalary" name="monthlySalary" inputMode="decimal" placeholder="8.000,00" required />
        </Field>
        <Field label="Encargos (%)" htmlFor="chargesPercent" errors={state.fieldErrors?.chargesPercent}>
          <Input id="chargesPercent" name="chargesPercent" inputMode="decimal" placeholder="80" />
        </Field>
        <Field label="Encargos (R$)" htmlFor="chargesAmount" errors={state.fieldErrors?.chargesAmount}>
          <Input id="chargesAmount" name="chargesAmount" inputMode="decimal" placeholder="0,00" />
        </Field>
        <Field label="Benefícios (R$)" htmlFor="benefits" errors={state.fieldErrors?.benefits}>
          <Input id="benefits" name="benefits" inputMode="decimal" placeholder="600,00" />
        </Field>
        <Field label="Horas no mês" htmlFor="costMonthlyHours" errors={state.fieldErrors?.monthlyHours}>
          <Input
            id="costMonthlyHours"
            name="monthlyHours"
            inputMode="decimal"
            defaultValue={defaultMonthlyHours.toLocaleString("pt-BR")}
            required
          />
        </Field>
        <Field label="Vigência a partir de" htmlFor="validFrom" errors={state.fieldErrors?.validFrom}>
          <Input id="validFrom" name="validFrom" type="date" defaultValue={today} required />
        </Field>
      </div>
      <div>
        <SubmitButton>Registrar custo</SubmitButton>
      </div>
    </form>
  );
}

export function CostHistory({ costs }: { costs: Tables<"employee_costs">[] }) {
  if (!costs.length) return <EmptyState>Nenhum custo registrado — a rentabilidade não considerará estas horas.</EmptyState>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Vigência</TableHead>
          <TableHead>Salário</TableHead>
          <TableHead>Encargos</TableHead>
          <TableHead>Benefícios</TableHead>
          <TableHead>Horas</TableHead>
          <TableHead>Custo hora</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {costs.map((cost) => (
          <TableRow key={cost.id}>
            <TableCell>
              {formatDate(cost.valid_from)} — {cost.valid_to ? formatDate(cost.valid_to) : "vigente"}
            </TableCell>
            <TableCell>{formatCurrency(Number(cost.monthly_salary))}</TableCell>
            <TableCell>
              {Number(cost.charges_percent) > 0 ? `${Number(cost.charges_percent).toLocaleString("pt-BR")}%` : null}
              {Number(cost.charges_percent) > 0 && Number(cost.charges_amount) > 0 ? " + " : null}
              {Number(cost.charges_amount) > 0 ? formatCurrency(Number(cost.charges_amount)) : null}
              {Number(cost.charges_percent) === 0 && Number(cost.charges_amount) === 0 ? "—" : null}
            </TableCell>
            <TableCell>{formatCurrency(Number(cost.benefits))}</TableCell>
            <TableCell>{formatHours(Number(cost.monthly_hours))}</TableCell>
            <TableCell className="font-medium">{formatCurrency(Number(cost.hourly_cost))}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function GrantAccessForm({ employee }: { employee: Tables<"employees"> }) {
  const [state, formAction] = useActionState(grantAccessAction, initialActionState);

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="employeeId" value={employee.id} />
      <input type="hidden" name="fullName" value={employee.full_name} />
      <FormAlert state={state} />
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <Field label="E-mail de acesso" htmlFor="accessEmail" errors={state.fieldErrors?.email}>
          <Input id="accessEmail" name="email" type="email" defaultValue={employee.email ?? ""} required />
        </Field>
        <Field label="Perfil" htmlFor="accessRole" errors={state.fieldErrors?.role}>
          <NativeSelect id="accessRole" name="role" defaultValue="colaborador">
            <option value="colaborador">Colaborador</option>
            <option value="gestor">Gestor</option>
            <option value="admin">Administrador</option>
          </NativeSelect>
        </Field>
        <SubmitButton>Enviar convite</SubmitButton>
      </div>
    </form>
  );
}
