import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function PaymentApproved() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center space-y-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-green-100 p-3">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
            </div>
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">
              Pagamento Aprovado!
            </h1>
            <p className="text-muted-foreground">
              Seu pagamento foi processado com sucesso. Você receberá um e-mail de confirmação em breve.
            </p>
          </div>

          <div className="pt-4">
            <Button 
              onClick={() => window.location.href = '/'}
              className="w-full"
            >
              Voltar para o início
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
