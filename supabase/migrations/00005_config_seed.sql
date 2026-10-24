-- ============================================================================
-- HCM Lite — Configuration seed
--
-- IMPORTANT: this is NOT demo data. These are the tax slabs specified in the
-- challenge brief (illustrative, applied on ANNUAL gross = monthly gross x 12).
-- The system otherwise starts completely empty — no users, no employees, no
-- attendance. Admin configures the company via /setup and the M2 screens.
-- Admin can edit slabs in the UI (Organization → Tax slabs).
--
--   0        – 600,000  : 0%
--   600,000  – 1,200,000: 5%
--   1,200,000– 2,400,000: 30,000 + 15%
--   2,400,000– 3,600,000: 210,000 + 25%
--   3,600,000– ∞        : 510,000 + 35%
-- ============================================================================

insert into public.tax_slabs (min_amount, max_amount, rate_pct, flat_amount, sort_order)
values
  (0,       600000,    0,  0,      1),
  (600000,  1200000,   5,  0,      2),
  (1200000, 2400000,  15,  30000,  3),
  (2400000, 3600000,  25,  210000, 4),
  (3600000, null,     35,  510000, 5)
on conflict (min_amount, max_amount) do nothing;
