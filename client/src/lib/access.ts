export const MODULE_LABELS: Record<string, string> = {
  agenda: "Agenda",
  pacientes: "Pacientes",
  prontuarios: "Prontuários (acesso completo)",
  prontuarios_anotacoes: "Prontuários — anotações da equipe",
  fotos: "Fotos",
  documentos_identificacao: "Documentos de identificação",
  contratos_termos: "Contratos e termos",
  prescricoes: "Prescrições",
  exames: "Exames",
  assinaturas: "Assinaturas",
  orcamentos: "Orçamentos",
  financeiro: "Financeiro",
  estoque: "Estoque",
  crm: "CRM",
  relatorios: "Relatórios",
  chat: "Chat",
  configuracoes: "Configurações",
  usuarios: "Usuários",
  fiscal: "Fiscal",
  templates: "Modelos clínicos",
};

export const AVAILABLE_MODULES = Object.entries(MODULE_LABELS).map(([id, label]) => ({
  id,
  label,
}));

const LEGACY_MODULE_ALIASES: Record<string, string[]> = {
  prontuarios: ["prontuarios"],
  prontuarios_anotacoes: ["prontuarios_anotacoes", "prontuarios"],
  documentos_identificacao: ["documentos_identificacao", "documentos"],
  contratos_termos: ["contratos_termos", "documentos"],
};

const pathModuleMap: Array<{ prefix: string; moduleId: string }> = [
  { prefix: "/agenda", moduleId: "agenda" },
  { prefix: "/pacientes", moduleId: "pacientes" },
  { prefix: "/prontuarios", moduleId: "prontuarios_any" },
  { prefix: "/evolucao", moduleId: "prontuarios" },
  { prefix: "/fotos", moduleId: "fotos" },
  { prefix: "/documentos", moduleId: "documentos_identificacao" },
  { prefix: "/contratos", moduleId: "contratos_termos" },
  { prefix: "/prescricoes", moduleId: "prescricoes" },
  { prefix: "/exames", moduleId: "exames" },
  { prefix: "/assinaturas", moduleId: "assinaturas" },
  { prefix: "/orcamentos", moduleId: "orcamentos" },
  { prefix: "/financeiro", moduleId: "financeiro" },
  { prefix: "/estoque", moduleId: "estoque" },
  { prefix: "/crm", moduleId: "crm" },
  { prefix: "/relatorios", moduleId: "relatorios" },
  { prefix: "/chat", moduleId: "chat" },
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

  const granted = parsePermissions(user.permissions);

  if (moduleId === "prontuarios_any") {
    return granted.includes("prontuarios") || granted.includes("prontuarios_anotacoes");
  }

  const aliases = LEGACY_MODULE_ALIASES[moduleId] ?? [moduleId];
  return aliases.some((id) => granted.includes(id));
}

export function hasModulePermission(
  user: { role?: string | null; permissions?: string | null } | null | undefined,
  moduleId: string
) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return parsePermissions(user.permissions).includes(moduleId);
}

export function getModuleForPath(path: string) {
  const match = pathModuleMap.find(item => path === item.prefix || path.startsWith(`${item.prefix}/`));
  return match?.moduleId ?? null;
}
