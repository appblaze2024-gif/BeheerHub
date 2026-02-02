'use client';

import * as React from 'react';
import { useNavigationUI } from '@/context/navigation-ui-context';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export default function MeldingenportaalPage() {
    const { setIsHeaderVisible } = useNavigationUI();
    const router = useRouter();

    React.useEffect(() => {
        setIsHeaderVisible(false);
        return () => {
        setIsHeaderVisible(true);
        };
    }, [setIsHeaderVisible]);

  return (
    <div className="flex flex-col h-screen bg-background">
        <header className="flex items-center justify-between p-4 border-b shrink-0">
            <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-xl font-bold">Meldingenportaal</h1>
            </div>
        </header>

        <div className="flex-1 overflow-auto p-4">
            <p>Meldingenportaal inhoud komt hier.</p>
        </div>
    </div>
  );
}
