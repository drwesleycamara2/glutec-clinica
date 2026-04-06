import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  FileText,
  Files,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  Package,
  Receipt,
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
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "./ui/button";
import { canAccessModule } from "@/lib/access";

type MenuItem = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
  adminOnly?: boolean;
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
      { icon: Users, label: "Pacientes", path: "/pacientes", moduleId: "pacientes" },
      { icon: ClipboardList, label: "Prontuarios", path: "/prontuarios", moduleId: "prontuarios" },
      { icon: Camera, label: "Fotos", path: "/fotos", moduleId: "fotos" },
      { icon: Files, label: "Documentos", path: "/documentos", moduleId: "documentos" },
      { icon: FileText, label: "Prescricoes", path: "/prescricoes", moduleId: "prescricoes" },
      { icon: Stethoscope, label: "Exames", path: "/exames", moduleId: "exames" },
      { icon: ShieldCheck, label: "Assinaturas", path: "/assinaturas", moduleId: "assinaturas" },
      { icon: Receipt, label: "Orcamentos", path: "/orcamentos", moduleId: "orcamentos" },
    ],
  },
  {
    label: "Operacional",
    items: [
      { icon: Wallet, label: "Fiscal", path: "/fiscal", adminOnly: true, moduleId: "fiscal" },
      { icon: Wallet, label: "Financeiro", path: "/financeiro", moduleId: "financeiro" },
      { icon: Package, label: "Estoque", path: "/estoque", moduleId: "estoque" },
      { icon: MessageSquareText, label: "CRM", path: "/crm", moduleId: "crm" },
      { icon: BarChart3, label: "Relatorios", path: "/relatorios", moduleId: "relatorios" },
      { icon: MessageSquareText, label: "Chat", path: "/chat", moduleId: "chat" },
      { icon: UserCircle2, label: "Perfil", path: "/perfil", moduleId: "perfil" },
      { icon: ShieldCheck, label: "Usuarios", path: "/usuarios", adminOnly: true, moduleId: "usuarios" },
      { icon: Settings, label: "Configuracoes", path: "/configuracoes", moduleId: "configuracoes" },
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
            Glutec Sistema | Wesley Câmara
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
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const { isMobile } = useIsMobile();
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isCollapsed = state === "collapsed";

  const sections = useMemo(
    () =>
      menuSections.map(section => ({
        ...section,
        items: section.items.filter(item => {
          if (item.adminOnly && user?.role !== "admin") return false;
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

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="app-sidebar border-r-0" disableTransition={isResizing}>
          <SidebarHeader className="px-4 pb-3 pt-4">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSidebar}
                className="app-brand-mark flex h-12 w-12 items-center justify-center p-2.5 transition-transform hover:-translate-y-0.5"
                aria-label="Alternar navegacao"
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
                          onClick={() => setLocation(item.path)}
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

          <SidebarFooter className="p-3">
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
                      {user?.name || "Equipe Glutec"}
                    </p>
                    <p className="mt-1 truncate text-[11px] uppercase tracking-[0.2em] text-text-tertiary">
                      {user?.role === "admin" ? "Administrador" : "Equipe clinica"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setLocation("/perfil")} className="cursor-pointer">
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
              {activeMenuItem?.label ?? "Glutec"}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-text-tertiary">
                Plataforma clinica premium
              </p>
              <p className="truncate text-lg font-semibold text-text-primary">
                Ambiente de atendimento e gestão centralizados
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="rounded-xl px-4" onClick={() => setLocation("/pacientes")}>
              <Users className="h-4 w-4" />
              Novo Paciente
            </Button>
            <Button variant="premium" className="rounded-xl px-4" onClick={() => setLocation("/agenda")}>
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
                <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-text-tertiary">Glutec</p>
                <p className="text-sm font-medium text-text-primary">{activeMenuItem?.label ?? "Menu"}</p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        )}

        <main className="app-main-content flex-1 px-4 pb-6 pt-4 lg:px-6 lg:pb-8 lg:pt-6">{children}</main>
      </SidebarInset>
    </>
  );
}
