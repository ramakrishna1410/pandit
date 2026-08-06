import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile } from '../types/database';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  /** A pandit profile exists but hasn't finished onboarding (no base location set yet). */
  panditOnboardingIncomplete: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [panditOnboardingIncomplete, setPanditOnboardingIncomplete] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      setProfile(data as Profile | null);

      if (data?.role === 'pandit') {
        const { data: panditRow } = await supabase
          .from('pandit_profiles')
          .select('base_location')
          .eq('id', userId)
          .maybeSingle();
        setPanditOnboardingIncomplete(!panditRow?.base_location);
      } else {
        setPanditOnboardingIncomplete(false);
      }
    } catch (err) {
      // A network hiccup or unexpected query failure here must not leave
      // `loading` stuck at true forever (which would strand the app on
      // the root spinner indefinitely) -- surface it as "no profile yet"
      // instead, and let the caller's own error handling / a retry
      // (pull-to-refresh, re-navigating) take it from there.
      console.error('AuthProvider: failed to load profile', err);
      setProfile(null);
      setPanditOnboardingIncomplete(false);
    }
  };

  const refreshProfile = async () => {
    if (session?.user.id) {
      await loadProfile(session.user.id);
    }
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        if (data.session?.user.id) {
          await loadProfile(data.session.user.id);
        }
      })
      .catch((err) => {
        console.error('AuthProvider: failed to get session', err);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession?.user.id) {
        await loadProfile(newSession.user.id);
      } else {
        setProfile(null);
        setPanditOnboardingIncomplete(false);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, profile, panditOnboardingIncomplete, loading, refreshProfile, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
