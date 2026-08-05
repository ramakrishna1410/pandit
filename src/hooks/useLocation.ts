import { useCallback, useState } from 'react';
import * as Location from 'expo-location';

export interface LocationResult {
  lat: number;
  lng: number;
  label: string;
}

export function useLocation() {
  const [location, setLocation] = useState<LocationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captureCurrentLocation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission denied. You can still enter an address manually.');
        return null;
      }
      const position = await Location.getCurrentPositionAsync({});
      const [place] = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      const label = place
        ? [place.name, place.city, place.region].filter(Boolean).join(', ')
        : `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
      const result: LocationResult = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        label,
      };
      setLocation(result);
      return result;
    } catch (e) {
      setError('Could not fetch your location.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { location, setLocation, loading, error, captureCurrentLocation };
}
