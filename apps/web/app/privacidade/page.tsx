import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Privacidade e LGPD" };

/** Versão do texto (a API registra a versão aceita no cadastro: VERSAO_PRIVACIDADE em auth.py). */
const VERSAO = "2026-10-31";

const CONTROLADOR = process.env.NEXT_PUBLIC_CONTROLADOR_NOME?.trim();
const ENCARREGADO = process.env.NEXT_PUBLIC_ENCARREGADO_NOME?.trim();
const ENCARREGADO_EMAIL = process.env.NEXT_PUBLIC_ENCARREGADO_EMAIL?.trim();

function Secao({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-line/70 py-8">
      <h2 id={id} className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink">{titulo}</h2>
      <div className="mt-3 space-y-3 text-base leading-relaxed text-ink-muted [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink">{children}</div>
    </section>
  );
}

export default function PrivacidadePage() {
  const configurado = Boolean(CONTROLADOR && ENCARREGADO_EMAIL);
  return (
    <div className="relative min-h-screen bg-canvas text-ink">
      <SiteHeader />
      <main className="mx-auto max-w-[72ch] px-5 pb-20 pt-32 sm:px-8">
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-accent">LGPD · Lei 13.709/2018</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-[-0.03em] text-ink sm:text-5xl">Termos e Política de Privacidade</h1>
        <p className="mt-4 text-base text-ink-muted">Versão {VERSAO}. Explica quais dados o {BRAND.name} guarda, para quê, por quanto tempo e como você exerce seus direitos.</p>
        {!configurado ? (
          <p role="note" className="mt-6 rounded-xl bg-signal-warn/10 p-4 text-sm text-ink ring-1 ring-inset ring-signal-warn/40">
            Antes de abrir a plataforma ao público, o responsável deve preencher o nome do controlador e o nome e o e-mail do encarregado
            (variáveis NEXT_PUBLIC_CONTROLADOR_NOME, NEXT_PUBLIC_ENCARREGADO_NOME e NEXT_PUBLIC_ENCARREGADO_EMAIL) e revisar este texto com
            a assessoria jurídica.
          </p>
        ) : null}

        <Secao id="quem" titulo="1. Quem trata os dados">
          <p>
            <strong>Dados da sua conta</strong> (nome, e-mail, perfil profissional, foto, registro no conselho): o controlador é{" "}
            {CONTROLADOR ? <strong>{CONTROLADOR}</strong> : "o responsável pela plataforma"}.
          </p>
          <p>
            <strong>Dados dos pacientes</strong> que o fonoaudiólogo registra (cadastro, gravações, medidas, protocolos, anotações, documentos,
            fotos, vídeos e agenda): o controlador é o próprio profissional ou a clínica, que decide o que registrar. A plataforma atua como
            operadora: guarda e processa esses dados só para prestar o serviço, conforme as instruções do profissional.
          </p>
        </Secao>

        <Secao id="dados" titulo="2. Quais dados e para quê">
          <ul>
            <li><strong>Conta:</strong> entrar no sistema, identificar o profissional nos documentos e relatórios, avisos sobre a conta.</li>
            <li><strong>Pacientes (dados de saúde):</strong> avaliação, acompanhamento e terapia da voz, emissão de documentos e agenda de consultas.</li>
            <li><strong>Registros de acesso:</strong> quem acessou qual área, quando e de qual endereço IP — segurança e prestação de contas.</li>
          </ul>
          <p>Peça só o necessário: além do nome ou código, todos os campos do cadastro do paciente são opcionais.</p>
        </Secao>

        <Secao id="base" titulo="3. Bases legais">
          <ul>
            <li>Dados de saúde dos pacientes: tutela da saúde, em procedimento realizado por profissional de saúde (art. 11, II, “f”), e cumprimento de obrigação legal ou regulatória de guarda do prontuário (art. 11, II, “a”).</li>
            <li>Dados da conta: execução do contrato de uso da plataforma (art. 7º, V).</li>
            <li>Registros de acesso: cumprimento de obrigação legal e legítimo interesse em segurança (art. 7º, II e IX).</li>
          </ul>
          <p>
            Quando a lei exigir consentimento do paciente (por exemplo, uso de imagem ou de gravações para outra finalidade), use o modelo de
            Termo de Consentimento da aba Documentos e guarde o termo assinado.
          </p>
        </Secao>

        <Secao id="compartilhamento" titulo="4. Compartilhamento e IA">
          <p>Os dados não são vendidos nem cedidos. As análises de voz rodam nos servidores da própria plataforma.</p>
          <p>
            A ajuda de IA na redação de documentos usa, por padrão, um modelo instalado no próprio computador/servidor (Ollama): o texto não sai
            dali. Antes de chegar à IA, telefone, e-mail, CPF, CNS e CEP são trocados por marcadores, e o nome do paciente também. Um provedor de
            IA na internet só pode ser ligado pelo responsável, com contrato com o provedor e informação aos pacientes (transferência internacional,
            art. 33).
          </p>
        </Secao>

        <Secao id="seguranca" titulo="5. Segurança">
          <ul>
            <li>Senhas guardadas só como hash (bcrypt); sessão em cookie protegido (HttpOnly), proteção contra CSRF e limite de tentativas de login.</li>
            <li>Cada profissional só enxerga os próprios pacientes; a área clínica é exclusiva do perfil de fonoaudiólogo.</li>
            <li>O nome do paciente não vai em endereços (URLs) nem nos registros de acesso, que guardam só um código irreversível.</li>
            <li>Toda operação na área clínica fica registrada (quem, quando, o quê).</li>
          </ul>
        </Secao>

        <Secao id="prazo" titulo="6. Por quanto tempo">
          <p>
            Os dados da conta ficam enquanto ela existir. O prontuário dos pacientes segue o prazo de guarda definido pelo conselho profissional e
            pela legislação aplicável; depois disso, ou a pedido quando a lei permitir, o profissional pode excluir tudo do paciente, inclusive as
            gravações.
          </p>
        </Secao>

        <Secao id="direitos" titulo="7. Seus direitos (art. 18)">
          <ul>
            <li><strong>Acesso e portabilidade:</strong> em Pacientes, “Exportar dados” gera um ZIP com tudo do paciente (dados e gravações).</li>
            <li><strong>Correção:</strong> o cadastro e as anotações podem ser editados a qualquer momento.</li>
            <li><strong>Eliminação:</strong> no histórico do paciente, “Excluir todos os dados” apaga avaliações, mídias, agenda e links de prática.</li>
            <li><strong>Informação:</strong> pelo contato do encarregado abaixo.</li>
          </ul>
          <p>Pacientes exercem esses direitos junto ao profissional que os atende, que tem as ferramentas acima para atender o pedido.</p>
        </Secao>

        <Secao id="encarregado" titulo="8. Encarregado (DPO) e incidentes">
          <p>
            Encarregado pelo tratamento de dados:{" "}
            {ENCARREGADO || ENCARREGADO_EMAIL ? (
              <strong>
                {ENCARREGADO}
                {ENCARREGADO && ENCARREGADO_EMAIL ? " — " : ""}
                {ENCARREGADO_EMAIL ? <a className="text-accent underline" href={`mailto:${ENCARREGADO_EMAIL}`}>{ENCARREGADO_EMAIL}</a> : null}
              </strong>
            ) : (
              "a definir pelo responsável pela plataforma."
            )}
          </p>
          <p>
            Em caso de incidente de segurança que possa causar risco ou dano relevante, os titulares afetados e a ANPD serão comunicados, como
            determina o art. 48.
          </p>
        </Secao>

        <p className="border-t border-line/70 pt-8 text-sm text-ink-faint">
          Dúvidas sobre o uso? <Link href="/register" className="text-accent hover:underline">Criar conta</Link> ·{" "}
          <Link href="/login" className="text-accent hover:underline">Entrar</Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
