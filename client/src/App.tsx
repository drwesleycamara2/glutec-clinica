import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import React, { useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard.premium";
import Usuarios from "./pages/Usuarios.premium";
import Agenda from "./pages/Agenda";
import Pacientes from "./pages/Pacientes";
import Prontuarios from "./pages/Prontuarios";
import PacienteDetalhe from "./pages/PacienteDetalhe";
import ProntuarioDetalhe from "./pages/ProntuarioDetalhe";
import Configuracoes from "./pages/Configuracoes";
import Templates from "./pages/Templates";
import Prescricoes from "./pages/Prescricoes";
import Exames from "./pages/ExamesClinicos";
import Assinaturas from "./pages/Assinaturas";
import Orcamentos from "./pages/Orcamentos";
import Financeiro from "./pages/Financeiro";
import Estoque from "./pages/Estoque";
import NfseEmissao from "./pages/NfseEmissao";
import ConfiguracoesFiscais from "./pages/ConfiguracoesFiscaisNacional";
import EvolucaoClinica from "./pages/EvolucaoClinica";
import Documentos from "./pages/Documentos";
import Fotos from "./pages/Fotos";
import CRM from "./pages/CRM";
import Relatorios from "./pages/Relatorios";
import RelatorioProntuario from "./pages/RelatorioProntuario";
import PortabilidadeDados from "./pages/PortabilidadeDados";
import Chat from "./pages/Chat";
import Perfil from "./pages/Perfil";
import DashboardLayout from "./components/DashboardLayoutPremium";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AceitarConvite from "./pages/AceitarConvite";
import VerificarDoisFatores from "./pages/VerificarDoisFatores";
import Configurar2FA from "./pages/Configurar2FA";
import TrocarSenha from "./pages/TrocarSenha";
import EnvioMidiasPaciente from "./pages/EnvioMidiasPaciente";
import AnamnesePublica from "./pages/AnamnesePublica";
import { useAuth } from "./_core/hooks/useAuth";
import { canAccessModule, getModuleForPath } from "./lib/access";

const publicPaths = [
  "/login",
  "/esqueci-senha",
  "/redefinir-senha",
  "/aceitar-convite",
  "/verificar-2fa",
  "/envio-midias",
  "/anamnese-publica",
  "/anamnese-preencher",
];
const sessionSetupPaths = ["/configurar-2fa", "/trocar-senha"];

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <div className="text-5xl">🔒</div>
      <h2 className="text-xl font-semibold">Acesso restrito</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        Você não tem permissão para acessar esta página. Entre em contato com o administrador do sistema.
      </p>
    </div>
  );
}

function AdminOnly({ component: Component }: { component: React.ComponentType }) {
  const { user } = useAuth();
  if ((user as any)?.role !== "admin") return <AccessDenied />;
  return <Component />;
}

function AdminOrGerente({ component: Component }: { component: React.ComponentType }) {
  const { user } = useAuth();
  const role = (user as any)?.role;
  if (role !== "admin" && role !== "gerente") return <AccessDenied />;
  return <Component />;
}

function ProtectedRoutes() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/usuarios" component={Usuarios} />
        <Route path="/agenda" component={Agenda} />
        <Route path="/pacientes" component={Pacientes} />
        <Route path="/pacientes/:id" component={PacienteDetalhe} />
        <Route path="/prontuarios" component={Prontuarios} />
        <Route path="/prontuarios/:id" component={ProntuarioDetalhe} />
        <Route path="/evolucao" component={EvolucaoClinica} />
        <Route path="/prescricoes" component={Prescricoes} />
        <Route path="/exames" component={Exames} />
        <Route path="/assinaturas" component={Assinaturas} />
        <Route path="/orcamentos" component={Orcamentos} />
        <Route path="/financeiro">{() => <AdminOrGerente component={Financeiro} />}</Route>
        <Route path="/estoque" component={Estoque} />
        <Route path="/nfse" component={NfseEmissao} />
        <Route path="/fiscal" component={ConfiguracoesFiscais} />
        <Route path="/documentos" component={Documentos} />
        <Route path="/fotos" component={Fotos} />
        <Route path="/crm" component={CRM} />
        <Route path="/relatorios/prontuario">{() => <AdminOnly component={RelatorioProntuario} />}</Route>
        <Route path="/relatorios/portabilidade">{() => <AdminOnly component={PortabilidadeDados} />}</Route>
        <Route path="/relatorios">{() => <AdminOnly component={Relatorios} />}</Route>
        <Route path="/chat" component={Chat} />
        <Route path="/perfil" component={Perfil} />
        <Route path="/configuracoes" component={Configuracoes} />
        <Route path="/templates" component={Templates} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function ProtectedEntry() {
  const { user } = useAuth();
  if (!user || user.mustChangePassword || !user.twoFactorEnabled) return null;
  return <ProtectedRoutes />;
}

function Router() {
  const [location, setLocation] = useLocation();
  const { loading, user } = useAuth();

  useEffect(() => {
    if (loading) return;

    const isPublicPath = publicPaths.some(
      path => location === path || location.startsWith(`${path}?`) || location.startsWith(`${path}/`)
    );
    const isSessionSetupPath = sessionSetupPaths.some(
      path => location === path || location.startsWith(`${path}?`)
    );

    if (!user) {
      if (!isPublicPath) {
        setLocation("/login");
      }
      return;
    }

    if (user.mustChangePassword && location !== "/trocar-senha") {
      setLocation("/trocar-senha");
      return;
    }

    if (!user.twoFactorEnabled && location !== "/configurar-2fa") {
      setLocation("/configurar-2fa");
      return;
    }

    const moduleId = getModuleForPath(location);
    if (moduleId && !canAccessModule(user, moduleId)) {
      setLocation("/");
      return;
    }

    if ((isPublicPath || isSessionSetupPath) && location !== "/configurar-2fa" && location !== "/trocar-senha") {
      setLocation("/");
    }
  }, [loading, location, setLocation, user]);

  if (loading) {
    return <div className="min-h-screen bg-[#F7F4EE]" />;
  }

  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/esqueci-senha" component={ForgotPassword} />
      <Route path="/redefinir-senha/:token" component={ResetPassword} />
      <Route path="/aceitar-convite" component={AceitarConvite} />
      <Route path="/verificar-2fa" component={VerificarDoisFatores} />
      <Route path="/envio-midias/:token" component={EnvioMidiasPaciente} />
      <Route path="/anamnese-preencher/:token" component={AnamnesePublica} />
      <Route path="/configurar-2fa" component={Configurar2FA} />
      <Route path="/trocar-senha" component={TrocarSenha} />
      <Route component={ProtectedEntry} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
