import Link from "next/link";
import { ArrowRightIcon, CheckCircle2Icon, CircleDashedIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireContext, ROLE_LABELS } from "@/lib/auth/session";
import { formatHours } from "@/lib/format";

export const metadata = { title: "Início | Apontamento" };

const ROADMAP = [
  { label: "Multiempresa, perfis de acesso e RLS", done: true },
  { label: "Cadastros: áreas, atividades, colaboradores e clientes", done: false },
  { label: "Contratos e gastos extras", done: false },
  { label: "Apontamento de horas, cronômetro e aprovação", done: false },
  { label: "Motor de rentabilidade", done: false },
  { label: "Dashboard gerencial e detalhe do cliente", done: false },
];

export default async function HomePage() {
  const { profile, tenant } = await requireContext();

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Olá, {profile.full_name.split(" ")[0]}</h1>
        <p className="text-muted-foreground">
          Você está em <span className="font-medium text-foreground">{tenant.name}</span> como{" "}
          {ROLE_LABELS[profile.role]}.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Jornada padrão</CardTitle>
            <CardDescription>Horas disponíveis por colaborador no mês</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{formatHours(Number(tenant.monthly_hours))}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tolerância de margem</CardTitle>
            <CardDescription>Faixa de atenção abaixo da margem desejada</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {Number(tenant.margin_attention_tolerance).toLocaleString("pt-BR")} p.p.
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Próximos passos</CardTitle>
          <CardDescription>O que já está pronto e o que vem a seguir</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {ROADMAP.map((step) => (
            <div key={step.label} className="flex items-center gap-2 text-sm">
              {step.done ? (
                <CheckCircle2Icon className="size-4 text-emerald-600" />
              ) : (
                <CircleDashedIcon className="size-4 text-muted-foreground" />
              )}
              <span className={step.done ? "" : "text-muted-foreground"}>{step.label}</span>
            </div>
          ))}
          {profile.role === "admin" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button render={<Link href="/configuracoes/empresa" />} variant="outline">
                Configurar empresa
                <ArrowRightIcon />
              </Button>
              <Button render={<Link href="/configuracoes/usuarios" />}>
                Convidar equipe
                <ArrowRightIcon />
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
