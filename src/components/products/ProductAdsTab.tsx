import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Save } from "lucide-react";
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
import { Tables } from "@/integrations/supabase/types";

interface ProductAdsTabProps {
  productId: string;
}

type AdsConfig = Tables<"product_ads_configs">;
type NewAdsConfig = Omit<AdsConfig, "created_at" | "updated_at" | "product_id">;

const platformLabels = {
  meta: "Meta Ads (Facebook/Instagram)",
  google: "Google Ads",
  tiktok: "TikTok Ads",
  taboola: "Taboola Ads",
};

export function ProductAdsTab({ productId }: ProductAdsTabProps) {
  const [configs, setConfigs] = useState<(AdsConfig | NewAdsConfig)[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchConfigs();
  }, [productId]);

  const fetchConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from("product_ads_configs")
        .select("*")
        .eq("product_id", productId)
        .order("platform");

      if (error) throw error;
      setConfigs(data || []);
    } catch (error) {
      console.error("Error fetching ads configs:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar configurações de anúncios",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddPlatform = (platform: "meta" | "google" | "tiktok" | "taboola") => {
    const exists = configs.some((c) => c.platform === platform);
    if (exists) {
      toast({
        title: "Atenção",
        description: "Esta plataforma já está configurada",
        variant: "destructive",
      });
      return;
    }

    setConfigs([
      ...configs,
      {
        id: crypto.randomUUID(),
        platform,
        pixel_id: null,
        token: null,
        is_active: true,
      },
    ]);
  };

  const handleUpdateConfig = (id: string, field: string, value: any) => {
    setConfigs(
      configs.map((config) =>
        config.id === id ? { ...config, [field]: value } : config
      )
    );
  };

  const handleSaveConfig = async (config: AdsConfig | NewAdsConfig) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("product_ads_configs")
        .upsert({
          id: config.id,
          product_id: productId,
          platform: config.platform,
          pixel_id: config.pixel_id,
          token: config.token,
          is_active: config.is_active,
        });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Configuração salva com sucesso",
      });
      fetchConfigs();
    } catch (error) {
      console.error("Error saving ads config:", error);
      toast({
        title: "Erro",
        description: "Erro ao salvar configuração",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfig = async () => {
    if (!deleteId) return;

    try {
      const { error } = await supabase
        .from("product_ads_configs")
        .delete()
        .eq("id", deleteId);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Configuração removida com sucesso",
      });
      fetchConfigs();
    } catch (error) {
      console.error("Error deleting ads config:", error);
      toast({
        title: "Erro",
        description: "Erro ao remover configuração",
        variant: "destructive",
      });
    } finally {
      setDeleteId(null);
    }
  };

  const availablePlatforms = (
    Object.keys(platformLabels) as Array<keyof typeof platformLabels>
  ).filter((platform) => !configs.some((c) => c.platform === platform));

  if (loading) {
    return <div className="p-6">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Configurações de Anúncios</h3>
          <p className="text-sm text-muted-foreground">
            Configure Pixels e Tokens para suas plataformas de anúncios
          </p>
        </div>
        {availablePlatforms.length > 0 && (
          <div className="flex gap-2">
            {availablePlatforms.map((platform) => (
              <Button
                key={platform}
                onClick={() => handleAddPlatform(platform)}
                size="sm"
                variant="outline"
              >
                <Plus className="h-4 w-4 mr-2" />
                {platformLabels[platform]}
              </Button>
            ))}
          </div>
        )}
      </div>

      {configs.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Nenhuma plataforma configurada. Adicione uma plataforma para começar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {configs.map((config) => (
            <Card key={config.id}>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>{platformLabels[config.platform]}</CardTitle>
                    <CardDescription>
                      Configure o Pixel ID e Token para esta plataforma
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteId(config.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`pixel-${config.id}`}>Pixel ID</Label>
                    <Input
                      id={`pixel-${config.id}`}
                      placeholder="Digite o Pixel ID"
                      value={config.pixel_id || ""}
                      onChange={(e) =>
                        handleUpdateConfig(config.id, "pixel_id", e.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`token-${config.id}`}>Token</Label>
                    <Input
                      id={`token-${config.id}`}
                      type="password"
                      placeholder="Digite o Token"
                      value={config.token || ""}
                      onChange={(e) =>
                        handleUpdateConfig(config.id, "token", e.target.value)
                      }
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id={`active-${config.id}`}
                      checked={config.is_active}
                      onCheckedChange={(checked) =>
                        handleUpdateConfig(config.id, "is_active", checked)
                      }
                    />
                    <Label htmlFor={`active-${config.id}`}>Ativo</Label>
                  </div>
                  <Button
                    onClick={() => handleSaveConfig(config)}
                    disabled={saving}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Salvar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover esta configuração? Esta ação não
              pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfig}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
