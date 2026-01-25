'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Mail, Lock } from 'lucide-react';

export default function LoginPage() {
  const auth = useAuth();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const handleSignIn = async () => {
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e: any) {
      if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found') {
        setError('Ongeldige inloggegevens. Controleer uw e-mailadres en wachtwoord.');
      } else {
        setError('Er is een onbekende fout opgetreden. Probeer het opnieuw.');
      }
    }
  };
  

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-gray-100 dark:bg-gray-950">
      <div className="absolute top-8 left-8 z-10">
         <Image
          src="https://i.ibb.co/HLV8MBp0/Ontwerp-zonder-titel-3.png"
          alt="Ontwerp-zonder-titel-3"
          width={360}
          height={90}
          priority
        />
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <h1 className="text-2xl font-bold">Inloggen</h1>
          <p className="text-sm text-muted-foreground">
            Voer uw gegevens in om toegang te krijgen tot uw account.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <div className='relative'>
              <Mail className='absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground' />
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center">
                <Label htmlFor="password">Wachtwoord</Label>
                <Link href="/reset-password" className="ml-auto inline-block text-xs text-primary hover:underline">
                    Wachtwoord vergeten?
                </Link>
            </div>
             <div className='relative'>
                <Lock className='absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground' />
                <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10"
                />
            </div>
          </div>
          {error && <p className="text-sm text-destructive bg-destructive/10 p-2 rounded-md border border-destructive/20">{error}</p>}
           <Button className="w-full" onClick={handleSignIn}>
            Inloggen
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
