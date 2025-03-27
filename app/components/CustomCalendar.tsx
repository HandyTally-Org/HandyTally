import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList, Animated } from 'react-native';
import moment from 'moment';

interface CustomCalendarProps {
  selectedDates: string[];
  events: any[];
  onDayPress: (dateString: string) => void;
  hasEvents?: (dateString: string) => boolean;
  eventHighlightColor?: string;
}

// Add ref type to expose calendar methods
export interface CustomCalendarRef {
  goToCurrentWeek: () => void;
  setViewMode: (mode: 'week' | 'month') => void;
}

// Define the component with forwardRef
const CustomCalendar = forwardRef<CustomCalendarRef, CustomCalendarProps>((props, ref) => {
  const { 
    selectedDates, 
    events, 
    onDayPress,
    hasEvents,
    eventHighlightColor = '#FFE0B2' // Default to light orange if not provided
  } = props;
  
  const [currentDate, setCurrentDate] = useState(moment());
  const [currentWeek, setCurrentWeek] = useState(moment().startOf('week'));
  const [currentMonth, setCurrentMonth] = useState(moment().startOf('month'));
  const [weekDays, setWeekDays] = useState<moment.Moment[]>([]);
  const [monthDays, setMonthDays] = useState<moment.Moment[][]>([]);
  const [timeSlots, setTimeSlots] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  
  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    goToCurrentWeek: () => {
      setCurrentDate(moment());
      setCurrentWeek(moment().startOf('week'));
      setCurrentMonth(moment().startOf('month'));
    },
    setViewMode: (mode: 'week' | 'month') => {
      setViewMode(mode);
    }
  }));
  
  // Generate days for the current week
  useEffect(() => {
    const days: moment.Moment[] = [];
    let day = currentWeek.clone();
    
    // Generate 7 days (Sun-Sat)
    for (let i = 0; i < 7; i++) {
      days.push(day.clone());
      day.add(1, 'day');
    }
    
    setWeekDays(days);
  }, [currentWeek]);
  
  // Generate days for the current month
  useEffect(() => {
    const monthMatrix: moment.Moment[][] = [];
    const firstDay = currentMonth.clone().startOf('month').startOf('week');
    
    // Generate 6 weeks (42 days) to ensure we cover the month
    for (let week = 0; week < 6; week++) {
      const weekDays: moment.Moment[] = [];
      for (let day = 0; day < 7; day++) {
        const currentDay = firstDay.clone().add(week * 7 + day, 'days');
        weekDays.push(currentDay);
      }
      monthMatrix.push(weekDays);
    }
    
    setMonthDays(monthMatrix);
  }, [currentMonth]);
  
  // Generate time slots
  useEffect(() => {
    const slots: string[] = [];
    // Start from 8 AM and go to 5 PM
    for (let hour = 8; hour <= 17; hour++) {
      slots.push(`${hour === 12 ? 12 : hour % 12} ${hour < 12 ? 'AM' : 'PM'}`);
    }
    setTimeSlots(slots);
  }, []);
  
  // Navigate to previous week/month
  const goToPrevious = () => {
    if (viewMode === 'week') {
      setCurrentWeek(moment(currentWeek).subtract(1, 'week'));
    } else {
      setCurrentMonth(moment(currentMonth).subtract(1, 'month'));
    }
  };
  
  // Navigate to next week/month
  const goToNext = () => {
    if (viewMode === 'week') {
      setCurrentWeek(moment(currentWeek).add(1, 'week'));
    } else {
      setCurrentMonth(moment(currentMonth).add(1, 'month'));
    }
  };
  
  // Check if a date is selected
  const isDateSelected = (date: moment.Moment) => {
    const dateStr = date.format('YYYY-MM-DD');
    return selectedDates.includes(dateStr);
  };
  
  // Check if a date has events
  const checkHasEvents = (date: moment.Moment) => {
    if (!hasEvents) return false;
    const dateStr = date.format('YYYY-MM-DD');
    return hasEvents(dateStr);
  };
  
  // Get events for a specific date (used in month view)
  const getEventsForDate = (date: moment.Moment) => {
    const dateStr = date.format('YYYY-MM-DD');
    
    return events.filter(event => {
      try {
        // Get the event start date - handle both property formats
        const eventStart = event.start || event.start_date;
        if (!eventStart) return false;
        
        // Convert to date string for comparison
        const eventDate = moment(eventStart).format('YYYY-MM-DD');
        return eventDate === dateStr;
      } catch (error) {
        console.error('Error filtering events:', error, event);
        return false;
      }
    });
  };
  
  // Get events for a specific day and time
  const getEventsForDayAndTime = (day: moment.Moment, timeSlot: string) => {
    const dateStr = day.format('YYYY-MM-DD');
    const hour = parseInt(timeSlot.split(' ')[0]);
    const isPM = timeSlot.includes('PM');
    const hour24 = isPM && hour !== 12 ? hour + 12 : (hour === 12 && !isPM ? 0 : hour);
    
    return events.filter(event => {
      try {
        // Get the event start/end dates - handle both property formats
        const eventStart = event.start || event.start_date;
        const eventEnd = event.end || event.end_date;
        
        if (!eventStart) return false;
        
        // Convert to moment objects for consistent handling
        const eventStartDate = moment(eventStart);
        const eventEndDate = eventEnd ? moment(eventEnd) : eventStartDate.clone().add(1, 'hour');
        
        // Check if the event is on this date
        const eventDate = eventStartDate.format('YYYY-MM-DD');
        if (eventDate !== dateStr) return false;
        
        // Check if the event spans this hour
        const eventStartHour = eventStartDate.hour();
        const eventEndHour = eventEndDate.hour() || 24; // If end hour is 0 (midnight), treat as 24
        
        // Debug logging
        console.log(`Event: ${event.title}, Date: ${eventDate}, Current hour: ${hour24}, Start: ${eventStartHour}, End: ${eventEndHour}`);
        
        // Event spans this hour if the hour is between start and end hours (inclusive of start, exclusive of end)
        return (hour24 >= eventStartHour && (hour24 < eventEndHour || (eventEndHour === 0 && hour24 === 0)));
      } catch (error) {
        console.error('Error processing event:', error, event);
        return false;
      }
    });
  };
  
  // Check if this is the first hour of an event (to avoid duplicate rendering)
  const isFirstHourOfEvent = (event: any, hour24: number) => {
    try {
      // Get the event start date - handle both property formats
      const eventStart = event.start || event.start_date;
      if (!eventStart) return false;
      
      const eventStartDate = moment(eventStart);
      return eventStartDate.hour() === hour24;
    } catch (error) {
      console.error('Error checking first hour:', error, event);
      return false;
    }
  };
  
  // Calculate event height based on duration
  const calculateEventHeight = (event: any) => {
    try {
      // Get the event start/end dates - handle both property formats
      const eventStart = event.start || event.start_date;
      const eventEnd = event.end || event.end_date;
      
      if (!eventStart) return 54; // Default height
      
      const startTime = moment(eventStart);
      const endTime = eventEnd ? moment(eventEnd) : startTime.clone().add(1, 'hour');
      
      // Calculate duration in hours
      let durationHours = moment.duration(endTime.diff(startTime)).asHours();
      
      // If duration is negative or zero (possible with midnight end times), adjust
      if (durationHours <= 0) {
        // Assume it spans to the next day
        durationHours = 24 - startTime.hour() + endTime.hour();
      }
      
      console.log(`Event: ${event.title}, Duration: ${durationHours} hours`);
      
      // Each time slot is 60px high
      return Math.min(durationHours * 60 - 6, 54); // Subtract 6px for padding
    } catch (error) {
      console.error('Error calculating height:', error, event);
      return 54; // Default height
    }
  };
  
  // Format the day header (e.g., "MON 10")
  const formatDayHeader = (day: moment.Moment) => {
    return (
      <View style={styles.dayHeaderContainer}>
        <Text style={styles.dayName}>{day.format('ddd').toUpperCase()}</Text>
        <Text style={[
          styles.dayNumber, 
          day.isSame(moment(), 'day') && styles.todayNumber,
          isDateSelected(day) && styles.selectedDayNumber,
          checkHasEvents(day) && { backgroundColor: eventHighlightColor }
        ]}>
          {day.format('D')}
        </Text>
      </View>
    );
  };
  
  // Render an event in a time slot
  const renderEvent = (event: any, isFirstHour: boolean) => {
    if (!isFirstHour) return null; // Only render the event in its first hour
    
    try {
      // Get the event start/end dates - handle both property formats
      const eventStart = event.start || event.start_date;
      const eventEnd = event.end || event.end_date;
      
      if (!eventStart) return null;
      
      const startTime = moment(eventStart);
      const endTime = eventEnd ? moment(eventEnd) : startTime.clone().add(1, 'hour');
      const height = calculateEventHeight(event);
      
      // Format times for display
      const startTimeStr = startTime.format('h:mm A');
      const endTimeStr = endTime.format('h:mm A');
      
      // Add a consistent color based on event type or status
      let bgColor = '#FF9800'; // Default orange
      if (event.status === 'pending') bgColor = '#FFC107'; // Amber for pending
      if (event.status === 'in_progress') bgColor = '#2196F3'; // Blue for in progress
      if (event.status === 'completed') bgColor = '#4CAF50'; // Green for completed
      
      return (
        <View 
          key={event.id} 
          style={[
            styles.eventContainer, 
            { 
              backgroundColor: bgColor,
              height: height,
              position: 'absolute',
              left: 2,
              right: 2,
              top: 2,
              zIndex: 10
            }
          ]}
        >
          <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
          <Text style={styles.eventDetails} numberOfLines={1}>
            {startTimeStr} - {endTimeStr}
            {event.client_name && `, ${event.client_name}`}
          </Text>
        </View>
      );
    } catch (error) {
      console.error('Error rendering event:', error, event);
      return null;
    }
  };
  
  // Render a single day in month view
  const renderMonthDay = (day: moment.Moment, rowIndex: number, colIndex: number) => {
    const isCurrentMonth = day.month() === currentMonth.month();
    const isToday = day.isSame(moment(), 'day');
    const isSelected = isDateSelected(day);
    const dayEvents = getEventsForDate(day);
    const hasEventOnDay = checkHasEvents(day);
    
    return (
      <TouchableOpacity 
        key={`month-day-${rowIndex}-${colIndex}`}
        style={[
          styles.monthDay,
          !isCurrentMonth && styles.outsideMonthDay,
          isToday && styles.todayCell,
          isSelected && styles.selectedDay,
        ]}
        onPress={() => onDayPress(day.format('YYYY-MM-DD'))}
      >
        <Text style={[
          styles.monthDayNumber,
          !isCurrentMonth && styles.outsideMonthDayText,
          isToday && styles.todayDayText,
          isSelected && styles.selectedDayText,
        ]}>
          {day.format('D')}
        </Text>
        
        {hasEventOnDay && (
          <View style={[
            styles.monthDayEventIndicator,
            { backgroundColor: eventHighlightColor }
          ]} />
        )}
        
        {dayEvents.length > 0 && dayEvents.length <= 3 && (
          <View style={styles.monthDayEvents}>
            {dayEvents.slice(0, 3).map((event, index) => (
              <View 
                key={`month-event-${index}`}
                style={[
                  styles.monthDayEventDot, 
                  { backgroundColor: getEventColor(event) }
                ]} 
              />
            ))}
          </View>
        )}
        
        {dayEvents.length > 3 && (
          <Text style={styles.monthDayMoreEvents}>+{dayEvents.length - 3} more</Text>
        )}
      </TouchableOpacity>
    );
  };
  
  // Get color based on event status
  const getEventColor = (event: any) => {
    if (event.status === 'pending') return '#FFC107'; // Amber for pending
    if (event.status === 'in_progress') return '#2196F3'; // Blue for in progress
    if (event.status === 'completed') return '#4CAF50'; // Green for completed
    return '#FF9800'; // Default orange
  };

  return (
    <View style={styles.container}>
      {/* Calendar Header with Navigation */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goToPrevious}>
          <Text style={styles.navigationButton}>{'<'}</Text>
        </TouchableOpacity>
        
        <Text style={styles.calendarTitle}>
          {viewMode === 'week' 
            ? `${weekDays[0]?.format('MMM D')} - ${weekDays[6]?.format('MMM D, YYYY')}`
            : currentMonth.format('MMMM YYYY')
          }
        </Text>
        
        <TouchableOpacity onPress={goToNext}>
          <Text style={styles.navigationButton}>{'>'}</Text>
        </TouchableOpacity>
      </View>
      
      {viewMode === 'week' ? (
        /* Week View Calendar */
        <View style={styles.calendarContainer}>
          {/* Day Headers */}
          <View style={styles.dayHeadersRow}>
            <View style={styles.timeHeaderCell}>
              {/* Empty cell above time slots */}
            </View>
            {weekDays.map((day, index) => (
              <TouchableOpacity 
                key={`header-${index}`} 
                style={[
                  styles.dayHeaderCell,
                  day.isSame(moment(), 'day') && styles.todayColumn,
                  checkHasEvents(day) && { backgroundColor: eventHighlightColor }
                ]}
                onPress={() => onDayPress(day.format('YYYY-MM-DD'))}
              >
                {formatDayHeader(day)}
              </TouchableOpacity>
            ))}
          </View>
          
          {/* Scrollable Time Slots and Events */}
          <ScrollView style={styles.timeSlotContainer}>
            {timeSlots.map((timeSlot, timeIndex) => {
              // Convert the time slot string to 24-hour format
              const hour = parseInt(timeSlot.split(' ')[0]);
              const isPM = timeSlot.includes('PM');
              const hour24 = isPM && hour !== 12 ? hour + 12 : (hour === 12 && !isPM ? 0 : hour);
              
              return (
                <View key={`time-${timeIndex}`} style={styles.timeSlotRow}>
                  <View style={styles.timeCell}>
                    <Text style={styles.timeText}>{timeSlot}</Text>
                  </View>
                  {weekDays.map((day, dayIndex) => {
                    const dayEvents = getEventsForDayAndTime(day, timeSlot);
                    const isToday = day.isSame(moment(), 'day');
                    
                    return (
                      <View 
                        key={`day-${dayIndex}-time-${timeIndex}`} 
                        style={[
                          styles.dayCell,
                          isToday && styles.todayColumn
                        ]}
                      >
                        {dayEvents.map(event => 
                          renderEvent(event, isFirstHourOfEvent(event, hour24))
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : (
        /* Month View Calendar */
        <View style={styles.monthContainer}>
          {/* Day of Week Headers */}
          <View style={styles.monthHeaderRow}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(dayName => (
              <View key={`month-header-${dayName}`} style={styles.monthHeaderCell}>
                <Text style={styles.monthHeaderText}>{dayName}</Text>
              </View>
            ))}
          </View>
          
          {/* Calendar Grid */}
          <View style={styles.monthGrid}>
            {monthDays.map((week, rowIndex) => (
              <View key={`month-week-${rowIndex}`} style={styles.monthRow}>
                {week.map((day, colIndex) => renderMonthDay(day, rowIndex, colIndex))}
              </View>
            ))}
          </View>
        </View>
      )}
      
      {/* Debug information - this is helpful during development */}
      <View style={styles.debugContainer}>
        {/* Debug text removed as requested, but bar preserved */}
      </View>
    </View>
  );
});

// Set display name for debugging
CustomCalendar.displayName = 'CustomCalendar';

export default CustomCalendar;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  navigationButton: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2196F3',
    padding: 10,
  },
  calendarTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d4150',
  },
  calendarContainer: {
    flex: 1,
    flexDirection: 'column',
  },
  dayHeadersRow: {
    flexDirection: 'row',
    height: 70,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  timeHeaderCell: {
    width: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#E0E0E0',
  },
  dayHeaderCell: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#E0E0E0',
  },
  dayHeaderContainer: {
    alignItems: 'center',
  },
  dayName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#757575',
    marginBottom: 5,
  },
  dayNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d4150',
    lineHeight: 36,
  },
  todayNumber: {
    backgroundColor: '#2196F3',
    color: '#FFFFFF',
  },
  selectedDayNumber: {
    backgroundColor: '#9E9E9E',
    color: '#FFFFFF',
  },
  timeSlotContainer: {
    flex: 1,
  },
  timeSlotRow: {
    flexDirection: 'row',
    height: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  timeCell: {
    width: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#E0E0E0',
  },
  timeText: {
    fontSize: 12,
    color: '#757575',
  },
  dayCell: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#E0E0E0',
    padding: 2,
  },
  todayColumn: {
    backgroundColor: '#F5F5F5',
  },
  eventContainer: {
    backgroundColor: '#FF9800',
    borderRadius: 4,
    padding: 4,
    marginBottom: 2,
    height: 54,
  },
  eventTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  eventDetails: {
    fontSize: 10,
    color: '#FFFFFF',
  },
  debugContainer: {
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    backgroundColor: '#F5F5F5',
  },
  debugInfo: {
    fontSize: 10,
    color: '#757575',
  },
  noEventsText: {
    padding: 16,
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
  },
  monthContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  monthHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  monthHeaderCell: {
    flex: 1,
    padding: 10,
    alignItems: 'center',
  },
  monthHeaderText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#757575',
  },
  monthGrid: {
    flex: 1,
  },
  monthRow: {
    flex: 1,
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  monthDay: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#E0E0E0',
    padding: 6,
    height: '100%',
  },
  outsideMonthDay: {
    backgroundColor: '#F9F9F9',
  },
  todayCell: {
    backgroundColor: '#E3F2FD',
  },
  selectedDay: {
    backgroundColor: '#E8F5E9',
  },
  monthDayNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  outsideMonthDayText: {
    color: '#BDBDBD',
  },
  todayDayText: {
    color: '#2196F3',
  },
  selectedDayText: {
    color: '#4CAF50',
  },
  monthDayEventIndicator: {
    height: 4,
    borderRadius: 2,
    marginTop: 4,
    marginBottom: 2,
  },
  monthDayEvents: {
    flexDirection: 'row',
    marginTop: 4,
  },
  monthDayEventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 2,
  },
  monthDayMoreEvents: {
    fontSize: 10,
    color: '#757575',
    marginTop: 2,
  },
}); 