'use client';

import * as React from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  getAuth,
  verifyPasswordResetCode,
  confirmPasswordReset,
} from 'firebase/auth';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth as useFirebaseAuth } from '@/firebase'; // Using alias to avoid conflict

const passwordResetSchema = z.object({
  password: z.string().min(6, 'Wachtwoord moet minimaal 6 karakters lang zijn.'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Wachtwoorden komen niet overeen.",
  path: ["confirmPassword"], // path of error
});

type PasswordResetFormValues = z.infer<typeof passwordResetSchema>;

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useFirebaseAuth();

  const [mode, setMode] = React.useState<'verify' | 'form' | 'success' | 'error'>('verify');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState<string | null>(null);
  const oobCode = searchParams.get('oobCode');

  const form = useForm<PasswordResetFormValues>({
    resolver: zodResolver(passwordResetSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  React.useEffect(() => {
    if (!oobCode) {
      setErrorMessage('Geen resetcode gevonden. De link is mogelijk ongeldig of verlopen.');
      setMode('error');
      return;
    }

    verifyPasswordResetCode(auth, oobCode)
      .then((verifiedEmail) => {
        setEmail(verifiedEmail);
        setMode('form');
      })
      .catch((error) => {
        console.error(error);
        setErrorMessage('De link is ongeldig of verlopen. Vraag een nieuwe link aan.');
        setMode('error');
      });
  }, [oobCode, auth]);

  const onSubmit = async (data: PasswordResetFormValues) => {
    if (!oobCode) return;
    try {
      await confirmPasswordReset(auth, oobCode, data.password);
      setMode('success');
    } catch (error) {
      console.error(error);
      setErrorMessage('Er is een fout opgetreden bij het instellen van uw wachtwoord. Probeer het opnieuw.');
      setMode('error');
    }
  };

  const renderContent = () => {
    switch (mode) {
      case 'verify':
        return (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Link verifiëren...</p>
          </div>
        );
      case 'form':
        return (
          <>
            <CardHeader>
              <CardTitle>Wachtwoord instellen</CardTitle>
              <CardDescription>
                Stel een nieuw wachtwoord in voor uw account: {email}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nieuw wachtwoord</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bevestig wachtwoord</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Wachtwoord opslaan
                  </Button>
                </form>
              </Form>
            </CardContent>
          </>
        );
      case 'success':
        return (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <CardTitle>Gelukt!</CardTitle>
            <p className="text-muted-foreground mt-2">Uw wachtwoord is succesvol gewijzigd.</p>
            <Button onClick={() => router.push('/login')} className="mt-6">
              Ga naar Inloggen
            </Button>
          </div>
        );
      case 'error':
        return (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <CardTitle>Fout opgetreden</CardTitle>
            <p className="text-muted-foreground mt-2">{errorMessage}</p>
            <Button variant="outline" onClick={() => router.push('/login')} className="mt-6">
              Terug naar Inloggen
            </Button>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-muted/40">
        <div className="absolute top-8 left-8 z-10">
         <Image
          src="https://i.ibb.co/Fk1pVzqw/IMG-1314.png"
          alt="Logo"
          width={320}
          height={104}
          priority
        />
      </div>
      <Card className="w-full max-w-md">
        {renderContent()}
      </Card>
    </div>
  );
}
