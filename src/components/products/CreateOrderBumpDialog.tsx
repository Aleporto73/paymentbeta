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
import { OrderBumpPreview } from "./OrderBumpPreview";
import type { Product, ProductOrderBump } from "@/types/product";

const formSchema = z.object({
  order_bump_product_id: z.string().min(1, "Selecione um produto"),
  title: z.string().min(3, "O título deve ter no mínimo 3 caracteres"),
  description: z.string().optional(),
  price: z.number().min(0.01, "O preço deve ser maior que zero"),
  is_active: z.boolean().default(true),
  display_order: z.number().int().min(1, "Ordem deve ser maior que zero").default(1),
  preview_background_color: z.string().default("#f8f9fa"),
  preview_text_color: z.string().default("#1f2937"),
  preview_button_color: z.string().default("#3b82f6"),
  preview_position: z.enum(["below_product", "sidebar", "popup"]).default("below_product"),
});

interface CreateOrderBumpDialogProps {
  productId: string;
  products: Product[];
  isOpen: boolean;
  onClose: () => void;
  editingOrderBump: ProductOrderBump | null;
}

export function CreateOrderBumpDialog({
  productId,
  products,
  isOpen,
  onClose,
  editingOrderBump,
}: CreateOrderBumpDialogProps) {
  const queryClient = useQueryClient();
  const [priceDisplay, setPriceDisplay] = useState("");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      order_bump_product_id: "",
      title: "",
      description: "",
      price: 0,
      is_active: true,
      display_order: 1,
      preview_background_color: "#f8f9fa",
      preview_text_color: "#1f2937",
      preview_button_color: "#3b82f6",
      preview_position: "below_product",
    },
  });

  const watchedValues = form.watch();

  useEffect(() => {
    if (isOpen) {
      if (editingOrderBump) {
        form.reset({
          order_bump_product_id: editingOrderBump.order_bump_product_id,
          title: editingOrderBump.title,
          description: editingOrderBump.description || "",
          price: editingOrderBump.price,
          is_active: editingOrderBump.is_active,
          display_order: editingOrderBump.display_order,
          preview_background_color: editingOrderBump.preview_background_color,
          preview_text_color: editingOrderBump.preview_text_color,
          preview_button_color: editingOrderBump.preview_button_color,
          preview_position: editingOrderBump.preview_position,
        });
        setPriceDisplay(formatCurrency(editingOrderBump.price));
      } else {
        form.reset({
          order_bump_product_id: "",
          title: "",
          description: "",
          price: 0,
          is_active: true,
          display_order: 1,
          preview_background_color: "#f8f9fa",
          preview_text_color: "#1f2937",
          preview_button_color: "#3b82f6",
          preview_position: "below_product",
        });
        setPriceDisplay("");
      }
    }
  }, [editingOrderBump, isOpen, form]);

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      if (editingOrderBump) {
        const { error } = await supabase
          .from("product_order_bumps")
          .update({
            order_bump_product_id: values.order_bump_product_id,
            title: values.title,
            description: values.description || null,
            price: values.price,
            is_active: values.is_active,
            display_order: values.display_order,
            preview_background_color: values.preview_background_color,
            preview_text_color: values.preview_text_color,
            preview_button_color: values.preview_button_color,
            preview_position: values.preview_position,
          })
          .eq("id", editingOrderBump.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("product_order_bumps")
          .insert({
            product_id: productId,
            order_bump_product_id: values.order_bump_product_id,
            title: values.title,
            description: values.description || null,
            price: values.price,
            is_active: values.is_active,
            display_order: values.display_order,
            preview_background_color: values.preview_background_color,
            preview_text_color: values.preview_text_color,
            preview_button_color: values.preview_button_color,
            preview_position: values.preview_position,
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-order-bumps", productId] });
      toast.success(
        editingOrderBump
          ? "Order Bump atualizado com sucesso"
          : "Order Bump criado com sucesso"
      );
      onClose();
      form.reset();
      setPriceDisplay("");
    },
    onError: (error) => {
      toast.error("Erro ao salvar Order Bump");
      console.error(error);
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    mutation.mutate(values);
  };

  const availableProducts = products.filter(p => p.id !== productId);
  const selectedProduct = products.find(p => p.id === watchedValues.order_bump_product_id);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingOrderBump ? "Editar Order Bump" : "Adicionar Order Bump"}
          </DialogTitle>
          <DialogDescription>
            Configure uma oferta adicional para ser exibida no checkout
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
                  name="order_bump_product_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Produto do Order Bump</FormLabel>
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
                        Selecione o produto que será oferecido como Order Bump
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
                        <Input placeholder="Ex: Adicione este produto por apenas..." {...field} />
                      </FormControl>
                      <FormDescription>
                        Título chamativo para a oferta de Order Bump
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
                        <FormLabel>Preço do Order Bump</FormLabel>
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
                </div>

                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Ativo</FormLabel>
                        <FormDescription>
                          Ative ou desative este Order Bump
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
                <OrderBumpPreview 
                  orderBump={watchedValues}
                  productName={selectedProduct?.name}
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

                <div className="grid grid-cols-2 gap-4">
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

                  <FormField
                    control={form.control}
                    name="preview_position"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Posição no Checkout</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-background">
                            <SelectItem value="below_product">Abaixo do Produto</SelectItem>
                            <SelectItem value="sidebar">Barra Lateral</SelectItem>
                            <SelectItem value="popup">Pop-up</SelectItem>
                          </SelectContent>
                        </Select>
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
                  {mutation.isPending
                    ? "Salvando..."
                    : editingOrderBump
                    ? "Atualizar"
                    : "Criar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
