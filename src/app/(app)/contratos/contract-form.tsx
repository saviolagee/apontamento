"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { initialActionState } from "@/lib/actions";
import { CONTRACT_STATUS_LABELS, PERIODICITY_LABELS, PERIODICITY_MONTHS } from "@/lib/contracts";
import { formatCurrency } from "@/lib/format";
import type { ContractPeriodicity, Tables } from "@/lib/database.types";
import { createContractAction, updateContractAction } from "./actions";

export function ContractForm({
  clientId,
  contract,
  today,
}: {
  clientId: string;
  contract?: Tables<"contracts">;
  today: string;
}) {
  const [state, formAction] = useActionState(
    contract ? updateContractAction : createContractAction,
    initialActionState,
  );
  const [periodicity, setPeriodicity] = useState<ContractPeriodicity>(contract?.periodicity ?? "mensal");
  const [amount, setAmount] = useState(contract ? String(Number(contract.amount)).replace(".", ",") : "");

  const months = PERIODICITY_MONTHS[periodicity];
  const parsedAmount = Number(amount.replace(/\./g, "").replace(",", "."));
  const monthly = months && Number.isFinite(parsedAmount) ? parsedAmount / months : null;

  return (
    <form action={formAction} className="grid gap-5">
      {contract ? <input type="hidden" name="id" value={contract.id} /> : null}
      <input type="hidden" name="clientId" value={clientId} />
      <FormAlert state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do contrato" htmlFor="name" errors={state.fieldErrors?.name}>
          <Input id="name" name="name" defaultValue={contract?.name} required placeholder="Contabilidade mensal" />
        </Field>
        <Field label="Status" htmlFor="status" errors={state.fieldErrors?.status}>
          <NativeSelect id="status" name="status" defaultValue={contract?.status ?? "ativo"}>
            {Object.entries(CONTRACT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <Field label="Descrição" htmlFor="description" errors={state.fieldErrors?.description}>
        <Textarea id="description" name="description" defaultValue={contract?.description ?? ""} rows={2} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Periodicidade"
          htmlFor="periodicity"
          errors={state.fieldErrors?.periodicity}
        >
          <NativeSelect
            id="periodicity"
            name="periodicity"
            value={periodicity}
            onChange={(e) => setPeriodicity(e.target.value as ContractPeriodicity)}
          >
            {Object.entries(PERIODICITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label={periodicity === "projeto" ? "Valor total do projeto" : "Valor por período"}
          htmlFor="amount"
          hint={monthly !== null && monthly > 0 ? `Equivale a ${formatCurrency(monthly)}/mês` : undefined}
          errors={state.fieldErrors?.amount}
        >
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="3.000,00"
            required
          />
        </Field>
        <Field
          label="Horas previstas por período"
          htmlFor="expectedHours"
          hint="Opcional."
          errors={state.fieldErrors?.expectedHours}
        >
          <Input
            id="expectedHours"
            name="expectedHours"
            inputMode="decimal"
            defaultValue={contract?.expected_hours ? String(Number(contract.expected_hours)) : ""}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Início" htmlFor="startDate" errors={state.fieldErrors?.startDate}>
          <Input id="startDate" name="startDate" type="date" defaultValue={contract?.start_date ?? today} required />
        </Field>
        <Field
          label="Término"
          htmlFor="endDate"
          hint={periodicity === "projeto" ? "Obrigatório em projeto fechado." : "Opcional em recorrentes."}
          errors={state.fieldErrors?.endDate}
        >
          <Input
            id="endDate"
            name="endDate"
            type="date"
            defaultValue={contract?.end_date ?? ""}
            required={periodicity === "projeto"}
          />
        </Field>
        <Field
          label="Margem desejada (%)"
          htmlFor="desiredMargin"
          errors={state.fieldErrors?.desiredMargin}
        >
          <Input
            id="desiredMargin"
            name="desiredMargin"
            inputMode="decimal"
            defaultValue={contract ? String(Number(contract.desired_margin)).replace(".", ",") : "30"}
            required
          />
        </Field>
        <Field
          label="Impostos sobre a receita (%)"
          htmlFor="taxRate"
          hint="Descontado antes do cálculo da margem."
          errors={state.fieldErrors?.taxRate}
        >
          <Input
            id="taxRate"
            name="taxRate"
            inputMode="decimal"
            defaultValue={contract ? String(Number(contract.tax_rate)).replace(".", ",") : ""}
            placeholder="0"
          />
        </Field>
      </div>

      <div>
        <SubmitButton>{contract ? "Salvar contrato" : "Criar contrato"}</SubmitButton>
      </div>
    </form>
  );
}
