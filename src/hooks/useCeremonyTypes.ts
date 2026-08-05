import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { CeremonyType } from '../types/database';

export function useCeremonyTypes() {
  const [ceremonyTypes, setCeremonyTypes] = useState<CeremonyType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('ceremony_types')
      .select('*')
      .order('id')
      .then(({ data }) => {
        setCeremonyTypes((data as CeremonyType[]) ?? []);
        setLoading(false);
      });
  }, []);

  return { ceremonyTypes, loading };
}
