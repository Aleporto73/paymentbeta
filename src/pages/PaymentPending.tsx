import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function PaymentPending() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center space-y-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-yellow-100 p-3">
              <Clock className="h-12 w-12 text-yellow-600" />
            </div>
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">
              Pagamento em Análise
            </h1>
            <p className="text-muted-foreground">
              Seu pagamento está sendo processado. Você receberá um e-mail assim que for confirmado.
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
