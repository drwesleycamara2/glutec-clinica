import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import {
  BarChart3,
  CalendarDays,
  Camera,
  ClipboardList,
  Clock,
  FileStack,
  FileText,
  Files,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Package,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Stethoscope,
  UserCircle2,
  Users,
  Wallet,
} from "lucide-react";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { SimplesNacionalReminder } from "./SimplesNacionalReminder";
import { ThemeToggle } from "./ThemeToggle";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "./ui/button";
import { canAccessModule } from "@/lib/access";
import {
  CLINICAL_DRAFT_AUTOSAVE_EVENT,
  CLINICAL_DRAFT_CHANGED_EVENT,
  CLINICAL_LOCK_RETURN_TO_KEY,
  readClinicalDraftMetas,
  type ClinicalDraftMeta,
} from "@/lib/clinicalSession";

type MenuItem = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
  adminOnly?: boolean;
  adminOrGerente?: boolean;
  moduleId?: string;
};

type MenuSection = {
  label: string;
  items: MenuItem[];
};

const menuSections: MenuSection[] = [
  {
    label: "Principal",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/" },
      { icon: CalendarDays, label: "Agenda", path: "/agenda", moduleId: "agenda" },
      { icon: Clock, label: "Sala de Espera", path: "/sala-espera", moduleId: "agenda" },
      { icon: Users, label: "Pacientes", path: "/pacientes", moduleId: "pacientes" },
      { icon: ClipboardList, label: "Prontuários", path: "/prontuarios", moduleId: "prontuarios_any" },
      { icon: Camera, label: "Imagens", path: "/fotos", moduleId: "fotos" },
      { icon: Files, label: "Documentos", path: "/documentos", moduleId: "documentos_identificacao" },
      { icon: ScrollText, label: "Contratos", path: "/contratos", moduleId: "contratos_termos" },
      { icon: FileStack, label: "Modelos", path: "/templates", moduleId: "templates" },
      { icon: FileText, label: "Prescrições", path: "/prescricoes", moduleId: "prescricoes" },
      { icon: Stethoscope, label: "Exames", path: "/exames", moduleId: "exames" },
      { icon: ShieldCheck, label: "Assinaturas", path: "/assinaturas", moduleId: "assinaturas" },
      { icon: Receipt, label: "Orçamentos", path: "/orcamentos", moduleId: "orcamentos" },
    ],
  },
  {
    label: "Operacional",
    items: [
      { icon: Wallet, label: "Fiscal", path: "/fiscal", adminOnly: true, moduleId: "fiscal" },
      { icon: Wallet, label: "Financeiro", path: "/financeiro", adminOrGerente: true, moduleId: "financeiro" },
      { icon: Package, label: "Estoque", path: "/estoque", moduleId: "estoque" },
      { icon: MessageSquare, label: "CRM", path: "/crm", moduleId: "crm" },
      { icon: BarChart3, label: "Relatórios", path: "/relatorios", adminOnly: true, moduleId: "relatorios" },
      { icon: ShieldCheck, label: "Auditoria", path: "/auditoria", adminOnly: true },
      { icon: MessageSquare, label: "Chat", path: "/chat", moduleId: "chat" },
      { icon: UserCircle2, label: "Perfil", path: "/perfil" },
      { icon: ShieldCheck, label: "Usuários", path: "/usuarios", adminOnly: true, moduleId: "usuarios" },
      { icon: Settings, label: "Configurações", path: "/configuracoes" },
    ],
  },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width-premium";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 216;
const MAX_WIDTH = 420;

function matchesPath(location: string, path: string) {
  if (path === "/") return location === path;
  return location === path || location.startsWith(`${path}/`);
}

function getInitials(name?: string | null) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "GC";
  return parts
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDraftUpdatedAt(updatedAt: string) {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return "Atualizado há pouco";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DashboardLayoutPremium({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(241,215,145,0.2),transparent_22%),linear-gradient(135deg,rgba(255,255,255,0.9),rgba(247,243,236,0.82))] dark:bg-[radial-gradient(circle_at_top_right,rgba(201,165,91,0.18),transparent_22%),linear-gradient(135deg,rgba(9,9,9,0.95),rgba(18,16,14,0.92))]" />
        <div className="relative flex w-full max-w-xl flex-col items-center gap-8 rounded-[2rem] border border-gold/25 bg-surface/75 px-10 py-12 text-center shadow-[0_40px_100px_rgba(90,63,18,0.16)] backdrop-blur-2xl dark:bg-surface/70">
          <div className="app-brand-mark flex h-24 w-24 items-center justify-center p-4">
            <img src="/logo-glutee-white.png" alt="Clínica Glutée" className="h-full w-full object-contain" />
          </div>
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-text-tertiary">
              Clínica Glutée
            </p>
            <h1 className="text-4xl font-light tracking-tight text-text-primary">
              Plataforma premium para atendimento, gestão e prontuário.
            </h1>
            <p className="mx-auto max-w-md text-sm leading-7 text-text-secondary">
              Entre para continuar a migração dos legados, revisar a emissão fiscal e operar a clínica com a nova identidade visual.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = "/login";
            }}
            size="lg"
            variant="premium"
            className="h-14 w-full max-w-sm rounded-2xl text-base font-semibold"
          >
            Entrar no sistema
          </Button>
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-text-muted">
            Glutec System | Wesley Câmara
          </p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      className="app-shell"
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutPremiumContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutPremiumContent>
    </SidebarProvider>
  );
}

function DashboardLayoutPremiumContent({
  children,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
}) {
  const { user, logout } = useAuth();
  const { setStorageScope } = useTheme();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar, isMobile } = useSidebar();
  const [isResizing, setIsResizing] = useState(false);
  const [openClinicalDrafts, setOpenClinicalDrafts] = useState<ClinicalDraftMeta[]>(() => readClinicalDraftMetas());
  const [navigationPromptOpen, setNavigationPromptOpen] = useState(false);
  const [pendingNavigationPath, setPendingNavigationPath] = useState<string | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isCollapsed = state === "collapsed";
  const previousLocationRef = useRef(location);
  const revertingNavigationRef = useRef(false);
  const inactivityTimeoutRef = useRef<number | null>(null);
  const activeClinicalDraft = useMemo(
    () => openClinicalDrafts.find((draft) => draft.path.split("#")[0] === location) ?? openClinicalDrafts[0] ?? null,
    [location, openClinicalDrafts]
  );
  const activeDraftBasePath = activeClinicalDraft?.path.split("#")[0] ?? null;
  const isSeniorAdmin =
    user?.role === "admin" &&
    String(user?.email ?? "").trim().toLowerCase() === "contato@drwesleycamara.com.br";
  const themeScope = user?.id ? `user-${user.id}` : user?.email ? String(user.email).trim().toLowerCase() : null;

  useEffect(() => {
    setStorageScope?.(themeScope);
    return () => setStorageScope?.(null);
  }, [setStorageScope, themeScope]);

  const sections = useMemo(
    () =>
      menuSections.map(section => ({
        ...section,
        items: section.items.filter(item => {
          if (item.adminOnly && user?.role !== "admin") return false;
          if (item.adminOrGerente && user?.role !== "admin" && user?.role !== "gerente" && !canAccessModule(user, item.moduleId)) return false;
          return canAccessModule(user, item.moduleId);
        }),
      })),
    [user]
  );

  const activeMenuItem = useMemo(
    () => sections.flatMap(section => section.items).find(item => matchesPath(location, item.path)),
    [location, sections]
  );

  useEffect(() => {
    const syncDraft = () => {
      setOpenClinicalDrafts(readClinicalDraftMetas());
    };

    syncDraft();
    window.addEventListener(CLINICAL_DRAFT_CHANGED_EVENT, syncDraft as EventListener);
    window.addEventListener("storage", syncDraft);
    return () => {
      window.removeEventListener(CLINICAL_DRAFT_CHANGED_EVENT, syncDraft as EventListener);
      window.removeEventListener("storage", syncDraft);
    };
  }, []);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizing) return;
      let nextWidth = event.clientX;
      if (nextWidth < MIN_WIDTH) nextWidth = MIN_WIDTH;
      if (nextWidth > MAX_WIDTH) nextWidth = MAX_WIDTH;
      setSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  useEffect(() => {
    if (!user) return;

    const handleTimeout = async () => {
      if (activeClinicalDraft) {
        window.dispatchEvent(new CustomEvent(CLINICAL_DRAFT_AUTOSAVE_EVENT));
      }

      window.localStorage.setItem(CLINICAL_LOCK_RETURN_TO_KEY, `${window.location.pathname}${window.location.search}${window.location.hash}`);
      await logout();
      setLocation(`/login?locked=1&returnTo=${encodeURIComponent(`${window.location.pathname}${window.location.search}${window.location.hash}`)}`);
    };

    const resetTimer = () => {
      if (inactivityTimeoutRef.current) {
        window.clearTimeout(inactivityTimeoutRef.current);
      }
      inactivityTimeoutRef.current = window.setTimeout(() => {
        void handleTimeout();
      }, 60 * 60 * 1000);
    };

    const events: Array<keyof WindowEventMap> = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      if (inactivityTimeoutRef.current) {
        window.clearTimeout(inactivityTimeoutRef.current);
      }
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
    };
  }, [activeClinicalDraft, location, logout, setLocation, user]);

  useEffect(() => {
    if (!activeClinicalDraft) {
      previousLocationRef.current = location;
      return;
    }

    const previousLocation = previousLocationRef.current;
    if (
      previousLocation === activeDraftBasePath &&
      location !== previousLocation &&
      location !== activeDraftBasePath &&
      !revertingNavigationRef.current
    ) {
      setPendingNavigationPath(location);
      setNavigationPromptOpen(true);
    }

    previousLocationRef.current = location;
    if (revertingNavigationRef.current) {
      revertingNavigationRef.current = false;
    }
  }, [activeClinicalDraft, location]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!activeClinicalDraft || location !== activeDraftBasePath) return;
      window.dispatchEvent(new CustomEvent(CLINICAL_DRAFT_AUTOSAVE_EVENT));
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [activeClinicalDraft, location]);

  const navigateWithDraftProtection = (nextPath: string) => {
    if (activeClinicalDraft && location === activeDraftBasePath && nextPath !== activeClinicalDraft.path) {
      window.dispatchEvent(new CustomEvent(CLINICAL_DRAFT_AUTOSAVE_EVENT));
      setPendingNavigationPath(nextPath);
      setNavigationPromptOpen(true);
      return;
    }

    setLocation(nextPath);
  };

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="app-sidebar border-r-0" disableTransition={isResizing}>
          <SidebarHeader className="px-4 pb-3 pt-4">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSidebar}
                className="app-brand-mark flex h-12 w-12 items-center justify-center p-2.5 transition-transform hover:-translate-y-0.5"
                aria-label="Alternar navegação"
              >
                <img src="/logo-glutee-white.png" alt="Clínica Glutée" className="h-full w-full object-contain" />
              </button>
              {!isCollapsed ? (
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold tracking-[0.18em] text-text-primary">GLUTEC</p>
                  <p className="truncate text-[11px] tracking-[0.2em] text-text-tertiary">
                    Clínica Glutée
                  </p>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="app-sidebar-content gap-0 px-3 pb-4">
            {sections.map(section => (
              <div key={section.label} className="app-sidebar-section mb-4 last:mb-0">
                {!isCollapsed ? <div className="app-sidebar-section-label">{section.label}</div> : null}
                <SidebarMenu className="gap-1">
                  {section.items.map(item => {
                    const isActive = matchesPath(location, item.path);
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => navigateWithDraftProtection(item.path)}
                          tooltip={item.label}
                          className="app-sidebar-button px-3 text-text-secondary"
                        >
                          <item.icon className={`h-4 w-4 ${isActive ? "text-accent" : ""}`} />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </div>
            ))}
          </SidebarContent>

          <SidebarFooter className="space-y-3 p-3">
            {!isCollapsed ? (
              <div className="rounded-2xl border border-gold/15 bg-background/50 px-3 py-2 text-[11px] uppercase tracking-[0.22em] text-text-tertiary">
                Versão 1.0
              </div>
            ) : null}
            <Button
              variant="outline"
              className={`rounded-2xl border-gold/20 ${isCollapsed ? "h-11 w-11 px-0" : "w-full justify-start"}`}
              onClick={logout}
              title="Sair do sistema"
            >
              <LogOut className={`h-4 w-4 ${isCollapsed ? "" : "mr-2"}`} />
              {!isCollapsed ? "Sair do sistema" : null}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="app-sidebar-user flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-accent/10 group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-10 w-10 shrink-0 border border-gold/20">
                    <AvatarFallback className="bg-accent/10 text-xs font-semibold text-accent">
                      {getInitials(user?.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {user?.name || "Equipe Glutec System"}
                    </p>
                    <p className="mt-1 truncate text-[11px] uppercase tracking-[0.2em] text-text-tertiary">
                      {user?.role === "admin" ? "Administrador" : "Equipe clínica"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => navigateWithDraftProtection("/perfil")} className="cursor-pointer">
                  <UserCircle2 className="mr-2 h-4 w-4" />
                  <span>Meu perfil</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        <div
          className={`absolute right-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-gold/30 ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset className="app-main-shell">
        <header className="app-main-header hidden h-20 items-center justify-between px-6 md:flex">
          <div className="flex min-w-0 items-center gap-4">
            <div className="app-hero-chip rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-text-tertiary">
              {activeMenuItem?.label ?? "Glutec System"}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-text-tertiary">
                Clínica Premium
              </p>
              <p className="truncate text-lg font-semibold text-text-primary">
                Ambiente de atendimento e gestão centralizado
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-gold/20 bg-background/80 text-[#8f2f2f] shadow-[0_10px_24px_rgba(0,0,0,0.08)] transition-all hover:-translate-y-0.5 hover:border-[#d65a5a]/45 hover:text-[#c93030]"
                  aria-label={`Prontuários abertos (${openClinicalDrafts.length})`}
                >
                  <Stethoscope className="h-5 w-5" />
                  {openClinicalDrafts.length > 0 ? (
                    <span className="absolute -right-1 -top-1 flex min-w-[1.25rem] items-center justify-center rounded-full bg-[#d63b3b] px-1.5 py-0.5 text-[10px] font-bold text-white shadow-[0_0_0_4px_rgba(255,255,255,0.85)] animate-pulse dark:shadow-[0_0_0_4px_rgba(8,8,8,0.88)]">
                      {openClinicalDrafts.length}
                    </span>
                  ) : null}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[26rem] rounded-2xl border-gold/20 bg-background/95 p-2">
                <DropdownMenuLabel className="px-3 py-2 text-sm font-semibold text-text-primary">
                  Prontuários abertos
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {openClinicalDrafts.length === 0 ? (
                  <div className="px-3 py-5 text-sm text-text-secondary">
                    Nenhum prontuário está em aberto no momento.
                  </div>
                ) : (
                  openClinicalDrafts.map((draft) => (
                    <DropdownMenuItem
                      key={draft.patientId}
                      onClick={() => navigateWithDraftProtection(draft.path)}
                      className="flex items-start justify-between gap-4 rounded-xl px-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-text-primary">{draft.patientName}</p>
                        <p className="mt-1 text-xs text-text-secondary">
                          {draft.status === "em_andamento" ? "Atendimento em andamento" : "Rascunho salvo"}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] text-text-tertiary">
                        {formatDraftUpdatedAt(draft.updatedAt)}
                      </span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" className="rounded-xl px-4" onClick={() => navigateWithDraftProtection("/pacientes")}>
              <Users className="h-4 w-4" />
              Novo Paciente
            </Button>
            <Button variant="premium" className="rounded-xl px-4" onClick={() => navigateWithDraftProtection("/prontuarios?novo=1")}>
              <CalendarDays className="h-4 w-4" />
              Nova Consulta
            </Button>
            <ThemeToggle />
          </div>
        </header>

        {isMobile && (
          <div className="app-main-header sticky top-0 z-40 flex h-16 items-center justify-between px-3 md:hidden">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-10 w-10 rounded-xl border border-gold/20 bg-white/40 dark:bg-white/5" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-text-tertiary">Glutec System</p>
                <p className="text-sm font-medium text-text-primary">{activeMenuItem?.label ?? "Menu"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-gold/20 bg-background/80 text-[#8f2f2f]"
                    aria-label={`Prontuários abertos (${openClinicalDrafts.length})`}
                  >
                    <Stethoscope className="h-4 w-4" />
                    {openClinicalDrafts.length > 0 ? (
                      <span className="absolute -right-1 -top-1 flex min-w-[1rem] items-center justify-center rounded-full bg-[#d63b3b] px-1 py-0.5 text-[9px] font-bold text-white animate-pulse">
                        {openClinicalDrafts.length}
                      </span>
                    ) : null}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[22rem] rounded-2xl border-gold/20 bg-background/95 p-2">
                  <DropdownMenuLabel className="px-3 py-2 text-sm font-semibold text-text-primary">
                    Prontuários abertos
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {openClinicalDrafts.length === 0 ? (
                    <div className="px-3 py-5 text-sm text-text-secondary">
                      Nenhum prontuário está em aberto no momento.
                    </div>
                  ) : (
                    openClinicalDrafts.map((draft) => (
                      <DropdownMenuItem
                        key={`mobile-${draft.patientId}`}
                        onClick={() => navigateWithDraftProtection(draft.path)}
                        className="flex items-start justify-between gap-3 rounded-xl px-3 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-text-primary">{draft.patientName}</p>
                          <p className="mt-1 text-xs text-text-secondary">
                            {draft.status === "em_andamento" ? "Atendimento em andamento" : "Rascunho salvo"}
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] text-text-tertiary">
                          {formatDraftUpdatedAt(draft.updatedAt)}
                        </span>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <ThemeToggle />
            </div>
          </div>
        )}

        <main className="app-main-content flex-1 px-4 pb-6 pt-4 lg:px-6 lg:pb-8 lg:pt-6">
          {activeClinicalDraft ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#C9A55B]/25 bg-[linear-gradient(135deg,rgba(201,165,91,0.12),rgba(255,255,255,0.04))] px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <div>
                <p className="font-semibold text-text-primary">Há um prontuário em aberto e não concluído.</p>
                <p className="text-xs text-text-secondary">
                  Paciente: {activeClinicalDraft.patientName} • Atualizado em {new Date(activeClinicalDraft.updatedAt).toLocaleString("pt-BR")}
                </p>
              </div>
              <Button variant="outline" className="rounded-xl" onClick={() => navigateWithDraftProtection(activeClinicalDraft.path)}>
                Voltar ao prontuário em aberto
              </Button>
            </div>
          ) : null}
          {isSeniorAdmin ? <SimplesNacionalReminder /> : null}
          {children}
        </main>
      </SidebarInset>

      <AlertDialog open={navigationPromptOpen} onOpenChange={setNavigationPromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Há um atendimento em andamento</AlertDialogTitle>
            <AlertDialogDescription>
              Vamos salvar provisoriamente o prontuário aberto antes de trocar de tela. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setNavigationPromptOpen(false);
                setPendingNavigationPath(null);
                if (activeClinicalDraft) {
                  revertingNavigationRef.current = true;
                  setLocation(activeClinicalDraft.path);
                }
              }}
            >
              Permanecer no atendimento
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setNavigationPromptOpen(false);
                const nextPath = pendingNavigationPath;
                setPendingNavigationPath(null);
                if (nextPath) {
                  revertingNavigationRef.current = true;
                  setLocation(nextPath);
                }
              }}
            >
              Salvar e continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

