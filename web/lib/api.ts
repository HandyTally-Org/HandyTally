import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://evgopevhaapzyvqulwjb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2Z29wZXZoYWFwenl2cXVsd2piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA0MzEzODMsImV4cCI6MjA1NjAwNzM4M30.asYGfJtuoNoJ6s3sOYUc0FRAwHLAVTq1XWqLdGsOZdA'
); 