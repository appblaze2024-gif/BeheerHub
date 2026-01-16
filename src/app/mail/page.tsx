'use client';

import { PageHeader } from "@/components/page-header";

export default function MailPage() {
  return (
    <div className="flex flex-col flex-1 p-6 min-h-0">
      <PageHeader title="Mail" />
      <div className="flex-1 mt-6">
        <p>Hier kan de functionaliteit voor het versturen van e-mails worden gebouwd.</p>
      </div>
    </div>
  );
}
