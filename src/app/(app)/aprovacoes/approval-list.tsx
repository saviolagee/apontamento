"use client";

import { useActionState, useState } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeCheckbox } from "@/components/native-select";
import { FormAlert, SubmitButton } from "@/components/form";
import { initialActionState } from "@/lib/actions";
import { formatDate, formatHours } from "@/lib/format";
import type { PendingEntry } from "./page";
import { reviewTimeEntriesAction } from "../apontamentos/actions";

export function ApprovalList({ entries }: { entries: PendingEntry[] }) {
  const [state, formAction] = useActionState(reviewTimeEntriesAction, initialActionState);
  const [selected, setSelected] = useState<string[]>([]);

  const allSelected = selected.length === entries.length && entries.length > 0;
  const toggleAll = () => setSelected(allSelected ? [] : entries.map((e) => e.id));
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <form action={formAction} className="grid gap-4">
      <FormAlert state={state} />
      {selected.map((id) => (
        <input key={id} type="hidden" name="ids" value={id} />
      ))}

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid flex-1 gap-1.5">
          <label htmlFor="comment" className="text-sm font-medium">
            Comentário (opcional, útil ao rejeitar)
          </label>
          <Input id="comment" name="comment" placeholder="Ex.: lançar no contrato correto" />
        </div>
        <SubmitButton name="status" value="aprovado">
          <CheckIcon />
          Aprovar selecionados
        </SubmitButton>
        <SubmitButton name="status" value="rejeitado" variant="outline">
          <XIcon />
          Rejeitar
        </SubmitButton>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <NativeCheckbox checked={allSelected} onChange={toggleAll} aria-label="Selecionar todos" />
            </TableHead>
            <TableHead>Colaborador</TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Cliente / contrato</TableHead>
            <TableHead>Atividade</TableHead>
            <TableHead className="text-right">Horas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell>
                <NativeCheckbox
                  checked={selected.includes(entry.id)}
                  onChange={() => toggle(entry.id)}
                  aria-label={`Selecionar apontamento de ${entry.employees?.full_name ?? ""}`}
                />
              </TableCell>
              <TableCell className="font-medium">{entry.employees?.full_name ?? "—"}</TableCell>
              <TableCell>{formatDate(entry.entry_date)}</TableCell>
              <TableCell>
                {entry.contracts ? (
                  <>
                    <span className="block">
                      {entry.contracts.clients?.trade_name || entry.contracts.clients?.legal_name}
                    </span>
                    <span className="text-xs text-muted-foreground">{entry.contracts.name}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Interno</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {entry.activities?.name}
                {entry.billable ? "" : " (não faturável)"}
                {entry.description ? <span className="block text-xs">{entry.description}</span> : null}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatHours(entry.minutes / 60)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </form>
  );
}
