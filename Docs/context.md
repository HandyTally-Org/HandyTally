# Invoice Management System Documentation

## Tech Stack
Frontend: React Native with TypeScript, Expo, and Expo Router
Backend/Database: Supabase
UI Framework: React Native Paper
AI Processing: DeepSeek

## Client & Job Selection
- Users tag estimates to existing clients
- Client selection prompts associated job selection

## Services & Materials Entry

### Services
- Dropdown menu for service selection
- Secondary dropdown displays resources
- Auto-populates rates from services database

### Materials
- Dropdown for material selection 
- Selected quantities deducted from inventory
- Real-time inventory tracking

### Calculations
- Separate subtotals for services and materials
- Automatic grand total calculation
- Invoice-style formatting

## Approval Process
- Approved estimates move to Invoices section
- Automatic removal from Estimates list

## Clients & Jobs Management

### Clients Tab
- Collapsible table view with minimal display
- Row-level actions:
  - Edit button expands row with fields
  - Delete option
  - Save button for updates
- Fields include:
  - Name
  - Email
  - Phone
  - Address
  - City/State/Zip
  - Country
- New client form with matching fields

### Jobs Tab
- Collapsible table format
- Job details include:
  - Job name
  - Start/End dates
  - Notes
  - Total
- Client linking functionality

## Invoice Features

### Invoice Listing
- Table/List view showing:
  - Invoice Number
  - Client Name
  - Job
  - Date
  - Due Date
  - Total Amount
  - Status (Pending/Approved/Paid/Overdue)
- Advanced filtering and sorting options

### Detailed View
- Line item breakdown:
  - Services with quantities and rates
  - Materials with quantities and rates
  - Individual totals
- Summary sections:
  - Services subtotal
  - Materials subtotal
  - Grand total
- Status management options

### Inventory Integration
- Automatic quantity deduction
- Low inventory warnings
- Confirmation prompts
- Real-time updates

### Edit/Delete Rules
- Editable pre-finalization
- Locked post-approval
- Modification restrictions

## Technical Considerations

### UI/UX Design
- Clean, consistent interface
- Clear labeling
- Intuitive navigation
- Immediate user feedback

### Notifications
- Low inventory alerts
- Overdue invoice notifications
- Job deadline reminders

### Future Scalability
- Recurring invoices
- Accounting software integration
- Advanced reporting
- API expansion capabilities

## Database Schema

### Tables

#### clients
- id (UUID PRIMARY KEY)
- name (TEXT NOT NULL)
- email (TEXT UNIQUE)
- phone (TEXT)
- address (TEXT)
- city (TEXT)
- state (TEXT)
- zip (TEXT)
- country (TEXT)
- status (TEXT DEFAULT 'active')
- created_at (TIMESTAMP DEFAULT now())
- updated_at (TIMESTAMP DEFAULT now())

#### jobs
- id (UUID PRIMARY KEY)
- client_id (UUID REFERENCES clients(id))
- name (TEXT NOT NULL)
- description (TEXT)
- start_date (DATE)
- end_date (DATE)
- notes (TEXT)
- total (DECIMAL(10,2))
- status (TEXT DEFAULT 'pending')
- created_at (TIMESTAMP DEFAULT now())
- updated_at (TIMESTAMP DEFAULT now())

#### services
- id (UUID PRIMARY KEY)
- name (TEXT NOT NULL)
- description (TEXT)
- rate (DECIMAL(10,2) NOT NULL)
- unit (TEXT)
- category (TEXT)
- is_active (BOOLEAN DEFAULT true)
- created_at (TIMESTAMP DEFAULT now())
- updated_at (TIMESTAMP DEFAULT now())

#### materials
- id (UUID PRIMARY KEY)
- name (TEXT NOT NULL)
- description (TEXT)
- unit_price (DECIMAL(10,2) NOT NULL)
- quantity_in_stock (DECIMAL(10,2))
- unit (TEXT)
- min_stock_level (DECIMAL(10,2))
- category (TEXT)
- supplier (TEXT)
- is_active (BOOLEAN DEFAULT true)
- created_at (TIMESTAMP DEFAULT now())
- updated_at (TIMESTAMP DEFAULT now())

#### invoices
- id (UUID PRIMARY KEY)
- invoice_number (TEXT UNIQUE)
- client_id (UUID REFERENCES clients(id))
- job_id (UUID REFERENCES jobs(id))
- issue_date (DATE NOT NULL)
- due_date (DATE NOT NULL)
- status (TEXT DEFAULT 'draft')
- services_subtotal (DECIMAL(10,2))
- materials_subtotal (DECIMAL(10,2))
- total_amount (DECIMAL(10,2))
- notes (TEXT)
- payment_terms (TEXT)
- payment_status (TEXT DEFAULT 'unpaid')
- created_at (TIMESTAMP DEFAULT now())
- updated_at (TIMESTAMP DEFAULT now())

#### invoice_services
- id (UUID PRIMARY KEY)
- invoice_id (UUID REFERENCES invoices(id))
- service_id (UUID REFERENCES services(id))
- quantity (DECIMAL(10,2))
- rate (DECIMAL(10,2))
- total (DECIMAL(10,2))
- description (TEXT)
- created_at (TIMESTAMP DEFAULT now())

#### invoice_materials
- id (UUID PRIMARY KEY)
- invoice_id (UUID REFERENCES invoices(id))
- material_id (UUID REFERENCES materials(id))
- quantity (DECIMAL(10,2))
- unit_price (DECIMAL(10,2))
- total (DECIMAL(10,2))
- description (TEXT)
- created_at (TIMESTAMP DEFAULT now())

#### users
- id (UUID PRIMARY KEY)
- email (TEXT UNIQUE NOT NULL)
- encrypted_password (TEXT NOT NULL)
- role (TEXT DEFAULT 'user')
- first_name (TEXT)
- last_name (TEXT)
- phone (TEXT)
- is_active (BOOLEAN DEFAULT true)
- last_login (TIMESTAMP)
- created_at (TIMESTAMP DEFAULT now())
- updated_at (TIMESTAMP DEFAULT now())

#### settings
- id (UUID PRIMARY KEY)
- user_id (UUID REFERENCES users(id))
- key (TEXT NOT NULL)
- value (JSONB)
- created_at (TIMESTAMP DEFAULT now())
- updated_at (TIMESTAMP DEFAULT now())

## Application Structure
