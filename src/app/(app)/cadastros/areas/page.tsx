import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";
import { AreaForm, AreasTable } from "./areas-client";

export const metadata = { title: "Áreas de atuação | Apontamento" };

export default async function AreasPage() {
  await requireRole(["admin", "gestor"]);
  const supabase = await createClient();
  const { data: areas } = await supabase
    .from("areas")
    .select("*, activities(count)")
    .order("name");

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Áreas de atuação"
        description="Agrupam atividades, colaboradores e clientes — e permitem analisar a rentabilidade por área."
      />

      <Card>
        <CardHeader>
          <CardTitle>Nova área</CardTitle>
          <CardDescription>Ex.: Contábil, Fiscal, Consultoria, Desenvolvimento.</CardDescription>
        </CardHeader>
        <CardContent>
          <AreaForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Áreas cadastradas</CardTitle>
          <CardDescription>Áreas inativas não aparecem nos novos cadastros e apontamentos.</CardDescription>
        </CardHeader>
        <CardContent>
          <AreasTable areas={(areas ?? []) as (Tables<"areas"> & { activities: { count: number }[] })[]} />
        </CardContent>
      </Card>
    </div>
  );
}
