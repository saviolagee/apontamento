import { requireRole } from "@/lib/auth/session";
import { CompanyForm } from "./company-form";

export const metadata = { title: "Empresa | Apontamento" };

export default async function CompanyPage() {
  const { tenant } = await requireRole(["admin"]);

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Empresa</h1>
        <p className="text-muted-foreground">Dados da empresa e parâmetros usados nos cálculos de rentabilidade.</p>
      </header>
      <CompanyForm tenant={tenant} />
    </div>
  );
}
