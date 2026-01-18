import { PageHeader } from "@/components/page-header";

export default function SettingsPage() {
  return (
    <div className="flex flex-col flex-1 p-6 min-h-0">
      <PageHeader title="Instellingen" description="Algemene applicatie-instellingen." />
      <div className="flex-1 mt-6">
        {/* Page content goes here */}
      </div>
    </div>
  );
}
