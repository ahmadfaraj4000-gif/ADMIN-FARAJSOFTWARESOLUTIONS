# Faraj Software Solutions Admin Portal

This is a starter Vite + React admin portal for managing Faraj Software Solutions users, subscriptions, support requests, product access, and admin notes.

## What it includes

- Admin-only login restricted by email
- Dashboard cards
  - Total users
  - Active subscribers
  - Pending support requests
- Users table
- Subscriptions table
- Support/messages table
- Grant access button
- Revoke access button
- Admin notes per customer
- Supabase SQL schema
- Supabase RLS policies

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create your `.env` file

Copy `.env.example` into `.env`:

```bash
cp .env.example .env
```

Then update it:

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_ADMIN_EMAIL=farajsoftwaresolutions@gmail.com
```

### 3. Run the SQL files in Supabase

Open Supabase → SQL Editor and run these in order:

1. `sql/01_schema.sql`
2. `sql/02_functions_and_triggers.sql`
3. `sql/03_rls_policies.sql`
4. `sql/05_pricing_assistant_tables.sql`
5. `sql/06_trial_access.sql`

Only run `sql/04_optional_test_data.sql` if you want test data and you replace `customer@example.com` with a real user email.

### 4. Run locally

```bash
npm run dev
```

Open the Vite local URL in your browser.

### 5. Build for deployment

```bash
npm run build
```

Deploy the generated `dist` folder.

## Important notes

### Admin email

The portal blocks access unless the signed-in Supabase user's email matches:

```env
VITE_ADMIN_EMAIL=farajsoftwaresolutions@gmail.com
```

The Supabase RLS function also checks the same admin email inside `sql/02_functions_and_triggers.sql`.

If you change the admin email, change it in both places.

### Required Supabase Auth setup

Users must exist in Supabase Auth. The trigger in `02_functions_and_triggers.sql` automatically creates a row in `profiles` when new users sign up.

For users created before the trigger, you can manually backfill profiles:

```sql
insert into public.profiles (id, email, full_name)
select id, email, raw_user_meta_data ->> 'full_name'
from auth.users
on conflict (id) do nothing;
```

### Product values

The subscriptions table supports:

- `shift_planner`
- `pricing_assistant_pro`

### Pricing Assistant web app tables

The converted web app stores saved menus and reusable cost structures in:

- `pricing_assistant_menus`
- `pricing_assistant_cost_configs`

Run `sql/05_pricing_assistant_tables.sql` so users can save menu items, recall restaurant cost setups, and export menus later.

### Pricing Assistant trial access

Run `sql/06_trial_access.sql` to enable the client portal's 7-day Pricing Assistant Pro trial. The trial is enforced by Supabase using the signed-in user's normalized email and `pricing_assistant_pro`, so the same email cannot start repeated trials.

### Stripe links

The client portal reads these optional env vars:

```env
VITE_STRIPE_PRICING_ASSISTANT_PRO_LINK=https://buy.stripe.com/...
```

Stripe webhooks should insert or update `subscriptions.product` as `pricing_assistant_pro`. Admin-granted trials and bypasses should use that same product value so the protected portal route honors them.

### Fix for ON CONFLICT error

This package includes the required unique constraint:

```sql
constraint subscriptions_user_product_unique unique (user_id, product)
```

That allows this to work:

```sql
on conflict (user_id, product)
do update set status = 'active';
```
