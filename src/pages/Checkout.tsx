import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CheckCircle2, CreditCard, Info } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

export default function Checkout() {
  const [searchParams] = useSearchParams();
  const productCode = searchParams.get("product");
  const priceCode = searchParams.get("price");
  const affiliateCode = searchParams.get("affiliate");

  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<any>(null);
  const [price, setPrice] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card">("pix");

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    cpf: "",
    phone: "",
  });

  useEffect(() => {
    const fetchCheckoutData = async () => {
      try {
        if (!productCode) {
          toast.error("Código do produto não fornecido");
          return;
        }

        // Buscar produto
        const { data: productData, error: productError } = await supabase
          .from("products")
          .select("*")
          .eq("unique_code", productCode)
          .single();

        if (productError) throw productError;
        setProduct(productData);

        // Se tiver código de preço específico, buscar, senão usar o padrão
        if (priceCode) {
          const { data: priceData, error: priceError } = await supabase
            .from("product_prices")
            .select("*")
            .eq("unique_code", priceCode)
            .eq("product_id", productData.id)
            .single();

          if (priceError) throw priceError;
          setPrice(priceData);
        } else {
          // Buscar preço padrão
          const { data: defaultPrice, error: priceError } = await supabase
            .from("product_prices")
            .select("*")
            .eq("product_id", productData.id)
            .eq("is_default", true)
            .single();

          if (priceError) {
            // Se não houver preço padrão, usar o preço do produto
            setPrice({ price: productData.price, name: "Padrão" });
          } else {
            setPrice(defaultPrice);
          }
        }
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
        toast.error("Erro ao carregar informações do produto");
      } finally {
        setLoading(false);
      }
    };

    fetchCheckoutData();
  }, [productCode, priceCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.fullName || !formData.email || !formData.cpf) {
      toast.error("Por favor, preencha todos os campos obrigatórios");
      return;
    }

    // Aqui você implementaria a lógica de pagamento
    toast.success("Processando pagamento...");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Produto não encontrado</h1>
          <p className="text-muted-foreground">O produto solicitado não existe ou não está disponível.</p>
        </div>
      </div>
    );
  }

  const finalPrice = price?.price || product.price;

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header com produto */}
        <div className="flex flex-col md:flex-row items-center gap-6 mb-8">
          <div className="w-48 h-32 bg-muted rounded-lg flex items-center justify-center overflow-hidden">
            {product.image_url ? (
              <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
            ) : (
              <div className="text-muted-foreground">Sem imagem</div>
            )}
          </div>
          <div className="flex-1 text-center md:text-left">
            <div className="text-sm text-muted-foreground mb-1">
              Autor: {product.user_id} • Plataforma para {product.category}
            </div>
            <h1 className="text-3xl font-bold mb-2">{product.name}</h1>
            <div className="text-4xl font-bold text-primary mb-2">
              R$ {formatCurrency(finalPrice)}
            </div>
            {price?.name && (
              <div className="text-sm text-destructive font-medium mb-3">
                Valor Promocional Fullpay
              </div>
            )}
            <div className="flex flex-wrap gap-4 justify-center md:justify-start">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span>Acesso Imediato e Vitalício e Plataforma</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span>Pagamento Único</span>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Identificação */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-primary font-semibold">👤</span>
                </div>
                <h2 className="text-xl font-bold">Identificação</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="fullName">Nome completo</Label>
                  <Input
                    id="fullName"
                    placeholder="Seu nome completo"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Seu e-mail"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="cpf">CPF/CNPJ</Label>
                    <Input
                      id="cpf"
                      placeholder="Digite seu CPF/CNPJ"
                      value={formData.cpf}
                      onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Celular</Label>
                    <Input
                      id="phone"
                      placeholder="Digite seu celular"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pagamento */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-xl font-bold">Pagamento</h2>
              </div>

              <div className="flex gap-4 mb-6">
                <Button
                  type="button"
                  variant={paymentMethod === "pix" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setPaymentMethod("pix")}
                >
                  <svg className="w-6 h-6 mr-2" viewBox="0 0 512 512" fill="currentColor">
                    <path d="M242.4 292.5C247.8 287.1 257.1 287.1 262.5 292.5L339.5 369.5C353.7 383.7 372.6 391.5 392.6 391.5H407.7L310.6 488.6C280.3 518.1 231.1 518.1 200.8 488.6L103.3 391.5H112.6C132.6 391.5 151.5 383.7 165.7 369.5L242.4 292.5zM262.5 219.5C257.1 224.9 247.8 224.9 242.4 219.5L165.7 142.5C151.5 128.3 132.6 120.5 112.6 120.5H103.3L200.8 23.4C231.1-6.9 280.3-6.9 310.6 23.4L407.7 120.5H392.6C372.6 120.5 353.7 128.3 339.5 142.5L262.5 219.5zM112.6 142.5C126.4 142.5 139.1 148.3 149.7 158.1L226.4 234.1C233.6 241.3 243.1 245.5 252.5 245.5C261.9 245.5 271.4 241.3 278.6 234.1L355.3 158.1C365.9 148.3 378.6 142.5 392.4 142.5H407.7L488.6 221.9C518.9 252.2 518.9 301.4 488.6 331.7L407.7 410.5H392.6C378.8 410.5 366.1 404.7 355.5 394.9L278.8 318.9C271.6 311.7 262.1 307.5 252.7 307.5C243.3 307.5 233.8 311.7 226.6 318.9L149.9 394.9C139.3 404.7 126.6 410.5 112.8 410.5H103.3L23.4 331.7C-6.9 301.4-6.9 252.2 23.4 221.9L103.3 142.5H112.6z" />
                  </svg>
                  PIX
                </Button>
                <Button
                  type="button"
                  variant={paymentMethod === "card" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setPaymentMethod("card")}
                >
                  <CreditCard className="w-5 h-5 mr-2" />
                  Cartão
                </Button>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-2">
                  <Info className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-semibold mb-2">Informações sobre o pagamento via PIX</p>
                    <p className="text-muted-foreground mb-2">
                      O pagamento é instantâneo e liberação imediata.
                    </p>
                    <p className="text-muted-foreground">
                      Ao clicar em "Comprar agora" você será encaminhado para um ambiente seguro,
                      onde encontrará o passo a passo para realizar o pagamento.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between text-lg font-semibold">
                  <span>💵 Valor à vista:</span>
                  <span>R$ {formatCurrency(finalPrice)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sua Compra */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-primary font-semibold">🛒</span>
                </div>
                <h2 className="text-xl font-bold">Sua Compra</h2>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between pb-4 border-b">
                  <span className="font-medium">{product.name}</span>
                  <span className="font-bold">R$ {formatCurrency(finalPrice)}</span>
                </div>

                <Button type="submit" className="w-full h-12 text-lg font-semibold">
                  Comprar agora
                </Button>

                <p className="text-center text-sm text-muted-foreground">
                  Ao clicar em "Comprar agora", você concorda com os{" "}
                  <a href="#" className="text-primary hover:underline">
                    Termos de Compra
                  </a>{" "}
                  e está ciente da{" "}
                  <a href="#" className="text-primary hover:underline">
                    Política de Privacidade
                  </a>
                  .
                </p>

                <div className="text-center">
                  <div className="inline-flex items-center gap-2 text-sm text-green-600 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    Compra 100% segura
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </form>

        {/* Footer */}
        <footer className="mt-8 text-center text-sm text-muted-foreground">
          Tecnologia Payment App © 2025 - Todos os direitos reservados
        </footer>
      </div>
    </div>
  );
}
