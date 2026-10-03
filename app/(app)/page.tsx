import { HomeLogSection } from "@/components/home/HomeLogSection";
import { InventorySection } from "@/components/home/InventorySection";
import { MaintenanceSection } from "@/components/home/MaintenanceSection";
import { MetricsSection } from "@/components/home/MetricsSection";
import { ProjectsSection } from "@/components/home/ProjectsSection";
import { QuickCaptureLine } from "@/components/home/QuickCaptureLine";
import { RestaurantsSection } from "@/components/home/RestaurantsSection";
import { SectionIndex } from "@/components/home/SectionIndex";
import { SinceLastVisitSection } from "@/components/home/SinceLastVisitSection";
import { UpcomingRemindersSection } from "@/components/home/UpcomingRemindersSection";

export default function HomePage() {
  return (
    <div className="md:grid md:grid-cols-[10rem_1fr] md:gap-10">
      <SectionIndex />
      <div className="max-w-3xl">
        <header className="border-b border-border pb-4">
          <h1 className="font-serif text-3xl text-text">Home</h1>
          <p className="mt-1 font-serif text-text-muted">The household record, current.</p>
        </header>

        <div className="mt-6 space-y-8">
          <UpcomingRemindersSection />
          <SinceLastVisitSection />
          <ProjectsSection />
          <RestaurantsSection />
          <MetricsSection />
          <InventorySection />
          <MaintenanceSection />
          <HomeLogSection />
          <QuickCaptureLine />
        </div>
      </div>
    </div>
  );
}