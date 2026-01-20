'use client';

import * as React from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  verifyPasswordResetCode,
  confirmPasswordReset,
  sendPasswordResetEmail
} from 'firebase/auth';

import { Button } from '@/components/ui/button';
import { CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, CheckCircle, AlertCircle, Mail, Lock } from 'lucide-react';
import { useAuth as useFirebaseAuth } from '@/firebase';

const passwordResetSchema = z.object({
  password: z.string().min(6, 'Wachtwoord moet minimaal 6 karakters lang zijn.'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Wachtwoorden komen niet overeen.",
  path: ["confirmPassword"],
});

const emailSchema = z.object({
    email: z.string().email('Voer een geldig e-mailadres in.'),
});

type PasswordResetFormValues = z.infer<typeof passwordResetSchema>;
type EmailFormValues = z.infer<typeof emailSchema>;

export function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useFirebaseAuth();

  const [mode, setMode] = React.useState<'email' | 'verify' | 'form' | 'success' | 'error' | 'email-sent'>('email');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [emailForReset, setEmailForReset] = React.useState<string | null>(null);
  const oobCode = searchParams.get('oobCode');

  const passwordForm = useForm<PasswordResetFormValues>({
    resolver: zodResolver(passwordResetSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const emailForm = useForm<EmailFormValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
  });
  
  React.useEffect(() => {
    if (oobCode) {
      setMode('verify');
      verifyPasswordResetCode(auth, oobCode)
        .then((verifiedEmail) => {
          setEmailForReset(verifiedEmail);
          setMode('form');
        })
        .catch((error) => {
          console.error(error);
          setErrorMessage('De link voor het opnieuw instellen van het wachtwoord is ongeldig of verlopen. Vraag een nieuwe aan.');
          setMode('error');
        });
    } else {
        setMode('email');
    }
  }, [oobCode, auth]);

  const onPasswordSubmit = async (data: PasswordResetFormValues) => {
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

  const onEmailSubmit = async (data: EmailFormValues) => {
    try {
      await sendPasswordResetEmail(auth, data.email, {
        url: window.location.href, // This will include the current URL, so when they click the link they come back here
      });
      setEmailForReset(data.email);
      setMode('email-sent');
    } catch (error) {
      console.error(error);
      setErrorMessage('Er is een fout opgetreden bij het verzenden van de e-mail. Controleer het e-mailadres en probeer het opnieuw.');
      setMode('error');
    }
  };

  switch (mode) {
    case 'email':
      return (
        <>
            <CardHeader className="items-center text-center">
                <CardTitle>Wachtwoord vergeten?</CardTitle>
                <CardDescription>
                Voer uw e-mailadres in en we sturen u een link om uw wachtwoord opnieuw in te stellen.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...emailForm}>
                    <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
                    <FormField
                        control={emailForm.control}
                        name="email"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                <Input placeholder="m@example.com" {...field} className="pl-10"/>
                            </div>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <Button type="submit" className="w-full" disabled={emailForm.formState.isSubmitting}>
                        {emailForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Verstuur reset link
                    </Button>
                     <Button variant="link" className="w-full" onClick={() => router.push('/login')}>
                        Terug naar inloggen
                    </Button>
                    </form>
                </Form>
            </CardContent>
        </>
      );
    case 'email-sent':
        return (
             <CardContent>
                <div className="flex flex-col items-center justify-center p-8 text-center">
                    <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                    <CardTitle>E-mail verzonden!</CardTitle>
                    <p className="text-muted-foreground mt-2">
                        Als er een account bestaat voor {emailForReset}, is er een e-mail verzonden met instructies om uw wachtwoord opnieuw in te stellen.
                    </p>
                    <Button onClick={() => router.push('/login')} className="mt-6">
                        Terug naar Inloggen
                    </Button>
                </div>
            </CardContent>
        );
    case 'verify':
      return (
        <CardContent>
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Link verifiëren...</p>
          </div>
        </CardContent>
      );
    case 'form':
      return (
        <>
          <CardHeader className="items-center text-center">
            <CardTitle>Nieuw wachtwoord instellen</CardTitle>
            <CardDescription>
              Stel een nieuw wachtwoord in voor uw account: {emailForReset}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...passwordForm}>
              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                <FormField
                  control={passwordForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nieuw wachtwoord</FormLabel>
                       <FormControl>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                <Input type="password" {...field} className="pl-10"/>
                            </div>
                        </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bevestig wachtwoord</FormLabel>
                        <FormControl>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                <Input type="password" {...field} className="pl-10"/>
                            </div>
                        </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={passwordForm.formState.isSubmitting}>
                  {passwordForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Wachtwoord opslaan
                </Button>
              </form>
            </Form>
          </CardContent>
        </>
      );
    case 'success':
      return (
        <CardContent>
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <CardTitle>Gelukt!</CardTitle>
            <p className="text-muted-foreground mt-2">Uw wachtwoord is succesvol gewijzigd.</p>
            <Button onClick={() => router.push('/login')} className="mt-6">
              Ga naar Inloggen
            </Button>
          </div>
        </CardContent>
      );
    case 'error':
      return (
        <CardContent>
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <CardTitle>Fout opgetreden</CardTitle>
            <p className="text-muted-foreground mt-2">{errorMessage}</p>
            <Button variant="outline" onClick={() => router.push('/login')} className="mt-6">
              Terug naar Inloggen
            </Button>
          </div>
        </CardContent>
      );
  }
}
