'use client';

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Truck, Trash2 } from "lucide-react";
import Link from "next/link";

export default function RoutePlannerPage() {
  return (
    <div className="flex flex-col flex-1 p-6 min-h-0">
      <PageHeader title="Routeplanner" description="Kies het type route dat u wilt plannen." className="pb-0"/>
      <div className="flex-1 flex items-center justify-center">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Link href="/route-planner/sweeper">
            <Button
              variant="outline"
              className="h-48 w-64 flex flex-col items-center justify-center gap-4 rounded-xl shadow-md hover:shadow-lg transition-all"
            >
              <Truck className="h-16 w-16 text-primary" />
              <span className="text-xl font-semibold">Veegwagenroute</span>
            </Button>
          </Link>
          <Link href="/route-planner/trash">
             <Button
              variant="outline"
              className="h-48 w-64 flex flex-col items-center justify-center gap-4 rounded-xl shadow-md hover:shadow-lg transition-all"
            >
              <Trash2 className="h-16 w-16 text-primary" />
              <span className="text-xl font-semibold">Prullenbakkenroute</span>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
