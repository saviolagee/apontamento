import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";
import { ActivitiesTable, ActivityForm } from "./activities-client";

export const metadata = { title: "Atividades | Apontamento" };

export default async function ActivitiesPage() {
  await requireRole(["admin", "gestor"]);
  const supabase = await createClient();

  const [{ data: activities }, { data: areas }] = await Promise.all([
    supabase.from("activities").select("*, time_entries(count)").order("name"),
    supabase.from("areas").select("id, name, active").order("name"),
  ]);

  const areaOptions = (areas ?? []) as Pick<Tables<"areas">, "id" | "name" | "active">[];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Atividades"
        description="O que a equipe aponta. A marcação faturável / não faturável alimenta os indicadores de produtividade."
      />

      {areaOptions.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Cadastre uma área primeiro</CardTitle>
            <CardDescription>
              Atividades pertencem a uma área de atuação.{" "}
              <Link href="/cadastros/areas" className="font-medium text-foreground underline">
                Cadastrar áreas
              </Link>
              .
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Nova atividade</CardTitle>
            <CardDescription>Ex.: Apuração fiscal (faturável), Reunião interna (não faturável).</CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityForm areas={areaOptions} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Atividades cadastradas</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivitiesTable
            activities={(activities ?? []) as (Tables<"activities"> & { time_entries: { count: number }[] })[]}
            areas={areaOptions}
          />
        </CardContent>
      </Card>
    </div>
  );
}
