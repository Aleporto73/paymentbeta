import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Plus, Trash2, Code, Eye } from "lucide-react";

interface ProductUpsellTabProps {
  productId: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
}

interface Upsell {
  id: string;
  upsell_product_id: string;
  title: string;
  description: string | null;
  price: number;
  discount_percentage: number | null;
  is_active: boolean;
  display_order: number;
  unique_code: string;
  created_at: string;
  redirect_url?: string | null;
}

export function ProductUpsellTab({ productId }: ProductUpsellTabProps) {
  const { toast } = useToast();
  const [upsells, setUpsells] = useState<Upsell[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUpsell, setEditingUpsell] = useState<Upsell | null>(null);
  
  // Form state
  const [selectedProduct, setSelectedProduct] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [discountPercentage, setDiscountPercentage] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [displayOrder, setDisplayOrder] = useState("1");
  const [redirectUrl, setRedirectUrl] = useState("");

  useEffect(() => {
    fetchData();
  }, [productId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch upsells
      const { data: upsellsData, error: upsellsError } = await supabase
        .from('product_upsells')
        .select('*')
        .eq('product_id', productId)
        .order('display_order', { ascending: true });

      if (upsellsError) throw upsellsError;
      setUpsells(upsellsData || []);

      // Fetch products for selection
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('id, name, price')
        .eq('user_id', user.id)
        .neq('id', productId)
        .order('name');

      if (productsError) throw productsError;
      setProducts(productsData || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar upsells",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedProduct("");
    setTitle("");
    setDescription("");
    setPrice("");
    setDiscountPercentage("");
    setIsActive(true);
    setDisplayOrder("1");
    setRedirectUrl("");
    setEditingUpsell(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const upsellData = {
        product_id: productId,
        upsell_product_id: selectedProduct,
        title,
        description: description || null,
        price: parseFloat(price),
        discount_percentage: discountPercentage ? parseFloat(discountPercentage) : null,
        is_active: isActive,
        display_order: parseInt(displayOrder),
        redirect_url: redirectUrl || null,
      };

      if (editingUpsell) {
        const { error } = await supabase
          .from('product_upsells')
          .update(upsellData)
          .eq('id', editingUpsell.id);

        if (error) throw error;
        toast({ title: "Upsell atualizado com sucesso!" });
      } else {
        const { error } = await supabase
          .from('product_upsells')
          .insert(upsellData);

        if (error) throw error;
        toast({ title: "Upsell criado com sucesso!" });
      }

      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar upsell",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEdit = (upsell: Upsell) => {
    setEditingUpsell(upsell);
    setSelectedProduct(upsell.upsell_product_id);
    setTitle(upsell.title);
    setDescription(upsell.description || "");
    setPrice(upsell.price.toString());
    setDiscountPercentage(upsell.discount_percentage?.toString() || "");
    setIsActive(upsell.is_active);
    setDisplayOrder(upsell.display_order.toString());
    setRedirectUrl(upsell.redirect_url || "");
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('product_upsells')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: "Upsell excluído com sucesso!" });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir upsell",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getWidgetCode = (upsellCode: string) => {
    return `<!-- Widget de Upsell Modal -->
<script>
(function() {
  const script = document.createElement('script');
  script.src = '${window.location.origin}/upsell-widget.js';
  script.dataset.upsellId = '${upsellCode}';
  document.body.appendChild(script);
})();
</script>

<!-- Adicione este código no seu botão CTA -->
<button onclick="openUpsellModal()">🎁 Ver Oferta Especial!</button>`;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">Carregando...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upsell One-Click</CardTitle>
        <CardDescription>
          Configure ofertas de upsell que aparecerão na página de obrigado com pagamento One-Click
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex justify-end">
          <Button onClick={() => setShowForm(true)} disabled={showForm}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Upsell
          </Button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-4 border rounded-lg p-4">
            <div className="grid gap-4">
              <div>
                <Label htmlFor="product">Produto do Upsell *</Label>
                <Select value={selectedProduct} onValueChange={setSelectedProduct} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} - R$ {product.price.toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="title">Título do Upsell *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Aproveite esta oferta especial!"
                  required
                />
              </div>

              <div>
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva a oferta do upsell"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="price">Preço (R$) *</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="discount">Desconto (%)</Label>
                  <Input
                    id="discount"
                    type="number"
                    step="0.01"
                    value={discountPercentage}
                    onChange={(e) => setDiscountPercentage(e.target.value)}
                    placeholder="Ex: 20"
                  />
                </div>
              </div>

               <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="order">Ordem de Exibição</Label>
                  <Input
                    id="order"
                    type="number"
                    value={displayOrder}
                    onChange={(e) => setDisplayOrder(e.target.value)}
                    min="1"
                  />
                </div>

                <div className="flex items-center space-x-2 pt-8">
                  <Switch
                    id="active"
                    checked={isActive}
                    onCheckedChange={setIsActive}
                  />
                  <Label htmlFor="active">Upsell ativo</Label>
                </div>
              </div>

              <div>
                <Label htmlFor="redirectUrl">URL de Redirecionamento (após pagamento aprovado)</Label>
                <Input
                  id="redirectUrl"
                  type="url"
                  value={redirectUrl}
                  onChange={(e) => setRedirectUrl(e.target.value)}
                  placeholder="https://seusite.com/obrigado-upsell"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Deixe em branco para apenas fechar o modal após o pagamento
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
              <Button type="submit">
                {editingUpsell ? "Atualizar" : "Criar"} Upsell
              </Button>
            </div>
          </form>
        )}

        {upsells.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            Nenhum upsell configurado ainda. Crie seu primeiro upsell!
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ordem</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Código</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {upsells.map((upsell) => (
                <TableRow key={upsell.id}>
                  <TableCell>{upsell.display_order}</TableCell>
                  <TableCell>{upsell.title}</TableCell>
                  <TableCell>R$ {upsell.price.toFixed(2)}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded text-xs ${upsell.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {upsell.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-2 py-1 rounded">{upsell.unique_code}</code>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Code className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                       <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Código do Widget</DialogTitle>
                          <DialogDescription>
                            Cole este código na sua página de obrigado (precisa ter transaction_token na URL)
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <h4 className="font-semibold mb-2">Como usar:</h4>
                            <ol className="text-sm space-y-1 list-decimal list-inside text-muted-foreground">
                              <li>Cole o código do script na sua página de obrigado</li>
                              <li>Adicione um botão CTA que chama <code className="bg-muted px-1 rounded">openUpsellModal()</code></li>
                              <li>O cliente verá um modal com a oferta e poderá comprar com One-Click</li>
                            </ol>
                          </div>
                          <div className="bg-muted p-4 rounded-lg">
                            <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                              {getWidgetCode(upsell.unique_code)}
                            </pre>
                          </div>
                        </div>
                        <Button
                          onClick={() => {
                            navigator.clipboard.writeText(getWidgetCode(upsell.unique_code));
                            toast({ title: "Código copiado!" });
                          }}
                        >
                          Copiar Código
                        </Button>
                      </DialogContent>
                    </Dialog>

                    <Button variant="outline" size="sm" onClick={() => handleEdit(upsell)}>
                      <Eye className="h-4 w-4" />
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir Upsell</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja excluir este upsell? Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(upsell.id)}>
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
