"use client";

import { useActionState } from "react";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormAlert, SubmitButton } from "@/components/form";
import { initialActionState, type ActionState } from "@/lib/actions";

/**
 * Botão de excluir com confirmação. Se o registro tiver histórico vinculado,
 * o próprio servidor recusa (chave estrangeira) e a mensagem aparece dentro
 * do diálogo, sem fechá-lo — a pessoa decide inativar em vez de excluir.
 */
export function DeleteButton({
  action,
  hiddenFields,
  title,
  description,
  label = "Excluir",
  iconOnly = true,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  hiddenFields: Record<string, string>;
  title: string;
  description: string;
  label?: string;
  iconOnly?: boolean;
}) {
  const [state, formAction] = useActionState(action, initialActionState);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button type="button" variant="ghost" size={iconOnly ? "icon-sm" : "sm"} aria-label={label} title={label}>
            <Trash2Icon />
            {iconOnly ? null : label}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {state.error ? <FormAlert state={state} /> : null}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
          <form action={formAction}>
            {Object.entries(hiddenFields).map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
            <SubmitButton variant="destructive">Excluir definitivamente</SubmitButton>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
