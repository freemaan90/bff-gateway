export interface MetaBusiness {
  id: string;
  name: string;
}

export interface MetaWaba {
  id: string;
  name: string;
  currency: string;
  timezone_id: string;
}

export interface MetaPhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name: string;
}

export interface MetaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

export interface MetaListResponse<T> {
  data: T[];
  paging?: {
    cursors?: { before: string; after: string };
    next?: string;
  };
}
