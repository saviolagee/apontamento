import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { CompanyForm, DomainForm } from "./company-form";

export const metadata = { title: "Empresa | Apontamento" };

export default async function CompanyPage() {
  const { tenant } = await requireRole(["admin"]);

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Empresa</h1>
        <p className="text-muted-foreground">Dados da empresa e parâmetros usados nos cálculos de rentabilidade.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Domínio corporativo</CardTitle>
          <CardDescription>
            É o que liga cada pessoa à empresa certa: quem se cadastra com um e-mail do domínio entra automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DomainForm tenant={tenant} />
        </CardContent>
      </Card>

      <CompanyForm tenant={tenant} />
    </div>
  );
}
