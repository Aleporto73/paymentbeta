import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";

interface ProductRedirectPagesTabProps {
  productId: string;
}

export function ProductRedirectPagesTab({ productId }: ProductRedirectPagesTabProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approvedUrl, setApprovedUrl] = useState("");
  const [rejectedUrl, setRejectedUrl] = useState("");

  useEffect(() => {
    fetchRedirectPages();
  }, [productId]);

  const fetchRedirectPages = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select("approved_payment_redirect_url, rejected_payment_redirect_url")
        .eq("id", productId)
        .single();

      if (error) throw error;

      setApprovedUrl(data.approved_payment_redirect_url || "");
      setRejectedUrl(data.rejected_payment_redirect_url || "");
    } catch (error) {
      console.error("Erro ao carregar URLs:", error);
      toast.error("Erro ao carregar páginas de redirecionamento");
    } finally {
      setLoading(false);
    }
  };

  const validateUrl = (url: string): boolean => {
    if (!url) return true; // URLs vazias são válidas (opcional)
    try {
      new URL(url);
      return url.startsWith("http://") || url.startsWith("https://");
    } catch {
      return false;
    }
  };

  const handleSave = async () => {
    // Validar URLs
    if (approvedUrl && !validateUrl(approvedUrl)) {
      toast.error("URL de pagamento aprovado inválida");
      return;
    }

    if (rejectedUrl && !validateUrl(rejectedUrl)) {
      toast.error("URL de pagamento reprovado inválida");
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase
        .from("products")
        .update({
          approved_payment_redirect_url: approvedUrl || null,
          rejected_payment_redirect_url: rejectedUrl || null,
        })
        .eq("id", productId);

      if (error) throw error;

      toast.success("Páginas de redirecionamento salvas com sucesso!");
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar páginas de redirecionamento");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <CardTitle>Pagamento Aprovado</CardTitle>
          </div>
          <CardDescription>
            URL para onde o cliente será redirecionado quando o pagamento for aprovado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="approved-url">URL de Redirecionamento</Label>
            <div className="flex gap-2 mt-2">
              <Input
                id="approved-url"
                type="url"
                placeholder="https://seusite.com.br/obrigado"
                value={approvedUrl}
                onChange={(e) => setApprovedUrl(e.target.value)}
              />
              {approvedUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(approvedUrl, "_blank")}
                  title="Testar URL"
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Deixe em branco para usar a página padrão do sistema
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-600" />
            <CardTitle>Pagamento Reprovado</CardTitle>
          </div>
          <CardDescription>
            URL para onde o cliente será redirecionado quando o pagamento for reprovado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="rejected-url">URL de Redirecionamento</Label>
            <div className="flex gap-2 mt-2">
              <Input
                id="rejected-url"
                type="url"
                placeholder="https://seusite.com.br/pagamento-recusado"
                value={rejectedUrl}
                onChange={(e) => setRejectedUrl(e.target.value)}
              />
              {rejectedUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(rejectedUrl, "_blank")}
                  title="Testar URL"
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Deixe em branco para usar a página padrão do sistema
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}
