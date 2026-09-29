Schema changes ship as generated Drizzle migrations and must be additive: every deploy migrates before its code is live, so a rename or drop takes two deploys.
