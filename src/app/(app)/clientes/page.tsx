import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatCnpj } from "@/lib/format";
import type { Tables } from "@/lib/database.types";
import { NewClientForm } from "./clients-client";

export const metadata = { title: "Clientes | Apontamento" };

export default async function ClientsPage() {
  await requireRole(["admin", "gestor"]);
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("*").order("legal_name");
  const clients = (data ?? []) as Tables<"clients">[];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Clientes"
        description="Cada cliente pode ter um ou mais contratos — é onde a rentabilidade é medida."
      />

      <Card>
        <CardHeader>
          <CardTitle>Novo cliente</CardTitle>
          <CardDescription>Os contratos são cadastrados dentro do cliente.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewClientForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Carteira</CardTitle>
        </CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <EmptyState>Nenhum cliente cadastrado ainda.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell>
                      <Link href={`/clientes/${client.id}`} className="font-medium hover:underline">
                        {client.trade_name || client.legal_name}
                      </Link>
                      {!client.active ? (
                        <Badge variant="secondary" className="ml-2">
                          inativo
                        </Badge>
                      ) : null}
                      {client.trade_name ? (
                        <p className="text-xs text-muted-foreground">{client.legal_name}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatCnpj(client.cnpj) || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {client.contact_name ?? "—"}
                      {client.email ? <p className="text-xs">{client.email}</p> : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/clientes/${client.id}`} aria-label={`Abrir ${client.legal_name}`}>
                        <ChevronRightIcon className="size-4 text-muted-foreground" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
