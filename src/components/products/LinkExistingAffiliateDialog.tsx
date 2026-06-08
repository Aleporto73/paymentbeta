import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CommissionType } from "@/types/product";
import { formatCurrency, parseCurrency } from "@/lib/utils";
import { Link2 } from "lucide-react";

interface AffiliateOption {
  id: string;
  name: string;
  email: string;
  asaas_wallet_id: string | null;
  is_active: boolean | null;
}

interface LinkExistingAffiliateDialogProps {
  productId: string;
  linkedAffiliateIds: string[];
  defaultCommissionType: CommissionType | null;
  defaultCommissionValue: number | null;
  onSuccess: () => void;
}

export function LinkExistingAffiliateDialog({
  productId,
  linkedAffiliateIds,
  defaultCommissionType,
  defaultCommissionValue,
  onSuccess,
}: LinkExistingAffiliateDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingAffiliates, setLoadingAffiliates] = useState(false);
  const [search, setSearch] = useState("");
  const [affiliates, setAffiliates] = useState<AffiliateOption[]>([]);
  const [form, setForm] = useState({
    affiliateId: "",
    commissionOption: "default" as "default" | "custom",
    customCommissionType: "percentage" as CommissionType,
    customCommissionValue: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    if (!open) {
      return;
    }

    const fetchAffiliates = async () => {
      setLoadingAffiliates(true);

      try {
        const { data, error } = await supabase
          .from("affiliates")
          .select("id, name, email, is_active, asaas_wallet_id")
          .order("name", { ascending: true });

        if (error) throw error;
        setAffiliates((data || []) as AffiliateOption[]);
      } catch (error: any) {
        toast({
          title: "Erro ao carregar afiliados",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setLoadingAffiliates(false);
      }
    };

    fetchAffiliates();
  }, [open, toast]);

  const linkedIds = new Set(linkedAffiliateIds);
  const normalizedSearch = search.trim().toLowerCase();
  const availableAffiliates = affiliates.filter((affiliate) => {
    if (linkedIds.has(affiliate.id)) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return (
      affiliate.name.toLowerCase().includes(normalizedSearch) ||
      affiliate.email.toLowerCase().includes(normalizedSearch)
    );
  });

  const isCommissionConfigured = defaultCommissionType && defaultCommissionValue !== null;

  const resetForm = () => {
    setSearch("");
    setForm({
      affiliateId: "",
      commissionOption: "default",
      customCommissionType: "percentage",
      customCommissionValue: "",
    });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (!nextOpen) {
      resetForm();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!defaultCommissionType || defaultCommissionValue === null) {
      toast({
        title: "Erro",
        description: "Configure a comissao padrao antes de vincular um afiliado.",
        variant: "destructive",
      });
      return;
    }

    if (!form.affiliateId) {
      toast({
        title: "Erro",
        description: "Selecione um afiliado para continuar.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const commissionType =
        form.commissionOption === "default"
          ? defaultCommissionType
          : form.customCommissionType;

      const commissionValue =
        form.commissionOption === "default"
          ? defaultCommissionValue
          : form.customCommissionType === "percentage"
            ? parseFloat(form.customCommissionValue)
            : parseCurrency(form.customCommissionValue);

      if (!Number.isFinite(commissionValue)) {
        throw new Error("Valor de comissao invalido");
      }

      const { data, error } = await supabase.functions.invoke("admin-create-affiliate", {
        body: {
          productId,
          affiliateId: form.affiliateId,
          commissionType,
          commissionValue,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Afiliado vinculado",
        description: "O afiliado existente foi vinculado ao produto.",
      });

      handleOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Erro ao vincular afiliado",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={!isCommissionConfigured}>
          <Link2 className="w-4 h-4 mr-2" />
          Vincular afiliado existente
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Vincular afiliado existente</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="affiliate-search">Selecionar afiliado</Label>
            <Input
              id="affiliate-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou email"
            />
          </div>

          <div className="space-y-2">
            <ScrollArea className="h-64 rounded-md border">
              <div className="p-3 space-y-2">
                {loadingAffiliates ? (
                  <p className="text-sm text-muted-foreground">Carregando afiliados...</p>
                ) : availableAffiliates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum afiliado disponivel para vinculo.
                  </p>
                ) : (
                  availableAffiliates.map((affiliate) => {
                    const isSelected = form.affiliateId === affiliate.id;
                    const isInactive = affiliate.is_active === false;

                    return (
                      <button
                        key={affiliate.id}
                        type="button"
                        disabled={isInactive}
                        onClick={() => setForm({ ...form, affiliateId: affiliate.id })}
                        className={`w-full rounded-md border p-3 text-left transition-colors ${
                          isSelected ? "border-primary bg-muted" : "border-border"
                        } ${isInactive ? "opacity-60 cursor-not-allowed" : "hover:bg-muted/60"}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">{affiliate.name}</p>
                            <p className="text-sm text-muted-foreground truncate">{affiliate.email}</p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Badge variant={affiliate.is_active ? "default" : "secondary"}>
                              {affiliate.is_active ? "ativo" : "inativo"}
                            </Badge>
                            <Badge variant={affiliate.asaas_wallet_id ? "default" : "secondary"}>
                              {affiliate.asaas_wallet_id ? "repasse ativo" : "repasse pendente"}
                            </Badge>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="space-y-2">
            <Label>Comissao</Label>
            <RadioGroup
              value={form.commissionOption}
              onValueChange={(value: "default" | "custom") =>
                setForm({ ...form, commissionOption: value })
              }
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="default" id="existing-default-commission" />
                <Label htmlFor="existing-default-commission" className="font-normal cursor-pointer">
                  Padrao do produto ({defaultCommissionType === "percentage"
                    ? `${defaultCommissionValue}%`
                    : `R$ ${formatCurrency(defaultCommissionValue || 0)}`})
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="custom" id="existing-custom-commission" />
                <Label htmlFor="existing-custom-commission" className="font-normal cursor-pointer">
                  Diferenciada
                </Label>
              </div>
            </RadioGroup>
          </div>

          {form.commissionOption === "custom" && (
            <>
              <div className="space-y-2">
                <Label>Tipo de comissao</Label>
                <RadioGroup
                  value={form.customCommissionType}
                  onValueChange={(value: CommissionType) =>
                    setForm({
                      ...form,
                      customCommissionType: value,
                      customCommissionValue: value === "percentage" ? "" : "0,00",
                    })
                  }
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="percentage" id="existing-percentage" />
                    <Label htmlFor="existing-percentage" className="font-normal cursor-pointer">
                      Porcentagem (%)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="fixed" id="existing-fixed" />
                    <Label htmlFor="existing-fixed" className="font-normal cursor-pointer">
                      Valor fixo (R$)
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="existing-custom-value">
                  {form.customCommissionType === "percentage" ? "Porcentagem (%)" : "Valor (R$)"}
                </Label>
                <Input
                  id="existing-custom-value"
                  type="text"
                  required
                  value={form.customCommissionValue}
                  onChange={(e) => {
                    if (form.customCommissionType === "percentage") {
                      const value = e.target.value.replace(/[^\d.]/g, "");
                      setForm({ ...form, customCommissionValue: value });
                      return;
                    }

                    let value = e.target.value.replace(/[^\d]/g, "");
                    if (value.length > 0) {
                      const numValue = parseInt(value, 10);
                      value = formatCurrency(numValue / 100);
                    }
                    setForm({ ...form, customCommissionValue: value });
                  }}
                  placeholder={form.customCommissionType === "percentage" ? "0.00" : "0,00"}
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || loadingAffiliates || availableAffiliates.length === 0}>
              {loading ? "Vinculando..." : "Vincular ao produto"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
