
'use client';

import * as React from 'react';
import { UserManagement } from '@/components/user-management';
import { PageHeader } from '@/components/page-header';

export default function UsersPage() {
  return (
    <div className="flex flex-col flex-1 p-6 min-h-0 bg-slate-50 overflow-auto">
      <PageHeader 
        title="App Gebruikers & Rechten" 
        description="Beheer hier de accounts die toegang hebben tot BeheerHub en configureer hun specifieke module-rechten."
      />
      <div className="mt-6 max-w-6xl mx-auto w-full">
        <UserManagement />
      </div>
    </div>
  );
}
