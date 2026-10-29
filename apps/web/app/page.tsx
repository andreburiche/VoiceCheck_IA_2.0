import { Audience } from "@/components/marketing/audience";
import { CommandDeck } from "@/components/marketing/command-deck";
import { FeatureCards } from "@/components/marketing/feature-cards";
import { FinalCta } from "@/components/marketing/final-cta";
import { LandingHero } from "@/components/marketing/landing-hero";
import { PrivacySection } from "@/components/marketing/privacy-section";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { VoiceCheckSection } from "@/components/marketing/voicecheck-section";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-canvas text-ink">
      <SiteHeader />
      <main>
        <LandingHero />
        <FeatureCards />
        <CommandDeck />
        <VoiceCheckSection />
        <Audience />
        <PrivacySection />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
