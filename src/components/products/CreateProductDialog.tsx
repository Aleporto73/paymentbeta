import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ImageUpload } from "./ImageUpload";
import {
  InstallmentInterestRates,
  ProductCategory,
  ProductType,
  PaymentMethod,
  SubscriptionPeriod,
  CATEGORY_LABELS,
  PRODUCT_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  SUBSCRIPTION_PERIOD_LABELS,
} from "@/types/product";

interface CreateProductDialogProps {
  onProductCreated: () => void;
}

type InstallmentRateForm = Record<string, string>;

const normalizeInstallments = (value: string | number | null | undefined) => {
  const parsed = Number.parseInt(String(value ?? "1"), 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return 1;
  }

  return Math.min(parsed, 12);
};

const parseRateValue = (value: string) => {
  const normalized = value.replace(",", ".").trim();
  const parsed = Number(normalized);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const buildInstallmentInterestRates = (rates: InstallmentRateForm, installments: string | number) => {
  const maxInstallments = normalizeInstallments(installments);
  const parsedRates: InstallmentInterestRates = {};

  for (let installment = 2; installment <= maxInstallments; installment += 1) {
    const parsedRate = parseRateValue(rates[installment.toString()] || "");

    if (parsedRate !== null) {
      parsedRates[installment.toString()] = parsedRate;
    }
  }

  return Object.keys(parsedRates).length > 0 ? parsedRates : null;
};

export function CreateProductDialog({ onProductCreated }: CreateProductDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    image_url: "",
    category: "" as ProductCategory,
    product_type: "" as ProductType,
    payment_method: "" as PaymentMethod,
    subscription_period: "" as SubscriptionPeriod | "",
    price: "",
    installments: "1",
    installment_interest_rates: {} as InstallmentRateForm,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const isRecurring = formData.product_type === "recorrente";

      if (isRecurring && !formData.subscription_period) {
        throw new Error("Selecione o período da assinatura");
      }

      const subscriptionPeriod = isRecurring ? formData.subscription_period : null;
      const installments = isRecurring ? 1 : normalizeInstallments(formData.installments);
      const { data: { user } } = await supabase.auth.getUser();
      const { installment_interest_rates } = formData;
      const productFormData = {
        name: formData.name,
        description: formData.description,
        image_url: formData.image_url,
        category: formData.category,
        product_type: formData.product_type,
        payment_method: formData.payment_method,
      };
      if (!user) throw new Error("Usuário não autenticado");

      // Criar o produto
      const { data: product, error: productError } = await supabase
        .from("products")
        .insert([
          {
            ...productFormData,
            user_id: user.id,
            price: parseFloat(formData.price),
            installments,
          } as any,
        ])
        .select()
        .single();

      if (productError) throw productError;

      // Criar o preço principal automaticamente
      const priceName = isRecurring
        ? `Plano ${SUBSCRIPTION_PERIOD_LABELS[subscriptionPeriod as SubscriptionPeriod]}`
        : "Preço Principal";
      
      const { error: priceError } = await supabase.from("product_prices").insert([
        {
          product_id: product.id,
          name: priceName,
          price: parseFloat(formData.price),
          subscription_period: subscriptionPeriod,
          installments,
          installment_interest_rates: !isRecurring && formData.payment_method === "parcelado_taxa_cliente"
            ? buildInstallmentInterestRates(installment_interest_rates, formData.installments)
            : null,
          is_default: true,
        } as any,
      ]);

      if (priceError) throw priceError;

      toast({
        title: "Produto criado com sucesso!",
        description: "O produto e o preço principal foram criados.",
      });

      setFormData({
        name: "",
        description: "",
        image_url: "",
        category: "" as ProductCategory,
        product_type: "" as ProductType,
        payment_method: "" as PaymentMethod,
        subscription_period: "" as SubscriptionPeriod | "",
        price: "",
        installments: "1",
        installment_interest_rates: {},
      });
      setOpen(false);
      onProductCreated();
    } catch (error: any) {
      toast({
        title: "Erro ao criar produto",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const maxInstallmentsForRates = normalizeInstallments(formData.installments);
  const showInstallmentInterestRates =
    formData.product_type !== "recorrente" &&
    formData.payment_method === "parcelado_taxa_cliente" &&
    maxInstallmentsForRates > 1;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Novo Produto
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar Novo Produto</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Produto *</Label>
            <Input
              id="name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Curso de Marketing Digital"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição *</Label>
            <Textarea
              id="description"
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descreva seu produto..."
              rows={4}
            />
          </div>

          <ImageUpload
            currentImageUrl={formData.image_url}
            onImageUploaded={(url) => setFormData({ ...formData, image_url: url })}
            onImageRemoved={() => setFormData({ ...formData, image_url: "" })}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Preço principal (R$) *</Label>
              <Input
                id="price"
                type="text"
                required
                value={formData.price}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "");
                  const numericValue = value ? (parseInt(value) / 100).toFixed(2) : "";
                  setFormData({ ...formData, price: numericValue });
                }}
                placeholder="0,00"
              />
            </div>

            {formData.product_type !== "recorrente" &&
              (formData.payment_method === "parcelado_taxa_cliente" ||
                formData.payment_method === "parcelado_taxa_vendedor") && (
              <div className="space-y-2">
                <Label htmlFor="installments">Número de Parcelas *</Label>
                <Input
                  id="installments"
                  type="number"
                  min="1"
                  max="12"
                  required
                  value={formData.installments}
                  onChange={(e) => setFormData({ ...formData, installments: e.target.value })}
                  placeholder="1"
                />
              </div>
            )}
          </div>

          {showInstallmentInterestRates && (
            <div className="space-y-2">
              <div>
                <Label>Taxa do cliente por parcela (%)</Label>
                <p className="text-xs text-muted-foreground">Deixe vazio para 0%.</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Array.from({ length: maxInstallmentsForRates - 1 }, (_, index) => {
                  const installment = index + 2;
                  const key = installment.toString();

                  return (
                    <div key={key} className="space-y-1">
                      <Label htmlFor={`create-installment-rate-${key}`} className="text-xs">
                        {installment}x
                      </Label>
                      <Input
                        id={`create-installment-rate-${key}`}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0,00"
                        value={formData.installment_interest_rates[key] || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            installment_interest_rates: {
                              ...formData.installment_interest_rates,
                              [key]: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Categoria *</Label>
              <Select
                required
                value={formData.category}
                onValueChange={(value: ProductCategory) =>
                  setFormData({ ...formData, category: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo de Produto *</Label>
              <Select
                required
                value={formData.product_type}
                onValueChange={(value: ProductType) =>
                  setFormData({
                    ...formData,
                    product_type: value,
                    subscription_period: value === "recorrente" ? formData.subscription_period : "",
                    installments: value === "recorrente" ? "1" : formData.installments,
                    installment_interest_rates:
                      value === "recorrente" ? {} : formData.installment_interest_rates,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRODUCT_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {formData.product_type === "recorrente" && (
            <div className="space-y-2">
              <Label>Período de Assinatura *</Label>
              <Select
                required
                value={formData.subscription_period}
                onValueChange={(value: SubscriptionPeriod) =>
                  setFormData({
                    ...formData,
                    subscription_period: value,
                    installments: "1",
                    installment_interest_rates: {},
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o período" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SUBSCRIPTION_PERIOD_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Assinaturas recorrentes são cobradas em uma única parcela por ciclo.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Forma de Pagamento *</Label>
            <Select
              required
              value={formData.payment_method}
              onValueChange={(value: PaymentMethod) =>
                setFormData({ ...formData, payment_method: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a forma de pagamento" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Criando..." : "Criar Produto"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
