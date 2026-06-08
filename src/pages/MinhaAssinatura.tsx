import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, Ban, CalendarDays, CheckCircle2, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type SubscriptionDetails = {
  status: string | null;
  access_until: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  next_due_date: string | null;
  cycle: string | null;
  value: number | null;
  billing_type: string | null;
  is_cancelled: boolean;
  can_cancel: boolean;
  cancel_at_period_end?: boolean;
};

type ProductDetails = {
  name: string | null;
  price_name: string | null;
  subscription_period: string | null;
  price_value: number | null;
};

type SubscriptionResponse = {
  success: boolean;
  error?: string;
  subscription?: SubscriptionDetails;
  product?: ProductDetails;
};

type CancelResponse = {
  success: boolean;
  error?: string;
  message?: string;
  already_cancelled?: boolean;
};

const formatCurrency = (value: number | null | undefined) => {
  if (typeof value !== "number") return "Nao informado";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "Nao informado";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Nao informado";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

const translateCycle = (value: string | null | undefined) => {
  const cycles: Record<string, string> = {
    MONTHLY: "Mensal",
    QUARTERLY: "Trimestral",
    SEMIANNUALLY: "Semestral",
    YEARLY: "Anual",
  };

  return value ? cycles[value] ?? value : "Nao informado";
};

const translateStatus = (value: string | null | undefined) => {
  const statuses: Record<string, string> = {
    ACTIVE: "Ativa",
    CANCELED: "Cancelada",
    CANCELLED: "Cancelada",
    INACTIVE: "Inativa",
    EXPIRED: "Expirada",
  };

  return value ? statuses[value] ?? value : "Nao informado";
};

const getStatusVariant = (value: string | null | undefined) => {
  if (value === "ACTIVE") return "default";
  if (value === "INACTIVE") return "secondary";
  if (value === "EXPIRED") return "destructive";
  return "outline";
};

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border bg-background p-4">
    <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
    <dd className="mt-1 text-base font-semibold text-foreground">{value}</dd>
  </div>
);

export default function MinhaAssinatura() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);

  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
  const [product, setProduct] = useState<ProductDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadSubscription = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setErrorMessage("Link invalido ou incompleto.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.functions.invoke<SubscriptionResponse>(
        "customer-get-subscription",
        {
          body: { token },
        },
      );

      if (error || !data?.success || !data.subscription) {
        setSubscription(null);
        setProduct(null);
        setErrorMessage(data?.error || "Nao foi possivel carregar sua assinatura.");
        return;
      }

      setSubscription(data.subscription);
      setProduct(data.product ?? null);
    } catch {
      setSubscription(null);
      setProduct(null);
      setErrorMessage("Nao foi possivel carregar sua assinatura. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  const handleCancel = async () => {
    if (!token || isCancelling) return;

    setIsCancelling(true);
    setCancelError(null);
    setSuccessMessage(null);

    try {
      const { data, error } = await supabase.functions.invoke<CancelResponse>(
        "customer-cancel-subscription",
        {
          body: { token, confirm: true },
        },
      );

      if (error || !data?.success) {
        setCancelError(data?.error || "Nao foi possivel cancelar agora. Tente novamente em instantes.");
        return;
      }

      setConfirmOpen(false);
      setSuccessMessage(
        data.message || "Assinatura cancelada. Seu acesso permanece ativo ate o fim do periodo pago.",
      );
      await loadSubscription();
    } catch {
      setCancelError("Nao foi possivel cancelar agora. Tente novamente em instantes.");
    } finally {
      setIsCancelling(false);
    }
  };

  const isCancelled = subscription?.is_cancelled === true;
  const canCancel = subscription?.can_cancel === true;

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <ShieldCheck className="h-4 w-4" />
            Acesso seguro por link
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-normal text-foreground">Minha assinatura</h1>
            <p className="text-muted-foreground">Gerencie sua assinatura com seguranca.</p>
          </div>
        </header>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : errorMessage ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Nao foi possivel abrir sua assinatura</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : subscription ? (
          <>
            {successMessage && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Cancelamento registrado</AlertTitle>
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
            )}

            {cancelError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Erro ao cancelar</AlertTitle>
                <AlertDescription>{cancelError}</AlertDescription>
              </Alert>
            )}

            {isCancelled && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Renovacao automatica cancelada</AlertTitle>
                <AlertDescription>
                  Seu acesso permanece ativo ate o fim do periodo ja pago, quando houver data de acesso disponivel.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <CreditCard className="h-5 w-5 text-primary" />
                    Produto e plano
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid gap-3">
                    <DetailRow label="Produto" value={product?.name || "Nao informado"} />
                    <DetailRow label="Plano" value={product?.price_name || "Nao informado"} />
                    <DetailRow label="Periodo do plano" value={translateCycle(product?.subscription_period)} />
                    <DetailRow label="Valor do plano" value={formatCurrency(product?.price_value ?? subscription.value)} />
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <CalendarDays className="h-5 w-5 text-primary" />
                    Status e acesso
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3 rounded-md border bg-background p-4">
                    <span className="text-sm font-medium text-muted-foreground">Status</span>
                    <Badge variant={getStatusVariant(subscription.status)}>
                      {translateStatus(subscription.status)}
                    </Badge>
                  </div>

                  <dl className="grid gap-3">
                    <DetailRow label="Acesso ate" value={formatDate(subscription.access_until)} />
                    <DetailRow label="Inicio do periodo" value={formatDate(subscription.current_period_start)} />
                    <DetailRow label="Fim do periodo" value={formatDate(subscription.current_period_end)} />
                    <DetailRow label="Proximo vencimento" value={formatDate(subscription.next_due_date)} />
                    <DetailRow label="Ciclo" value={translateCycle(subscription.cycle)} />
                    <DetailRow label="Tipo de cobranca" value={subscription.billing_type || "Nao informado"} />
                    <DetailRow label="Valor atual" value={formatCurrency(subscription.value)} />
                  </dl>
                </CardContent>
              </Card>
            </div>

            {canCancel && (
              <Card>
                <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-foreground">Cancelar renovacao automatica</h2>
                    <p className="text-sm text-muted-foreground">
                      O acesso permanece ativo ate o fim do periodo ja pago.
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    onClick={() => setConfirmOpen(true)}
                    disabled={isCancelling}
                    className="w-full sm:w-auto"
                  >
                    {isCancelling ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Cancelando...
                      </>
                    ) : (
                      <>
                        <Ban className="h-4 w-4" />
                        Cancelar assinatura
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancelar renovacao automatica?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tem certeza que deseja cancelar a renovacao automatica? Seu acesso permanecera ativo ate o fim do
                    periodo ja pago.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isCancelling}>Manter assinatura</AlertDialogCancel>
                  <AlertDialogAction
                    className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}
                    disabled={isCancelling}
                    onClick={(event) => {
                      event.preventDefault();
                      void handleCancel();
                    }}
                  >
                    {isCancelling ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Cancelando...
                      </>
                    ) : (
                      "Confirmar cancelamento"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : null}
      </div>
    </main>
  );
}
