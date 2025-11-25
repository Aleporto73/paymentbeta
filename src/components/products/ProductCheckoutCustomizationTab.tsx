import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageUpload } from "./ImageUpload";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface ProductCheckoutCustomizationTabProps {
  productId: string;
}

export function ProductCheckoutCustomizationTab({ productId }: ProductCheckoutCustomizationTabProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [headerImageUrl, setHeaderImageUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchCheckoutCustomization();
  }, [productId]);

  const fetchCheckoutCustomization = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select("checkout_header_image_url")
        .eq("id", productId)
        .single();

      if (error) throw error;

      setHeaderImageUrl(data.checkout_header_image_url || null);
    } catch (error) {
      console.error("Erro ao carregar personalização:", error);
      toast.error("Erro ao carregar personalização do checkout");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from("products")
        .update({ checkout_header_image_url: headerImageUrl })
        .eq("id", productId);

      if (error) throw error;

      toast.success("Personalização salva com sucesso!");
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar personalização");
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
    <Card>
      <CardHeader>
        <CardTitle>Personalização do Checkout</CardTitle>
        <CardDescription>
          Configure uma imagem personalizada para o topo da página de checkout
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Imagem do Topo do Checkout</Label>
          <p className="text-sm text-muted-foreground mb-4">
            Esta imagem será exibida no topo da página de checkout. Recomendamos uma imagem em formato paisagem (landscape).
          </p>
          <ImageUpload
            currentImageUrl={headerImageUrl}
            onImageUploaded={(url) => setHeaderImageUrl(url)}
            onImageRemoved={() => setHeaderImageUrl(null)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar Personalização
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
