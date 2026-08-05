export type Role = 'seeker' | 'pandit';

export type RequestStatus = 'pending' | 'accepted' | 'cancelled' | 'expired' | 'completed';

export type AvailabilityStatus = 'available' | 'busy' | 'blocked';

export interface Profile {
  id: string;
  phone: string | null;
  full_name: string | null;
  role: Role | null;
  avatar_url: string | null;
  created_at: string;
}

export interface CeremonyType {
  id: number;
  name: string;
  icon: string | null;
}

export interface PanditProfile {
  id: string;
  bio: string | null;
  languages: string[];
  years_experience: number | null;
  base_lat: number | null;
  base_lng: number | null;
  base_address_text: string | null;
  service_radius_km: number;
  avg_rating: number;
  rating_count: number;
  is_available: boolean;
  verified: boolean;
  created_at: string;
}

export interface PanditAvailability {
  id: string;
  pandit_id: string;
  date: string;
  status: AvailabilityStatus;
}

export interface BookingRequest {
  id: string;
  seeker_id: string;
  ceremony_type_id: number;
  contact_name: string;
  contact_phone: string;
  ceremony_date: string;
  lat: number;
  lng: number;
  address_text: string;
  notes: string | null;
  budget_estimate: number | null;
  status: RequestStatus;
  accepted_by: string | null;
  accepted_at: string | null;
  fallback_notified: boolean;
  created_at: string;
}

export interface NearbyPanditResult {
  pandit_id: string;
  distance_m: number;
}

export interface DeviceToken {
  id: string;
  profile_id: string;
  expo_push_token: string;
  device_info: Record<string, unknown> | null;
  updated_at: string;
}

export interface Rating {
  id: string;
  request_id: string;
  seeker_id: string;
  pandit_id: string;
  stars: number;
  review_text: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  request_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}
