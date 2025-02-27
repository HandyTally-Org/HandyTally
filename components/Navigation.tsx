import { Link } from 'expo-router';
import { View } from 'react-native';

const links = ['dashboard', 'clients', 'jobs', 'services', 'materials', 'invoices', 'admin'] as const;

export function Navigation() {
  const getHref = (link: string) => {
    if (link === 'dashboard') return '/';
    return `/${link}`;
  };

  return (
    <View>
      {links.map((link) => (
        <Link 
          key={link}
          href={getHref(link) as any}
        >
          {link}
        </Link>
      ))}
    </View>
  );
} 