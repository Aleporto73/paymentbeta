export default function TermsOfPurchase() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-6">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3 border-b pb-6">
          <p className="text-sm font-medium text-blue-600">Checkout</p>
          <h1 className="text-3xl font-bold tracking-normal">Termos de Compra</h1>
          <p className="text-muted-foreground">
            Estes termos apresentam informações básicas aplicáveis às compras realizadas pela plataforma.
          </p>
        </header>

        <section className="space-y-4 text-sm leading-7 text-muted-foreground">
          <h2 className="text-xl font-semibold tracking-normal text-foreground">Produtos e serviços digitais</h2>
          <p>
            As ofertas disponibilizadas no checkout podem envolver produtos digitais, serviços digitais, assinaturas,
            conteúdos, acessos ou outros itens informados na própria página de compra.
          </p>
          <p>
            A liberação do acesso, entrega ou continuidade do serviço ocorre após a confirmação do pagamento, conforme
            as condições descritas na oferta adquirida.
          </p>
        </section>

        <section className="space-y-4 text-sm leading-7 text-muted-foreground">
          <h2 className="text-xl font-semibold tracking-normal text-foreground">Pagamento</h2>
          <p>
            Os pagamentos podem ser realizados via Pix ou cartão de crédito, quando essas opções estiverem disponíveis
            na oferta. O processamento do pagamento é realizado por provedor de pagamento externo.
          </p>
          <p>
            O comprador é responsável por informar dados corretos e atualizados para identificação, pagamento, contato e
            liberação do acesso ao produto ou serviço adquirido.
          </p>
        </section>

        <section className="space-y-4 text-sm leading-7 text-muted-foreground">
          <h2 className="text-xl font-semibold tracking-normal text-foreground">Suporte e reembolso</h2>
          <p>
            O suporte relacionado à compra, acesso ou uso do produto deve ser solicitado pelo canal de atendimento
            informado na oferta, na página de compra ou na comunicação de confirmação.
          </p>
          <p>
            Solicitações de reembolso são avaliadas conforme as regras comerciais, prazos e condições informadas na
            oferta adquirida.
          </p>
          <p>
            Canal de contato: utilize o suporte informado na oferta ou no e-mail de confirmação da compra.
          </p>
        </section>

        <footer className="border-t pt-6">
          <p className="text-sm text-muted-foreground">Você pode fechar esta aba para voltar ao checkout.</p>
        </footer>
      </article>
    </main>
  );
}
