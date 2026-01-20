"use client";

import * as React from "react";
import Link from 'next/link';
import { Card, CardContent } from "@/components/ui/card";
import { allMenuItems, type MenuItem } from "@/lib/menu-config";
import { cn } from "@/lib/utils";

const cardColors = [
  'bg-teal-600 hover:bg-teal-700',
  'bg-sky-600 hover:bg-sky-700',
  'bg-rose-600 hover:bg-rose-700',
  'bg-amber-600 hover:bg-amber-700',
  'bg-indigo-600 hover:bg-indigo-700',
  'bg-emerald-600 hover:bg-emerald-700',
  'bg-cyan-600 hover:bg-cyan-700',
  'bg-fuchsia-600 hover:bg-fuchsia-700',
  'bg-slate-600 hover:bg-slate-700',
  'bg-lime-600 hover:bg-lime-700',
  'bg-orange-600 hover:bg-orange-700',
  'bg-violet-600 hover:bg-violet-700',
];

function NavCard({ item, color }: { item: MenuItem, color: string }) {
  return (
    <Link href={item.href} passHref>
      <Card className={cn("text-white transition-transform transform hover:-translate-y-1 flex h-36", color)}>
        <CardContent className="flex flex-1 flex-col items-center justify-center p-4">
          <item.icon className="h-12 w-12 mb-3" />
          <h2 className="text-lg font-semibold text-center">{item.label}</h2>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function DashboardPage() {
  // Show all menu items on the dashboard, permissions are handled on the pages themselves.
  const gridItems = allMenuItems.filter(item => item.href !== '/');

  return (
    <div className="flex-1 p-6">
      <div className="grid grid-cols-5 gap-4">
          {gridItems.map((item, index) => (
            <NavCard key={item.href} item={item} color={cardColors[index % cardColors.length]} />
          ))}
      </div>
    </div>
  );
}
