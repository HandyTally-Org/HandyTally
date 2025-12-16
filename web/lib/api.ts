import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://supabase.axiappm.com',
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc2NTc3MDAwMCwiZXhwIjo0OTIxNDQzNjAwLCJyb2xlIjoiYW5vbiJ9.gO1H0XzlOU2T9ayabs3A5k6RsNLqqCUv93IG8k3wflk'
); 