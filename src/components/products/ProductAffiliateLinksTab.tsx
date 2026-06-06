import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Percent, Trash2, Edit, Power } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ProductAffiliateLink, CommissionType, Product } from "@/types/product";
import { formatCurrency, parseCurrency } from "@/lib/utils";
import { AddAffiliateDialog } from "./AddAffiliateDialog";
import { EditAffiliateDialog } from "./EditAffiliateDialog";
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

interface ProductAffiliateLinksTabProps {
  productId: string;
  affiliateLinks: ProductAffiliateLink[];
  onUpdate: () => void;
  defaultCommissionType: CommissionType;
  defaultCommissionValue: number;
  product?: Product;
}

export function ProductAffiliateLinksTab({
  productId,
  affiliateLinks,
  onUpdate,
  defaultCommissionType,
  defaultCommissionValue,
  product,
}: ProductAffiliateLinksTabProps) {
  const [commissionDialogOpen, setCommissionDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedLink, setSelectedLink] = useState<ProductAffiliateLink | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const [commissionForm, setCommissionForm] = useState({
    type: defaultCommissionType,
    value: defaultCommissionType === 'percentage' ? String(defaultCommissionValue) : formatCurrency(defaultCommissionValue),
    applyTo: "new" as "all" | "new",
  });

  const [editForm, setEditForm] = useState({
    type: "percentage" as CommissionType,
    value: "",
  });

  const handleCommissionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const numValue = commissionForm.type === 'percentage' 
        ? parseFloat(commissionForm.value)
        : parseCurrency(commissionForm.value);

      // Update product default commission
      const { error: productError } = await supabase
        .from("products")
        .update({
          default_commission_type: commissionForm.type,
          default_commission_value: numValue,
        })
        .eq("id", productId);

      if (productError) throw productError;

      // If apply to all, update existing affiliates
      if (commissionForm.applyTo === "all") {
        const { error: linksError } = await supabase
          .from("product_affiliate_links")
          .update({
            commission_type: commissionForm.type,
            commission_value: numValue,
          })
          .eq("product_id", productId);

        if (linksError) throw linksError;
      }

      toast({
        title: "Comissão configurada",
        description: "A comissão padrão foi atualizada com sucesso.",
      });

      setCommissionDialogOpen(false);
      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao configurar comissão",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditCommission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLink) return;
    
    setLoading(true);

    try {
      const numValue = editForm.type === 'percentage' 
        ? parseFloat(editForm.value)
        : parseCurrency(editForm.value);

      const { error } = await supabase
        .from("product_affiliate_links")
        .update({
          commission_type: editForm.type,
          commission_value: numValue,
        })
        .eq("id", selectedLink.id);

      if (error) throw error;

      toast({
        title: "Comissão atualizada",
        description: "A comissão do afiliado foi atualizada com sucesso.",
      });

      setEditDialogOpen(false);
      setSelectedLink(null);
      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar comissão",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (linkId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("product_affiliate_links")
        .update({ is_active: !currentStatus })
        .eq("id", linkId);

      if (error) throw error;

      toast({
        title: currentStatus ? "Link desativado" : "Link ativado",
        description: `O link foi ${currentStatus ? "desativado" : "ativado"} com sucesso.`,
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (linkId: string) => {
    try {
      const { error } = await supabase
        .from("product_affiliate_links")
        .delete()
        .eq("id", linkId);

      if (error) throw error;

      toast({
        title: "Link excluído",
        description: "O link de afiliação foi removido com sucesso.",
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir link",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (link: ProductAffiliateLink) => {
    setSelectedLink(link);
    setEditForm({
      type: link.commission_type,
      value: link.commission_type === 'percentage' 
        ? String(link.commission_value) 
        : formatCurrency(link.commission_value),
    });
    setEditDialogOpen(true);
  };

  const formatCommissionDisplay = (type: CommissionType, value: number) => {
    if (type === 'percentage') {
      return `${value}%`;
    }
    return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Afiliados</CardTitle>
            <CardDescription>Gerencie os afiliados e suas comissões</CardDescription>
          </div>
          <div className="flex gap-2">
            <AddAffiliateDialog
              productId={productId}
              defaultCommissionType={defaultCommissionType}
              defaultCommissionValue={defaultCommissionValue}
              onSuccess={onUpdate}
            />
            <Dialog open={commissionDialogOpen} onOpenChange={setCommissionDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Percent className="w-4 h-4 mr-2" />
                Comissão
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Configurar Comissão Padrão</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCommissionSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Tipo de Comissão</Label>
                  <Select
                    value={commissionForm.type}
                    onValueChange={(value: CommissionType) => {
                      setCommissionForm({ 
                        ...commissionForm, 
                        type: value,
                        value: value === 'percentage' ? '0' : '0,00'
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
                  <Label htmlFor="commission_value">
                    {commissionForm.type === 'percentage' ? 'Porcentagem (%)' : 'Valor (R$)'}
                  </Label>
                  <Input
                    id="commission_value"
                    type="text"
                    required
                    value={commissionForm.value}
                    onChange={(e) => {
                      if (commissionForm.type === 'percentage') {
                        const value = e.target.value.replace(/[^\d.]/g, '');
                        setCommissionForm({ ...commissionForm, value });
                      } else {
                        let value = e.target.value.replace(/[^\d]/g, '');
                        if (value.length > 0) {
                          const numValue = parseInt(value);
                          value = formatCurrency(numValue / 100);
                        }
                        setCommissionForm({ ...commissionForm, value });
                      }
                    }}
                    placeholder={commissionForm.type === 'percentage' ? '0.00' : '0,00'}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Aplicar em</Label>
                  <RadioGroup
                    value={commissionForm.applyTo}
                    onValueChange={(value: "all" | "new") =>
                      setCommissionForm({ ...commissionForm, applyTo: value })
                    }
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="new" id="new" />
                      <Label htmlFor="new" className="font-normal cursor-pointer">
                        Apenas novos afiliados
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="all" id="all" />
                      <Label htmlFor="all" className="font-normal cursor-pointer">
                        Todos os afiliados (incluindo atuais)
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCommissionDialogOpen(false)}
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
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {affiliateLinks.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>Nenhum afiliado cadastrado</p>
            <p className="text-sm mt-2">Configure a comissão para começar a trabalhar com afiliados</p>
          </div>
        ) : (
          <div className="space-y-4">
            {affiliateLinks.map((link) => (
              <div
                key={link.id}
                className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-semibold">{link.affiliate_name}</h4>
                    <Badge variant={link.is_active ? "default" : "secondary"}>
                      {link.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground truncate">
                      URL: {link.affiliate_url}
                    </p>
                    <p className="text-sm font-medium">
                      Comissão: {formatCommissionDisplay(link.commission_type, link.commission_value)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Repasse automático Asaas: {link.affiliate_asaas_wallet_id ? "ativo" : "pendente"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <EditAffiliateDialog
                    affiliateId={link.affiliate_id!}
                    affiliateName={link.affiliate_name || ""}
                    affiliateEmail={link.affiliate_email || ""}
                    affiliateAsaasWalletId={link.affiliate_asaas_wallet_id}
                    productId={productId}
                    currentCommissionType={link.commission_type as CommissionType}
                    currentCommissionValue={link.commission_value}
                    defaultCommissionType={product?.default_commission_type as CommissionType}
                    defaultCommissionValue={product?.default_commission_value || 0}
                    onSuccess={onUpdate}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleToggleActive(link.id, link.is_active)}
                    title={link.is_active ? "Desativar link" : "Ativar link"}
                  >
                    <Power className="w-4 h-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        title="Excluir link"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                        <AlertDialogDescription>
                          Tem certeza que deseja excluir este afiliado? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(link.id)}>
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

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Comissão</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditCommission} className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo de Comissão</Label>
                <Select
                  value={editForm.type}
                  onValueChange={(value: CommissionType) => {
                    setEditForm({ 
                      ...editForm, 
                      type: value,
                      value: value === 'percentage' ? '0' : '0,00'
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
                <Label htmlFor="edit_commission_value">
                  {editForm.type === 'percentage' ? 'Porcentagem (%)' : 'Valor (R$)'}
                </Label>
                <Input
                  id="edit_commission_value"
                  type="text"
                  required
                  value={editForm.value}
                  onChange={(e) => {
                    if (editForm.type === 'percentage') {
                      const value = e.target.value.replace(/[^\d.]/g, '');
                      setEditForm({ ...editForm, value });
                    } else {
                      let value = e.target.value.replace(/[^\d]/g, '');
                      if (value.length > 0) {
                        const numValue = parseInt(value);
                        value = formatCurrency(numValue / 100);
                      }
                      setEditForm({ ...editForm, value });
                    }
                  }}
                  placeholder={editForm.type === 'percentage' ? '0.00' : '0,00'}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditDialogOpen(false)}
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
      </CardContent>
    </Card>
  );
}
