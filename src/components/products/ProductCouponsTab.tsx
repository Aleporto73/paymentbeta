import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Power, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ProductCoupon, DiscountType } from "@/types/product";
import { formatCurrency, parseCurrency } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ProductCouponsTabProps {
  productId: string;
}

export function ProductCouponsTab({ productId }: ProductCouponsTabProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [coupons, setCoupons] = useState<ProductCoupon[]>([]);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    code: "",
    discount_type: "percentage" as DiscountType,
    discount_value: "",
  });

  useEffect(() => {
    fetchCoupons();
  }, [productId]);

  const fetchCoupons = async () => {
    try {
      const { data, error } = await supabase
        .from("product_coupons")
        .select("*")
        .eq("product_id", productId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCoupons((data || []) as ProductCoupon[]);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar cupons",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.code.trim()) {
      toast({
        title: "Erro",
        description: "O código do cupom não pode estar vazio.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Check if coupon code already exists for this product
      const { data: existingCoupon } = await supabase
        .from("product_coupons")
        .select("id")
        .eq("product_id", productId)
        .eq("code", formData.code.toUpperCase())
        .single();

      if (existingCoupon) {
        toast({
          title: "Erro",
          description: "Já existe um cupom com este código para este produto.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const numValue = formData.discount_type === 'percentage' 
        ? parseFloat(formData.discount_value)
        : parseCurrency(formData.discount_value);

      const { error } = await supabase.from("product_coupons").insert([
        {
          product_id: productId,
          code: formData.code.toUpperCase(),
          discount_type: formData.discount_type,
          discount_value: numValue,
        },
      ]);

      if (error) throw error;

      toast({
        title: "Cupom criado",
        description: `Código do cupom: ${formData.code.toUpperCase()}`,
      });

      setFormData({
        code: "",
        discount_type: "percentage",
        discount_value: "",
      });
      setOpen(false);
      fetchCoupons();
    } catch (error: any) {
      toast({
        title: "Erro ao criar cupom",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (couponId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("product_coupons")
        .update({ is_active: !currentStatus })
        .eq("id", couponId);

      if (error) throw error;

      toast({
        title: currentStatus ? "Cupom desativado" : "Cupom ativado",
        description: `O cupom foi ${currentStatus ? "desativado" : "ativado"} com sucesso.`,
      });

      fetchCoupons();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (couponId: string) => {
    try {
      const { error } = await supabase
        .from("product_coupons")
        .delete()
        .eq("id", couponId);

      if (error) throw error;

      toast({
        title: "Cupom excluído",
        description: "O cupom foi removido com sucesso.",
      });

      fetchCoupons();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir cupom",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: "Código copiado!",
      description: "O código do cupom foi copiado para a área de transferência.",
    });
  };

  const formatDiscountDisplay = (type: DiscountType, value: number) => {
    if (type === 'percentage') {
      return `${value}%`;
    }
    return `R$ ${formatCurrency(value)}`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Cupons de Desconto</CardTitle>
            <CardDescription>Gerencie os cupons de desconto do seu produto</CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Cupom
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Novo Cupom</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="coupon-code">Código do Cupom *</Label>
                  <Input
                    id="coupon-code"
                    placeholder="Ex: DESCONTO10"
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({ ...formData, code: e.target.value.toUpperCase() })
                    }
                    maxLength={20}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Digite o código personalizado do cupom (máximo 20 caracteres)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Tipo de Desconto</Label>
                  <Select
                    value={formData.discount_type}
                    onValueChange={(value: DiscountType) => {
                      setFormData({ 
                        ...formData, 
                        discount_type: value,
                        discount_value: value === 'percentage' ? '' : ''
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Porcentagem (%)</SelectItem>
                      <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="discount_value">
                    {formData.discount_type === 'percentage' ? 'Porcentagem de Desconto (%)' : 'Valor do Desconto (R$)'}
                  </Label>
                  <Input
                    id="discount_value"
                    type="text"
                    required
                    value={formData.discount_value}
                    onChange={(e) => {
                      if (formData.discount_type === 'percentage') {
                        const value = e.target.value.replace(/[^\d.]/g, '');
                        setFormData({ ...formData, discount_value: value });
                      } else {
                        let value = e.target.value.replace(/[^\d]/g, '');
                        if (value.length > 0) {
                          const numValue = parseInt(value);
                          value = formatCurrency(numValue / 100);
                        }
                        setFormData({ ...formData, discount_value: value });
                      }
                    }}
                    placeholder={formData.discount_type === 'percentage' ? '0.00' : '0,00'}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? "Criando..." : "Criar Cupom"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {coupons.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>Nenhum cupom cadastrado</p>
            <p className="text-sm mt-2">Clique em "Adicionar Cupom" para criar seu primeiro cupom</p>
          </div>
        ) : (
          <div className="space-y-4">
            {coupons.map((coupon) => (
              <div
                key={coupon.id}
                className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-mono font-semibold text-lg">{coupon.code}</h4>
                    <Badge variant={coupon.is_active ? "default" : "secondary"}>
                      {coupon.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      Desconto: {formatDiscountDisplay(coupon.discount_type, coupon.discount_value)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Criado em: {new Date(coupon.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(coupon.code)}
                    title="Copiar código"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={coupon.is_active ? "default" : "outline"}
                    size="icon"
                    onClick={() => handleToggleActive(coupon.id, coupon.is_active)}
                    title={coupon.is_active ? "Desativar cupom" : "Ativar cupom"}
                  >
                    <Power className="w-4 h-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        title="Excluir cupom"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                        <AlertDialogDescription>
                          Tem certeza que deseja excluir o cupom "{coupon.code}"? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(coupon.id)}>
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
