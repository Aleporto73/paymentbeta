import { useEffect } from "react";
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
import { toast } from "sonner";
import type { Product, ProductOrderBump } from "@/types/product";

const formSchema = z.object({
  order_bump_product_id: z.string().min(1, "Selecione um produto"),
  title: z.string().min(3, "O título deve ter no mínimo 3 caracteres"),
  description: z.string().optional(),
  price: z.coerce.number().min(0.01, "O preço deve ser maior que zero"),
  is_active: z.boolean().default(true),
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

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      order_bump_product_id: "",
      title: "",
      description: "",
      price: 0,
      is_active: true,
    },
  });

  useEffect(() => {
    if (editingOrderBump) {
      form.reset({
        order_bump_product_id: editingOrderBump.order_bump_product_id,
        title: editingOrderBump.title,
        description: editingOrderBump.description || "",
        price: editingOrderBump.price,
        is_active: editingOrderBump.is_active,
      });
    } else {
      form.reset({
        order_bump_product_id: "",
        title: "",
        description: "",
        price: 0,
        is_active: true,
      });
    }
  }, [editingOrderBump, form, isOpen]);

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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editingOrderBump ? "Editar Order Bump" : "Adicionar Order Bump"}
          </DialogTitle>
          <DialogDescription>
            Configure uma oferta adicional para ser exibida no checkout
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                    <SelectContent>
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

            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Preço do Order Bump</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Preço especial para o Order Bump (pode ser diferente do preço original)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
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
      </DialogContent>
    </Dialog>
  );
}
