-- Periodic housekeeping via pg_cron (runs inside Postgres, independent of API instances).
create extension if not exists pg_cron;

select cron.schedule('bocardo-prune-outbox', '15 3 * * *',
  $$delete from public.outbox where processed_at < now() - interval '7 days'$$);

select cron.schedule('bocardo-prune-pings', '30 3 * * *',
  $$delete from public.rider_location_pings where recorded_at < now() - interval '90 days'$$);

select cron.schedule('bocardo-prune-webhooks', '45 3 * * *',
  $$delete from public.webhook_events where received_at < now() - interval '30 days'$$);

-- Lift busy mode automatically once it has expired.
select cron.schedule('bocardo-clear-busy', '* * * * *',
  $$update public.restaurants set busy_until = null where busy_until < now()$$);
