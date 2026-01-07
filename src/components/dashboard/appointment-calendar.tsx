"use client";

import type { Appointment } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { AddAppointmentDialog } from "@/components/add-appointment-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import * as React from "react";

type AppointmentCalendarProps = {
  appointments: Appointment[];
  onAddAppointment: (appointment: Omit<Appointment, "id">) => void;
};

export function AppointmentCalendar({
  appointments,
  onAddAppointment,
}: AppointmentCalendarProps) {
  const [date, setDate] = React.useState<Date | undefined>(new Date());

  const upcomingAppointments = React.useMemo(() => {
    return appointments
      .filter((apt) => apt.date >= new Date())
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [appointments]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
            <div>
                <CardTitle>Appointments</CardTitle>
                <CardDescription>Schedule and view appointments.</CardDescription>
            </div>
            <AddAppointmentDialog onAddAppointment={onAddAppointment} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          className="rounded-md border"
          components={{
            DayContent: ({ date }) => {
              const hasAppointment = appointments.some(
                (apt) => apt.date.toDateString() === date.toDateString()
              );
              return (
                <div className="relative">
                  {date.getDate()}
                  {hasAppointment && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-primary"></span>
                  )}
                </div>
              );
            },
          }}
        />
        <div className="space-y-2">
            <h3 className="text-sm font-medium">Upcoming</h3>
             <ScrollArea className="h-48">
                 <div className="space-y-4 pr-4">
                    {upcomingAppointments.length > 0 ? (
                        upcomingAppointments.map((apt) => (
                        <div key={apt.id} className="flex items-center">
                            <div className="flex flex-col text-sm">
                                <span className="font-semibold">{apt.title}</span>
                                <span className="text-muted-foreground">{apt.contact}</span>
                            </div>
                            <Badge variant="outline" className="ml-auto">{format(apt.date, 'MMM d')}</Badge>
                        </div>
                        ))
                    ) : (
                        <p className="text-sm text-muted-foreground">No upcoming appointments.</p>
                    )}
                 </div>
            </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
