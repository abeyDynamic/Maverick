import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { TrendingUp } from 'lucide-react';

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) { setError('Enter your email and password.'); return; }
    setLoading(true);
    setError('');
    const { error: err } = await signIn(email, password);
    if (err) {
      setError('Invalid credentials — check your email and password.');
      setLoading(false);
    } else {
      navigate('/dashboard');
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'hsl(220,18%,97%)' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'hsl(216,75%,12%)' }}
          >
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-base font-semibold tracking-tight text-foreground">Maverick</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest -mt-0.5">
              KSquare Mortgages
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="surface p-8">
          <h1 className="text-[22px] font-semibold text-foreground tracking-tight mb-1">
            Sign in
          </h1>
          <p className="text-[13px] text-muted-foreground mb-7">
            Adviser access only.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="field-label">Email</label>
              <input
                type="email"
                className="maverick-input"
                placeholder="you@ksquare.ae"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div>
              <label className="field-label">Password</label>
              <input
                type="password"
                className="maverick-input"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="text-[12.5px] text-red-500 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60 mt-2"
              style={{ background: 'hsl(216,75%,12%)' }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-muted-foreground mt-6">
          KSquare Mortgages · Internal Platform
        </p>
      </div>
    </div>
  );
}
