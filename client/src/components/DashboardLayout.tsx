import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Activity,
  BarChart3,
  CalendarDays,
  ClipboardList,
  FileSignature,
  FileText,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  PanelLeft,
  Settings,
  Stethoscope,
  Users,
  UserCog,
  ShieldCheck,
  Receipt,
  Package,
  CreditCard,
  FileStack,
  Building2,
  Camera,
  Archive,
  HeartPulse,
  MessageSquare,
  Gauge,
  FileText as DocumentIcon,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";

type MenuItem = {
  icon: React.ElementType;
  label: string;
  path: string;
  roles?: string[];
};

type MenuGroup = {
  label: string;
  items: MenuItem[];
};

const menuGroups: MenuGroup[] = [
  {
    label: "Principal",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/" },
      { icon: CalendarDays, label: "Agenda", path: "/agenda" },
    ],
  },
  {
    label: "Pacientes",
    items: [
      { icon: Users, label: "Pacientes", path: "/pacientes" },
      { icon: ClipboardList, label: "Prontuários", path: "/prontuarios", roles: ["admin", "medico", "enfermeiro"] },
      { icon: Camera, label: "Fotos", path: "/fotos", roles: ["admin", "medico", "enfermeiro"] },
    ],
  },
  {
    label: "Documentos",
    items: [
      { icon: FileText, label: "Documentos (Texto Livre)", path: "/documentos", roles: ["admin", "medico"] },
      { icon: FileText, label: "Prescrições", path: "/prescricoes", roles: ["admin", "medico"] },
      { icon: FlaskConical, label: "Exames", path: "/exames", roles: ["admin", "medico"] },
      { icon: FileSignature, label: "Assinaturas", path: "/assinaturas", roles: ["admin", "medico"] },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { icon: Receipt, label: "Orçamentos", path: "/orcamentos", roles: ["admin", "medico", "recepcionista"] },
      { icon: Gauge, label: "Financeiro", path: "/financeiro", roles: ["admin"] },
    ],
  },
  {
    label: "Operacional",
    items: [
      { icon: Archive, label: "Estoque", path: "/estoque", roles: ["admin", "enfermeiro"] },
      { icon: HeartPulse, label: "CRM", path: "/crm", roles: ["admin", "medico", "recepcionista"] },
      { icon: MessageSquare, label: "Chat", path: "/chat" },
    ],
  },
  {
    label: "Admin",
    items: [
      { icon: Building2, label: "Empresa", path: "/empresa", roles: ["admin"] },
      { icon: FileStack, label: "Templates", path: "/templates", roles: ["admin", "medico"] },
      { icon: Package, label: "Catálogo", path: "/catalogo", roles: ["admin"] },
      { icon: BarChart3, label: "Relatórios", path: "/relatorios", roles: ["admin"] },
      { icon: UserCog, label: "Usuários", path: "/usuarios", roles: ["admin"] },
      { icon: ShieldCheck, label: "Auditoria", path: "/auditoria", roles: ["admin"] },
    ],
  },
];

const SIDEBAR_WIDTH = 240;

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  medico: "Médico",
  recepcionista: "Recepcionista",
  enfermeiro: "Enfermeiro",
  user: "Usuário",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-primary/20 text-primary",
  medico: "bg-blue-500/20 text-blue-300",
  recepcionista: "bg-green-500/20 text-green-300",
  enfermeiro: "bg-teal-500/20 text-teal-300",
  user: "bg-gray-500/20 text-gray-300",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-4">
            <div className="h-24 w-24 rounded-2xl bg-white p-2 flex items-center justify-center shadow-[0_4px_20px_rgba(212,168,83,0.4)] border border-primary/20">
              <img src="/assets/logo.jpg" alt="Clínica Glutée" className="h-full w-full object-contain" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-center text-primary uppercase tracking-widest">Glutec</h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm font-medium">
              Sistema de Gestão Clínica Glutée
            </p>
          </div>
          <Button
            onClick={() => { window.location.href = getLoginUrl(); }}
            size="lg"
            variant="premium"
            className="w-full py-7 text-lg uppercase tracking-widest"
          >
            Entrar no Sistema
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": `${SIDEBAR_WIDTH}px` } as CSSProperties}>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const isMobile = useIsMobile();

  const userRole = (user as any)?.role ?? "user";

  const visibleGroups = menuGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.roles || item.roles.includes(userRole)
      ),
    }))
    .filter((group) => group.items.length > 0);

  const activeItem = visibleGroups
    .flatMap((g) => g.items)
    .find((item) => item.path === location);

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border/50">
        {/* Header */}
        <SidebarHeader className="h-14 justify-center border-b border-sidebar-border/50 px-3">
          <div className="flex items-center gap-2.5 w-full overflow-hidden">
            <button
              onClick={toggleSidebar}
              className="h-8 w-8 flex items-center justify-center hover:bg-sidebar-accent rounded-md transition-colors focus:outline-none shrink-0"
              aria-label="Toggle navigation"
            >
              <PanelLeft className="h-4 w-4 text-sidebar-foreground/60" />
            </button>
            {!isCollapsed && (
              <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                <div className="h-8 w-8 rounded-md bg-white p-0.5 flex items-center justify-center shrink-0 shadow-sm border border-primary/10">
                  <img src="/assets/logo.jpg" alt="Logo" className="h-full w-full object-contain" />
                </div>
                <div className="min-w-0 overflow-hidden">
                  <p className="text-sm font-bold text-sidebar-foreground truncate leading-tight uppercase tracking-wider">Glutec</p>
                  <p className="text-[10px] text-sidebar-foreground/40 truncate leading-tight">Clínica Glutée</p>
                </div>
              </div>
            )}
          </div>
        </SidebarHeader>

        {/* Navigation */}
        <SidebarContent className="overflow-y-auto overflow-x-hidden py-1.5">
          {visibleGroups.map((group) => (
            <SidebarGroup key={group.label} className="px-2 py-0.5">
              {!isCollapsed && (
                <SidebarGroupLabel className="text-[10px] font-semibold text-sidebar-foreground/30 uppercase tracking-widest px-2 mb-0.5 h-6 leading-6">
                  {group.label}
                </SidebarGroupLabel>
              )}
              <SidebarMenu className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = location === item.path || (item.path !== "/" && location.startsWith(item.path));
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => setLocation(item.path)}
                        tooltip={item.label}
                        className={`h-8 transition-all rounded-md text-[13px] font-normal overflow-hidden ${
                          isActive
                            ? "bg-primary/15 text-primary hover:bg-primary/25 font-medium"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        }`}
                      >
                        <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : ""}`} />
                        <span className="truncate">{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>

        {/* Footer */}
        <SidebarFooter className="p-2 border-t border-sidebar-border/50">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-sidebar-accent transition-colors w-full text-left focus:outline-none overflow-hidden">
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarFallback className="text-[10px] font-bold bg-primary text-white">
                    {user?.name?.charAt(0).toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
                {!isCollapsed && (
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <p className="text-xs font-medium text-sidebar-foreground truncate leading-tight">
                      {user?.name ?? "Usuário"}
                    </p>
                    <p className="text-[10px] text-sidebar-foreground/40 truncate leading-tight">
                      {ROLE_LABELS[userRole] ?? "Usuário"}
                    </p>
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <div className="px-3 py-2">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setLocation("/perfil")} className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                <span>Meu Perfil</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sair</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        {/* Top header bar */}
        <div className="flex border-b h-14 items-center justify-between bg-background/95 px-4 md:px-6 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
          <div className="flex items-center gap-3">
            {isMobile && <SidebarTrigger className="h-8 w-8 rounded-md" />}
              <div className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4 text-primary" />
              <span className="font-medium text-foreground">{activeItem?.label ?? "Dashboard"}</span>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] font-normal border-primary/30 text-primary">
            {ROLE_LABELS[userRole] ?? "Usuário"}
          </Badge>
        </div>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </>
  );
}
