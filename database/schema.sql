-- Drop existing foreign key constraint
ALTER TABLE jobs
DROP CONSTRAINT IF EXISTS jobs_client_id_fkey;

-- Add new constraint with CASCADE
ALTER TABLE jobs
ADD CONSTRAINT jobs_client_id_fkey 
    FOREIGN KEY (client_id) 
    REFERENCES clients(id) 
    ON DELETE CASCADE;

ALTER TABLE clients
ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS company (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  ein VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
); 