import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

export default function Integracoes() {
  const [loading, setLoading] = useState(false);
  const [fetchingSettings, setFetchingSettings] = useState(true);
  const [isSandbox, setIsSandbox] = useState(true);
  const [sandboxApiKey, setSandboxApiKey] = useState("");
  const [productionApiKey, setProductionApiKey] = useState("");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setFetchingSettings(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return;

      const { data, error } = await supabase
        .from("integration_settings")
        .select("*")
        .eq("integration_name", "asaas")
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching settings:", error);
        return;
      }

      if (data) {
        setIsSandbox(data.is_sandbox);
        setSandboxApiKey(data.sandbox_api_key || "");
        setProductionApiKey(data.production_api_key || "");
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setFetchingSettings(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      const { error } = await supabase
        .from("integration_settings")
        .upsert({
          user_id: user.id,
          integration_name: "asaas",
          is_sandbox: isSandbox,
          sandbox_api_key: sandboxApiKey || null,
          production_api_key: productionApiKey || null,
          is_active: true,
        }, {
          onConflict: "user_id,integration_name"
        });

      if (error) throw error;

      toast.success("Configurações salvas com sucesso!");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Erro ao salvar configurações");
    } finally {
      setLoading(false);
    }
  };

  if (fetchingSettings) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Integrações</h1>
        <p className="text-muted-foreground mt-2">
          Configure suas integrações com serviços externos
        </p>
      </div>

      <Tabs defaultValue="asaas" className="w-full">
        <TabsList>
          <TabsTrigger value="asaas">Asaas</TabsTrigger>
        </TabsList>

        <TabsContent value="asaas" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configuração Asaas</CardTitle>
              <CardDescription>
                Configure as API keys do Asaas para processar pagamentos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="sandbox-mode" className="text-base">
                    Modo Sandbox
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Ative para usar o ambiente de testes do Asaas
                  </p>
                </div>
                <Switch
                  id="sandbox-mode"
                  checked={isSandbox}
                  onCheckedChange={setIsSandbox}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sandbox-api-key">
                  API Key Sandbox
                </Label>
                <Input
                  id="sandbox-api-key"
                  type="password"
                  placeholder="Digite sua API key de sandbox"
                  value={sandboxApiKey}
                  onChange={(e) => setSandboxApiKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Use esta chave para testes. Você pode obter uma em{" "}
                  <a
                    href="https://sandbox.asaas.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    sandbox.asaas.com
                  </a>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="production-api-key">
                  API Key Produção
                </Label>
                <Input
                  id="production-api-key"
                  type="password"
                  placeholder="Digite sua API key de produção"
                  value={productionApiKey}
                  onChange={(e) => setProductionApiKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Use esta chave para processar pagamentos reais. Você pode obter uma em{" "}
                  <a
                    href="https://www.asaas.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    asaas.com
                  </a>
                </p>
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  onClick={handleSaveSettings}
                  disabled={loading}
                  className="min-w-[120px]"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Salvar
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
