import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

type RequiredRole = "admin" | "affiliate";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: RequiredRole;
}

const fetchUserRoles = async (userId: string): Promise<RequiredRole[]> => {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error) {
    console.error("Erro ao buscar roles do usuario:", error);
    return [];
  }

  const roles = new Set<RequiredRole>();

  data?.forEach(({ role }) => {
    if (role === "admin" || role === "affiliate") {
      roles.add(role);
    }
  });

  return Array.from(roles);
};

const getSafeRedirectPath = (roles: RequiredRole[]) => {
  if (roles.includes("admin")) {
    return "/";
  }

  if (roles.includes("affiliate")) {
    return "/dashboard-afiliado";
  }

  return "/auth";
};

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<RequiredRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadAccess = async (currentSession: Session | null) => {
      if (!isMounted) return;

      setSession(currentSession);

      if (!currentSession || !requiredRole) {
        setRoles([]);
        setLoading(false);
        return;
      }

      const userRoles = await fetchUserRoles(currentSession.user.id);

      if (!isMounted) return;

      setRoles(userRoles);
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setLoading(true);
        void loadAccess(session);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      void loadAccess(session);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [requiredRole]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  if (requiredRole && !roles.includes(requiredRole)) {
    return <Navigate to={getSafeRedirectPath(roles)} replace />;
  }

  return <>{children}</>;
}
