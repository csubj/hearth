import { SinceLastVisitSection } from "@/components/home/SinceLastVisitSection";
import { InventorySection } from "@/components/home/InventorySection";
import { MetricsSection } from "@/components/home/MetricsSection";
import { ProjectsSection } from "@/components/home/ProjectsSection";
import { RestaurantsSection } from "@/components/home/RestaurantsSection";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-2xl text-text">Home</h1>
        <p className="mt-1 text-sm text-text-muted">A glance at what&apos;s happening.</p>
      </header>
      <SinceLastVisitSection />
      <div className="grid gap-6 md:grid-cols-2">
        <ProjectsSection />
        <RestaurantsSection />
        <MetricsSection />
        <InventorySection />
      </div>
    </div>
  );
}
