import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

const recentSales = [
  {
    id: 1,
    customer: "João Silva",
    email: "joao@email.com",
    product: "Curso Completo de React",
    amount: "R$ 497,00",
    status: "approved",
    avatar: "JS"
  },
  {
    id: 2,
    customer: "Maria Santos",
    email: "maria@email.com",
    product: "Ebook de Marketing Digital",
    amount: "R$ 97,00",
    status: "approved",
    avatar: "MS"
  },
  {
    id: 3,
    customer: "Pedro Costa",
    email: "pedro@email.com",
    product: "Mentoria Individual",
    amount: "R$ 1.497,00",
    status: "pending",
    avatar: "PC"
  },
  {
    id: 4,
    customer: "Ana Oliveira",
    email: "ana@email.com",
    product: "Assinatura Premium",
    amount: "R$ 199,00",
    status: "approved",
    avatar: "AO"
  },
];

export function RecentSales() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Vendas Recentes</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {recentSales.map((sale) => (
            <div key={sale.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-white text-sm">
                  {sale.avatar}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium">{sale.customer}</p>
                <p className="text-xs text-muted-foreground">{sale.product}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge 
                  variant={sale.status === "approved" ? "default" : "secondary"}
                  className={sale.status === "approved" ? "bg-success-light text-success" : "bg-warning-light text-warning"}
                >
                  {sale.status === "approved" ? "Aprovado" : "Pendente"}
                </Badge>
                <p className="text-sm font-semibold min-w-[100px] text-right">{sale.amount}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
