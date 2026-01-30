'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth, useFirestore } from '@/firebase';
import { signInWithEmailAndPassword, signInAnonymously } from 'firebase/auth';
import { Mail, Lock, Nfc, Loader2 } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';

export default function LoginPage() {
  const auth = useAuth();
  const firestore = useFirestore();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [nfcStatus, setNfcStatus] = React.useState<'idle' | 'scanning' | 'error' | 'success'>('idle');
  const [nfcError, setNfcError] = React.useState<string | null>(null);

  const handleSignIn = async () => {
    localStorage.removeItem('impersonatedUserProfileId');
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
  
  const handleNfcLogin = async () => {
    if (!('NDEFReader' in window)) {
        setNfcError('Web NFC wordt niet ondersteund op dit apparaat of in deze browser.');
        setNfcStatus('error');
        return;
    }
    setNfcStatus('scanning');
    setNfcError(null);
    localStorage.removeItem('impersonatedUserProfileId');
    try {
        const ndef = new NDEFReader();
        await ndef.scan();
        
        ndef.onreadingerror = () => {
            setNfcError('Kan NFC-tag niet lezen. Probeer het opnieuw.');
            setNfcStatus('error');
        };

        ndef.onreading = async (event) => {
            const { serialNumber } = event;
            if (!serialNumber) {
                setNfcError('Geen serienummer gevonden op NFC-tag.');
                setNfcStatus('error');
                return;
            }
            
            if (!firestore || !auth) {
              setNfcError('Database of authenticatie niet beschikbaar.');
              setNfcStatus('error');
              return;
            }
            
            try {
                // 1. Find Medewerker by NFC tag
                const medewerkersRef = collection(firestore, 'medewerkers');
                const qMedewerker = query(medewerkersRef, where('nfcTagId', '==', serialNumber));
                const medewerkerSnapshot = await getDocs(qMedewerker);

                if (medewerkerSnapshot.empty) {
                    setNfcError('Geen gebruiker gevonden voor deze NFC-tag.');
                    setNfcStatus('error');
                    return;
                }
                
                const medewerkerDoc = medewerkerSnapshot.docs[0].data();
                if (!medewerkerDoc.email) {
                     setNfcError('Gebruiker gevonden, maar er is geen e-mailadres gekoppeld.');
                     setNfcStatus('error');
                     return;
                }

                // 2. Find the UserProfile using the email from Medewerker
                const usersRef = collection(firestore, 'users');
                const qUser = query(usersRef, where('email', '==', medewerkerDoc.email));
                const userSnapshot = await getDocs(qUser);
                
                if (userSnapshot.empty) {
                    setNfcError('Geen gebruikersprofiel gevonden met de juiste rechten.');
                    setNfcStatus('error');
                    return;
                }

                const userProfile = userSnapshot.docs[0];

                // 3. Sign in anonymously
                await signInAnonymously(auth);

                // 4. Store the ID of the user profile we want to impersonate in localStorage.
                // The ProfileProvider will read this and fetch the correct profile data.
                localStorage.setItem('impersonatedUserProfileId', userProfile.id);

                setNfcStatus('success');
                // The main AppLayout will handle the redirection to the home page
                // because the auth state has changed.

            } catch (e) {
                console.error("Firestore query error:", e);
                setNfcError('Fout bij het zoeken naar gebruiker.');
                setNfcStatus('error');
            }
        };
    } catch (error) {
        console.error('NFC scan error:', error);
        setNfcError('Kon NFC-scanner niet starten. Zorg ervoor dat u op een compatibel apparaat bent en de juiste machtigingen hebt.');
        setNfcStatus('error');
    }
  };


  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-gray-100 p-4 dark:bg-gray-950">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
            <Image
              src="https://i.ibb.co/5gvYFDLC/BEHEERHUB.png"
              alt="BEHEERHUB"
              width={360}
              height={90}
              priority
            />
        </div>

        <Card>
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
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Of</span>
              </div>
            </div>
            <Button variant="outline" className="w-full" onClick={handleNfcLogin} disabled={nfcStatus === 'scanning'}>
              {nfcStatus === 'scanning' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Nfc className="mr-2 h-4 w-4" />}
              {nfcStatus === 'scanning' ? 'NFC Tag Scannen...' : 'Inloggen met NFC'}
            </Button>
            {nfcStatus === 'scanning' && <p className="text-sm text-muted-foreground mt-2 text-center">Houd de NFC-tag tegen uw apparaat.</p>}
            {nfcStatus === 'error' && <p className="text-sm text-destructive mt-2">{nfcError}</p>}
            {nfcStatus === 'success' && <p className="text-sm text-green-600 mt-2">Inloggen gelukt! U wordt doorgestuurd...</p>}
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
