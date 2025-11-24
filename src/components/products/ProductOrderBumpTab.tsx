import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
import { CreateOrderBumpDialog } from "./CreateOrderBumpDialog";
import type { ProductOrderBump, Product } from "@/types/product";

interface ProductOrderBumpTabProps {
  productId: string;
}

export function ProductOrderBumpTab({ productId }: ProductOrderBumpTabProps) {
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingOrderBump, setEditingOrderBump] = useState<ProductOrderBump | null>(null);
  const [deleteOrderBumpId, setDeleteOrderBumpId] = useState<string | null>(null);

  const { data: orderBumps, isLoading } = useQuery({
    queryKey: ["product-order-bumps", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_order_bumps")
        .select("*")
        .eq("product_id", productId)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return data as ProductOrderBump[];
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products-for-order-bump"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("products")
        .select("id, name, price")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return data as Product[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("product_order_bumps")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-order-bumps", productId] });
      toast.success("Order Bump excluído com sucesso");
      setDeleteOrderBumpId(null);
    },
    onError: (error) => {
      toast.error("Erro ao excluir Order Bump");
      console.error(error);
    },
  });

  const getProductName = (productId: string) => {
    return products?.find(p => p.id === productId)?.name || "Produto não encontrado";
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Order Bump</CardTitle>
          <CardDescription>Configure ofertas adicionais no checkout</CardDescription>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Adicionar Order Bump
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : orderBumps && orderBumps.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Ordem</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderBumps.map((orderBump) => (
                <TableRow key={orderBump.id}>
                  <TableCell className="font-medium text-center">
                    {orderBump.display_order}
                  </TableCell>
                  <TableCell>{orderBump.title}</TableCell>
                  <TableCell>{getProductName(orderBump.order_bump_product_id)}</TableCell>
                  <TableCell>
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format(orderBump.price)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={orderBump.is_active ? "default" : "secondary"}>
                      {orderBump.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingOrderBump(orderBump);
                          setIsCreateDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteOrderBumpId(orderBump.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted-foreground text-center py-8">
            Nenhum Order Bump cadastrado. Clique em "Adicionar Order Bump" para criar um.
          </p>
        )}

        <CreateOrderBumpDialog
          productId={productId}
          products={products || []}
          isOpen={isCreateDialogOpen}
          onClose={() => {
            setIsCreateDialogOpen(false);
            setEditingOrderBump(null);
          }}
          editingOrderBump={editingOrderBump}
        />

        <AlertDialog open={!!deleteOrderBumpId} onOpenChange={() => setDeleteOrderBumpId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir este Order Bump? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteOrderBumpId && deleteMutation.mutate(deleteOrderBumpId)}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
