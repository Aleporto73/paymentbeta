import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CommissionType } from "@/types/product";
import { formatCurrency, parseCurrency } from "@/lib/utils";

interface EditAffiliateDialogProps {
  affiliateId: string;
  affiliateName: string;
  affiliateEmail: string;
  productId?: string;
  currentCommissionType?: CommissionType;
  currentCommissionValue?: number;
  defaultCommissionType?: CommissionType | null;
  defaultCommissionValue?: number | null;
  onSuccess: () => void;
  variant?: "icon" | "default";
}

export function EditAffiliateDialog({
  affiliateId,
  affiliateName,
  affiliateEmail,
  productId,
  currentCommissionType,
  currentCommissionValue,
  defaultCommissionType,
  defaultCommissionValue,
  onSuccess,
  variant = "icon",
}: EditAffiliateDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: affiliateName,
    email: affiliateEmail,
    password: "",
    commissionOption: "current" as "current" | "default" | "custom",
    customCommissionType: (currentCommissionType || "percentage") as CommissionType,
    customCommissionValue: "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: affiliateName,
        email: affiliateEmail,
        password: "",
        commissionOption: "current",
        customCommissionType: (currentCommissionType || "percentage") as CommissionType,
        customCommissionValue: "",
      });
    }
  }, [open, affiliateName, affiliateEmail, currentCommissionType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Update affiliate basic info
      const { error: affiliateError } = await supabase
        .from("affiliates")
        .update({
          name: form.name,
          email: form.email,
        })
        .eq("id", affiliateId);

      if (affiliateError) throw affiliateError;

      // Update password if provided
      if (form.password) {
        const { data: affiliateData } = await supabase
          .from("affiliates")
          .select("user_id")
          .eq("id", affiliateId)
          .single();

        if (affiliateData) {
          const { error: passwordError } = await supabase.auth.admin.updateUserById(
            affiliateData.user_id,
            { password: form.password }
          );

          if (passwordError) throw passwordError;
        }
      }

      // Update commission if this is for a specific product and commission changed
      if (productId && form.commissionOption !== "current") {
        const commissionType =
          form.commissionOption === "default"
            ? defaultCommissionType!
            : form.customCommissionType;
        
        const commissionValue =
          form.commissionOption === "default"
            ? defaultCommissionValue!
            : form.customCommissionType === "percentage"
            ? parseFloat(form.customCommissionValue)
            : parseCurrency(form.customCommissionValue);

        const { error: linkError } = await supabase
          .from("product_affiliate_links")
          .update({
            affiliate_name: form.name,
            commission_type: commissionType,
            commission_value: commissionValue,
          })
          .eq("product_id", productId)
          .eq("affiliate_id", affiliateId);

        if (linkError) throw linkError;
      } else if (productId) {
        // Just update the name in the link
        const { error: linkError } = await supabase
          .from("product_affiliate_links")
          .update({
            affiliate_name: form.name,
          })
          .eq("product_id", productId)
          .eq("affiliate_id", affiliateId);

        if (linkError) throw linkError;
      }

      toast({
        title: "Afiliado atualizado",
        description: "As informações do afiliado foram atualizadas com sucesso.",
      });

      setOpen(false);
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar afiliado",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === "icon" ? (
          <Button variant="ghost" size="icon" title="Editar">
            <Pencil className="w-4 h-4" />
          </Button>
        ) : (
          <Button variant="outline">
            <Pencil className="w-4 h-4 mr-2" />
            Editar Afiliado
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Afiliado</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome *</Label>
            <Input
              id="name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Nova Senha (deixe em branco para não alterar)</Label>
            <Input
              id="password"
              type="password"
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••"
            />
          </div>

          {productId && currentCommissionType && currentCommissionValue !== undefined && (
            <div className="space-y-2">
              <Label>Comissão</Label>
              <RadioGroup
                value={form.commissionOption}
                onValueChange={(value: "current" | "default" | "custom") =>
                  setForm({ ...form, commissionOption: value })
                }
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="current" id="current-commission" />
                  <Label htmlFor="current-commission" className="font-normal cursor-pointer">
                    Manter atual ({currentCommissionType === 'percentage' 
                      ? `${currentCommissionValue}%` 
                      : `R$ ${formatCurrency(currentCommissionValue)}`})
                  </Label>
                </div>
                
                {defaultCommissionType && defaultCommissionValue !== null && (
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="default" id="default-commission" />
                    <Label htmlFor="default-commission" className="font-normal cursor-pointer">
                      Padrão ({defaultCommissionType === 'percentage' 
                        ? `${defaultCommissionValue}%` 
                        : `R$ ${formatCurrency(defaultCommissionValue)}`})
                    </Label>
                  </div>
                )}
                
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="custom" id="custom-commission" />
                  <Label htmlFor="custom-commission" className="font-normal cursor-pointer">
                    Diferenciado
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {form.commissionOption === "custom" && productId && (
            <>
              <div className="space-y-2">
                <Label>Tipo de Comissão</Label>
                <RadioGroup
                  value={form.customCommissionType}
                  onValueChange={(value: CommissionType) =>
                    setForm({ 
                      ...form, 
                      customCommissionType: value,
                      customCommissionValue: value === 'percentage' ? '' : '0,00'
                    })
                  }
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="percentage" id="percentage" />
                    <Label htmlFor="percentage" className="font-normal cursor-pointer">
                      Porcentagem (%)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="fixed" id="fixed" />
                    <Label htmlFor="fixed" className="font-normal cursor-pointer">
                      Valor Fixo (R$)
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="custom-value">
                  {form.customCommissionType === 'percentage' ? 'Porcentagem (%)' : 'Valor (R$)'}
                </Label>
                <Input
                  id="custom-value"
                  type="text"
                  required
                  value={form.customCommissionValue}
                  onChange={(e) => {
                    if (form.customCommissionType === 'percentage') {
                      const value = e.target.value.replace(/[^\d.]/g, '');
                      setForm({ ...form, customCommissionValue: value });
                    } else {
                      let value = e.target.value.replace(/[^\d]/g, '');
                      if (value.length > 0) {
                        const numValue = parseInt(value);
                        value = formatCurrency(numValue / 100);
                      }
                      setForm({ ...form, customCommissionValue: value });
                    }
                  }}
                  placeholder={form.customCommissionType === 'percentage' ? '0.00' : '0,00'}
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
