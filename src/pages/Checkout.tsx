import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, ChevronDown, ChevronUp, CreditCard, Info, Copy } from "lucide-react";
import { formatCurrency, formatCPF, formatPhone } from "@/lib/utils";
import { toast } from "sonner";
import CheckoutOrderBump from "@/components/checkout/CheckoutOrderBump";
import { ProductOrderBump } from "@/types/product";
import { useCheckoutTracking } from "@/hooks/useCheckoutTracking";
import { usePixPaymentPolling } from "@/hooks/usePixPaymentPolling";

export default function Checkout() {
  const [searchParams] = useSearchParams();
  const productCode = searchParams.get("product");
  const priceCode = searchParams.get("price");
  const affiliateCode = searchParams.get("affiliate");

  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<any>(null);
  const [price, setPrice] = useState<any>(null);
  const [orderBumps, setOrderBumps] = useState<ProductOrderBump[]>([]);
  const [selectedOrderBumps, setSelectedOrderBumps] = useState<Set<string>>(new Set());
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card">("pix");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [showCouponField, setShowCouponField] = useState(false);

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    cpf: "",
    phone: "",
  });
  const [emailError, setEmailError] = useState<string>("");
  const [cpfError, setCpfError] = useState<string>("");
  const [phoneError, setPhoneError] = useState<string>("");

  const [cardData, setCardData] = useState({
    cardholderName: "",
    cardNumber: "",
    zipCode: "",
    expiryDate: "",
    cvv: "",
    installments: "1",
  });
  const [cardError, setCardError] = useState<string>("");
  const [cardBrand, setCardBrand] = useState<string>("");
  const [expiryError, setExpiryError] = useState<string>("");
  const [cep, setCep] = useState("");
  const [address, setAddress] = useState({
    street: "",
    neighborhood: "",
    city: "",
    state: "",
  });
  const [showCoupon, setShowCoupon] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [paymentResult, setPaymentResult] = useState<any>(null);
  const [showPixModal, setShowPixModal] = useState(false);
  const [pixPollingEnabled, setPixPollingEnabled] = useState(false);
  const [productOwnerId, setProductOwnerId] = useState<string | null>(null);

  // Função para gerar token e redirecionar
  const generateAndRedirectWithToken = async (redirectUrl: string, transactionId: string) => {
    try {
      // Gerar token de transação
      const { data: tokenData, error: tokenError } = await supabase.functions.invoke(
        "generate-transaction-token",
        {
          body: { transactionId },
        }
      );

      if (tokenError) {
        console.error("Error generating token:", tokenError);
        // Redirecionar sem token em caso de erro
        window.location.href = redirectUrl;
        return;
      }

      // Adicionar token à URL de redirecionamento
      const urlWithToken = new URL(redirectUrl, window.location.origin);
      urlWithToken.searchParams.set("transaction_token", tokenData.token);
      
      window.location.href = urlWithToken.toString();
    } catch (error) {
      console.error("Error generating token:", error);
      // Redirecionar sem token em caso de erro
      window.location.href = redirectUrl;
    }
  };

  const { trackConversion } = useCheckoutTracking({
    productId: product?.id || "",
    priceId: price?.id,
    affiliateCode,
  });

  // Hook de polling inteligente para PIX
  const { isPolling, checkCount } = usePixPaymentPolling({
    paymentId: paymentResult?.payment?.id || null,
    userId: productOwnerId,
    enabled: pixPollingEnabled,
    onSuccess: () => {
      toast.success("Pagamento confirmado! Redirecionando...");
      setPixPollingEnabled(false);
      // Redirecionar para página configurada com token de transação
      setTimeout(async () => {
        const redirectUrl = product?.approved_payment_redirect_url || '/confirmacao';
        const transactionId = paymentResult?.transaction?.id;
        
        if (transactionId && product?.approved_payment_redirect_url) {
          await generateAndRedirectWithToken(redirectUrl, transactionId);
        } else {
          window.location.href = redirectUrl;
        }
      }, 2000);
    },
    onError: (error) => {
      toast.error(error);
      setPixPollingEnabled(false);
      // Redirecionar para página de erro configurada ou página padrão
      setTimeout(() => {
        const redirectUrl = product?.rejected_payment_redirect_url || '/pagamento-recusado';
        window.location.href = redirectUrl;
      }, 2000);
    },
  });

  // Funções de validação
  const validateEmail = (email: string) => {
    if (!email) {
      setEmailError("");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError("Digite um e-mail válido");
    } else {
      setEmailError("");
    }
  };

  const validateCPF = (cpf: string) => {
    if (!cpf) {
      setCpfError("");
      return;
    }
    
    const cleanCPF = cpf.replace(/\D/g, '');
    
    if (cleanCPF.length < 11) {
      setCpfError("CPF incompleto");
      return;
    }

    if (cleanCPF.length === 14) {
      // É CNPJ, validação simplificada
      setCpfError("");
      return;
    }
    
    // Validação de CPF
    if (cleanCPF.length !== 11 || /^(\d)\1{10}$/.test(cleanCPF)) {
      setCpfError("CPF inválido");
      return;
    }
    
    let sum = 0;
    let remainder;
    
    for (let i = 1; i <= 9; i++) {
      sum += parseInt(cleanCPF.substring(i - 1, i)) * (11 - i);
    }
    
    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cleanCPF.substring(9, 10))) {
      setCpfError("CPF inválido");
      return;
    }
    
    sum = 0;
    for (let i = 1; i <= 10; i++) {
      sum += parseInt(cleanCPF.substring(i - 1, i)) * (12 - i);
    }
    
    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cleanCPF.substring(10, 11))) {
      setCpfError("CPF inválido");
      return;
    }
    
    setCpfError("");
  };

  const validatePhone = (phone: string) => {
    if (!phone) {
      setPhoneError("");
      return;
    }
    
    const cleanPhone = phone.replace(/\D/g, '');
    
    if (cleanPhone.length < 11) {
      setPhoneError("Celular incompleto");
      return;
    }
    
    if (cleanPhone.length !== 11) {
      setPhoneError("Celular inválido");
      return;
    }
    
    // Validar DDD (11-99)
    const ddd = parseInt(cleanPhone.substring(0, 2));
    if (ddd < 11 || ddd > 99) {
      setPhoneError("DDD inválido");
      return;
    }
    
    // Validar se o nono dígito é 9 (celular)
    if (cleanPhone[2] !== '9') {
      setPhoneError("Número deve ser de celular");
      return;
    }
    
    setPhoneError("");
  };

  // Detectar bandeira do cartão
  const detectCardBrand = (cardNumber: string) => {
    const cleanNumber = cardNumber.replace(/\s/g, '');
    
    if (/^4/.test(cleanNumber)) {
      return 'Visa';
    } else if (/^5[1-5]/.test(cleanNumber)) {
      return 'Mastercard';
    } else if (/^3[47]/.test(cleanNumber)) {
      return 'Amex';
    } else if (/^6(?:011|5)/.test(cleanNumber)) {
      return 'Discover';
    } else if (/^(?:2131|1800|35)/.test(cleanNumber)) {
      return 'JCB';
    } else if (/^3(?:0[0-5]|[68])/.test(cleanNumber)) {
      return 'Diners';
    } else if (/^(?:5[06789]|6)/.test(cleanNumber)) {
      return 'Elo';
    } else if (/^(636368|438935|504175|451416|636297)/.test(cleanNumber)) {
      return 'Hipercard';
    }
    return '';
  };

  // Validação Luhn
  const luhnValidation = (cardNumber: string) => {
    const cleanNumber = cardNumber.replace(/\s/g, '');
    
    if (cleanNumber.length < 13) {
      return false;
    }
    
    let sum = 0;
    let isEven = false;
    
    for (let i = cleanNumber.length - 1; i >= 0; i--) {
      let digit = parseInt(cleanNumber[i]);
      
      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      
      sum += digit;
      isEven = !isEven;
    }
    
    return sum % 10 === 0;
  };

  // Validar cartão de crédito
  const validateCard = (cardNumber: string) => {
    if (!cardNumber) {
      setCardError("");
      setCardBrand("");
      return;
    }
    
    const cleanNumber = cardNumber.replace(/\s/g, '');
    
    if (cleanNumber.length < 13) {
      setCardError("Número incompleto");
      const brand = detectCardBrand(cardNumber);
      setCardBrand(brand);
      return;
    }
    
    const brand = detectCardBrand(cardNumber);
    setCardBrand(brand);
    
    if (!brand) {
      setCardError("Bandeira não identificada");
      return;
    }
    
    // Validar com algoritmo de Luhn
    if (!luhnValidation(cardNumber)) {
      setCardError("Número de cartão inválido");
      return;
    }
    
    setCardError("");
  };

  // Validar data de vencimento
  const validateExpiryDate = (expiryDate: string) => {
    if (!expiryDate) {
      setExpiryError("");
      return;
    }

    const cleanDate = expiryDate.replace(/\D/g, '');
    
    if (cleanDate.length < 4) {
      setExpiryError("Data incompleta");
      return;
    }

    const month = parseInt(cleanDate.substring(0, 2));
    const year = parseInt(cleanDate.substring(2, 4));

    // Validar mês entre 01-12
    if (month < 1 || month > 12) {
      setExpiryError("Mês inválido (01-12)");
      return;
    }

    // Verificar se está expirado
    const now = new Date();
    const currentYear = now.getFullYear() % 100; // Últimos 2 dígitos do ano
    const currentMonth = now.getMonth() + 1; // Mês atual (1-12)

    if (year < currentYear || (year === currentYear && month < currentMonth)) {
      setExpiryError("Cartão vencido");
      return;
    }

    setExpiryError("");
  };

  const handleCepChange = async (value: string) => {
    const cleanedCep = value.replace(/\D/g, '');
    const formattedCep = cleanedCep.replace(/^(\d{5})(\d)/, '$1-$2').slice(0, 9);
    setCep(formattedCep);

    if (cleanedCep.length === 8) {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanedCep}/json/`);
        const data = await response.json();
        
        if (!data.erro) {
          setAddress({
            street: data.logradouro || "",
            neighborhood: data.bairro || "",
            city: data.localidade || "",
            state: data.uf || "",
          });
        } else {
          toast.error("CEP não encontrado");
        }
      } catch (error) {
        toast.error("Erro ao buscar CEP");
      }
    }
  };

  useEffect(() => {
    // Preencher campos a partir dos parâmetros da URL
    const name = searchParams.get("name") || searchParams.get("nome");
    const email = searchParams.get("email");
    
    if (name || email) {
      setFormData(prev => ({
        ...prev,
        fullName: name || prev.fullName,
        email: email || prev.email,
      }));
      
      if (email) {
        validateEmail(email);
      }
    }
  }, [searchParams]);

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
          .select("*, checkout_header_image_url, approved_payment_redirect_url, rejected_payment_redirect_url")
          .eq("unique_code", productCode)
          .single();

        if (productError) throw productError;
        setProduct(productData);
        setProductOwnerId(productData.user_id);

        // Buscar order bumps ativos
        const { data: orderBumpsData, error: orderBumpsError } = await supabase
          .from("product_order_bumps")
          .select("*")
          .eq("product_id", productData.id)
          .eq("is_active", true)
          .order("display_order");

        if (!orderBumpsError && orderBumpsData) {
          // Buscar imagens dos produtos dos order bumps
          if (orderBumpsData.length > 0) {
            const productIds = orderBumpsData.map(ob => ob.order_bump_product_id);
            const { data: productsData } = await supabase
              .from("products")
              .select("id, image_url")
              .in("id", productIds);

            const orderBumpsWithImages = orderBumpsData.map(ob => ({
              ...ob,
              product_image_url: productsData?.find(p => p.id === ob.order_bump_product_id)?.image_url || null
            }));

            setOrderBumps(orderBumpsWithImages as ProductOrderBump[]);
          } else {
            setOrderBumps([]);
          }
        }

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

    // Validar campos adicionais baseado no método de pagamento
    if (paymentMethod === "card") {
      if (!cardData.cardholderName || !cardData.cardNumber || !cardData.expiryDate || !cardData.cvv || !cardData.zipCode) {
        toast.error("Por favor, preencha todos os dados do cartão");
        return;
      }

      if (cardError || expiryError) {
        toast.error("Por favor, corrija os erros no formulário");
        return;
      }
    }

    // Se for PIX, abrir modal
    if (paymentMethod === "pix") {
      setShowPixModal(true);
    }

    setProcessing(true);

    try {
      // Preparar dados do cliente
      const customerData = {
        name: formData.fullName,
        email: formData.email,
        cpfCnpj: formData.cpf.replace(/\D/g, ''),
        mobilePhone: formData.phone.replace(/\D/g, ''),
        phone: formData.phone.replace(/\D/g, ''),
        postalCode: address.state ? cardData.zipCode.replace(/\D/g, '') : undefined,
        address: address.street || undefined,
        addressNumber: "S/N",
        province: address.neighborhood || undefined,
        city: address.city || undefined,
        state: address.state || undefined,
      };

      // Preparar dados do pagamento
      const billingType = paymentMethod === "pix" ? "PIX" : "CREDIT_CARD";
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7); // Vencimento em 7 dias

      const paymentData: any = {
        billingType,
        value: totalPrice,
        dueDate: dueDate.toISOString().split('T')[0],
        description: `${product.name}${price?.name ? ` - ${price.name}` : ''}`,
        externalReference: `${product.unique_code}-${Date.now()}`,
      };

      // Adicionar dados do cartão se for pagamento com cartão
      if (paymentMethod === "card") {
        const [month, year] = cardData.expiryDate.split('/');
        paymentData.creditCard = {
          holderName: cardData.cardholderName,
          number: cardData.cardNumber.replace(/\s/g, ''),
          expiryMonth: month,
          expiryYear: `20${year}`,
          ccv: cardData.cvv,
        };

        const installments = parseInt(cardData.installments);
        if (installments > 1) {
          paymentData.installmentCount = installments;
          paymentData.installmentValue = totalPrice / installments;
        }
      }

      // Preparar order bumps selecionados
      const selectedBumps = Array.from(selectedOrderBumps).map(bumpId => {
        const bump = orderBumps.find(b => b.id === bumpId);
        return {
          id: bumpId,
          price: bump?.price || 0,
          title: bump?.title || '',
        };
      });

      // Obter informações do dispositivo
      const deviceInfo = {
        deviceType: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
        userAgent: navigator.userAgent,
        ip: undefined, // Será preenchido no backend
      };

      // Chamar edge function
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: {
          customerData,
          paymentData,
          productId: product.id,
          priceId: price?.id,
          userId: product.user_id,
          affiliateCode,
          orderBumps: selectedBumps,
          deviceInfo,
        },
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Erro ao processar pagamento');
      }

      // Track conversion
      trackConversion(
        Array.from(selectedOrderBumps),
        totalPrice,
        orderBumpsTotal
      );

      setPaymentResult(data);

      if (paymentMethod === "pix") {
        // Modal já está aberto, iniciar polling
        setPixPollingEnabled(true);
      } else {
        // Para cartão de crédito, redirecionar imediatamente
        toast.success("Pagamento processado com sucesso! Redirecionando...");
        setTimeout(async () => {
          const redirectUrl = product.approved_payment_redirect_url || '/confirmacao';
          const transactionId = data?.transaction?.id;
          
          if (transactionId && product.approved_payment_redirect_url) {
            await generateAndRedirectWithToken(redirectUrl, transactionId);
          } else {
            window.location.href = redirectUrl;
          }
        }, 2000);
      }

    } catch (error: any) {
      console.error("Erro ao processar pagamento:", error);
      toast.error(error.message || "Erro ao processar pagamento. Tente novamente.");
      setShowPixModal(false);
      
      // Redirecionar para página de erro se configurada
      if (product?.rejected_payment_redirect_url) {
        setTimeout(() => {
          window.location.href = product.rejected_payment_redirect_url;
        }, 3000);
      }
    } finally {
      setProcessing(false);
    }
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
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-2xl w-full text-center">
          <div className="mb-6 flex justify-center">
            <div className="w-24 h-24 rounded-full bg-destructive flex items-center justify-center">
              <span className="text-4xl text-destructive-foreground font-bold">!</span>
            </div>
          </div>
          
          <h1 className="text-3xl font-bold mb-3">Ops! Oferta Não Encontrada</h1>
          <p className="text-muted-foreground mb-8">
            A oferta que você está procurando não foi encontrada ou não está mais disponível.
          </p>

          <Card className="mb-8">
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4 text-left">O que você pode fazer?</h2>
              <ul className="text-left space-y-2 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>Verifique se o link está correto.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>Volte para a nossa página inicial e explore outras ofertas.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>Caso tenha dúvidas, entre em contato com nosso suporte.</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Button 
            className="w-full md:w-auto px-12 h-12 bg-[#157347] hover:bg-[#157347]/90 text-white font-semibold"
            onClick={() => window.location.href = '/'}
          >
            Voltar para a Página Inicial
          </Button>

          <footer className="mt-12 text-sm text-muted-foreground">
            Tecnologia Payment App © 2025 - Todos os direitos reservados
          </footer>
        </div>
      </div>
    );
  }

  const finalPrice = price?.price || product.price;
  
  const toggleOrderBump = (orderBumpId: string) => {
    setSelectedOrderBumps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderBumpId)) {
        newSet.delete(orderBumpId);
      } else {
        newSet.add(orderBumpId);
      }
      return newSet;
    });
  };

  const orderBumpsTotal = Array.from(selectedOrderBumps).reduce((total, bumpId) => {
    const bump = orderBumps.find(b => b.id === bumpId);
    return total + (bump?.price || 0);
  }, 0);

  const subtotal = finalPrice + orderBumpsTotal;
  
  const calculateDiscount = () => {
    if (!appliedCoupon) return 0;
    
    if (appliedCoupon.discount_type === 'percentage') {
      return subtotal * (appliedCoupon.discount_value / 100);
    } else {
      return appliedCoupon.discount_value;
    }
  };

  const discount = calculateDiscount();
  const totalPrice = Math.max(0, subtotal - discount);

  const validateCoupon = async () => {
    if (!couponCode.trim()) {
      toast.error("Digite um código de cupom");
      return;
    }

    setValidatingCoupon(true);
    try {
      const { data, error } = await supabase
        .from("product_coupons")
        .select("*")
        .eq("code", couponCode.toUpperCase())
        .eq("product_id", product.id)
        .eq("is_active", true)
        .single();

      if (error || !data) {
        toast.error("Cupom inválido ou expirado");
        return;
      }

      setAppliedCoupon(data);
      toast.success("Cupom aplicado com sucesso!");
    } catch (error) {
      console.error("Erro ao validar cupom:", error);
      toast.error("Erro ao validar cupom");
    } finally {
      setValidatingCoupon(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
    toast.success("Cupom removido");
  };

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Imagem personalizada do topo (se configurada) */}
        {product.checkout_header_image_url && (
          <div className="mb-8 rounded-lg overflow-hidden">
            <img 
              src={product.checkout_header_image_url} 
              alt="Header do checkout" 
              className="w-full h-auto object-cover"
            />
          </div>
        )}

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
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      validateEmail(e.target.value);
                    }}
                    className={emailError ? "border-destructive focus-visible:ring-destructive" : formData.email && !emailError ? "border-green-500 focus-visible:ring-green-500" : ""}
                    required
                  />
                  {emailError && (
                    <p className="text-sm text-destructive mt-1">{emailError}</p>
                  )}
                  {formData.email && !emailError && (
                    <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      E-mail válido
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="cpf">CPF/CNPJ</Label>
                    <Input
                      id="cpf"
                      placeholder="Digite seu CPF/CNPJ"
                      value={formData.cpf}
                      onChange={(e) => {
                        const formatted = formatCPF(e.target.value);
                        setFormData({ ...formData, cpf: formatted });
                        validateCPF(formatted);
                      }}
                      className={cpfError ? "border-destructive focus-visible:ring-destructive" : formData.cpf && !cpfError && formData.cpf.replace(/\D/g, '').length >= 11 ? "border-green-500 focus-visible:ring-green-500" : ""}
                      maxLength={18}
                      required
                    />
                    {cpfError && (
                      <p className="text-sm text-destructive mt-1">{cpfError}</p>
                    )}
                    {formData.cpf && !cpfError && formData.cpf.replace(/\D/g, '').length >= 11 && (
                      <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        {formData.cpf.replace(/\D/g, '').length === 11 ? 'CPF válido' : 'CNPJ válido'}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="phone">Celular</Label>
                    <Input
                      id="phone"
                      placeholder="Digite seu celular"
                      value={formData.phone}
                      onChange={(e) => {
                        const formatted = formatPhone(e.target.value);
                        setFormData({ ...formData, phone: formatted });
                        validatePhone(formatted);
                      }}
                      className={phoneError ? "border-destructive focus-visible:ring-destructive" : formData.phone && !phoneError && formData.phone.replace(/\D/g, '').length === 11 ? "border-green-500 focus-visible:ring-green-500" : ""}
                      maxLength={15}
                    />
                    {phoneError && (
                      <p className="text-sm text-destructive mt-1">{phoneError}</p>
                    )}
                    {formData.phone && !phoneError && formData.phone.replace(/\D/g, '').length === 11 && (
                      <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Celular válido
                      </p>
                    )}
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
                  variant="outline"
                  className={`flex-1 transition-all ${
                    paymentMethod === "pix" 
                      ? "bg-primary/10 border-primary border-2 font-semibold" 
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => setPaymentMethod("pix")}
                >
                  <svg className="w-6 h-6 mr-2" viewBox="0 0 512 512" fill="currentColor">
                    <path d="M242.4 292.5C247.8 287.1 257.1 287.1 262.5 292.5L339.5 369.5C353.7 383.7 372.6 391.5 392.6 391.5H407.7L310.6 488.6C280.3 518.1 231.1 518.1 200.8 488.6L103.3 391.5H112.6C132.6 391.5 151.5 383.7 165.7 369.5L242.4 292.5zM262.5 219.5C257.1 224.9 247.8 224.9 242.4 219.5L165.7 142.5C151.5 128.3 132.6 120.5 112.6 120.5H103.3L200.8 23.4C231.1-6.9 280.3-6.9 310.6 23.4L407.7 120.5H392.6C372.6 120.5 353.7 128.3 339.5 142.5L262.5 219.5zM112.6 142.5C126.4 142.5 139.1 148.3 149.7 158.1L226.4 234.1C233.6 241.3 243.1 245.5 252.5 245.5C261.9 245.5 271.4 241.3 278.6 234.1L355.3 158.1C365.9 148.3 378.6 142.5 392.4 142.5H407.7L488.6 221.9C518.9 252.2 518.9 301.4 488.6 331.7L407.7 410.5H392.6C378.8 410.5 366.1 404.7 355.5 394.9L278.8 318.9C271.6 311.7 262.1 307.5 252.7 307.5C243.3 307.5 233.8 311.7 226.6 318.9L149.9 394.9C139.3 404.7 126.6 410.5 112.8 410.5H103.3L23.4 331.7C-6.9 301.4-6.9 252.2 23.4 221.9L103.3 142.5H112.6z" />
                  </svg>
                  PIX
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={`flex-1 transition-all ${
                    paymentMethod === "card" 
                      ? "bg-primary/10 border-primary border-2 font-semibold" 
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => setPaymentMethod("card")}
                >
                  <CreditCard className="w-5 h-5 mr-2" />
                  Cartão
                </Button>
              </div>

              {paymentMethod === "pix" ? (
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
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="cardholderName">Nome do titular</Label>
                    <Input
                      id="cardholderName"
                      placeholder="Digite o nome do titular"
                      value={cardData.cardholderName}
                      onChange={(e) => setCardData({ ...cardData, cardholderName: e.target.value })}
                      required={paymentMethod === "card"}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="cardNumber">Número do cartão</Label>
                      <div className="relative">
                        <Input
                          id="cardNumber"
                          placeholder="0000 0000 0000 0000"
                          value={cardData.cardNumber}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, '').slice(0, 16);
                            const formatted = value.replace(/(\d{4})(?=\d)/g, '$1 ');
                            setCardData({ ...cardData, cardNumber: formatted });
                            validateCard(formatted);
                          }}
                          className={cardError ? "border-destructive focus-visible:ring-destructive pr-20" : cardData.cardNumber && !cardError && cardData.cardNumber.replace(/\s/g, '').length >= 13 ? "border-green-500 focus-visible:ring-green-500 pr-20" : "pr-20"}
                          maxLength={19}
                          required={paymentMethod === "card"}
                        />
                        {cardBrand && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground bg-muted px-2 py-1 rounded">
                            {cardBrand}
                          </div>
                        )}
                      </div>
                      {cardError && (
                        <p className="text-sm text-destructive mt-1">{cardError}</p>
                      )}
                      {cardData.cardNumber && !cardError && cardData.cardNumber.replace(/\s/g, '').length >= 13 && (
                        <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Cartão válido
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="zipCode">CEP do endereço de cobrança</Label>
                      <Input
                        id="zipCode"
                        placeholder="00000-000"
                        value={cardData.zipCode}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '').slice(0, 8);
                          const formatted = value.replace(/(\d{5})(\d)/, '$1-$2');
                          setCardData({ ...cardData, zipCode: formatted });
                          handleCepChange(formatted);
                        }}
                        maxLength={9}
                        required={paymentMethod === "card"}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="expiryDate">Vencimento</Label>
                      <Input
                        id="expiryDate"
                        placeholder="MM/AA"
                        value={cardData.expiryDate}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                          let formatted = value;
                          if (value.length >= 2) {
                            formatted = value.slice(0, 2) + '/' + value.slice(2);
                          }
                          setCardData({ ...cardData, expiryDate: formatted });
                          validateExpiryDate(formatted);
                        }}
                        className={expiryError ? "border-destructive focus-visible:ring-destructive" : cardData.expiryDate && !expiryError && cardData.expiryDate.length === 5 ? "border-green-500 focus-visible:ring-green-500" : ""}
                        maxLength={5}
                        required={paymentMethod === "card"}
                      />
                      {expiryError && (
                        <p className="text-sm text-destructive mt-1">{expiryError}</p>
                      )}
                      {cardData.expiryDate && !expiryError && cardData.expiryDate.length === 5 && (
                        <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Válido
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="cvv">CVV</Label>
                      <Input
                        id="cvv"
                        placeholder={cardBrand === 'Amex' ? '0000' : '000'}
                        value={cardData.cvv}
                        onChange={(e) => {
                          const maxLength = cardBrand === 'Amex' ? 4 : 3;
                          const value = e.target.value.replace(/\D/g, '').slice(0, maxLength);
                          setCardData({ ...cardData, cvv: value });
                        }}
                        maxLength={cardBrand === 'Amex' ? 4 : 3}
                        required={paymentMethod === "card"}
                      />
                    </div>
                    <div>
                      <Label htmlFor="installments">Parcelamento</Label>
                      <Input
                        id="installments"
                        value={`${cardData.installments} X de R$ ${formatCurrency(totalPrice / parseInt(cardData.installments))}`}
                        readOnly
                        className="cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod === "pix" && (
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between text-lg font-semibold">
                    <span>💵 Valor à vista:</span>
                    <span>R$ {formatCurrency(finalPrice)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Order Bumps */}
          {orderBumps.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xl font-bold">📦 Aproveite esta oferta especial!</h2>
              {orderBumps.map((orderBump) => (
                <CheckoutOrderBump
                  key={orderBump.id}
                  orderBump={orderBump}
                  isSelected={selectedOrderBumps.has(orderBump.id)}
                  onToggle={toggleOrderBump}
                />
              ))}
            </div>
          )}

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
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{product.name}</span>
                    <span className="font-bold">R$ {formatCurrency(finalPrice)}</span>
                  </div>
                  
                  {Array.from(selectedOrderBumps).map(bumpId => {
                    const bump = orderBumps.find(b => b.id === bumpId);
                    if (!bump) return null;
                    return (
                      <div key={bumpId} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{bump.title}</span>
                        <span className="font-semibold">R$ {formatCurrency(bump.price)}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Cupom de Desconto */}
                <div className="border-t pt-4">
                  <button
                    type="button"
                    className="text-primary hover:underline text-sm mb-3 flex items-center gap-2"
                    onClick={() => setShowCoupon(!showCoupon)}
                  >
                    Você tem um cupom?
                    {showCoupon ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {showCoupon && (
                    <div className="space-y-3">
                      {!appliedCoupon ? (
                        <div className="flex gap-2">
                          <Input
                            id="coupon"
                            placeholder="Digite o código do cupom"
                            value={couponCode}
                            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), validateCoupon())}
                            disabled={validatingCoupon}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={validateCoupon}
                            disabled={validatingCoupon}
                          >
                            {validatingCoupon ? "Validando..." : "Aplicar"}
                          </Button>
                        </div>
                      ) : (
                        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                              <span className="text-sm font-medium text-green-700 dark:text-green-300">
                                Cupom {appliedCoupon.code} aplicado
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={removeCoupon}
                              className="h-auto p-1 text-green-700 dark:text-green-300"
                            >
                              Remover
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Total */}
                <div className="border-t pt-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span>R$ {formatCurrency(subtotal)}</span>
                  </div>
                  
                  {appliedCoupon && (
                    <div className="flex items-center justify-between text-sm text-green-600">
                      <span>Desconto ({appliedCoupon.discount_type === 'percentage' ? `${appliedCoupon.discount_value}%` : 'fixo'}):</span>
                      <span>- R$ {formatCurrency(discount)}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between text-lg font-bold">
                    <span>Total:</span>
                    <span className="text-primary">R$ {formatCurrency(totalPrice)}</span>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12 text-lg font-semibold bg-[#157347] hover:bg-[#157347]/90 text-white"
                  disabled={processing}
                >
                  {paymentMethod === "pix" ? "Gerar PIX" : "Comprar agora"}
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

        {/* PIX Modal */}
        <Dialog open={showPixModal} onOpenChange={setShowPixModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {processing ? "Gerando PIX..." : "Pagamento via PIX"}
              </DialogTitle>
            </DialogHeader>

            {processing ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="text-muted-foreground">Aguarde, estamos gerando seu QR Code PIX...</p>
              </div>
            ) : paymentResult?.pixData ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  Escaneie o QR Code abaixo para realizar o pagamento via PIX:
                </p>
                
                <div className="bg-white p-4 rounded-lg flex justify-center border">
                  <img 
                    src={`data:image/png;base64,${paymentResult.pixData.encodedImage}`}
                    alt="QR Code PIX"
                    className="max-w-[250px] w-full"
                  />
                </div>

                <Button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(paymentResult.pixData.payload);
                    toast.success("Código PIX copiado!");
                  }}
                  className="w-full"
                  variant="outline"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copiar código PIX
                </Button>

                {isPolling && (
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        Verificando pagamento automaticamente... ({checkCount} verificações)
                      </p>
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground text-center">
                  O pagamento será confirmado automaticamente após a compensação.
                </p>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        {/* Payment Result for Card - mostrar após processamento */}
        {paymentResult && paymentMethod === "card" && (
          <Card className="mt-6 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
                <h2 className="text-xl font-bold text-green-900 dark:text-green-100">
                  Pagamento Iniciado com Sucesso!
                </h2>
              </div>

              <div className="space-y-4">
                <p className="text-green-800 dark:text-green-200">
                  Seu pagamento foi processado e está sendo analisado. Você receberá uma confirmação por e-mail em breve.
                </p>
                {paymentResult.invoiceUrl && (
                  <Button
                    type="button"
                    onClick={() => window.open(paymentResult.invoiceUrl, '_blank')}
                    className="w-full"
                    variant="outline"
                  >
                    Ver Fatura
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <footer className="mt-8 text-center text-sm text-muted-foreground">
          Tecnologia Payment App © 2025 - Todos os direitos reservados
        </footer>
      </div>
    </div>
  );
}
