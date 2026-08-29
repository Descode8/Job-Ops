-- Normalizes Home Progress labels. The app keeps "Other" at the end of the list.

update public.home_checklist_items
set label = case item_key
  when 'steps_decks' then 'Steps/Deck'
  when 'backfill_seed_straw' then 'Backfill, Seed, and Straw'
  when 'plumbing_tie_in' then 'Plumbing Tie-In'
  else label
end
where item_key in ('steps_decks', 'backfill_seed_straw', 'plumbing_tie_in');
