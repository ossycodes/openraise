-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- Seed the starting categories so every deployment has them. Admins can
-- rename, reorder or add more; fixed ids keep this migration idempotent.
INSERT INTO "Category" ("id", "slug", "name", "description", "sortOrder", "updatedAt") VALUES
  ('cat_medical',     'medical',     'Medical',              'Hospital bills, surgery, treatment and medicine.',            10, CURRENT_TIMESTAMP),
  ('cat_education',   'education',   'Education',            'School fees, exam fees, books and scholarships.',             20, CURRENT_TIMESTAMP),
  ('cat_emergencies', 'emergencies', 'Emergencies',          'Fire, flood, accidents and other sudden crises.',             30, CURRENT_TIMESTAMP),
  ('cat_community',   'community',   'Community',            'Boreholes, roads, schools and shared spaces.',                40, CURRENT_TIMESTAMP),
  ('cat_funerals',    'funerals',    'Funerals & memorials', 'Burial costs and honouring someone''s memory.',               50, CURRENT_TIMESTAMP),
  ('cat_family',      'family',      'Family',               'Rent, food and support for a family going through it.',       60, CURRENT_TIMESTAMP),
  ('cat_business',    'business',    'Business',             'Restarting or growing a small business.',                     70, CURRENT_TIMESTAMP),
  ('cat_creative',    'creative',    'Creative',             'Film, music, books, art and other creative work.',            80, CURRENT_TIMESTAMP),
  ('cat_environment', 'environment', 'Environment',          'Clean-ups, tree planting and protecting nature.',             90, CURRENT_TIMESTAMP),
  ('cat_animals',     'animals',     'Animals',              'Vet bills, shelters and animal welfare.',                    100, CURRENT_TIMESTAMP),
  ('cat_sports',      'sports',      'Sports',               'Teams, kits, tournaments and athletes.',                     110, CURRENT_TIMESTAMP),
  ('cat_competitions','competitions','Competitions',         'Entry fees and travel for contests and olympiads.',          120, CURRENT_TIMESTAMP),
  ('cat_travel',      'travel',      'Travel',               'Getting someone where they need to be.',                     130, CURRENT_TIMESTAMP),
  ('cat_newlyweds',   'newlyweds',   'Newlyweds',            'Weddings and helping a new couple start out.',               140, CURRENT_TIMESTAMP),
  ('cat_volunteer',   'volunteer',   'Volunteer',            'Funding volunteer projects and outreach.',                   150, CURRENT_TIMESTAMP),
  ('cat_other',       'other',       'Other',                'Anything that doesn''t fit elsewhere.',                      999, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
