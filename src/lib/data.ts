import type { Transaction, Appointment } from "@/lib/types";

export const initialTransactions: Transaction[] = [
  {
    id: "TRN-1",
    type: "revenue",
    description: "Web Design Project",
    amount: 2500,
    date: new Date("2024-05-15"),
    category: "Client Work",
  },
  {
    id: "TRN-2",
    type: "expense",
    description: "Software Subscription",
    amount: 75,
    date: new Date("2024-05-12"),
    category: "Software",
  },
  {
    id: "TRN-3",
    type: "revenue",
    description: "Consulting Fee",
    amount: 800,
    date: new Date("2024-05-10"),
    category: "Consulting",
  },
  {
    id: "TRN-4",
    type: "expense",
    description: "Office Supplies",
    amount: 120,
    date: new Date("2024-05-05"),
    category: "Office",
  },
  {
    id: "TRN-5",
    type: "expense",
    description: "Domain Renewal",
    amount: 20,
    date: new Date("2024-05-01"),
    category: "Web",
  },
];

export const initialAppointments: Appointment[] = [
  {
    id: "APT-1",
    title: "Client Meeting - Project Kickoff",
    date: new Date(new Date().setDate(new Date().getDate() + 2)),
    contact: "John Doe",
  },
  {
    id: "APT-2",
    title: "Follow-up with ACME Corp",
    date: new Date(new Date().setDate(new Date().getDate() + 5)),
    contact: "Jane Smith",
  },
  {
    id: "APT-3",
    title: "Dentist",
    date: new Date(new Date().setDate(new Date().getDate() - 3)),
    contact: "Dr. Smile",
  },
];
