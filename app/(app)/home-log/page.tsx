import { CreateDialog } from "@/components/ui/CreateDialog";
import { HomeSpaceCreateForm } from "@/components/home/HomeSpaceCreateForm";

export default async function HomeLogPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-text">Home Log</h1>
          <p className="mt-1 text-sm text-text-muted">
            A reference for your properties — rooms, materials, equipment, and how everything
            connects to maintenance, inventory, and projects. Use the tree on the left to browse
            spaces, or add your first property.
          </p>
        </div>
        <CreateDialog
          triggerLabel="Add property"
          title="Add a property"
          description="Start a new property to organize its rooms, materials, and equipment."
        >
          <HomeSpaceCreateForm defaultKind="property" />
        </CreateDialog>
      </header>
    </div>
  );
}
