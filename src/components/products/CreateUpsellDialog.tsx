import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { formatCurrency, parseCurrency } from "@/lib/utils";
import { UpsellPreview } from "./UpsellPreview";
import type { Product, ProductUpsell } from "@/types/product";

const formSchema = z.object({
  upsell_product_id: z.string().min(1, "Selecione um produto"),
  title: z.string().min(3, "O título deve ter no mínimo 3 caracteres"),
  description: z.string().optional(),
  price: z.number().min(0.01, "O preço deve ser maior que zero"),
  discount_percentage: z.number().optional(),
  is_active: z.boolean().default(true),
  display_order: z.number().int().min(1, "Ordem deve ser maior que zero").default(1),
  redirect_url: z.string().optional(),
  preview_background_color: z.string().default("#f8f9fa"),
  preview_text_color: z.string().default("#1f2937"),
  preview_button_color: z.string().default("#3b82f6"),
  accept_button_text: z.string().default("Sim, eu quero!"),
  decline_button_text: z.string().default("Não, obrigado"),
});

interface CreateUpsellDialogProps {
  productId: string;
  products: Product[];
  isOpen: boolean;
  onClose: () => void;
  editingUpsell: (ProductUpsell & { 
    preview_background_color?: string;
    preview_text_color?: string;
    preview_button_color?: string;
  }) | null;
}

export function CreateUpsellDialog({
  productId,
  products,
  isOpen,
  onClose,
  editingUpsell,
}: CreateUpsellDialogProps) {
  const queryClient = useQueryClient();
  const [priceDisplay, setPriceDisplay] = useState("");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      upsell_product_id: "",
      title: "",
      description: "",
      price: 0,
      discount_percentage: undefined,
      is_active: true,
      display_order: 1,
      redirect_url: "",
      preview_background_color: "#f8f9fa",
      preview_text_color: "#1f2937",
      preview_button_color: "#3b82f6",
      accept_button_text: "Sim, eu quero!",
      decline_button_text: "Não, obrigado",
    },
  });

  const watchedValues = form.watch();

  useEffect(() => {
    if (isOpen) {
      if (editingUpsell) {
        form.reset({
          upsell_product_id: editingUpsell.upsell_product_id,
          title: editingUpsell.title,
          description: editingUpsell.description || "",
          price: editingUpsell.price,
          discount_percentage: editingUpsell.discount_percentage || undefined,
          is_active: editingUpsell.is_active,
          display_order: editingUpsell.display_order,
          redirect_url: editingUpsell.redirect_url || "",
          preview_background_color: editingUpsell.preview_background_color || "#f8f9fa",
          preview_text_color: editingUpsell.preview_text_color || "#1f2937",
          preview_button_color: editingUpsell.preview_button_color || "#3b82f6",
          accept_button_text: (editingUpsell as any).accept_button_text || "Sim, eu quero!",
          decline_button_text: (editingUpsell as any).decline_button_text || "Não, obrigado",
        });
        setPriceDisplay(formatCurrency(editingUpsell.price));
      } else {
        form.reset({
          upsell_product_id: "",
          title: "",
          description: "",
          price: 0,
          discount_percentage: undefined,
          is_active: true,
          display_order: 1,
          redirect_url: "",
          preview_background_color: "#f8f9fa",
          preview_text_color: "#1f2937",
          preview_button_color: "#3b82f6",
          accept_button_text: "Sim, eu quero!",
          decline_button_text: "Não, obrigado",
        });
        setPriceDisplay("");
      }
    }
  }, [editingUpsell, isOpen, form]);

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      const upsellData = {
        product_id: productId,
        upsell_product_id: values.upsell_product_id,
        title: values.title,
        description: values.description || null,
        price: values.price,
        discount_percentage: values.discount_percentage || null,
        is_active: values.is_active,
        display_order: values.display_order,
        redirect_url: values.redirect_url || null,
        preview_background_color: values.preview_background_color,
        preview_text_color: values.preview_text_color,
        preview_button_color: values.preview_button_color,
        accept_button_text: values.accept_button_text,
        decline_button_text: values.decline_button_text,
      };

      if (editingUpsell) {
        const { error } = await supabase
          .from("product_upsells")
          .update(upsellData)
          .eq("id", editingUpsell.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("product_upsells")
          .insert(upsellData);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-upsells", productId] });
      toast.success(
        editingUpsell
          ? "Upsell atualizado com sucesso"
          : "Upsell criado com sucesso"
      );
      onClose();
      form.reset();
      setPriceDisplay("");
    },
    onError: (error) => {
      toast.error("Erro ao salvar Upsell");
      console.error(error);
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    mutation.mutate(values);
  };

  const availableProducts = products.filter(p => p.id !== productId);
  const selectedProduct = products.find(p => p.id === watchedValues.upsell_product_id);
  const selectedProductImage = selectedProduct?.image_url;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingUpsell ? "Editar Upsell" : "Adicionar Upsell"}
          </DialogTitle>
          <DialogDescription>
            Configure uma oferta de upsell com pagamento One-Click
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="configuracao" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="configuracao">Configuração</TabsTrigger>
            <TabsTrigger value="preview">Preview & Personalização</TabsTrigger>
          </TabsList>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <TabsContent value="configuracao" className="space-y-4">
                <FormField
                  control={form.control}
                  name="upsell_product_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Produto do Upsell</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um produto" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-background">
                          {availableProducts.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name} - {new Intl.NumberFormat("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              }).format(product.price)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Selecione o produto que será oferecido como Upsell
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Título</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Aproveite esta oferta especial!" {...field} />
                      </FormControl>
                      <FormDescription>
                        Título chamativo para a oferta de Upsell
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descrição</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Descreva os benefícios de adicionar este produto..."
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Descrição persuasiva da oferta (opcional)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Preço do Upsell</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                              R$
                            </span>
                            <Input
                              type="text"
                              placeholder="0,00"
                              className="pl-10"
                              value={priceDisplay}
                              onChange={(e) => {
                                const value = e.target.value;
                                setPriceDisplay(value);
                                const numericValue = parseCurrency(value);
                                field.onChange(numericValue);
                              }}
                              onBlur={() => {
                                if (priceDisplay) {
                                  const numericValue = parseCurrency(priceDisplay);
                                  setPriceDisplay(formatCurrency(numericValue));
                                }
                              }}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="discount_percentage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Desconto (%)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Ex: 20"
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="display_order"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ordem de Exibição</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          placeholder="1"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="redirect_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL de Redirecionamento</FormLabel>
                      <FormControl>
                        <Input
                          type="url"
                          placeholder="https://seusite.com/obrigado-upsell"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        URL para redirecionar após pagamento aprovado (opcional)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Ativo</FormLabel>
                        <FormDescription>
                          Ative ou desative este Upsell
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="preview" className="space-y-4">
                <UpsellPreview 
                  upsell={watchedValues}
                  productName={selectedProduct?.name}
                  imageUrl={selectedProductImage || undefined}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="preview_background_color"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cor de Fundo</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Input type="color" {...field} className="w-16 h-10" />
                            <Input 
                              type="text" 
                              value={field.value}
                              onChange={field.onChange}
                              placeholder="#f8f9fa"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="preview_text_color"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cor do Texto</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Input type="color" {...field} className="w-16 h-10" />
                            <Input 
                              type="text" 
                              value={field.value}
                              onChange={field.onChange}
                              placeholder="#1f2937"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="preview_button_color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cor do Botão</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input type="color" {...field} className="w-16 h-10" />
                          <Input 
                            type="text" 
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="#3b82f6"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="accept_button_text"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Texto do Botão "Aceitar"</FormLabel>
                        <FormControl>
                          <Input 
                            type="text" 
                            placeholder="Sim, eu quero!"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Texto do botão de aceitar a oferta
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="decline_button_text"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Texto do Botão "Recusar"</FormLabel>
                        <FormControl>
                          <Input 
                            type="text" 
                            placeholder="Não, obrigado"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Texto do botão de recusar a oferta
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Salvando..." : editingUpsell ? "Atualizar" : "Criar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
