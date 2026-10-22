-- Publish a new version of each active default contract template with the fee called the
-- "Vendly Protection fee". Admin edits are kept (only the fee wording changes), earlier
-- versions retire, and active vendor contracts on the old version move to the new one so
-- future bookings use the new wording. Signed booking contracts are snapshots and do not change.
CREATE TEMP TABLE _protection_fee_templates AS
SELECT
  t."id" AS old_id,
  'ctpl' || substr(md5(random()::text || t."id" || clock_timestamp()::text), 1, 21) AS new_id,
  (SELECT max(o."version") FROM "contract_templates" o WHERE o."category" = t."category") + 1 AS new_version
FROM "contract_templates" t
WHERE t."status" = 'ACTIVE'
  AND (t."body" LIKE '%Vendly service fee%' OR t."body" LIKE '%Any service fee is paid to Vendly.%');

UPDATE "contract_templates"
SET "status" = 'RETIRED', "updated_at" = now()
WHERE "id" IN (SELECT old_id FROM _protection_fee_templates);

INSERT INTO "contract_templates" ("id", "created_at", "updated_at", "category", "version", "title", "body", "required_fields", "status")
SELECT
  m.new_id, now(), now(), t."category", m.new_version, t."title",
  replace(
    replace(t."body", 'Vendly service fee', 'Vendly Protection fee'),
    'Any service fee is paid to Vendly.', 'The Vendly Protection fee is paid to Vendly.'
  ),
  t."required_fields", 'ACTIVE'
FROM _protection_fee_templates m
JOIN "contract_templates" t ON t."id" = m.old_id;

UPDATE "vendor_contracts" v
SET "template_id" = m.new_id, "updated_at" = now()
FROM _protection_fee_templates m
WHERE v."template_id" = m.old_id AND v."status" = 'ACTIVE';

DROP TABLE _protection_fee_templates;
