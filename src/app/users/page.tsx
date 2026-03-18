'use client';

import * as React from 'react';
import { UserManagement } from '@/components/user-management';

export default function UsersPage() {
  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <UserManagement />
    </div>
  );
}
