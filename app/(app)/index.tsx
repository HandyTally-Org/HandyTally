import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Dimensions, TouchableOpacity } from 'react-native';
import { Text, Card, Title, Paragraph, Button, List, ActivityIndicator, Menu, Divider, Portal, Modal, IconButton, Snackbar } from 'react-native-paper';
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

type ChartData = {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor: string;
  }[];
};

type TimeRange = 'year_to_date' | 'last_6_months' | 'last_12_months' | 'all_time';
type InvoiceStatus = 'all' | 'paid' | 'draft' | 'sent' | 'overdue';

type InvoicesByMonth = {
  [month: string]: {
    [status: string]: {
      total: number;
      invoices: any[];
    }
  }
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
  const [loading, setLoading] = useState(true);
  const [totalSales, setTotalSales] = useState(0);
  const [salesLoading, setSalesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<ChartData>({
    labels: [],
    datasets: []
  });
  const [timeRange, setTimeRange] = useState<TimeRange>('year_to_date');
  const [timeRangeMenuVisible, setTimeRangeMenuVisible] = useState(false);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus>('all');
  const [statusMenuVisible, setStatusMenuVisible] = useState(false);
  const [allInvoices, setAllInvoices] = useState<any[]>([]);
  const [invoicesByMonth, setInvoicesByMonth] = useState<InvoicesByMonth>({});
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [selectedMonthInvoices, setSelectedMonthInvoices] = useState<any[]>([]);
  const [activeCallout, setActiveCallout] = useState<{
    month: string;
    status: string;
    invoices: any[];
    position: { x: number, y: number };
  } | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  useEffect(() => {
    console.log("Dashboard component mounted");
    // Set a timeout to ensure loading state is properly shown
    setTimeout(() => {
      fetchAllData();
    }, 100);
  }, []);

  useEffect(() => {
    // When either time range or status filter changes, update the chart
    if (allInvoices.length > 0) {
      processChartData(allInvoices, timeRange, statusFilter);
    }
  }, [timeRange, statusFilter]);

  const fetchAllData = async () => {
    try {
      console.log("Starting to fetch all dashboard data");
      
      // Run each fetch separately to better handle errors
      await fetchDashboardData();
      await fetchRecentActivity();
      await fetchSalesData();
      
      console.log("All dashboard data fetched successfully");
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
      setError("Failed to load dashboard data. Please try refreshing the page.");
    } finally {
      // Ensure loading state is set to false
      setLoading(false);
    }
  };

  async function fetchDashboardData() {
    console.log("Fetching dashboard stats data");
    try {
      // Fetch client count
      const clientsResponse = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true });
      
      if (clientsResponse.error) {
        console.error("Error fetching client count:", clientsResponse.error);
        throw clientsResponse.error;
      }
      
      const clientCount = clientsResponse.count || 0;
      console.log("Client count:", clientCount);
      
      // Fetch active jobs count
      const jobsResponse = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'in_progress');
      
      if (jobsResponse.error) {
        console.error("Error fetching active jobs count:", jobsResponse.error);
        throw jobsResponse.error;
      }
      
      const activeJobsCount = jobsResponse.count || 0;
      console.log("Active jobs count:", activeJobsCount);
      
      // Fetch pending invoices count (draft + sent + overdue)
      const invoicesResponse = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .in('status', ['draft', 'sent', 'overdue']);
      
      if (invoicesResponse.error) {
        console.error("Error fetching pending invoices count:", invoicesResponse.error);
        throw invoicesResponse.error;
      }
      
      const pendingInvoicesCount = invoicesResponse.count || 0;
      console.log("Pending invoices count:", pendingInvoicesCount);
      
      // Fetch low stock materials count
      const materialsResponse = await supabase
        .from('materials')
        .select('*', { count: 'exact', head: true })
        .lt('quantity', 10);
      
      if (materialsResponse.error) {
        console.error("Error fetching low stock items count:", materialsResponse.error);
        throw materialsResponse.error;
      }
      
      const lowStockItemsCount = materialsResponse.count || 0;
      console.log("Low stock items count:", lowStockItemsCount);
      
      setStats({
        clientCount,
        activeJobsCount,
        pendingInvoicesCount,
        lowStockItemsCount,
        loading: false,
      });
      
      console.log("Dashboard stats updated successfully");
      
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setStats(prev => ({ ...prev, loading: false }));
      throw error; // Rethrow to be caught by fetchAllData
    }
  }
  
  async function fetchRecentActivity() {
    console.log("Fetching recent activity data");
    try {
      const activities: ActivityItem[] = [];
      
      // Fetch recent jobs
      const jobsResponse = await supabase
        .from('jobs')
        .select(`
          uid, 
          title, 
          client_id, 
          status, 
          created_at, 
          clients (
            name
          )
        `)
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (jobsResponse.error) {
        console.error("Error fetching recent jobs:", jobsResponse.error);
        throw jobsResponse.error;
      }
      
      const recentJobs = jobsResponse.data || [];
      console.log("Recent jobs fetched:", recentJobs.length);
      
      if (recentJobs.length > 0) {
        recentJobs.forEach(job => {
          // Safely access client name
          let clientName = 'Unknown Client';
          if (job.clients && typeof job.clients === 'object' && 'name' in job.clients) {
            clientName = job.clients.name || 'Unknown Client';
          }
          
          activities.push({
            id: `job-${job.uid}`,
            type: 'job',
            title: 'New Job Created',
            subtitle: `${job.title} - ${clientName}`,
            date: job.created_at,
          });
        });
      }
      
      // Fetch recent invoices
      const invoicesResponse = await supabase
        .from('invoices')
        .select(`
          uid, 
          invoice_number, 
          status, 
          total, 
          created_at, 
          client_id, 
          clients (
            name
          )
        `)
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (invoicesResponse.error) {
        console.error("Error fetching recent invoices:", invoicesResponse.error);
        throw invoicesResponse.error;
      }
      
      const recentInvoices = invoicesResponse.data || [];
      console.log("Recent invoices fetched:", recentInvoices.length);
      
      if (recentInvoices.length > 0) {
        recentInvoices.forEach(invoice => {
          // Safely access client name
          let clientName = 'Unknown Client';
          if (invoice.clients && typeof invoice.clients === 'object' && 'name' in invoice.clients) {
            clientName = invoice.clients.name || 'Unknown Client';
          }
          
          const status = invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1);
          activities.push({
            id: `invoice-${invoice.uid}`,
            type: 'invoice',
            title: `Invoice ${status}`,
            subtitle: `INV-${invoice.invoice_number} - $${invoice.total.toFixed(2)} - ${clientName}`,
            date: invoice.created_at,
          });
        });
      }
      
      // Fetch recent clients
      const clientsResponse = await supabase
        .from('clients')
        .select('uid, name, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (clientsResponse.error) {
        console.error("Error fetching recent clients:", clientsResponse.error);
        throw clientsResponse.error;
      }
      
      const recentClients = clientsResponse.data || [];
      console.log("Recent clients fetched:", recentClients.length);
      
      if (recentClients.length > 0) {
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
      console.log("Recent activity updated successfully:", activities.length);
      
    } catch (error) {
      console.error('Error fetching recent activity:', error);
      throw error; // Rethrow to be caught by fetchAllData
    } finally {
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

  const fetchSalesData = async () => {
    console.log("Fetching sales data");
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('total, issue_date, status, created_at, invoice_number')
        .order('issue_date');
      
      if (error) {
        console.error("Error fetching sales data:", error);
        throw error;
      }
      
      console.log("Sales data fetched:", data?.length || 0, "invoices");
      
      if (data) {
        // Store all invoices for filtering by time range later
        setAllInvoices(data);
        
        // Calculate total sales from all invoices, not just paid ones
        const total = data.reduce((sum, invoice) => sum + (invoice.total || 0), 0);
        setTotalSales(total);
        console.log("Total sales calculated:", total);
        
        // Process data for chart with default time range and status filter
        processChartData(data, timeRange, statusFilter);
      }
    } catch (error) {
      console.error('Error fetching sales data:', error);
      throw error; // Rethrow to be caught by fetchAllData
    } finally {
      setSalesLoading(false);
    }
  };

  const handleTimeRangeChange = (range: TimeRange) => {
    setTimeRange(range);
    setTimeRangeMenuVisible(false);
  };

  const handleStatusFilterChange = (status: InvoiceStatus) => {
    setStatusFilter(status);
    setStatusMenuVisible(false);
  };

  const getTimeRangeLabel = (range: TimeRange): string => {
    switch (range) {
      case 'year_to_date':
        return 'This year to date';
      case 'last_6_months':
        return 'Last 6 months';
      case 'last_12_months':
        return 'Last 12 months';
      case 'all_time':
        return 'All time';
      default:
        return 'This year to date';
    }
  };

  const getStatusFilterLabel = (status: InvoiceStatus): string => {
    switch (status) {
      case 'all':
        return 'All Statuses';
      case 'paid':
        return 'Paid Only';
      case 'draft':
        return 'Draft Only';
      case 'sent':
        return 'Sent Only';
      case 'overdue':
        return 'Overdue Only';
      default:
        return 'All Statuses';
    }
  };

  const processChartData = (invoices: any[], range: TimeRange, status: InvoiceStatus = 'all') => {
    // Filter invoices based on time range
    let filteredInvoices = filterInvoicesByTimeRange(invoices, range);
    
    // Further filter by status if not 'all'
    if (status !== 'all') {
      filteredInvoices = filteredInvoices.filter(invoice => invoice.status === status);
    }
    
    // Calculate total sales from filtered invoices
    const total = filteredInvoices.reduce((sum, invoice) => sum + (invoice.total || 0), 0);
    setTotalSales(total);
    
    // Get current year
    const currentYear = new Date().getFullYear();
    
    // Group invoices by month and status
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const statuses = ['paid', 'sent', 'draft', 'overdue'];
    const statusColors = {
      paid: '#71AF24', // Green
      sent: '#3498db', // Blue
      draft: '#9b59b6', // Purple
      overdue: '#e74c3c', // Red
    };
    
    // Initialize data structure for invoices by month and status
    const monthlyData: InvoicesByMonth = {};
    months.forEach(month => {
      monthlyData[month] = {};
      statuses.forEach(status => {
        monthlyData[month][status] = {
          total: 0,
          invoices: []
        };
      });
    });
    
    // Populate data
    filteredInvoices.forEach(invoice => {
      if (!invoice.issue_date) return;
      
      const date = new Date(invoice.issue_date);
      const year = date.getFullYear();
      const month = date.toLocaleDateString('en-US', { month: 'short' });
      const status = invoice.status || 'draft';
      
      // Only add current year data
      if (year === currentYear) {
        // Make sure the status exists in our structure
        if (!monthlyData[month][status]) {
          monthlyData[month][status] = { total: 0, invoices: [] };
        }
        
        // Ensure we have the invoice_number
        const invoiceWithNumber = {
          ...invoice,
          invoice_number: invoice.invoice_number || `Unknown-${monthlyData[month][status].invoices.length + 1}`
        };
        
        monthlyData[month][status].total += invoice.total || 0;
        monthlyData[month][status].invoices.push(invoiceWithNumber);
      }
    });
    
    // Log the invoices for debugging
    console.log("Processed invoices by month:", JSON.stringify(monthlyData, null, 2));
    
    // Save the processed data for interactive features
    setInvoicesByMonth(monthlyData);
    
    // Prepare datasets for the stacked bar chart
    const datasets = statuses.map(status => {
      return {
        label: status.charAt(0).toUpperCase() + status.slice(1),
        data: months.map(month => monthlyData[month][status]?.total || 0),
        backgroundColor: statusColors[status as keyof typeof statusColors]
      };
    });
    
    // Set chart data
    setChartData({
      labels: months,
      datasets
    });
    
    console.log("Chart data processed for stacked bar chart");
  };

  const filterInvoicesByTimeRange = (invoices: any[], range: TimeRange): any[] => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    switch (range) {
      case 'year_to_date':
        // Filter invoices from the start of the current year to now
        return invoices.filter(invoice => {
          const date = new Date(invoice.issue_date);
          return date.getFullYear() === currentYear || date.getFullYear() === currentYear - 1;
        });
        
      case 'last_6_months':
        // Filter invoices from 6 months ago to now
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(currentMonth - 5);
        return invoices.filter(invoice => {
          const date = new Date(invoice.issue_date);
          return date >= sixMonthsAgo || 
                 (date.getFullYear() === currentYear - 1 && 
                  date.getMonth() >= currentMonth - 5 && 
                  date.getMonth() <= currentMonth);
        });
        
      case 'last_12_months':
        // Filter invoices from 12 months ago to now
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setFullYear(currentYear - 1);
        return invoices.filter(invoice => {
          const date = new Date(invoice.issue_date);
          return date >= twelveMonthsAgo || 
                 (date.getFullYear() === currentYear - 2 && 
                  date.getMonth() >= currentMonth && 
                  date.getMonth() <= 11);
        });
        
      case 'all_time':
      default:
        // Return all invoices
        return invoices;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Function to retry loading if there was an error
  const handleRetry = () => {
    setLoading(true);
    setError(null);
    fetchAllData();
  };

  // Force a render to show data
  const forceRender = () => {
    console.log("Forcing render");
    setLoading(false);
  };

  // Calculate the screen width properly accounting for padding
  const screenWidth = Math.min(Dimensions.get('window').width - 64, 800); // Limit max width and account for padding

  const handleBarSegmentPress = (month: string, status: string, barIndex: number) => {
    // Get invoices for this month and status
    const monthData = invoicesByMonth[month];
    if (!monthData || !monthData[status]) return;
    
    const invoices = monthData[status].invoices;
    if (invoices.length === 0) return;
    
    // Show callout with invoice info
    setActiveCallout({
      month,
      status,
      invoices,
      position: {
        x: 100 + (barIndex * 50), // Position based on bar index
        y: 150 // Fixed vertical position
      }
    });
  };
  
  const renderStackedBarChart = () => {
    if (!chartData.labels.length) return null;
    
    // Calculate the true maximum value from all datasets combined
    const maxDataValue = Math.max(
      ...chartData.labels.map((_, monthIndex) => {
        return chartData.datasets.reduce(
          (sum, dataset) => sum + dataset.data[monthIndex], 0
        );
      })
    );
    
    // Add 10% padding to the top for better visualization
    const maxValue = maxDataValue * 1.1;
    
    const chartHeight = 220;
    const barWidth = 30; // Fixed width for bars
    
    // Calculate total values for each month to determine bar heights
    const monthTotals = chartData.labels.map((_, monthIndex) => {
      return chartData.datasets.reduce(
        (sum, dataset) => sum + dataset.data[monthIndex], 0
      );
    });
    
    // Create 5 evenly spaced grid lines (including 0 and max)
    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(ratio => ({
      position: chartHeight * (1 - ratio),
      value: maxValue * ratio
    }));

  return (
      <View style={styles.chartOuterContainer}>
        {/* Y-axis labels */}
        <View style={styles.yAxisContainer}>
          {gridLines.map((line, i) => (
            <Text key={i} style={[styles.yAxisLabel, { top: line.position - 10 }]}>
              {line.value >= 1000 ? `$${(line.value / 1000).toFixed(1)}K` : `$${line.value.toFixed(0)}`}
            </Text>
          ))}
        </View>
        
        {/* Chart area with grid lines and bars */}
        <View style={styles.chartMainArea}>
          {/* Grid lines */}
          {gridLines.map((line, i) => (
            <View 
              key={i} 
              style={[
                styles.gridLine, 
                { top: line.position, opacity: i === 0 ? 0 : 0.5 }
              ]} 
            />
          ))}
          
          {/* Bars and x-axis labels */}
          <View style={styles.barsArea}>
            {chartData.labels.map((month, monthIndex) => {
              const monthTotal = monthTotals[monthIndex];
              
              // Calculate the height ratio based on the max value
              const heightRatio = chartHeight / maxValue;
              
              // Track accumulated height for stacking
              let accumulatedHeight = 0;
              
              return (
                <View key={month} style={styles.barAndLabelContainer}>
                  <View style={[styles.barContainer, { height: chartHeight - 30 }]}>
                    {/* If no data, render an empty bar */}
                    {monthTotal === 0 ? (
                      <View style={[styles.emptyBar, { width: barWidth }]} />
                    ) : (
                      /* Render the stacked bar segments */
                      <View style={[styles.barContent, { width: barWidth }]}>
                        {chartData.datasets.map((dataset, datasetIndex) => {
                          const value = dataset.data[monthIndex];
                          if (value === 0) return null;
                          
                          const segmentHeight = value * heightRatio;
                          const status = dataset.label.toLowerCase();
                          
                          // Update accumulated height for next segment
                          const currentAccumulatedHeight = accumulatedHeight;
                          accumulatedHeight += segmentHeight;
                          
                          return (
                            <TouchableOpacity 
                              key={datasetIndex} 
                              style={{
                                width: '100%',
                                height: segmentHeight,
                                backgroundColor: dataset.backgroundColor,
                              }}
                              onPress={() => handleBarSegmentPress(month, status, monthIndex)}
                            />
                          );
                        })}
                      </View>
                    )}
                  </View>
                  
                  {/* X-axis label */}
                  <Text style={styles.monthLabel}>{month}</Text>
                </View>
              );
            })}
          </View>
          
          {/* Data callout */}
          {activeCallout && (
            <View 
              style={[
                styles.calloutContainer, 
                {
                  position: 'absolute',
                  left: activeCallout.position.x,
                  top: activeCallout.position.y,
                  zIndex: 1000,
                }
              ]}
            >
              <View style={styles.calloutHeader}>
                <Text style={styles.calloutTitle}>
                  {activeCallout.month} - {activeCallout.status.charAt(0).toUpperCase() + activeCallout.status.slice(1)}
                </Text>
                <TouchableOpacity onPress={() => setActiveCallout(null)}>
                  <Text style={styles.calloutClose}>×</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.calloutContent}>
                {activeCallout.invoices.slice(0, 3).map((invoice, index) => (
                  <View key={index} style={styles.calloutInvoice}>
                    <Text style={styles.calloutInvoiceNumber}>
                      Invoice #{invoice.invoice_number}
                    </Text>
                    <Text style={styles.calloutInvoiceAmount}>
                      {formatCurrency(invoice.total || 0)}
                    </Text>
                  </View>
                ))}
                {activeCallout.invoices.length > 3 && (
                  <Text style={styles.calloutMoreText}>
                    +{activeCallout.invoices.length - 3} more
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>
      </View>
    );
  };
  
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'paid': return '#71AF24'; // Green
      case 'sent': return '#3498db'; // Blue
      case 'draft': return '#9b59b6'; // Purple
      case 'overdue': return '#e74c3c'; // Red
      default: return '#95a5a6'; // Gray
    }
  };

  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  // Define the styles object
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: 16,
      backgroundColor: '#ffffff',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
      minHeight: 300,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
      minHeight: 300,
    },
    errorText: {
      color: 'red',
      marginBottom: 16,
      textAlign: 'center',
    },
    retryButton: {
      marginTop: 16,
    },
    statsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    statsCard: {
      width: '48%',
      backgroundColor: '#ffffff',
      elevation: 0,
      shadowOpacity: 0,
      borderWidth: 0,
      borderColor: 'transparent',
      borderRadius: 12,
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowRadius: 0,
    },
    chartCard: {
      marginBottom: 16,
      backgroundColor: '#ffffff',
      elevation: 0,
      shadowOpacity: 0,
      borderWidth: 0,
      borderColor: 'transparent',
      borderRadius: 0,
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowRadius: 0,
    },
    chartHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    sectionTitle: {
      marginBottom: 0,
    },
    chartOuterContainer: {
      flexDirection: 'row',
      width: '100%',
      height: 280,
      marginTop: 10,
    },
    yAxisContainer: {
      width: 50,
      height: 220,
      position: 'relative',
    },
    yAxisLabel: {
      fontSize: 10,
      color: '#666',
      position: 'absolute',
      right: 8,
      textAlign: 'right',
    },
    chartMainArea: {
      flex: 1,
      height: 220,
      position: 'relative',
    },
    gridLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: '#e0e0e0',
    },
    barsArea: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'flex-end',
      height: '100%',
      paddingTop: 10,
    },
    barAndLabelContainer: {
      alignItems: 'center',
      height: '100%',
      justifyContent: 'flex-end',
    },
    barContainer: {
      justifyContent: 'flex-end',
    },
    barContent: {
      flexDirection: 'column-reverse',
    },
    emptyBar: {
      height: 0,
    },
    monthLabel: {
      fontSize: 10,
      color: '#666',
      marginTop: 8,
      textAlign: 'center',
    },
    calloutContainer: {
      position: 'absolute',
      width: 200,
      backgroundColor: 'white',
      borderRadius: 8,
      padding: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
      zIndex: 1000,
      borderWidth: 1,
      borderColor: '#e0e0e0',
    },
    calloutHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    calloutTitle: {
      fontWeight: 'bold',
      fontSize: 14,
    },
    calloutClose: {
      fontSize: 18,
      fontWeight: 'bold',
      color: '#666',
    },
    calloutContent: {
      marginTop: 4,
    },
    calloutInvoice: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 4,
      borderBottomWidth: 1,
      borderBottomColor: '#f0f0f0',
    },
    calloutInvoiceNumber: {
      fontSize: 12,
    },
    calloutInvoiceAmount: {
      fontSize: 12,
      fontWeight: 'bold',
    },
    calloutMoreText: {
      fontSize: 12,
      color: '#666',
      textAlign: 'center',
      marginTop: 4,
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <ScrollView style={[styles.container, { backgroundColor: '#ffffff' }]}>
        <View style={{ 
          flexDirection: 'row', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: 16 
        }}>
          <Text style={{
            fontFamily: 'System',
            fontSize: 26,
            fontWeight: '600',
            color: '#333333',
          }}>Dashboard</Text>
          <IconButton
            icon="refresh"
            size={24}
            onPress={() => {
              setLoading(true);
              Promise.all([
                fetchDashboardData(),
                fetchRecentActivity(),
                fetchSalesData()
                // Add any other data fetching functions here
              ]).then(() => {
                setLoading(false);
                showSnackbar('Dashboard refreshed');
              }).catch(error => {
                console.error('Error refreshing dashboard:', error);
                setLoading(false);
                showSnackbar('Error refreshing dashboard');
              });
            }}
          />
        </View>
        
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
            <Text>Loading dashboard data...</Text>
            <Button 
              mode="text" 
              onPress={forceRender} 
              style={{ marginTop: 20 }}
            >
              Show Data Anyway
            </Button>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <Button mode="contained" onPress={handleRetry} style={styles.retryButton}>
              Retry
            </Button>
          </View>
        ) : (
          <>
      <View style={styles.statsContainer}>
              <Card style={[styles.statsCard, { 
                backgroundColor: '#E0F7FA', // Light teal for Clients
                elevation: 0, 
                shadowOpacity: 0, 
                borderWidth: 0, 
                borderColor: 'transparent',
                borderRadius: 12,
                shadowColor: 'transparent',
                shadowOffset: { width: 0, height: 0 },
                shadowRadius: 0,
                margin: 0,
                padding: 0,
                overflow: 'hidden'
              }]}>
                <Card.Content style={{ 
                  backgroundColor: '#E0F7FA', // Light teal
                  borderWidth: 0, 
                  borderColor: 'transparent',
                  borderTopWidth: 0,
                  borderBottomWidth: 0,
                  borderLeftWidth: 0,
                  borderRightWidth: 0
                }}>
            <Text variant="titleLarge">Clients</Text>
            {stats.loading ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text variant="displayMedium">{stats.clientCount}</Text>
            )}
          </Card.Content>
                <Card.Actions style={{ 
                  borderTopWidth: 0, 
                  borderWidth: 0,
                  borderColor: 'transparent',
                  borderBottomWidth: 0,
                  borderLeftWidth: 0,
                  borderRightWidth: 0,
                  backgroundColor: '#E0F7FA', // Light teal
                }}>
                  <Button onPress={() => window.location.href = '/clients'}>View All</Button>
          </Card.Actions>
        </Card>
        
              <Card style={[styles.statsCard, { 
                backgroundColor: '#E8F5E9', // Light green for Active Jobs
                elevation: 0, 
                shadowOpacity: 0, 
                borderWidth: 0, 
                borderRadius: 12,
                borderColor: 'transparent',
                shadowColor: 'transparent',
                shadowOffset: { width: 0, height: 0 },
                shadowRadius: 0,
                margin: 0,
                padding: 0,
                overflow: 'hidden'
              }]}>
                <Card.Content style={{ 
                  backgroundColor: '#E8F5E9', // Light green
                  borderWidth: 0, 
                  borderColor: 'transparent',
                  borderTopWidth: 0,
                  borderBottomWidth: 0,
                  borderLeftWidth: 0,
                  borderRightWidth: 0
                }}>
            <Text variant="titleLarge">Active Jobs</Text>
            {stats.loading ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text variant="displayMedium">{stats.activeJobsCount}</Text>
            )}
          </Card.Content>
                <Card.Actions style={{ 
                  borderTopWidth: 0, 
                  borderWidth: 0,
                  borderColor: 'transparent',
                  borderBottomWidth: 0,
                  borderLeftWidth: 0,
                  borderRightWidth: 0,
                  backgroundColor: '#E8F5E9', // Light green
                }}>
                  <Button onPress={() => window.location.href = '/jobs'}>View All</Button>
          </Card.Actions>
        </Card>
      </View>
      
      <View style={styles.statsContainer}>
              <Card style={[styles.statsCard, { 
                backgroundColor: '#FFF9C4', // Light yellow for Pending Invoices
                elevation: 0, 
                shadowOpacity: 0, 
                borderWidth: 0, 
                borderRadius: 12,
                borderColor: 'transparent',
                shadowColor: 'transparent',
                shadowOffset: { width: 0, height: 0 },
                shadowRadius: 0,
                margin: 0,
                padding: 0,
                overflow: 'hidden'
              }]}>
                <Card.Content style={{ 
                  backgroundColor: '#FFF9C4', // Light yellow
                  borderWidth: 0, 
                  borderColor: 'transparent',
                  borderTopWidth: 0,
                  borderBottomWidth: 0,
                  borderLeftWidth: 0,
                  borderRightWidth: 0
                }}>
            <Text variant="titleLarge">Pending Invoices</Text>
            {stats.loading ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text variant="displayMedium">{stats.pendingInvoicesCount}</Text>
            )}
          </Card.Content>
                <Card.Actions style={{ 
                  borderTopWidth: 0, 
                  borderWidth: 0,
                  borderColor: 'transparent',
                  borderBottomWidth: 0,
                  borderLeftWidth: 0,
                  borderRightWidth: 0,
                  backgroundColor: '#FFF9C4', // Light yellow
                }}>
                  <Button onPress={() => window.location.href = '/invoices'}>View All</Button>
          </Card.Actions>
        </Card>
        
              <Card style={[styles.statsCard, { 
                backgroundColor: '#E1BEE7', // Light purple for Low Stock Items
                elevation: 0, 
                shadowOpacity: 0, 
                borderWidth: 0, 
                borderRadius: 12,
                borderColor: 'transparent',
                shadowColor: 'transparent',
                shadowOffset: { width: 0, height: 0 },
                shadowRadius: 0,
                margin: 0,
                padding: 0,
                overflow: 'hidden'
              }]}>
                <Card.Content style={{ 
                  backgroundColor: '#E1BEE7', // Light purple
                  borderWidth: 0, 
                  borderColor: 'transparent',
                  borderTopWidth: 0,
                  borderBottomWidth: 0,
                  borderLeftWidth: 0,
                  borderRightWidth: 0
                }}>
            <Text variant="titleLarge">Low Stock Items</Text>
            {stats.loading ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text variant="displayMedium">{stats.lowStockItemsCount}</Text>
            )}
          </Card.Content>
                <Card.Actions style={{ 
                  borderTopWidth: 0, 
                  borderWidth: 0,
                  borderColor: 'transparent',
                  borderBottomWidth: 0,
                  borderLeftWidth: 0,
                  borderRightWidth: 0,
                  backgroundColor: '#E1BEE7', // Light purple
                }}>
                  <Button onPress={() => window.location.href = '/inventory'}>View All</Button>
          </Card.Actions>
        </Card>
      </View>
      
            <Card style={[styles.chartCard, { 
              backgroundColor: '#ffffff', 
              elevation: 0, 
              shadowOpacity: 0, 
              borderWidth: 0,
              borderRadius: 0, 
              borderColor: 'transparent',
              shadowColor: 'transparent',
              shadowOffset: { width: 0, height: 0 },
              shadowRadius: 0,
              margin: 0,
              padding: 0
            }]}>
              <Card.Content style={{ 
                backgroundColor: '#ffffff',
                borderWidth: 0, 
                borderColor: 'transparent',
                borderTopWidth: 0,
                borderBottomWidth: 0,
                borderLeftWidth: 0,
                borderRightWidth: 0
              }}>
                <View style={[styles.chartHeader, { backgroundColor: '#ffffff' }]}>
                  <Text variant="titleLarge" style={styles.sectionTitle}>Sales By Time</Text>
                  <Menu
                    visible={timeRangeMenuVisible}
                    onDismiss={() => setTimeRangeMenuVisible(false)}
                    anchor={
                      <Button 
                        mode="outlined" 
                        onPress={() => setTimeRangeMenuVisible(true)}
                        icon="calendar-range"
                        contentStyle={{ flexDirection: 'row-reverse' }}
                      >
                        {getTimeRangeLabel(timeRange)}
                      </Button>
                    }
                  >
                    <Menu.Item 
                      onPress={() => handleTimeRangeChange('year_to_date')} 
                      title="This year to date" 
                    />
                    <Menu.Item 
                      onPress={() => handleTimeRangeChange('last_6_months')} 
                      title="Last 6 months" 
                    />
                    <Menu.Item 
                      onPress={() => handleTimeRangeChange('last_12_months')} 
                      title="Last 12 months" 
                    />
                    <Menu.Item 
                      onPress={() => handleTimeRangeChange('all_time')} 
                      title="All time" 
                    />
                  </Menu>
                </View>
                
                <View style={{ marginTop: 16 }}>
                  <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 8 }}>
                    {formatCurrency(totalSales)}
                  </Text>
                  <Text style={{ color: '#666' }}>
                    Total Sales ({getTimeRangeLabel(timeRange)})
                  </Text>
                </View>
                
                {/* Add status filter buttons */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, marginBottom: 8 }}>
                  {['all', 'paid', 'draft', 'sent', 'overdue'].map(status => (
                    <TouchableOpacity
                      key={status}
                      style={{
                        backgroundColor: statusFilter === status ? getStatusColor(status) : '#ffffff',
                        borderWidth: 0,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        marginRight: 8,
                        marginBottom: 8,
                        borderRadius: 4,
                      }}
                      onPress={() => handleStatusFilterChange(status as InvoiceStatus)}
                    >
                      <Text style={{ 
                        color: statusFilter === status ? '#ffffff' : getStatusColor(status),
                        fontWeight: 'bold',
                      }}>
                        {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                
                <View style={{ marginTop: 16, marginBottom: 8 }}>
                  {salesLoading ? (
                    <View style={{ alignItems: 'center', padding: 40 }}>
                      <ActivityIndicator size="large" />
                      <Text style={{ marginTop: 16 }}>Loading sales data...</Text>
                    </View>
                  ) : chartData.datasets.length === 0 ? (
                    <Text style={{ textAlign: 'center', marginVertical: 40, fontSize: 16, color: '#666' }}>
                      No sales data available for the selected time period.
                    </Text>
                  ) : (
                    <>
                      {renderStackedBarChart()}
                      <Text style={{ textAlign: 'center', fontSize: 12, color: '#666', marginTop: 8 }}>
                        Tap on a bar segment to see invoice details
                      </Text>
                    </>
                  )}
                </View>
              </Card.Content>
            </Card>
            
            {/* Recent Activity Section */}
            <Card style={[styles.chartCard, { 
              backgroundColor: '#ffffff', 
              elevation: 0, 
              shadowOpacity: 0, 
              borderWidth: 0,
              borderRadius: 0, 
              borderColor: 'transparent',
              shadowColor: 'transparent',
              shadowOffset: { width: 0, height: 0 },
              shadowRadius: 0,
              margin: 0,
              padding: 0,
              marginTop: 16
            }]}>
              <Card.Content style={{ 
                backgroundColor: '#ffffff',
                borderWidth: 0, 
                borderColor: 'transparent',
                borderTopWidth: 0,
                borderBottomWidth: 0,
                borderLeftWidth: 0,
                borderRightWidth: 0
              }}>
                <View style={[styles.chartHeader, { backgroundColor: '#ffffff' }]}>
          <Text variant="titleLarge" style={styles.sectionTitle}>Recent Activity</Text>
                </View>
          
          {activityLoading ? (
                  <View style={{ alignItems: 'center', padding: 40 }}>
                    <ActivityIndicator size="large" />
                    <Text style={{ marginTop: 16 }}>Loading activity data...</Text>
                  </View>
          ) : recentActivity.length === 0 ? (
                  <Text style={{ textAlign: 'center', marginVertical: 40, fontSize: 16, color: '#666' }}>
                    No recent activity to display.
                  </Text>
          ) : (
                  <View style={{ marginTop: 8 }}>
                    {recentActivity.map((activity) => (
                      <View 
                key={activity.id}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 12,
                          borderBottomWidth: 1,
                          borderBottomColor: '#f0f0f0',
                        }}
                      >
                        <View style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: '#f0f0f0',
                          justifyContent: 'center',
                          alignItems: 'center',
                          marginRight: 12,
                        }}>
                          <IconButton
                            icon={getActivityIcon(activity.type)}
                            size={20}
                            style={{ margin: 0 }}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: 'bold', fontSize: 14 }}>{activity.title}</Text>
                          <Text style={{ fontSize: 14 }}>{activity.subtitle}</Text>
                          <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                            {formatDate(activity.date)}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
          )}
        </Card.Content>
              <Card.Actions style={{ 
                borderTopWidth: 0, 
                borderWidth: 0,
                borderColor: 'transparent',
                borderBottomWidth: 0,
                borderLeftWidth: 0,
                borderRightWidth: 0
              }}>
                <Button onPress={() => window.location.href = '/activity'}>View All Activity</Button>
              </Card.Actions>
      </Card>
          </>
        )}
    </ScrollView>
    </View>
  );
} 