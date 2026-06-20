import { HomeStatsStrip } from "@/components/home/HomeStatsStrip";
import { InventorySection } from "@/components/home/InventorySection";
import { MaintenanceSection } from "@/components/home/MaintenanceSection";
import { MetricsSection } from "@/components/home/MetricsSection";
import { ProjectsSection } from "@/components/home/ProjectsSection";
import { RestaurantsSection } from "@/components/home/RestaurantsSection";
import { SinceLastVisitSection } from "@/components/home/SinceLastVisitSection";
import { UpcomingRemindersSection } from "@/components/home/UpcomingRemindersSection";

export default function HomePage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-serif text-2xl text-text">Home</h1>
        <p className="text-sm text-text-muted">What needs attention across the household.</p>
      </header>

      <HomeStatsStrip />
      <UpcomingRemindersSection />
      <SinceLastVisitSection />

      <div className="grid gap-4 md:grid-cols-2">
        <ProjectsSection />
        <RestaurantsSection />
        <MetricsSection />
        <InventorySection />
        <MaintenanceSection />
      </div>
    </div>
  );
}
