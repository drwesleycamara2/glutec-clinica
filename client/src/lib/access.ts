export const MODULE_LABELS: Record<string, string> = {
  agenda: "Agenda",
  pacientes: "Pacientes",
  prontuarios: "Prontuários",
  fotos: "Fotos",
  documentos: "Documentos e termos",
  prescricoes: "Prescrições",
  exames: "Exames",
  assinaturas: "Assinaturas",
  orcamentos: "Orçamentos",
  financeiro: "Financeiro",
  estoque: "Estoque",
  crm: "CRM",
  relatorios: "Relatórios",
  chat: "Chat",
  perfil: "Perfil",
  configuracoes: "Configurações",
  usuarios: "Usuários",
  fiscal: "Fiscal",
  templates: "Modelos clínicos",
};

export const AVAILABLE_MODULES = Object.entries(MODULE_LABELS).map(([id, label]) => ({
  id,
  label,
}));

const pathModuleMap: Array<{ prefix: string; moduleId: string }> = [
  { prefix: "/agenda", moduleId: "agenda" },
  { prefix: "/pacientes", moduleId: "pacientes" },
  { prefix: "/prontuarios", moduleId: "prontuarios" },
  { prefix: "/evolucao", moduleId: "prontuarios" },
  { prefix: "/fotos", moduleId: "fotos" },
  { prefix: "/documentos", moduleId: "documentos" },
  { prefix: "/contratos", moduleId: "documentos" },
  { prefix: "/prescricoes", moduleId: "prescricoes" },
  { prefix: "/exames", moduleId: "exames" },
  { prefix: "/assinaturas", moduleId: "assinaturas" },
  { prefix: "/orcamentos", moduleId: "orcamentos" },
  { prefix: "/financeiro", moduleId: "financeiro" },
  { prefix: "/estoque", moduleId: "estoque" },
  { prefix: "/crm", moduleId: "crm" },
  { prefix: "/relatorios", moduleId: "relatorios" },
  { prefix: "/chat", moduleId: "chat" },
  { prefix: "/perfil", moduleId: "perfil" },
  { prefix: "/configuracoes", moduleId: "configuracoes" },
  { prefix: "/templates", moduleId: "templates" },
  { prefix: "/usuarios", moduleId: "usuarios" },
  { prefix: "/fiscal", moduleId: "fiscal" },
  { prefix: "/nfse", moduleId: "fiscal" },
];

export function parsePermissions(rawPermissions?: string | null) {
  if (!rawPermissions) return [];

  try {
    const parsed = JSON.parse(rawPermissions);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function canAccessModule(
  user: { role?: string | null; permissions?: string | null } | null | undefined,
  moduleId?: string | null
) {
  if (!moduleId) return true;
  if (!user) return false;
  if (user.role === "admin") return true;
  return parsePermissions(user.permissions).includes(moduleId);
}

export function getModuleForPath(path: string) {
  const match = pathModuleMap.find(item => path === item.prefix || path.startsWith(`${item.prefix}/`));
  return match?.moduleId ?? null;
}
