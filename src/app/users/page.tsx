'use client';

import * as React from 'react';
import { UserManagement } from '@/components/user-management';

export default function UsersPage() {
  return (
    <div className="flex flex-col flex-1 p-6 min-h-0 bg-slate-50 overflow-auto">
      <div className="mt-6 max-w-6xl mx-auto w-full">
        <UserManagement />
      </div>
    </div>
  );
}
