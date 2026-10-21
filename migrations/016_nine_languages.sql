ALTER TABLE users DROP CONSTRAINT IF EXISTS users_language_check;
ALTER TABLE users ADD CONSTRAINT users_language_check CHECK(language IN ('en','es','fr','de','it','pt','ja','ru','da'));
ALTER TABLE customer_branches DROP CONSTRAINT IF EXISTS customer_branches_language_check;
ALTER TABLE customer_branches ADD CONSTRAINT customer_branches_language_check CHECK(language IN ('en','es','fr','de','it','pt','ja','ru','da'));
