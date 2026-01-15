'use client';

import * as React from 'react';
import Image from 'next/image';
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
    <div className="relative flex h-screen w-screen flex-col items-center justify-center">
      <Image
        src="https://images.unsplash.com/photo-1534088568595-a066f410bcda"
        alt="Sky background"
        fill
        className="object-cover z-0"
        data-ai-hint="clouds sky"
      />
      <div className="absolute top-8 left-8 z-10">
         <Image
          src="https://i.ibb.co/Fk1pVzqw/IMG-1314.png"
          alt="Logo"
          width={120}
          height={40}
          priority
        />
      </div>

      <Card className="w-full max-w-md z-10 bg-white/30 backdrop-blur-lg border border-white/20 shadow-2xl">
        <CardHeader className="items-center text-center text-white">
            <div className='p-3 bg-white/20 rounded-lg border border-white/30'>
                 <Image
                    src="https://i.ibb.co/Fk1pVzqw/IMG-1314.png"
                    alt="Logo"
                    width={80}
                    height={26}
                    priority
                />
            </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Inloggen met e-mail</h1>
          <p className="text-gray-600 dark:text-gray-200 text-sm">
            Voer uw gegevens in om toegang te krijgen tot uw account.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email" className="text-gray-700 dark:text-gray-200">Email</Label>
            <div className='relative'>
              <Mail className='absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400' />
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 bg-white/50 border-white/30 placeholder:text-gray-500"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password" className="text-gray-700 dark:text-gray-200">Wachtwoord</Label>
             <div className='relative'>
                <Lock className='absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400' />
                <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 bg-white/50 border-white/30 placeholder:text-gray-500"
                />
            </div>
             <a href="#" className="text-right text-xs text-gray-600 dark:text-gray-300 hover:underline">
              Wachtwoord vergeten?
            </a>
          </div>
          {error && <p className="text-sm text-red-500 bg-red-100/50 p-2 rounded-md border border-red-500/50">{error}</p>}
           <Button className="w-full mt-4 bg-gray-800 text-white hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-800 text-base py-6" onClick={handleSignIn}>
            Inloggen
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
