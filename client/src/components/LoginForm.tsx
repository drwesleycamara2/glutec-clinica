import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { trpc } from "@/utils/trpc";
import { toast } from "sonner";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      toast.success("Login realizado com sucesso!");
      window.location.reload();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      toast.success("Registro realizado com sucesso! Faça login agora.");
      setIsRegistering(false);
      setEmail("");
      setPassword("");
      setName("");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegistering) {
      registerMutation.mutate({ email, password, name });
    } else {
      loginMutation.mutate({ email, password });
    }
  };

  return (
    <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-2xl font-semibold tracking-tight text-center">
          {isRegistering ? "Criar nova conta" : "Acesse sua conta"}
        </h1>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          {isRegistering
            ? "Preencha os dados para criar sua conta." 
            : "Entre com seu e-mail e senha para continuar."}
        </p>
      </div>
      <form onSubmit={handleSubmit} className="w-full space-y-4">
        {isRegistering && (
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              type="text"
              placeholder="Seu nome completo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
        )}
        <div>
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            placeholder="Sua senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <Button
          type="submit"
          size="lg"
          className="w-full shadow-lg hover:shadow-xl transition-all"
          disabled={loginMutation.isPending || registerMutation.isPending}
        >
          {isRegistering ? "Registrar" : "Entrar no Sistema"}
        </Button>
      </form>
      <Button
        variant="link"
        onClick={() => setIsRegistering(!isRegistering)}
        disabled={loginMutation.isPending || registerMutation.isPending}
      >
        {isRegistering ? "Já tem uma conta? Faça login" : "Não tem uma conta? Registre-se"}
      </Button>
    </div>
  );
}
