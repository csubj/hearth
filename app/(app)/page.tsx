import { SinceLastVisitSection } from "@/components/home/SinceLastVisitSection";
import { EventsSection } from "@/components/home/EventsSection";
import { ProjectsSection } from "@/components/home/ProjectsSection";
import { RestaurantsSection } from "@/components/home/RestaurantsSection";
import { StreamSection } from "@/components/home/StreamSection";
import { TrackersSection } from "@/components/home/TrackersSection";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-2xl text-text">Home</h1>
        <p className="mt-1 text-sm text-text-muted">A glance at what&apos;s happening.</p>
      </header>
      <SinceLastVisitSection />
      <div className="grid gap-6 md:grid-cols-2">
        <StreamSection />
        <RestaurantsSection />
        <ProjectsSection />
        <TrackersSection />
        <EventsSection />
      </div>
    </div>
  );
}
