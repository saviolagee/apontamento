import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, PlusIcon } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CONTRACT_STATUS_LABELS, PERIODICITY_LABELS, PERIODICITY_MONTHS, monthsBetween } from "@/lib/contracts";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Tables } from "@/lib/database.types";
import { ClientAreasForm, ClientDetailsForm } from "../clients-client";

export const metadata = { title: "Cliente | Apontamento" };

export default async function ClientPage({ params }: PageProps<"/clientes/[id]">) {
  const { id } = await params;
  await requireRole(["admin", "gestor"]);
  const supabase = await createClient();

  const [{ data: client }, { data: areas }, { data: clientAreas }, { data: contracts }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    supabase.from("areas").select("id, name, active").order("name"),
    supabase.from("client_areas").select("area_id").eq("client_id", id),
    supabase.from("contracts").select("*").eq("client_id", id).order("start_date", { ascending: false }),
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

        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>Contratos</CardTitle>
            <CardDescription>Cada contrato tem sua própria margem desejada e gastos extras.</CardDescription>
          </div>
          <Button nativeButton={false} render={<Link href={`/contratos/novo?cliente=${client.id}`} />} size="sm">
            <PlusIcon />
            Novo contrato
          </Button>
        </CardHeader>
        <CardContent>
          {(contracts ?? []).length === 0 ? (
            <EmptyState>Nenhum contrato cadastrado para este cliente.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contrato</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Equivalente/mês</TableHead>
                  <TableHead>Margem desejada</TableHead>
                  <TableHead>Vigência</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {((contracts ?? []) as Tables<"contracts">[]).map((contract) => {
                  const months =
                    PERIODICITY_MONTHS[contract.periodicity] ??
                    (contract.end_date ? monthsBetween(contract.start_date, contract.end_date) : null);
                  return (
                    <TableRow key={contract.id}>
                      <TableCell>
                        <Link href={`/contratos/${contract.id}`} className="font-medium hover:underline">
                          {contract.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {PERIODICITY_LABELS[contract.periodicity]}
                          {Number(contract.tax_rate) > 0
                            ? ` · impostos ${Number(contract.tax_rate).toLocaleString("pt-BR")}%`
                            : ""}
                        </p>
                      </TableCell>
                      <TableCell>{formatCurrency(Number(contract.amount))}</TableCell>
                      <TableCell>
                        {months ? formatCurrency(Number(contract.amount) / months) : "—"}
                      </TableCell>
                      <TableCell>{Number(contract.desired_margin).toLocaleString("pt-BR")}%</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(contract.start_date)}
                        {contract.end_date ? ` — ${formatDate(contract.end_date)}` : ""}
                      </TableCell>
                      <TableCell>
                        <Badge variant={contract.status === "ativo" ? "default" : "secondary"}>
                          {CONTRACT_STATUS_LABELS[contract.status]}
                        </Badge>
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
