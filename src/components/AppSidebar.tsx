import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  CreditCard,
  Users,
  UserCog,
  Ticket,
  BarChart3,
  Plug,
  Webhook
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import logo from "@/assets/logo_pay.png";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const mainItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Produtos", url: "/produtos", icon: Package },
  { title: "Vendas", url: "/vendas", icon: ShoppingCart },
  { title: "Assinaturas", url: "/assinaturas", icon: CreditCard },
  { title: "Relatórios", url: "/relatorios", icon: BarChart3 },
  { title: "Clientes", url: "/clientes", icon: Users },
  { title: "Afiliados", url: "/afiliados", icon: UserCog },
  { title: "Cupons", url: "/cupons", icon: Ticket },
];

const managementItems = [
  { title: "Integrações", url: "/integracoes", icon: Plug },
  { title: "Webhooks", url: "/webhooks", icon: Webhook },
];

type SidebarRole = "admin" | "affiliate";

const getPrimaryRole = (roles: Array<string | null>): SidebarRole | null => {
  if (roles.includes("admin")) {
    return "admin";
  }

  if (roles.includes("affiliate")) {
    return "affiliate";
  }

  return null;
};

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const isCollapsed = state === "collapsed";
  const [userRole, setUserRole] = useState<SidebarRole | null>(null);
  
  useEffect(() => {
    const fetchUserRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setUserRole(null);
        return;
      }

      const { data: roleData, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (error) {
        console.error("Erro ao buscar role do menu:", error);
        setUserRole(null);
        return;
      }

      setUserRole(getPrimaryRole((roleData ?? []).map(({ role }) => role)));
    };
    
    fetchUserRole();
  }, []);
  
  const isActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(path);
  };

  const affiliateItems = [
    { title: "Meu Dashboard", url: "/dashboard-afiliado", icon: BarChart3 },
  ];

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarContent>
        <div className="px-6 py-6">
          <div className="flex items-center gap-2">
            <img 
              src={logo} 
              alt="Payment Logo" 
              className={`h-12 object-contain transition-all ${isCollapsed ? 'w-12' : 'w-auto max-w-[180px]'}`}
            />
          </div>
        </div>

        {userRole === 'affiliate' ? (
          <SidebarGroup>
            <SidebarGroupLabel>Afiliado</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {affiliateItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink 
                        to={item.url} 
                        end={item.url === "/dashboard-afiliado"}
                        className="hover:bg-sidebar-accent transition-colors"
                        activeClassName="bg-primary-light text-primary font-medium border-l-3 border-primary"
                      >
                        <item.icon className="h-5 w-5" />
                        {!isCollapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : userRole === 'admin' ? (
          <>
            <SidebarGroup>
              <SidebarGroupLabel>Principal</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {mainItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <NavLink 
                          to={item.url} 
                          end={item.url === "/"}
                          className="hover:bg-sidebar-accent transition-colors"
                          activeClassName="bg-primary-light text-primary font-medium border-l-3 border-primary"
                        >
                          <item.icon className="h-5 w-5" />
                          {!isCollapsed && <span>{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Gestão</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {managementItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <NavLink 
                          to={item.url}
                          className="hover:bg-sidebar-accent transition-colors"
                          activeClassName="bg-primary-light text-primary font-medium border-l-3 border-primary"
                        >
                          <item.icon className="h-5 w-5" />
                          {!isCollapsed && <span>{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        ) : null}
      </SidebarContent>
    </Sidebar>
  );
}
