export default function PaymentSecurity() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-6">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3 border-b pb-6">
          <p className="text-sm font-medium text-blue-600">Checkout</p>
          <h1 className="text-3xl font-bold tracking-normal">Segurança do Pagamento</h1>
          <p className="text-muted-foreground">
            Informações básicas sobre como o pagamento é processado durante a compra.
          </p>
        </header>

        <section className="space-y-4 text-sm leading-7 text-muted-foreground">
          <h2 className="text-xl font-semibold tracking-normal text-foreground">Processamento pela Asaas</h2>
          <p>Os pagamentos são processados pela Asaas.</p>
          <p>
            No pagamento via Pix, o sistema gera um QR Code e um código Pix Copia e Cola para que o comprador realize o
            pagamento pelo aplicativo do banco ou instituição financeira.
          </p>
          <p>
            No pagamento por cartão, os dados necessários à transação são tratados em ambiente seguro pelo processador de
            pagamento responsável.
          </p>
        </section>

        <section className="space-y-4 text-sm leading-7 text-muted-foreground">
          <h2 className="text-xl font-semibold tracking-normal text-foreground">Políticas da Asaas</h2>
          <p>Para saber mais sobre as práticas de segurança da Asaas, consulte os materiais oficiais abaixo.</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <a
                href="https://www.asaas.com/politicas-de-seguranca"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline-offset-4 hover:underline"
              >
                Políticas de segurança da Asaas
              </a>
            </li>
            <li>
              <a
                href="https://cdn.asaas.com/p/Pol%C3%ADtica%20de%20Seguran%C3%A7a%20Cibern%C3%A9tica%20v.002_22e7237428470ea8.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline-offset-4 hover:underline"
              >
                Política de Segurança Cibernética da Asaas
              </a>
            </li>
          </ul>
        </section>

        <footer className="border-t pt-6">
          <p className="text-sm text-muted-foreground">Você pode fechar esta aba para voltar ao checkout.</p>
        </footer>
      </article>
    </main>
  );
}
