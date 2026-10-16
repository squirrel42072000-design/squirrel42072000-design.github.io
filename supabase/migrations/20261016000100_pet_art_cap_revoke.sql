-- Rootling v16 follow-up (Supabase security advisor): the 48-item cap is a
-- SECURITY DEFINER trigger function, so nobody should be able to call it
-- directly through /rest/v1/rpc. The trigger still fires on insert.
revoke execute on function public.pet_artworks_cap() from public, anon, authenticated;
