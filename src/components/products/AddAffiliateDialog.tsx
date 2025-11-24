import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CommissionType } from "@/types/product";
import { formatCurrency, parseCurrency } from "@/lib/utils";

interface AddAffiliateDialogProps {
  productId: string;
  defaultCommissionType: CommissionType | null;
  defaultCommissionValue: number | null;
  onSuccess: () => void;
}

export function AddAffiliateDialog({
  productId,
  defaultCommissionType,
  defaultCommissionValue,
  onSuccess,
}: AddAffiliateDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    commissionOption: "default" as "default" | "custom",
    customCommissionType: "percentage" as CommissionType,
    customCommissionValue: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!defaultCommissionType || defaultCommissionValue === null) {
      toast({
        title: "Erro",
        description: "Configure a comissão padrão antes de cadastrar um afiliado.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Create user in auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            full_name: form.name,
          },
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Falha ao criar usuário");

      // Create affiliate record
      const { data: affiliateData, error: affiliateError } = await supabase
        .from("affiliates")
        .insert({
          user_id: authData.user.id,
          name: form.name,
          email: form.email,
        })
        .select()
        .single();

      if (affiliateError) throw affiliateError;

      // Determine commission values
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

      // Create product-affiliate link
      const { error: linkError } = await supabase
        .from("product_affiliate_links")
        .insert({
          product_id: productId,
          affiliate_id: affiliateData.id,
          affiliate_name: form.name,
          affiliate_url: `${window.location.origin}/checkout/${productId}?aff=${affiliateData.id}`,
          commission_type: commissionType,
          commission_value: commissionValue,
        });

      if (linkError) throw linkError;

      // Assign affiliate role
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({
          user_id: authData.user.id,
          role: "affiliate",
        });

      if (roleError) throw roleError;

      toast({
        title: "Afiliado cadastrado",
        description: "O afiliado foi cadastrado com sucesso.",
      });

      setForm({
        name: "",
        email: "",
        password: "",
        commissionOption: "default",
        customCommissionType: "percentage",
        customCommissionValue: "",
      });
      setOpen(false);
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Erro ao cadastrar afiliado",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const isCommissionConfigured = defaultCommissionType && defaultCommissionValue !== null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!isCommissionConfigured}>
          <UserPlus className="w-4 h-4 mr-2" />
          Adicionar Afiliado
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cadastrar Afiliado</DialogTitle>
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
            <Label htmlFor="password">Senha *</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Comissão</Label>
            <RadioGroup
              value={form.commissionOption}
              onValueChange={(value: "default" | "custom") =>
                setForm({ ...form, commissionOption: value })
              }
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="default" id="default-commission" />
                <Label htmlFor="default-commission" className="font-normal cursor-pointer">
                  Padrão ({defaultCommissionType === 'percentage' 
                    ? `${defaultCommissionValue}%` 
                    : `R$ ${formatCurrency(defaultCommissionValue || 0)}`})
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="custom" id="custom-commission" />
                <Label htmlFor="custom-commission" className="font-normal cursor-pointer">
                  Diferenciado
                </Label>
              </div>
            </RadioGroup>
          </div>

          {form.commissionOption === "custom" && (
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
              {loading ? "Cadastrando..." : "Cadastrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
