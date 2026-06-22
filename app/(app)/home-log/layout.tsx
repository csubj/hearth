import { getHomeTree } from "@/lib/actions/home";
import { HomeLogTreeSidebar } from "@/components/home/HomeLogTreeSidebar";

export default async function HomeLogLayout({ children }: { children: React.ReactNode }) {
  const tree = await getHomeTree();

  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-0">
      <HomeLogTreeSidebar tree={tree} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
