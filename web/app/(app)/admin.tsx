import { Redirect } from 'expo-router';

// HT-48: /admin used to be a copy of the Company page that read a
// `company_info` table which exists in no migration, so it never worked.
// The drawer's Admin entry only opens the submenu; the route is kept so an
// old bookmark or deep link lands on the real page instead of a 404.
export default function AdminScreen() {
  return <Redirect href="/admin/company" />;
}
