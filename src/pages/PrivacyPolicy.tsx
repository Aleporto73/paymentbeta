import { Button } from "@/components/ui/button";

export default function PrivacyPolicy() {
  const goBackToCheckout = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.href = "/checkout";
  };

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-6">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3 border-b pb-6">
          <p className="text-sm font-medium text-blue-600">Checkout</p>
          <h1 className="text-3xl font-bold tracking-normal">Política de Privacidade</h1>
          <p className="text-muted-foreground">
            Esta página resume como os dados informados no checkout podem ser usados para processar compras e prestar
            suporte.
          </p>
        </header>

        <section className="space-y-4 text-sm leading-7 text-muted-foreground">
          <h2 className="text-xl font-semibold tracking-normal text-foreground">Dados coletados</h2>
          <p>
            Durante a compra, podem ser coletados dados como nome, e-mail, CPF/CNPJ, telefone, dados da compra e
            informações relacionadas ao pagamento.
          </p>
          <p>
            Dados sensíveis de pagamento, quando aplicável, são tratados pelo processador externo responsável pela
            transação.
          </p>
        </section>

        <section className="space-y-4 text-sm leading-7 text-muted-foreground">
          <h2 className="text-xl font-semibold tracking-normal text-foreground">Finalidades de uso</h2>
          <p>
            Os dados podem ser utilizados para processar a compra, confirmar o pagamento, liberar acesso ao produto ou
            serviço, emitir comunicações relacionadas à transação e prestar suporte ao comprador.
          </p>
          <p>
            As bases legais podem incluir execução de contrato, cumprimento de obrigação legal, legítimo interesse e
            consentimento quando aplicável.
          </p>
        </section>

        <section className="space-y-4 text-sm leading-7 text-muted-foreground">
          <h2 className="text-xl font-semibold tracking-normal text-foreground">Direitos do titular</h2>
          <p>
            O titular dos dados pode solicitar acesso, correção, exclusão, oposição ao tratamento e portabilidade quando
            aplicável, observados os limites legais e operacionais.
          </p>
          <p>
            Canal de contato: utilize o suporte informado na oferta ou na comunicação de confirmação da compra.
          </p>
        </section>

        <footer className="border-t pt-6">
          <Button type="button" variant="outline" onClick={goBackToCheckout}>
            Voltar ao checkout
          </Button>
        </footer>
      </article>
    </main>
  );
}
