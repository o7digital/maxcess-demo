// Adapted from o7digital/crm-suites-o7 AuthService: bcrypt password hashing,
// case-insensitive login and an explicit safe user projection. See docs/REUSE.md.
import bcrypt from "bcrypt";
export const hashPassword = (raw) => bcrypt.hash(raw, 10);
export const verifyPassword = (raw, hash) => bcrypt.compare(raw, hash);
export const exposeUser = ({
  id,
  email,
  name,
  role,
  company_id,
  tenant_id,
  is_platform_owner,
  language,
}) => ({
  id,
  email,
  name,
  role,
  company_id,
  tenant_id,
  is_platform_owner: Boolean(is_platform_owner),
  language,
});
