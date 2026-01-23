"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { DayPicker, useDayPicker, useNavigation, format, CaptionProps } from "react-day-picker";
import { nl } from 'date-fns/locale';


import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function CustomCaption(props: CaptionProps) {
  const { fromDate, toDate } = useDayPicker();
  const { goToMonth, currentMonth } = useNavigation();

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(Number(e.target.value));
    goToMonth(newMonth);
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = new Date(currentMonth);
    newMonth.setFullYear(Number(e.target.value));
    goToMonth(newMonth);
  };

  const months = Array.from({ length: 12 }, (_, i) => {
    const monthDate = new Date(currentMonth.getFullYear(), i, 1);
    return format(monthDate, "MMMM", { locale: nl });
  });

  const years: number[] = [];
  const fromYear = fromDate?.getFullYear() || new Date().getFullYear() - 10;
  const toYear = toDate?.getFullYear() || new Date().getFullYear() + 10;
  for (let i = fromYear; i <= toYear; i++) {
    years.push(i);
  }

  return (
    <div className="flex items-center justify-center gap-1">
      <select
        value={currentMonth.getMonth()}
        onChange={handleMonthChange}
        className="text-sm font-medium border-0 bg-transparent p-1 focus:ring-0"
      >
        {months.map((month, i) => (
          <option key={month} value={i}>
            {month}
          </option>
        ))}
      </select>
      <span className="text-sm font-medium">-</span>
      <select
        value={currentMonth.getFullYear()}
        onChange={handleYearChange}
        className="text-sm font-medium border-0 bg-transparent p-1 focus:ring-0"
      >
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
  );
}


function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components: userComponents,
  ...props
}: CalendarProps) {
  const defaultClassNames = {
    months: "relative flex flex-col sm:flex-row gap-4",
    month: "w-full",
    month_caption: "relative mx-10 mb-1 flex h-9 items-center justify-center z-20",
    caption_dropdowns: "flex items-center gap-1",
    caption_label: "text-sm font-medium",
    nav: "absolute top-0 flex w-full justify-between z-10",
    button_previous: cn(
      buttonVariants({ variant: "ghost" }),
      "size-9 text-muted-foreground/80 hover:text-foreground p-0",
    ),
    button_next: cn(
      buttonVariants({ variant: "ghost" }),
      "size-9 text-muted-foreground/80 hover:text-foreground p-0",
    ),
    weekday: "size-9 p-0 text-xs font-medium text-muted-foreground/80",
    day_button:
      "relative flex size-9 items-center justify-center whitespace-nowrap rounded-lg p-0 text-foreground outline-offset-2 group-[[data-selected]:not(.range-middle)]:[transition-property:color,background-color,border-radius,box-shadow] group-[[data-selected]:not(.range-middle)]:duration-150 focus:outline-none group-data-[disabled]:pointer-events-none focus-visible:z-10 hover:bg-accent group-data-[selected]:bg-primary hover:text-foreground group-data-[selected]:text-primary-foreground group-data-[disabled]:text-foreground/30 group-data-[outside]:text-foreground/30 group-data-[outside]:group-data-[selected]:text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 group-[.range-start:not(.range-end)]:rounded-e-none group-[.range-end:not(.range-start)]:rounded-s-none group-[.range-middle]:rounded-none group-data-[selected]:group-[.range-middle]:bg-accent group-data-[selected]:group-[.range-middle]:text-foreground",
    day: "group size-9 px-0 text-sm",
    range_start: "range-start",
    range_end: "range-end",
    range_middle: "range-middle",
    today:
      "*:after:pointer-events-none *:after:absolute *:after:bottom-1 *:after:start-1/2 *:after:z-10 *:after:size-[3px] *:after:-translate-x-1/2 *:after:rounded-full *:after:bg-primary [&[data-selected]:not(.range-middle)>*]:after:bg-background [&[data-disabled]>*]:after:bg-foreground/30 *:after:transition-colors",
    outside: "text-muted-foreground data-selected:bg-accent/50 data-selected:text-muted-foreground",
    hidden: "invisible",
    week_number: "size-9 p-0 text-xs font-medium text-muted-foreground/80",
  };

  const mergedClassNames: typeof defaultClassNames = Object.keys(defaultClassNames).reduce(
    (acc, key) => ({
      ...acc,
      [key]: classNames?.[key as keyof typeof classNames]
        ? cn(
            defaultClassNames[key as keyof typeof defaultClassNames],
            classNames[key as keyof typeof classNames],
          )
        : defaultClassNames[key as keyof typeof defaultClassNames],
    }),
    {} as typeof defaultClassNames,
  );

  const defaultComponents = {
    Chevron: (props: any) => {
      if (props.orientation === "left") {
        return <ChevronLeft size={16} strokeWidth={2} {...props} aria-hidden="true" />;
      }
      return <ChevronRight size={16} strokeWidth={2} {...props} aria-hidden="true" />;
    },
  };

  const mergedComponents = {
    ...defaultComponents,
    ...userComponents,
    ...(props.captionLayout === 'dropdown-buttons' && { Caption: CustomCaption })
  };

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("w-fit", className)}
      classNames={mergedClassNames}
      components={mergedComponents}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
