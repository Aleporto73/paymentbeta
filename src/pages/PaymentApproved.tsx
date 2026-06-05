import { CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const products = [
  {
    name: "PsicoBook",
    category: "PEI & AEE",
    description: "Sistema de elaboração e acompanhamento PEI e AEE com relatórios automáticos.",
    link: "https://app.psicobook.com.br/",
  },
  {
    name: "NeuroRastreio",
    category: "Rastreios",
    description: "Plataforma de rastreio funcional digital para apoio a profissionais.",
    link: "https://www.neurorastreio.com.br/",
  },
  {
    name: "Axis TCC",
    category: "TCC",
    description: "Organização clínica para psicólogos com transcrição automática e relatórios.",
    link: "https://axisclinico.com/produto/tcc",
  },
  {
    name: "Axis ABA",
    category: "ABA",
    description: "Solução clínica para organização e acompanhamento de atendimentos ABA.",
    link: "https://axisclinico.com/produto/aba",
  },
];

export default function PaymentApproved() {
  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-10">
        <Card className="w-full max-w-2xl">
          <CardContent className="space-y-4 pt-6 text-center">
            <div className="flex justify-center">
              <div className="rounded-full bg-green-100 p-3">
                <CheckCircle2 className="h-12 w-12 text-green-600" />
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-normal text-foreground sm:text-3xl">
                Pagamento aprovado!
              </h1>
              <p className="mx-auto max-w-lg text-muted-foreground">
                Seu pagamento foi processado com sucesso. Enviaremos a confirmação da compra em breve.
              </p>
            </div>
          </CardContent>
        </Card>

        <section className="w-full space-y-6" aria-labelledby="more-products-title">
          <div className="mx-auto max-w-2xl space-y-2 text-center">
            <h2
              id="more-products-title"
              className="text-2xl font-bold tracking-normal text-foreground sm:text-3xl"
            >
              Veja mais produtos
            </h2>
            <p className="text-muted-foreground">
              Conheça outras soluções para psicologia, educação e saúde mental.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((product) => (
              <Card key={product.name} className="flex h-full flex-col">
                <CardContent className="flex h-full flex-col p-5">
                  <div className="mb-5 inline-flex w-fit rounded-md bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                    {product.category}
                  </div>

                  <div className="flex flex-1 flex-col gap-3">
                    <h3 className="text-xl font-semibold tracking-normal text-foreground">
                      {product.name}
                    </h3>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {product.description}
                    </p>
                  </div>

                  <Button asChild className="mt-6 w-full">
                    <a
                      href={product.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Conhecer produto ${product.name}`}
                    >
                      Conhecer produto
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
