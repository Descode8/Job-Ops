-- Removes the deprecated Home Progress step without deleting historical data.

update public.home_checklist_items
set is_active = false
where item_key = 'trimout_after_meter';
