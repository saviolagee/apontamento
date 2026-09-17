import type { AppRole } from "@/lib/database.types";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  colaborador: "Colaborador",
};

export const isManager = (role: AppRole) => role === "admin" || role === "gestor";
