import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Shield, CheckCircle2 } from 'lucide-react';

export default function MFASetup() {
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [factorId, setFactorId] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [alreadySetup, setAlreadySetup] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkExisting();
  }, []);

  const checkExisting = async () => {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = factors?.totp?.filter(f => f.status === 'verified') || [];
    if (verified.length > 0) {
      setAlreadySetup(true);
    }
  };

  const startEnroll = async () => {
    setLoading(true);
    
    // Unenroll any unverified factors first
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const unverified = factors?.totp?.filter(f => f.status !== 'verified') || [];
    for (const f of unverified) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Mr. Boost Authenticator',
    });

    if (error) {
      toast.error('Fout bij instellen: ' + error.message);
      setLoading(false);
      return;
    }

    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setFactorId(data.id);
    setLoading(false);
  };

  const verifyEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) {
      toast.error('Challenge mislukt: ' + challengeError.message);
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: verifyCode,
    });

    if (error) {
      toast.error('Ongeldige code: ' + error.message);
      setLoading(false);
      return;
    }

    setEnrolled(true);
    toast.success('2FA succesvol ingesteld!');
    setLoading(false);
  };

  if (alreadySetup) {
    return (
      <div className="max-w-md mx-auto mt-8">
        <Card>
          <CardHeader className="text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle>2FA is al actief</CardTitle>
            <p className="text-sm text-muted-foreground">
              Twee-factor authenticatie is al ingesteld voor dit account.
            </p>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => navigate('/')}>
              Terug naar dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (enrolled) {
    return (
      <div className="max-w-md mx-auto mt-8">
        <Card>
          <CardHeader className="text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle>2FA ingesteld!</CardTitle>
            <p className="text-sm text-muted-foreground">
              Bij de volgende login wordt om een verificatiecode gevraagd.
            </p>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate('/')}>
              Naar dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-8">
      <Card>
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <CardTitle>Twee-factor authenticatie</CardTitle>
          <p className="text-sm text-muted-foreground">
            Beveilig je account met een authenticator app (Google Authenticator, Authy, etc.)
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!qrCode ? (
            <Button className="w-full" onClick={startEnroll} disabled={loading}>
              {loading ? 'Bezig...' : '2FA instellen'}
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm font-medium mb-3">Scan deze QR-code met je authenticator app:</p>
                <img src={qrCode} alt="QR Code" className="mx-auto rounded-lg border p-2" />
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Of voer deze code handmatig in:</p>
                <code className="text-xs bg-muted px-2 py-1 rounded font-mono break-all select-all">
                  {secret}
                </code>
              </div>
              <form onSubmit={verifyEnrollment} className="space-y-3">
                <p className="text-sm font-medium">Voer de code in uit je app om te bevestigen:</p>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={verifyCode}
                  onChange={e => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                  className="text-center text-2xl tracking-[0.5em] font-mono"
                  autoFocus
                />
                <Button type="submit" className="w-full" disabled={loading || verifyCode.length !== 6}>
                  {loading ? 'Verifiëren...' : 'Bevestigen'}
                </Button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
