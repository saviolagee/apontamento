import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";
import { ClientAreasForm, ClientDetailsForm } from "../clients-client";

export const metadata = { title: "Cliente | Apontamento" };

export default async function ClientPage({ params }: PageProps<"/clientes/[id]">) {
  const { id } = await params;
  await requireRole(["admin", "gestor"]);
  const supabase = await createClient();

  const [{ data: client }, { data: areas }, { data: clientAreas }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    supabase.from("areas").select("id, name, active").order("name"),
    supabase.from("client_areas").select("area_id").eq("client_id", id),
  ]);

  if (!client) notFound();

  return (
    <div className="grid gap-6">
      <Link href="/clientes" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" />
        Clientes
      </Link>

      <PageHeader
        title={client.trade_name || client.legal_name}
        description={client.trade_name ? client.legal_name : undefined}
      >
        {!client.active ? <Badge variant="secondary">inativo</Badge> : null}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Dados do cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <ClientDetailsForm client={client as Tables<"clients">} />
          </CardContent>
        </Card>

        <div className="grid gap-6 content-start">
          <Card>
            <CardHeader>
              <CardTitle>Áreas de atuação</CardTitle>
            </CardHeader>
            <CardContent>
              <ClientAreasForm
                clientId={client.id}
                areas={(areas ?? []) as Pick<Tables<"areas">, "id" | "name" | "active">[]}
                selected={(clientAreas ?? []).map((a) => a.area_id)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contratos</CardTitle>
              <CardDescription>
                Valor, periodicidade, margem desejada e gastos extras chegam na próxima etapa.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </div>
  );
}
