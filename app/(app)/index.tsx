import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Card, Button, List, ActivityIndicator } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { styles as globalStyles } from '../../styles';

type DashboardStats = {
  clientCount: number;
  activeJobsCount: number;
  pendingInvoicesCount: number;
  lowStockItemsCount: number;
  loading: boolean;
};

type ActivityItem = {
  id: string;
  type: 'job' | 'invoice' | 'client' | 'material';
  title: string;
  subtitle: string;
  date: string;
};

export default function DashboardScreen() {
  const [stats, setStats] = useState<DashboardStats>({
    clientCount: 0,
    activeJobsCount: 0,
    pendingInvoicesCount: 0,
    lowStockItemsCount: 0,
    loading: true,
  });
  
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
    fetchRecentActivity();
  }, []);

  async function fetchDashboardData() {
    try {
      setStats(prev => ({ ...prev, loading: true }));
      
      // Fetch client count
      const { count: clientCount, error: clientError } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true });
      
      if (clientError) throw clientError;
      
      // Fetch active jobs count
      const { count: activeJobsCount, error: jobsError } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'in_progress');
      
      if (jobsError) throw jobsError;
      
      // Fetch pending invoices count (draft + sent + overdue)
      const { count: pendingInvoicesCount, error: invoicesError } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .in('status', ['draft', 'sent', 'overdue']);
      
      if (invoicesError) throw invoicesError;
      
      // Fetch low stock materials count
      const { count: lowStockItemsCount, error: materialsError } = await supabase
        .from('materials')
        .select('*', { count: 'exact', head: true })
        .lt('quantity', 10); // Assuming items with quantity < 10 are considered low stock
      
      if (materialsError) throw materialsError;
      
      setStats({
        clientCount: clientCount || 0,
        activeJobsCount: activeJobsCount || 0,
        pendingInvoicesCount: pendingInvoicesCount || 0,
        lowStockItemsCount: lowStockItemsCount || 0,
        loading: false,
      });
      
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setStats(prev => ({ ...prev, loading: false }));
    }
  }
  
  async function fetchRecentActivity() {
    try {
      setActivityLoading(true);
      const activities: ActivityItem[] = [];
      
      // Fetch recent jobs
      const { data: recentJobs, error: jobsError } = await supabase
        .from('jobs')
        .select('uid, title, client_id, status, created_at, clients(name)')
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (jobsError) throw jobsError;
      
      if (recentJobs) {
        recentJobs.forEach(job => {
          activities.push({
            id: `job-${job.uid}`,
            type: 'job',
            title: 'New Job Created',
            subtitle: `${job.title} - ${job.clients?.name || 'Unknown Client'}`,
            date: job.created_at,
          });
        });
      }
      
      // Fetch recent invoices
      const { data: recentInvoices, error: invoicesError } = await supabase
        .from('invoices')
        .select('uid, invoice_number, status, total, created_at, client_id, clients(name)')
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (invoicesError) throw invoicesError;
      
      if (recentInvoices) {
        recentInvoices.forEach(invoice => {
          const status = invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1);
          activities.push({
            id: `invoice-${invoice.uid}`,
            type: 'invoice',
            title: `Invoice ${status}`,
            subtitle: `INV-${invoice.invoice_number} - $${invoice.total.toFixed(2)}`,
            date: invoice.created_at,
          });
        });
      }
      
      // Fetch recent clients
      const { data: recentClients, error: clientsError } = await supabase
        .from('clients')
        .select('uid, name, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (clientsError) throw clientsError;
      
      if (recentClients) {
        recentClients.forEach(client => {
          activities.push({
            id: `client-${client.uid}`,
            type: 'client',
            title: 'New Client Added',
            subtitle: client.name,
            date: client.created_at,
          });
        });
      }
      
      // Sort all activities by date
      activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      // Take only the 5 most recent activities
      setRecentActivity(activities.slice(0, 5));
      setActivityLoading(false);
      
    } catch (error) {
      console.error('Error fetching recent activity:', error);
      setActivityLoading(false);
    }
  }
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };
  
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'job':
        return 'briefcase-outline';
      case 'invoice':
        return 'file-document-outline';
      case 'client':
        return 'account-outline';
      case 'material':
        return 'package-variant-closed';
      default:
        return 'information-outline';
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text variant="headlineMedium" style={styles.title}>Dashboard</Text>
      
      <View style={styles.statsContainer}>
        <Card style={styles.statsCard}>
          <Card.Content>
            <Text variant="titleLarge">Clients</Text>
            {stats.loading ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text variant="displayMedium">{stats.clientCount}</Text>
            )}
          </Card.Content>
          <Card.Actions>
            <Button onPress={() => console.log('View all clients')}>View All</Button>
          </Card.Actions>
        </Card>
        
        <Card style={styles.statsCard}>
          <Card.Content>
            <Text variant="titleLarge">Active Jobs</Text>
            {stats.loading ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text variant="displayMedium">{stats.activeJobsCount}</Text>
            )}
          </Card.Content>
          <Card.Actions>
            <Button onPress={() => console.log('View all jobs')}>View All</Button>
          </Card.Actions>
        </Card>
      </View>
      
      <View style={styles.statsContainer}>
        <Card style={styles.statsCard}>
          <Card.Content>
            <Text variant="titleLarge">Pending Invoices</Text>
            {stats.loading ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text variant="displayMedium">{stats.pendingInvoicesCount}</Text>
            )}
          </Card.Content>
          <Card.Actions>
            <Button onPress={() => console.log('View all invoices')}>View All</Button>
          </Card.Actions>
        </Card>
        
        <Card style={styles.statsCard}>
          <Card.Content>
            <Text variant="titleLarge">Low Stock Items</Text>
            {stats.loading ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text variant="displayMedium">{stats.lowStockItemsCount}</Text>
            )}
          </Card.Content>
          <Card.Actions>
            <Button onPress={() => console.log('View all materials')}>View All</Button>
          </Card.Actions>
        </Card>
      </View>
      
      <Card style={styles.activityCard}>
        <Card.Content>
          <Text variant="titleLarge" style={styles.sectionTitle}>Recent Activity</Text>
          
          {activityLoading ? (
            <ActivityIndicator size="large" style={{ marginTop: 20 }} />
          ) : recentActivity.length === 0 ? (
            <Text style={styles.emptyText}>No recent activity</Text>
          ) : (
            recentActivity.map((activity) => (
              <List.Item
                key={activity.id}
                title={activity.title}
                description={activity.subtitle}
                left={props => <List.Icon {...props} icon={getActivityIcon(activity.type)} />}
                right={props => <Text {...props} style={styles.activityDate}>{formatDate(activity.date)}</Text>}
                style={styles.activityItem}
              />
            ))
          )}
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    marginBottom: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statsCard: {
    width: '48%',
  },
  activityCard: {
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 16,
  },
  activityItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  activityDate: {
    fontSize: 12,
    color: '#666',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
}); 