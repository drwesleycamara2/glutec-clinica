import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";

// Pages
import Dashboard from "./pages/Dashboard";
import Agenda from "./pages/Agenda";
import Pacientes from "./pages/Pacientes";
import PacienteDetalhe from "./pages/PacienteDetalhe";
import Prontuarios from "./pages/Prontuarios";
import ProntuarioDetalhe from "./pages/ProntuarioDetalhe";
import Prescricoes from "./pages/Prescricoes";
import Exames from "./pages/Exames";
import Assinaturas from "./pages/Assinaturas";
import Relatorios from "./pages/Relatorios";
import Usuarios from "./pages/Usuarios";
import Auditoria from "./pages/Auditoria";
import Perfil from "./pages/Perfil";

// New Pages
import Empresa from "./pages/Empresa";
import Templates from "./pages/Templates";
import Orcamentos from "./pages/Orcamentos";
import Catalogo from "./pages/Catalogo";
import Estoque from "./pages/Estoque";
import CRM from "./pages/CRM";
import Financeiro from "./pages/Financeiro";
import Chat from "./pages/Chat";
import Fotos from "./pages/Fotos";
import Permissoes from "./pages/Permissoes";

function AppRoutes() {
  return (
    <DashboardLayout>
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

        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
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
