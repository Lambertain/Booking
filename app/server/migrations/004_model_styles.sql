-- Migration 004: styles_json for model profile + seed model data

ALTER TABLE agency_models ADD COLUMN IF NOT EXISTS styles_json JSONB DEFAULT '[]';

-- Reset sites_json to new format {id, active, price} and fill seed data for 4 agency models

-- Ana V (@the_morning_st) — Hamburg
UPDATE agency_models SET
  city = 'Hamburg',
  rates = 'Portrait/lifestyle 80€, Lingerie 85€, Art nude 95€, Erotic (open legs) 110€/h',
  sites_json = '[
    {"id":"purpleport","label":"PurplePort","active":true,"price":"80"},
    {"id":"model-kartei","label":"Model-Kartei","active":true,"price":"80"},
    {"id":"modelmayhem","label":"Model Mayhem","active":true,"price":"80"},
    {"id":"adultfolio","label":"adultfolio.com","active":true,"price":"80"},
    {"id":"maxmodels","label":"MaxModels.pl","active":true,"price":"80"},
    {"id":"kavyar","label":"Kavyar","active":true,"price":"80"},
    {"id":"litmind","label":"Litmind","active":true,"price":"80"},
    {"id":"ibrandapp","label":"iBrandApp","active":true,"price":"80"}
  ]',
  styles_json = '["Portrait","Fashion","Lifestyle","Swimwear","Art nude","Erotic","Dance","Girl-girl soft","Pink","Toys","Cosplay","Aerial silks"]'
WHERE slug = 'ana-v';

-- Kisa (Juliana Rudek, @ludogroen) — Vilnius
UPDATE agency_models SET
  city = 'Vilnius',
  display_name = 'Kisa',
  rates = 'Portrait/fashion/lifestyle €70, Lingerie €70, Topless €85, Art nude €100, Erotic from €110/h',
  sites_json = '[
    {"id":"purpleport","label":"PurplePort","active":true,"price":"70"},
    {"id":"model-kartei","label":"Model-Kartei","active":true,"price":"70"},
    {"id":"modelmayhem","label":"Model Mayhem","active":true,"price":"70"},
    {"id":"adultfolio","label":"adultfolio.com","active":true,"price":"70"},
    {"id":"maxmodels","label":"MaxModels.pl","active":true,"price":"70"}
  ]',
  styles_json = '["Portrait","Fashion","Lifestyle","Swimwear","Lingerie","Covered nude","Art nude","Erotic","Dance","Shibari","Girl-girl soft","Girl-girl hard","BDSM","Pink","Cosplay"]'
WHERE slug = 'kisa';

-- Victoria Polly (@katerinamaste) — Berlin
UPDATE agency_models SET
  city = 'Berlin',
  display_name = 'Victoria Polly',
  rates = 'Portrait 90€, Fashion 90€, Topless 95€, Art nude 100€/h, min 2h',
  sites_json = '[
    {"id":"model-kartei","label":"Model-Kartei","active":true,"price":"90"}
  ]',
  styles_json = '["Portrait","Fashion","Lifestyle","Swimwear","Erotic","Art nude","Girl-girl soft"]'
WHERE slug = 'victoria-polly';

-- Violet Spes (Oleksandra Lebedieva) — Berlin
UPDATE agency_models SET
  city = 'Berlin',
  display_name = 'Violet Spes',
  rates = 'Portrait 65€, Art nude 85€, Open legs 100€/h, min 2h',
  sites_json = '[
    {"id":"model-kartei","label":"Model-Kartei","active":true,"price":"65"}
  ]',
  styles_json = '["Portrait","Fashion","Lifestyle","Swimwear","Lingerie","Covered nude","Art nude","Erotic","Dance","Pink","Shibari","BDSM"]'
WHERE slug = 'violet-spes';
