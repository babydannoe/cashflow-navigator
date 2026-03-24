import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Lock, Mail, Shield } from 'lucide-react';
import mrboostLogo from '@/assets/mrboost-logo.svg';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [loginMode, setLoginMode] = useState<'pin' | 'email'>('pin');
  const [loading, setLoading] = useState(false);
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [factorId, setFactorId] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const navigate = useNavigate();

  const handlePinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pinCode !== '9999') {
      toast.error('Ongeldige code');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: 'daan@mrboost.nl',
      password: 'MrBoost9999!',
    });
    if (error) {
      toast.error('Login mislukt: ' + error.message);
      setLoading(false);
      return;
    }
    toast.success('Ingelogd!');
    navigate('/');
    setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast.error('Login mislukt: ' + error.message);
      setLoading(false);
      return;
    }

    // Check if MFA is required
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totpFactors = factors?.totp || [];
    const verifiedFactors = totpFactors.filter(f => f.status === 'verified');

    if (verifiedFactors.length > 0) {
      // MFA is set up, need verification
      const factor = verifiedFactors[0];
      setFactorId(factor.id);

      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (challengeError) {
        toast.error('MFA challenge mislukt: ' + challengeError.message);
        setLoading(false);
        return;
      }
      setChallengeId(challenge.id);
      setMfaStep(true);
      setLoading(false);
      return;
    }

    // No MFA, login complete
    toast.success('Ingelogd!');
    navigate('/');
    setLoading(false);
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code: mfaCode,
    });

    if (error) {
      toast.error('Ongeldige code: ' + error.message);
      setLoading(false);
      return;
    }

    toast.success('Ingelogd!');
    navigate('/');
    setLoading(false);
  };

  if (mfaStep) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center space-y-3">
            <div className="mx-auto w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-xl">Verificatiecode</CardTitle>
            <p className="text-sm text-muted-foreground">
              Voer de 6-cijferige code in van je authenticator app
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleMfaVerify} className="space-y-4">
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={mfaCode}
                onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))}
                className="text-center text-2xl tracking-[0.5em] font-mono"
                autoFocus
              />
              <Button type="submit" className="w-full" disabled={loading || mfaCode.length !== 6}>
                {loading ? 'Verifiëren...' : 'Verifiëren'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-3">
          <img src={mrboostLogo} alt="Mr. Boost" className="h-10 mx-auto" />
          <CardTitle className="text-xl">Inloggen</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="E-mailadres"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Wachtwoord"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Inloggen...' : 'Inloggen'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
