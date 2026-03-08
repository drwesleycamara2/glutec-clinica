import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import { Loader2 } from "lucide-react";

// Lazy-loaded pages (Fase 20: Performance)
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Agenda = lazy(() => import("./pages/Agenda"));
const Pacientes = lazy(() => import("./pages/Pacientes"));
const PacienteDetalhe = lazy(() => import("./pages/PacienteDetalhe"));
const Prontuarios = lazy(() => import("./pages/Prontuarios"));
const ProntuarioDetalhe = lazy(() => import("./pages/ProntuarioDetalhe"));
const Prescricoes = lazy(() => import("./pages/Prescricoes"));
const Exames = lazy(() => import("./pages/Exames"));
const Assinaturas = lazy(() => import("./pages/Assinaturas"));
const Relatorios = lazy(() => import("./pages/Relatorios"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const Auditoria = lazy(() => import("./pages/Auditoria"));
const Perfil = lazy(() => import("./pages/Perfil"));
const Empresa = lazy(() => import("./pages/Empresa"));
const Templates = lazy(() => import("./pages/Templates"));
const Orcamentos = lazy(() => import("./pages/Orcamentos"));
const Catalogo = lazy(() => import("./pages/Catalogo"));
const Estoque = lazy(() => import("./pages/Estoque"));
const CRM = lazy(() => import("./pages/CRM"));
const Financeiro = lazy(() => import("./pages/Financeiro"));
const Chat = lazy(() => import("./pages/Chat"));
const Fotos = lazy(() => import("./pages/Fotos"));
const Permissoes = lazy(() => import("./pages/Permissoes"));
const Documentos = lazy(() => import("./pages/Documentos"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <DashboardLayout>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/agenda" component={Agenda} />
          <Route path="/pacientes" component={Pacientes} />
          <Route path="/pacientes/:id" component={PacienteDetalhe} />
          <Route path="/prontuarios" component={Prontuarios} />
          <Route path="/prontuarios/:id" component={ProntuarioDetalhe} />
          <Route path="/prescricoes" component={Prescricoes} />
          <Route path="/exames" component={Exames} />
          <Route path="/assinaturas" component={Assinaturas} />
          <Route path="/relatorios" component={Relatorios} />
          <Route path="/usuarios" component={Usuarios} />
          <Route path="/auditoria" component={Auditoria} />
          <Route path="/perfil" component={Perfil} />

          {/* Novos Módulos */}
          <Route path="/empresa" component={Empresa} />
          <Route path="/templates" component={Templates} />
          <Route path="/orcamentos" component={Orcamentos} />
          <Route path="/catalogo" component={Catalogo} />
          <Route path="/estoque" component={Estoque} />
          <Route path="/crm" component={CRM} />
          <Route path="/financeiro" component={Financeiro} />
          <Route path="/chat" component={Chat} />
          <Route path="/fotos" component={Fotos} />
          <Route path="/permissoes" component={Permissoes} />
          <Route path="/documentos" component={Documentos} />

          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <AppRoutes />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
