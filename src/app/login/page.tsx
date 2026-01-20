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
  
  const sunnyCloudsImage = "https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHw2fHxkYXJrfGVufDB8fHx8MTc2ODUwNTY5Mnww&ixlib=rb-4.1.0&q=80&w=1080";


  return (
    <div className="relative flex h-screen w-screen flex-col items-center justify-center">
      <Image
        src={sunnyCloudsImage}
        alt="Sunny sky background"
        fill
        className="object-cover z-0"
        data-ai-hint="checkerboard pattern"
        priority
      />
      <div className="absolute top-8 left-8 z-10">
         <Image
          src="https://i.ibb.co/rKbcyMm9/Chat-GPT-Image-20-jan-2026-08-23-45.png"
          alt="Logo"
          width={320}
          height={104}
          priority
        />
      </div>

      <Card className="w-full max-w-xl z-10 bg-white/50 backdrop-blur-xl border border-white/20 shadow-2xl rounded-xl">
        <CardHeader className="items-center text-center py-4">
            <Image
                src="https://i.ibb.co/rKbcyMm9/Chat-GPT-Image-20-jan-2026-08-23-45.png"
                alt="Logo"
                width={320}
                height={104}
                priority
            />
          <h1 className="text-2xl font-bold text-white">Inloggen met e-mail</h1>
          <p className="text-white/80 text-sm">
            Voer uw gegevens in om toegang te krijgen tot uw account.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 px-8 pb-6 pt-2">
          <div className="grid gap-2">
            <Label htmlFor="email" className="text-white">Email</Label>
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
            <Label htmlFor="password" className="text-white">Wachtwoord</Label>
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
             <a href="#" className="text-right text-xs text-white/80 hover:underline">
              Wachtwoord vergeten?
            </a>
          </div>
          {error && <p className="text-sm text-red-500 bg-red-100/50 p-2 rounded-md border border-red-500/50">{error}</p>}
           <Button className="w-full mt-2 bg-gray-800 text-white hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-800 text-base py-6" onClick={handleSignIn}>
            Inloggen
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
