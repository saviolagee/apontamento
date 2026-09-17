"use client";

import { useActionState, useState } from "react";
import { Trash2Icon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeCheckbox, NativeSelect } from "@/components/native-select";
import { EmptyState } from "@/components/page-header";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { initialActionState } from "@/lib/actions";
import { EXPENSE_CATEGORY_LABELS, EXPENSE_RECURRENCE_LABELS } from "@/lib/contracts";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ExpenseRecurrence, Tables } from "@/lib/database.types";
import { createExpenseAction, deleteExpenseAction, setContractLinksAction } from "../actions";

type Option = { id: string; name: string; active: boolean };

function CheckboxGroup({
  title,
  name,
  options,
  selected,
  empty,
}: {
  title: string;
  name: string;
  options: Option[];
  selected: string[];
  empty: string;
}) {
  const visible = options.filter((o) => o.active || selected.includes(o.id));
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">{title}</p>
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="grid gap-2">
          {visible.map((option) => (
            <label key={option.id} className="flex items-center gap-2 text-sm">
              <NativeCheckbox name={name} value={option.id} defaultChecked={selected.includes(option.id)} />
              {option.name}
              {option.active ? "" : " (inativo)"}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function ContractLinksForm({
  contractId,
  areas,
  activities,
  employees,
  selectedAreas,
  selectedActivities,
  selectedEmployees,
}: {
  contractId: string;
  areas: Pick<Tables<"areas">, "id" | "name" | "active">[];
  activities: Pick<Tables<"activities">, "id" | "name" | "active" | "area_id">[];
  employees: Pick<Tables<"employees">, "id" | "full_name" | "active">[];
  selectedAreas: string[];
  selectedActivities: string[];
  selectedEmployees: string[];
}) {
  const [state, formAction] = useActionState(setContractLinksAction, initialActionState);

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="contractId" value={contractId} />
      <FormAlert state={state} />
      <div className="grid gap-6 sm:grid-cols-3">
        <CheckboxGroup
          title="Áreas de atuação"
          name="areaIds"
          options={areas}
          selected={selectedAreas}
          empty="Nenhuma área cadastrada."
        />
        <CheckboxGroup
          title="Atividades"
          name="activityIds"
          options={activities.map((a) => ({ id: a.id, name: a.name, active: a.active }))}
          selected={selectedActivities}
          empty="Nenhuma atividade cadastrada."
        />
        <CheckboxGroup
          title="Colaboradores alocados"
          name="employeeIds"
          options={employees.map((e) => ({ id: e.id, name: e.full_name, active: e.active }))}
          selected={selectedEmployees}
          empty="Nenhum colaborador cadastrado."
        />
      </div>
      <div>
        <SubmitButton variant="outline">Salvar escopo</SubmitButton>
      </div>
    </form>
  );
}

function ExpenseForm({ contractId, today }: { contractId: string; today: string }) {
  const [state, formAction] = useActionState(createExpenseAction, initialActionState);
  const [recurrence, setRecurrence] = useState<ExpenseRecurrence>("pontual");

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="contractId" value={contractId} />
      <FormAlert state={state} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Field label="Descrição" htmlFor="description" className="lg:col-span-2" errors={state.fieldErrors?.description}>
          <Input id="description" name="description" required placeholder="Passagens aéreas" />
        </Field>
        <Field label="Categoria" htmlFor="category" errors={state.fieldErrors?.category}>
          <NativeSelect id="category" name="category" defaultValue="outros">
            {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Valor" htmlFor="amount" errors={state.fieldErrors?.amount}>
          <Input id="amount" name="amount" inputMode="decimal" required placeholder="800,00" />
        </Field>
        <Field label="Tipo" htmlFor="recurrence" errors={state.fieldErrors?.recurrence}>
          <NativeSelect
            id="recurrence"
            name="recurrence"
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value as ExpenseRecurrence)}
          >
            {Object.entries(EXPENSE_RECURRENCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label={recurrence === "pontual" ? "Data" : "Início"}
          htmlFor="expenseDate"
          errors={state.fieldErrors?.expenseDate}
        >
          <Input id="expenseDate" name="expenseDate" type="date" defaultValue={today} required />
        </Field>
        {recurrence !== "pontual" ? (
          <Field label="Fim (opcional)" htmlFor="endDate" errors={state.fieldErrors?.endDate}>
            <Input id="endDate" name="endDate" type="date" />
          </Field>
        ) : null}
      </div>
      <div>
        <SubmitButton>Adicionar gasto</SubmitButton>
      </div>
    </form>
  );
}

function ExpenseRow({ expense, contractId }: { expense: Tables<"contract_expenses">; contractId: string }) {
  const [state, formAction] = useActionState(deleteExpenseAction, initialActionState);

  return (
    <TableRow>
      <TableCell>
        <span className="font-medium">{expense.description}</span>
        {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
      </TableCell>
      <TableCell className="text-muted-foreground">{EXPENSE_CATEGORY_LABELS[expense.category]}</TableCell>
      <TableCell>{formatCurrency(Number(expense.amount))}</TableCell>
      <TableCell className="text-muted-foreground">
        {EXPENSE_RECURRENCE_LABELS[expense.recurrence]}
        {expense.recurrence !== "pontual" ? (
          <span className="block text-xs">
            {formatDate(expense.expense_date)} — {expense.end_date ? formatDate(expense.end_date) : "sem fim"}
          </span>
        ) : (
          <span className="block text-xs">{formatDate(expense.expense_date)}</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <form action={formAction}>
          <input type="hidden" name="id" value={expense.id} />
          <input type="hidden" name="contractId" value={contractId} />
          <SubmitButton variant="ghost" size="icon-sm">
            <Trash2Icon />
          </SubmitButton>
        </form>
      </TableCell>
    </TableRow>
  );
}

export function ExpensesCard({
  contractId,
  expenses,
  today,
}: {
  contractId: string;
  expenses: Tables<"contract_expenses">[];
  today: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Gastos extras</CardTitle>
        <CardDescription>
          Entram no custo total do contrato. Recorrentes são normalizados para o período analisado.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <ExpenseForm contractId={contractId} today={today} />
        {expenses.length === 0 ? (
          <EmptyState>Nenhum gasto extra lançado.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((expense) => (
                <ExpenseRow key={expense.id} expense={expense} contractId={contractId} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
