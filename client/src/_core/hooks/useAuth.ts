import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo, useState } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

const MASTER_ADMIN_EMAIL = "contato@drwesleycamara.com.br";
const ACCESS_PREVIEW_KEY = "glutec:access-preview";
const ACCESS_PREVIEW_CHANGED_EVENT = "glutec:access-preview-changed";

const previewPermissions = {
  gerente: [
    "agenda",
    "pacientes",
    "prontuarios",
    "prontuarios_anotacoes",
    "fotos",
    "documentos_identificacao",
    "contratos_termos",
    "prescricoes",
    "exames",
    "orcamentos",
    "financeiro",
    "funcionarios",
    "estoque",
    "crm",
    "relatorios",
    "chat",
    "templates",
  ],
  secretaria: [
    "agenda",
    "pacientes",
    "prontuarios_anotacoes",
    "documentos_identificacao",
    "contratos_termos",
    "orcamentos",
    "estoque",
    "crm",
    "chat",
  ],
  enfermeiro: [
    "agenda",
    "pacientes",
    "prontuarios",
    "prontuarios_anotacoes",
    "fotos",
    "documentos_identificacao",
    "prescricoes",
    "exames",
    "estoque",
    "chat",
  ],
  tecnico_enfermagem: [
    "agenda",
    "pacientes",
    "prontuarios_anotacoes",
    "fotos",
    "documentos_identificacao",
    "estoque",
    "chat",
  ],
  massoterapeuta: [
    "agenda",
    "pacientes",
    "prontuarios_anotacoes",
    "fotos",
    "documentos_identificacao",
    "chat",
  ],
} as const;

export const ACCESS_PREVIEW_PROFILES = [
  {
    id: "gerente",
    label: "Gerente",
    role: "gerente",
    profession: "Gerente",
    permissions: previewPermissions.gerente,
  },
  {
    id: "secretaria",
    label: "Secretária(o)",
    role: "recepcionista",
    profession: "Secretária(o)",
    permissions: previewPermissions.secretaria,
  },
  {
    id: "enfermeiro",
    label: "Enfermeira(o)",
    role: "enfermeiro",
    profession: "Enfermeira(o)",
    permissions: previewPermissions.enfermeiro,
  },
  {
    id: "tecnico_enfermagem",
    label: "Técnica(o) de enfermagem",
    role: "enfermeiro",
    profession: "Técnica(o) de enfermagem",
    permissions: previewPermissions.tecnico_enfermagem,
  },
  {
    id: "massoterapeuta",
    label: "Massoterapeuta",
    role: "recepcionista",
    profession: "Massoterapeuta",
    permissions: previewPermissions.massoterapeuta,
  },
] as const;

type AccessPreviewProfile = (typeof ACCESS_PREVIEW_PROFILES)[number];

function readAccessPreviewId() {
  if (typeof window === "undefined") return "";
  const stored = window.localStorage.getItem(ACCESS_PREVIEW_KEY) ?? "";
  return ACCESS_PREVIEW_PROFILES.some((profile) => profile.id === stored) ? stored : "";
}

function isMasterAdmin(user: any) {
  return (
    user?.role === "admin" &&
    String(user?.email ?? "").trim().toLowerCase() === MASTER_ADMIN_EMAIL
  );
}

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const utils = trpc.useUtils();
  const [accessPreviewId, setAccessPreviewIdState] = useState(readAccessPreviewId);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(ACCESS_PREVIEW_KEY);
        window.dispatchEvent(new Event(ACCESS_PREVIEW_CHANGED_EVENT));
      }
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  useEffect(() => {
    const syncPreview = () => setAccessPreviewIdState(readAccessPreviewId());
    window.addEventListener("storage", syncPreview);
    window.addEventListener(ACCESS_PREVIEW_CHANGED_EVENT, syncPreview);
    return () => {
      window.removeEventListener("storage", syncPreview);
      window.removeEventListener(ACCESS_PREVIEW_CHANGED_EVENT, syncPreview);
    };
  }, []);

  const accessPreview = useMemo(
    () => ACCESS_PREVIEW_PROFILES.find((profile) => profile.id === accessPreviewId) ?? null,
    [accessPreviewId],
  );

  const setAccessPreview = useCallback((profileId: string) => {
    if (typeof window === "undefined") return;
    const next = ACCESS_PREVIEW_PROFILES.some((profile) => profile.id === profileId) ? profileId : "";
    if (next) window.localStorage.setItem(ACCESS_PREVIEW_KEY, next);
    else window.localStorage.removeItem(ACCESS_PREVIEW_KEY);
    window.dispatchEvent(new Event(ACCESS_PREVIEW_CHANGED_EVENT));
  }, []);

  const clearAccessPreview = useCallback(() => setAccessPreview(""), [setAccessPreview]);

  const state = useMemo(() => {
    const actualUser = meQuery.data ?? null;
    const canUseAccessPreview = isMasterAdmin(actualUser);
    const effectiveProfile: AccessPreviewProfile | null =
      canUseAccessPreview && accessPreview ? accessPreview : null;
    const effectiveUser =
      actualUser && effectiveProfile
        ? {
            ...actualUser,
            role: effectiveProfile.role,
            profession: effectiveProfile.profession,
            permissions: JSON.stringify(effectiveProfile.permissions),
            accessPreviewRole: effectiveProfile.id,
            accessPreviewLabel: effectiveProfile.label,
            isAccessPreview: true,
          }
        : actualUser;
    localStorage.setItem(
      "manus-runtime-user-info",
      JSON.stringify(effectiveUser)
    );
    return {
      user: effectiveUser,
      actualUser,
      accessPreview: effectiveProfile,
      canUseAccessPreview,
      isAccessPreviewActive: Boolean(effectiveProfile),
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(actualUser),
    };
  }, [
    accessPreview,
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
    setAccessPreview,
    clearAccessPreview,
  };
}
