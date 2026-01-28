import { PageHeader } from "@/components/page-header";

export default function NewsPage() {
  return (
    <div className="flex flex-col flex-1 p-6 min-h-0">
      <PageHeader title="Nieuws berichten" />
      <div className="flex-1 mt-6">
        <p>Nieuws berichten pagina inhoud komt hier.</p>
      </div>
    </div>
  );
}
