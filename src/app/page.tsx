"use client";

import * as React from "react";
import {
  DollarSign,
  TrendingDown,
  TrendingUp,
  Scale,
} from "lucide-react";
import { OverviewCards } from "@/components/dashboard/overview-cards";
import { AppointmentCalendar } from "@/components/dashboard/appointment-calendar";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import type { Transaction, Appointment } from "@/lib/types";
import {
  initialTransactions,
  initialAppointments,
} from "@/lib/data";
import { PageHeader } from "@/components/page-header";

export default function DashboardPage() {
  const [transactions, setTransactions] =
    React.useState<Transaction[]>(initialTransactions);
  const [appointments, setAppointments] =
    React.useState<Appointment[]>(initialAppointments);

  const handleAddTransaction = (transaction: Omit<Transaction, "id">) => {
    setTransactions((prev) => [
      { ...transaction, id: `TRN-${Date.now()}` },
      ...prev,
    ]);
  };

  const handleAddAppointment = (appointment: Omit<Appointment, "id">) => {
    setAppointments((prev) => [
      { ...appointment, id: `APT-${Date.now()}` },
      ...prev,
    ]);
  };

  const { totalRevenue, totalExpenses, totalProfit } = React.useMemo(() => {
    const totalRevenue = transactions
      .filter((t) => t.type === "revenue")
      .reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);
    const totalProfit = totalRevenue - totalExpenses;
    return { totalRevenue, totalExpenses, totalProfit };
  }, [transactions]);

  const overviewData = [
    {
      label: "Total Revenue",
      value: totalRevenue,
      icon: TrendingUp,
    },
    {
      label: "Total Expenses",
      value: totalExpenses,
      icon: TrendingDown,
    },
    {
      label: "Profit",
      value: totalProfit,
      icon: Scale,
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
      <PageHeader title="Dashboard" />
      <main className="flex flex-1 flex-col gap-4 md:gap-8">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <OverviewCards data={overviewData} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RecentTransactions
              transactions={transactions.slice(0, 5)}
              onAddTransaction={handleAddTransaction}
            />
          </div>
          <div>
            <AppointmentCalendar
              appointments={appointments}
              onAddAppointment={handleAddAppointment}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
