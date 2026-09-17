"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3Icon,
  BriefcaseIcon,
  Building2Icon,
  ClockIcon,
  LayersIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  UsersIcon,
  UserCogIcon,
} from "lucide-react";
import type { AppRole } from "@/lib/database.types";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: AppRole[];
  soon?: boolean;
};

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Operação",
    items: [
      { href: "/inicio", label: "Início", icon: LayoutDashboardIcon, roles: ["admin", "gestor", "colaborador"] },
      { href: "/apontamentos", label: "Apontamentos", icon: ClockIcon, roles: ["admin", "gestor", "colaborador"], soon: true },
      { href: "/dashboard", label: "Rentabilidade", icon: BarChart3Icon, roles: ["admin", "gestor"], soon: true },
    ],
  },
  {
    group: "Cadastros",
    items: [
      { href: "/clientes", label: "Clientes e contratos", icon: BriefcaseIcon, roles: ["admin", "gestor"] },
      { href: "/colaboradores", label: "Colaboradores", icon: UsersIcon, roles: ["admin", "gestor"] },
      { href: "/cadastros/areas", label: "Áreas de atuação", icon: LayersIcon, roles: ["admin", "gestor"] },
      { href: "/cadastros/atividades", label: "Atividades", icon: ListChecksIcon, roles: ["admin", "gestor"] },
    ],
  },
  {
    group: "Configurações",
    items: [
      { href: "/configuracoes/empresa", label: "Empresa", icon: Building2Icon, roles: ["admin"] },
      { href: "/configuracoes/usuarios", label: "Usuários e acessos", icon: UserCogIcon, roles: ["admin"] },
    ],
  },
];

export function AppNav({ role, onNavigate }: { role: AppRole; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="grid gap-5 text-sm">
      {NAV.map((section) => {
        const items = section.items.filter((item) => item.roles.includes(role));
        if (!items.length) return null;
        return (
          <div key={section.group} className="grid gap-1">
            <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{section.group}</p>
            {items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              if (item.soon) {
                return (
                  <span
                    key={item.href}
                    className="flex cursor-not-allowed items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground/60"
                    title="Disponível em breve"
                  >
                    <Icon className="size-4" />
                    {item.label}
                    <span className="ml-auto rounded-md bg-muted px-1.5 py-0.5 text-[10px]">em breve</span>
                  </span>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted",
                    active && "bg-muted font-medium text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
