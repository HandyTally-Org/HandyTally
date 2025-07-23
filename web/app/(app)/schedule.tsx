import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Animated, PanResponder, Dimensions } from 'react-native';
import { Text, ActivityIndicator, Button, IconButton, Menu, Divider } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { toLocaleDateString } from '@fowusu/calendar-kit';
import CustomCalendar, { CustomCalendarRef } from '../components/CustomCalendar';
import { useRouter } from 'expo-router';
import moment from 'moment';
import { MaterialIcons } from '@expo/vector-icons';

// Add a color constant for date highlighting
const EVENT_HIGHLIGHT_COLOR = '#FFE0B2'; // Light orange color

// Simple calendar implementation
export default function ScheduleScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [dayEvents, setDayEvents] = useState<any[]>([]);
  const [showEvents, setShowEvents] = useState(false);
  
  // Add view state
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [viewMenuVisible, setViewMenuVisible] = useState(false);
  
  // Window dimensions for calculations
  const windowHeight = Dimensions.get('window').height;
  
  // Use percentages for panel sizing (25%, 50%, 75%)
  const panelSizes = {
    min: windowHeight * 0.25,
    mid: windowHeight * 0.5,
    max: windowHeight * 0.75
  };
  
  // Use a simple toggle between sizes instead of continuous dragging
  const [panelSize, setPanelSize] = useState('min');
  const [eventsPanelHeight, setEventsPanelHeight] = useState(panelSizes.min);
  
  // Properly type the ref
  const calendarRef = useRef<CustomCalendarRef>(null);
  
  // Function to toggle view mode
  const toggleViewMode = (mode: 'week' | 'month') => {
    setViewMode(mode);
    setViewMenuVisible(false);
    
    // If switching to monthly view, we might want to hide events panel
    if (mode === 'month' && showEvents) {
      setSelectedDates([]);
      setShowEvents(false);
    }
    
    // Tell calendar to update its view mode
    if (calendarRef.current && calendarRef.current.setViewMode) {
      calendarRef.current.setViewMode(mode);
    }
  };
  
  // Function to cycle through panel sizes
  const togglePanelSize = () => {
    if (panelSize === 'min') {
      setPanelSize('mid');
      setEventsPanelHeight(panelSizes.mid);
    } else if (panelSize === 'mid') {
      setPanelSize('max');
      setEventsPanelHeight(panelSizes.max);
    } else {
      setPanelSize('min');
      setEventsPanelHeight(panelSizes.min);
    }
  };

  // Add this effect to reset panel height when selection changes
  useEffect(() => {
    if (!showEvents) {
      setPanelSize('min');
      setEventsPanelHeight(panelSizes.min);
    }
  }, [showEvents]);

  // Add hardcoded test event dates
  const testEventDates = [
    moment().format('YYYY-MM-DD'), // Today
    moment().add(1, 'days').format('YYYY-MM-DD'), // Tomorrow
    moment().add(3, 'days').format('YYYY-MM-DD'), // 3 days from now
    '2023-03-04', // Specific date
  ];

  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    if (selectedDates.length > 0) {
      const filteredEvents = events.filter(event => {
        // Handle both property formats (start and start_date)
        const eventStart = event.start || event.start_date;
        if (!eventStart) return false;
        
        // Convert to YYYY-MM-DD format for comparison
        const eventDate = moment(eventStart).format('YYYY-MM-DD');
        console.log(`Filtering event: ${event.title}, Date: ${eventDate}, Selected dates: ${selectedDates}`);
        return selectedDates.includes(eventDate);
      });
      
      console.log(`Found ${filteredEvents.length} events for selected dates: ${selectedDates}`);
      setDayEvents(filteredEvents);
      setShowEvents(true);
    } else {
      setDayEvents([]);
      setShowEvents(false);
    }
  }, [selectedDates, events]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      
      // Get jobs data
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select(`
          uid,
          title,
          description,
          status,
          start_date,
          end_date,
          clients (
            name
          )
        `)
        .order('start_date', { ascending: true });
      
      if (jobsError) {
        console.error('Error fetching jobs:', jobsError);
        return;
      }
      
      // Transform job data into calendar events
      // Use local timezone for all dates - no timezone adjustment needed
      const transformedEvents = jobsData.map(job => {
        // Create event object with dates in user's local timezone
        const event = {
          id: job.uid.toString(),
          type: 'job',
          title: job.title,
          client_name: job.clients?.name || 'No client',
          // Store the original time strings for debugging
          original_start: job.start_date,
          original_end: job.end_date,
          // Use the dates directly in local timezone interpretation
          start: job.start_date ? new Date(job.start_date) : null,
          end: job.end_date ? new Date(job.end_date) : null,
          status: job.status,
          description: job.description || '',
        };
        
        console.log(`Event: ${event.title}, Original start: ${event.original_start}, Local start: ${event.start?.toLocaleString()}`);
        
        return event;
      });
      
      setEvents(transformedEvents);
      
    } catch (error) {
      console.error('Error in fetchEvents:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMarkedDates = () => {
    return selectedDates;
  };

  // Modify hasEvents to use test dates
  const hasEvents = (dateString: string) => {
    // First check our test dates
    if (testEventDates.includes(dateString)) {
      return true;
    }
    
    // Then check real events
    return events.some(event => {
      const eventDate = moment(event.start_date).format('YYYY-MM-DD');
      return eventDate === dateString;
    });
  };

  // 2. Then modify the onDayPress function to implement our custom styling logic
  const onDayPress = useCallback((dateString: string) => {
    setSelectedDates(prevDates => {
      // If the date is already selected, remove it (deselect)
      if (prevDates.includes(dateString)) {
        return prevDates.filter(date => date !== dateString);
      } 
      // Otherwise add it to the selection
      else {
        return [...prevDates, dateString];
      }
    });
  }, []);

  const clearSelection = () => {
    setSelectedDates([]);
  };

  // Add a function to check if an event spans a specific time slot
  const getEventsForTimeSlot = (dateStr: string, hour: number) => {
    // Convert the date string to a local Date object
    const baseDate = new Date(dateStr);
    if (isNaN(baseDate.getTime())) return [];
    
    // Set the hour for the time slot (in local time)
    const slotStart = new Date(baseDate);
    slotStart.setHours(hour, 0, 0, 0);
    
    // End time is one hour later
    const slotEnd = new Date(slotStart);
    slotEnd.setHours(hour + 1, 0, 0, 0);
    
    // Filter events that overlap with this time slot
    return events.filter(event => {
      if (!event.start) return false;
      
      const eventStart = new Date(event.start);
      const eventEnd = event.end ? new Date(event.end) : new Date(eventStart);
      
      // For all-day or multi-day events without specific times
      if (eventStart.getHours() === 0 && eventStart.getMinutes() === 0 && 
          eventEnd.getHours() === 0 && eventEnd.getMinutes() === 0) {
        // Check if the date matches (all-day event)
        return dateStr === eventStart.toISOString().split('T')[0];
      }
      
      // For events with specific times, check overlap
      return (eventStart < slotEnd && eventEnd > slotStart);
    });
  };

  // Update the getEventsForDayAndTime function to use the new logic
  const getEventsForDayAndTime = (day: moment.Moment, timeSlot: string) => {
    // Convert day (moment) to a date string in local timezone
    const dateStr = day.format('YYYY-MM-DD');
    
    // Parse the hour from timeSlot (e.g., "9:00 AM" -> 9)
    const timeMatch = timeSlot.match(/(\d+):00\s*(AM|PM)/i);
    if (!timeMatch) return [];
    
    let hour = parseInt(timeMatch[1]);
    const period = timeMatch[2].toUpperCase();
    
    // Convert to 24-hour format
    if (period === 'PM' && hour < 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    
    // Use the same function to get events
    return getEventsForTimeSlot(dateStr, hour);
  };

  // Function to jump to today and clear selections
  const goToToday = useCallback(() => {
    // Clear any selected dates
    setSelectedDates([]);
    // This will hide the events panel
    setShowEvents(false);
    
    // If we have a ref to the calendar component, tell it to go to today
    if (calendarRef.current && calendarRef.current.goToCurrentWeek) {
      calendarRef.current.goToCurrentWeek();
    }
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {/* Today button */}
          <TouchableOpacity 
            style={styles.todayButton}
            onPress={goToToday}
          >
            <Text style={styles.todayButtonText}>Today</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Schedule</Text>
        </View>
        
        <View style={styles.headerRight}>
          {/* View toggle dropdown */}
          <Menu
            visible={viewMenuVisible}
            onDismiss={() => setViewMenuVisible(false)}
            anchor={
              <TouchableOpacity 
                style={styles.viewToggle}
                onPress={() => setViewMenuVisible(true)}
              >
                <Text style={styles.viewToggleText}>
                  {viewMode === 'week' ? 'Week' : 'Month'}
                </Text>
                <MaterialIcons name="arrow-drop-down" size={20} color="#555" />
              </TouchableOpacity>
            }
          >
            <Menu.Item 
              onPress={() => toggleViewMode('week')} 
              title="Week"
              leadingIcon="view-week"
            />
            <Menu.Item 
              onPress={() => toggleViewMode('month')} 
              title="Month"
              leadingIcon="view-module"
            />
          </Menu>
        </View>
      </View>
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Loading schedule...</Text>
        </View>
      ) : (
        <View style={styles.content}>
          {/* Calendar takes full height */}
          <View style={styles.calendarContainer}>
            <CustomCalendar
              ref={calendarRef}
              selectedDates={selectedDates}
              events={events}
              onDayPress={onDayPress}
              hasEvents={hasEvents}
              eventHighlightColor={EVENT_HIGHLIGHT_COLOR}
            />
          </View>
          
          {/* Events panel with adjustable height */}
          {showEvents && (
            <View 
              style={[
                styles.eventsPanel,
                { height: eventsPanelHeight }
              ]}
            >
              {/* Resize control button */}
              <View style={styles.resizeControl}>
                <TouchableOpacity 
                  style={styles.resizeButton}
                  onPress={togglePanelSize}
                >
                  <View style={styles.resizeIcon}>
                    <View style={styles.resizeBar} />
                    <View style={styles.resizeBar} />
                    {panelSize === 'min' && <Text style={styles.resizeText}>▲ Expand</Text>}
                    {panelSize === 'mid' && <Text style={styles.resizeText}>▲ Full</Text>}
                    {panelSize === 'max' && <Text style={styles.resizeText}>▼ Minimize</Text>}
                  </View>
                </TouchableOpacity>
              </View>
              
              <View style={styles.eventsPanelHeader}>
                <Text style={styles.eventsPanelTitle}>
                  {selectedDates.length === 1 
                    ? `Events for ${moment(selectedDates[0]).format('MMMM D, YYYY')}` 
                    : `Events for ${selectedDates.length} selected days`}
                </Text>
                <TouchableOpacity onPress={clearSelection}>
                  <Text style={styles.closeButton}>✕</Text>
                </TouchableOpacity>
              </View>
              
              {dayEvents.length === 0 ? (
                <Text style={styles.noEventsText}>
                  No events scheduled for the selected day(s)
                </Text>
              ) : (
                <ScrollView style={styles.eventsList}>
                  {dayEvents.map(event => (
                    <TouchableOpacity 
                      key={event.id}
                      onPress={() => router.push(`/jobs/${event.id}`)}
                      style={styles.eventItem}
                    >
                      <View style={styles.eventCard}>
                        <Text style={styles.eventTitle}>{event.title}</Text>
                        <Text style={styles.eventClient}>Client: {event.client_name}</Text>
                        <Text style={styles.eventDate}>
                          Date: {moment(event.start || event.start_date).format('MMM D, YYYY')}
                        </Text>
                        {(event.start || event.start_date) && (
                          <Text style={styles.eventTime}>
                            {moment(event.start || event.start_date).format('h:mm A')} - 
                            {(event.end || event.end_date) ? moment(event.end || event.end_date).format(' h:mm A') : ' TBD'}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
    alignItems: 'flex-start',
  },
  headerRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  titleContainer: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  todayButton: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#f8f8f8',
  },
  todayButtonText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  viewToggle: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#f8f8f8',
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  viewToggleText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    marginRight: 2,
  },
  content: {
    flex: 1,
    position: 'relative',
  },
  calendarContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 0,
    borderWidth: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  addButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 0,
  },
  eventsPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingHorizontal: 16,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  resizeControl: {
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    marginBottom: 8,
  },
  resizeButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  resizeIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  resizeBar: {
    width: 30,
    height: 3,
    backgroundColor: '#aaaaaa',
    borderRadius: 1.5,
    marginVertical: 2,
  },
  resizeText: {
    fontSize: 10,
    color: '#666666',
    marginTop: 2,
  },
  eventsPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  eventsPanelTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    fontSize: 18,
    color: '#666',
  },
  eventsList: {
    flex: 1,
  },
  eventItem: {
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 12,
  },
  eventCard: {
    backgroundColor: '#fff',
    padding: 8,
  },
  eventTitle: {
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 4,
  },
  eventClient: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  eventDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  eventTime: {
    fontSize: 14,
    color: '#666',
  },
  noEventsText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  dayBase: {
    width: 45,
    height: 45,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderColor: '#E0E0E0',
  },
  daySelected: {
    backgroundColor: '#9E9E9E',
  },
  dayHasEvents: {
    backgroundColor: EVENT_HIGHLIGHT_COLOR,
  },
  dayText: {
    fontSize: 18,
    color: '#2d4150',
  },
  selectedDayText: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
  },
}); 