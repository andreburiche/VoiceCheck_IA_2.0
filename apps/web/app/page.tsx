import { CommandDeck } from "@/components/marketing/command-deck";
import { FeatureCards } from "@/components/marketing/feature-cards";
import { FinalCta } from "@/components/marketing/final-cta";
import { PrivacySection } from "@/components/marketing/privacy-section";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { VoiceCheckSection } from "@/components/marketing/voicecheck-section";
import { AreasDeUso } from "@/components/marketing/voz/areas-de-uso";
import { HeroVoz } from "@/components/marketing/voz/hero-voz";
import { JornadaClinica } from "@/components/marketing/voz/jornada-clinica";
import { Numeros } from "@/components/marketing/voz/numeros";
import { Precisao } from "@/components/marketing/voz/precisao";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-canvas text-ink">
      <SiteHeader />
      <main>
        <HeroVoz />
        <Numeros />
        <JornadaClinica />
        <Precisao />
        <AreasDeUso />
        <FeatureCards />
        <CommandDeck />
        <VoiceCheckSection />
        <PrivacySection />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
