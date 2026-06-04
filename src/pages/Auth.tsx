import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo_pay.png";

type AuthRole = "admin" | "affiliate";

const fetchUserRoles = async (userId: string): Promise<AuthRole[]> => {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error) {
    console.error("Erro ao buscar roles no login:", error);
    return [];
  }

  const roles = new Set<AuthRole>();

  data?.forEach(({ role }) => {
    if (role === "admin" || role === "affiliate") {
      roles.add(role);
    }
  });

  return Array.from(roles);
};

const getRoleRedirectPath = (roles: AuthRole[]) => {
  if (roles.includes("admin")) {
    return "/";
  }

  if (roles.includes("affiliate")) {
    return "/dashboard-afiliado";
  }

  return null;
};

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();

  const redirectByRole = async (userId: string) => {
    const roles = await fetchUserRoles(userId);
    const redirectPath = getRoleRedirectPath(roles);

    if (!redirectPath) {
      return false;
    }

    navigate(redirectPath, { replace: true });
    return true;
  };

  useEffect(() => {
    let isMounted = true;

    const handleSession = async (userId: string) => {
      const roles = await fetchUserRoles(userId);

      if (!isMounted) return;

      const redirectPath = getRoleRedirectPath(roles);

      if (redirectPath) {
        navigate(redirectPath, { replace: true });
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        void handleSession(session.user.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void handleSession(session.user.id);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (error) throw error;

      toast({
        title: "Conta criada com sucesso!",
        description: "Você já pode fazer login.",
      });

      setIsLogin(true);
      setPassword("");
    } catch (error: any) {
      toast({
        title: "Erro ao criar conta",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      const redirected = data.user ? await redirectByRole(data.user.id) : false;

      if (redirected) {
        toast({
          title: "Login realizado!",
          description: "Bem-vindo de volta.",
        });
      } else {
        toast({
          title: "Acesso nao liberado",
          description: "Sua conta ainda nao possui permissao para acessar o painel.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Erro ao fazer login",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <div className="flex justify-center">
            <img src={logo} alt="Payment Logo" className="h-14 object-contain" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold">{isLogin ? "Login" : "Criar Conta"}</CardTitle>
            <CardDescription>
              {isLogin ? "Entre com suas credenciais para acessar o sistema" : "Preencha os dados para criar sua conta"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={isLogin ? handleSignIn : handleSignUp} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome Completo</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="João Silva"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                minLength={6}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Carregando..." : isLogin ? "Entrar" : "Criar Conta"}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setPassword("");
                setFullName("");
              }}
              className="text-sm text-primary hover:underline"
              disabled={loading}
            >
              {isLogin ? "Não tem uma conta? Criar conta" : "Já tem uma conta? Fazer login"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
