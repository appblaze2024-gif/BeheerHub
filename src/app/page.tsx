"use client";

import * as React from "react";
import Link from 'next/link';
import { Card, CardContent } from "@/components/ui/card";
import { allMenuItems, type MenuItem } from "@/lib/menu-config";
import { cn } from "@/lib/utils";
import { useCollection, useFirestore } from "@/firebase";
import { collection } from "firebase/firestore";
import { Badge } from "@/components/ui/badge";
import { fetchEmailsFlow } from "@/ai/flows/fetch-emails-flow";
import { useProfile } from "@/firebase/profile-provider";
import { Skeleton } from "@/components/ui/skeleton";

type Melding = {
  id: string;
  status: string;
};

function NavCard({ item, badgeCount }: { item: MenuItem, badgeCount?: number }) {
  return (
    <Link href={item.href} passHref>
      <Card className={cn("text-white transition-transform transform hover:-translate-y-1 flex h-40 relative", item.color)}>
        <CardContent className="flex flex-1 flex-col items-center justify-center p-4">
          <item.icon className="h-16 w-16 mb-3" />
          <h2 className="text-lg font-semibold text-center">{item.label}</h2>
        </CardContent>
        {badgeCount !== undefined && badgeCount > 0 && (
            <Badge variant="destructive" className="absolute -top-2 -right-2 h-7 w-7 flex items-center justify-center p-0 border-2 border-white text-base animate-pulse-scale">{badgeCount}</Badge>
        )}
      </Card>
    </Link>
  );
}

export default function DashboardPage() {
  const firestore = useFirestore();
  const [unreadMailCount, setUnreadMailCount] = React.useState(0);
  const { profile, isLoading: isProfileLoading } = useProfile();

  const meldingenCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'meldingen');
  }, [firestore]);

  const { data: meldingen } = useCollection<Melding>(meldingenCollection);

  const openMeldingenCount = React.useMemo(() => {
    if (!meldingen) return 0;
    return meldingen.filter(m => m.status !== 'Afgerond').length;
  }, [meldingen]);

  React.useEffect(() => {
    const getUnreadCount = async () => {
      try {
        const emails = await fetchEmailsFlow('INBOX');
        const unreadCount = emails.filter(email => !email.read).length;
        setUnreadMailCount(unreadCount);
      } catch (error) {
        console.error("Failed to fetch unread email count:", error);
      }
    };

    getUnreadCount();
    const intervalId = setInterval(getUnreadCount, 60000); // Refresh every minute

    return () => clearInterval(intervalId); // Cleanup on unmount
  }, []);

  const gridItems = React.useMemo(() => {
    if (isProfileLoading || !profile) {
      return [];
    }

    const isSuperUser = profile.role === 'Super admin';

    return allMenuItems.filter(item => {
      if (item.href === '/') {
        return false;
      }

      if (!item.module) {
        return true;
      }

      if (isSuperUser) {
        return true;
      }

      const modulePermissions = profile.permissions?.[item.module];
      if (!modulePermissions) {
        return false;
      }

      // Check for 'view' permission for most modules, or 'use' for specific ones.
      return modulePermissions.view || modulePermissions.use || false;
    });
  }, [profile, isProfileLoading]);


  if (isProfileLoading) {
      return (
          <div className="flex flex-col flex-1 p-6">
              <div className="flex-1 grid grid-cols-5 gap-4 content-start">
                  {Array.from({ length: 12 }).map((_, index) => (
                      <Skeleton key={index} className="h-40" />
                  ))}
              </div>
          </div>
      );
  }

  return (
    <div className="flex flex-col flex-1 p-6">
      <div className="flex-1 grid grid-cols-5 gap-4 content-start">
          {gridItems.map((item) => {
            let badgeCount: number | undefined = undefined;
            if (item.href === '/issues') {
                badgeCount = openMeldingenCount;
            } else if (item.href === '/mail') {
                badgeCount = unreadMailCount;
            }
            return (
                <NavCard key={item.href} item={item} badgeCount={badgeCount} />
            )
          })}
      </div>
    </div>
  );
}
