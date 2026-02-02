'use client';
import * as React from 'react';
import Image from 'next/image';
import { Suspense } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { ResetPasswordContent } from '@/components/reset-password-content';

function Fallback() {
    return (
      <CardContent>
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Pagina laden...</p>
        </div>
      </CardContent>
    );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-start pt-20 bg-gray-100 dark:bg-gray-950">
       <div className="absolute top-8 left-8 z-10">
         <Image
          src="https://i.ibb.co/DgYjGBTt/Ontwerp-zonder-titel-5.png"
          alt="BEHEERHUB"
          width={360}
          height={90}
          priority
        />
      </div>
      <Card className="w-full max-w-md">
        <Suspense fallback={<Fallback />}>
          <ResetPasswordContent />
        </Suspense>
      </Card>
    </div>
  );
}
