export type Transaction = {
  id: string;
  type: "revenue" | "expense";
  description: string;
  amount: number;
  date: Date;
  category: string;
};

export type Appointment = {
  id: string;
  title: string;
  date: Date;
  contact: string;
};
