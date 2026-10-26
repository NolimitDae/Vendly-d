-- Removes the "[LAWYER REVIEW]" markers from contract template text: every template version, and the
-- vendors' own contract text. Contracts already rendered for a booking (booking_contracts) are left
-- exactly as they were: their text is hashed and signed.

CREATE FUNCTION strip_lawyer_review(t TEXT) RETURNS TEXT AS $$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(t, '[ \t]*\(\[LAWYER REVIEW\]\)', '', 'g'),  -- "Heading ([LAWYER REVIEW])"
             '[ \t]+\[LAWYER REVIEW\]', '', 'g'),                         -- "Heading [LAWYER REVIEW]", "Deposits [LAWYER REVIEW]:"
           '\[LAWYER REVIEW\][ \t]*', '', 'g')                            -- at the start of a line
$$ LANGUAGE SQL IMMUTABLE;

UPDATE "contract_templates"
SET "title" = strip_lawyer_review("title"),
    "body" = strip_lawyer_review("body")
WHERE "title" LIKE '%[LAWYER REVIEW]%' OR "body" LIKE '%[LAWYER REVIEW]%';

UPDATE "vendor_contracts"
SET "additional_terms" = strip_lawyer_review("additional_terms")
WHERE "additional_terms" LIKE '%[LAWYER REVIEW]%';

-- the tag has no characters JSON escapes, so the text stays valid JSON
UPDATE "vendor_contracts"
SET "field_values" = strip_lawyer_review("field_values"::text)::jsonb
WHERE "field_values"::text LIKE '%[LAWYER REVIEW]%';

DROP FUNCTION strip_lawyer_review(TEXT);
