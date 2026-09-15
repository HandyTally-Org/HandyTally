-- HT-12: add the technician role.
--
-- Organisation admins invite people as admin, member (`user`) or technician.
-- Technician is added now so HT-9 (hub.handytally.com) does not have to touch
-- the role model again; for the moment the app treats it exactly like member.
--
-- Kept in its own migration: PostgreSQL refuses to use a new enum value inside
-- the transaction that added it, and the next migration's functions refer to it.

alter type public.user_role add value if not exists 'technician';
