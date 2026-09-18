import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Snackbar } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { sendJobInvite } from '../../utils/sendJobInvite';
import { JobDialog } from '../../components/JobDialog';
import { useLabels } from '../../hooks/useLabels';
import type { LabelDef } from '../../constants/labels';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import {
  Calendar,
  CalendarEvent,
  DateRange,
  EventAction,
  EventDialog,
  colorsForStatus,
} from '../../components/calendar/Calendar';

type JobRow = {
  uid: number;
  title: string;
  description: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  clients: { name: string } | { name: string }[] | null;
};

const ONE_HOUR = 60 * 60 * 1000;

function clientName(row: JobRow): string {
  const c = Array.isArray(row.clients) ? row.clients[0] : row.clients;
  return c?.name || 'No client';
}

// A job with no end, or an end before its start, shows as a one-hour block.
function jobToEvent(row: JobRow, labels: readonly LabelDef[]): CalendarEvent | null {
  if (!row.start_date) return null;
  const start = new Date(row.start_date);
  if (isNaN(start.getTime())) return null;
  let end = row.end_date ? new Date(row.end_date) : new Date(start.getTime() + ONE_HOUR);
  if (isNaN(end.getTime()) || end <= start) end = new Date(start.getTime() + ONE_HOUR);

  return {
    id: String(row.uid),
    title: row.title || 'Untitled job',
    start,
    end,
    subtitle: clientName(row),
    description: row.description || undefined,
    status: row.status || undefined,
    ...colorsForStatus(row.status, labels),
  };
}

export default function ScheduleScreen() {
  const router = useRouter();
  const jobStatuses = useLabels('job_status');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<DateRange | null>(null);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [newJobDefaults, setNewJobDefaults] = useState<{ start_date: string; end_date: string } | null>(null);
  const [savingJob, setSavingJob] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  // Only the jobs that touch the visible dates: started before the range ends
  // and either ending, or starting, on or after it begins.
  const fetchJobs = useCallback(async (visible: DateRange) => {
    setLoading(true);
    try {
      const startIso = visible.start.toISOString();
      const endIso = visible.end.toISOString();
      const { data, error } = await supabase
        .from('jobs')
        .select('uid, title, description, status, start_date, end_date, clients ( name )')
        .lt('start_date', endIso)
        .or(`end_date.gte.${startIso},start_date.gte.${startIso}`)
        .order('start_date', { ascending: true });

      if (error) throw new Error(error.message);

      const next: CalendarEvent[] = [];
      for (const row of (data ?? []) as JobRow[]) {
        const event = jobToEvent(row, jobStatuses);
        if (event) next.push(event);
      }
      setEvents(next);
    } catch (error: any) {
      console.error('Error fetching jobs for the schedule:', error);
      setSnackbar(`Could not load the schedule: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [jobStatuses]);

  const handleRangeChange = useCallback(
    (visible: DateRange) => {
      setRange(visible);
      fetchJobs(visible);
    },
    [fetchJobs],
  );

  const refresh = useCallback(() => {
    if (range) fetchJobs(range);
  }, [range, fetchJobs]);

  // The calendar loads a range when it first reports one; this re-reads the
  // same range after a job was edited on its own page (HT-13).
  useRefreshOnFocus(refresh);

  const openJob = useCallback(
    (event: CalendarEvent) => {
      setSelected(null);
      router.push(`/jobs/${event.id}`);
    },
    [router],
  );

  // HT-1: email the .ics for this job to the client, its creator and me.
  const sendInvite = useCallback(async (event: CalendarEvent) => {
    setSendingInvite(true);
    try {
      const { to } = await sendJobInvite(Number(event.id));
      setSelected(null);
      setSnackbar(`Calendar invite sent to ${to.join(', ')}`);
    } catch (error: any) {
      setSnackbar(`Could not send the invite: ${error.message}`);
    } finally {
      setSendingInvite(false);
    }
  }, []);

  const startNewJob = useCallback((start?: Date, end?: Date) => {
    const s = start ?? new Date();
    const e = end ?? new Date(s.getTime() + ONE_HOUR);
    setNewJobDefaults({ start_date: s.toISOString(), end_date: e.toISOString() });
  }, []);

  const handleAddJob = useCallback(
    async (jobData: any) => {
      setSavingJob(true);
      try {
        const { error } = await supabase.from('jobs').insert({
          title: jobData.title,
          description: jobData.description || '',
          client_id: jobData.client_id,
          status: jobData.status || 'pending',
          start_date: jobData.start_date,
          end_date: jobData.end_date,
          assigned_to: jobData.assigned_to ?? null,
          custom_fields: jobData.custom_fields ?? {},
        });
        if (error) throw new Error(error.message);
        setNewJobDefaults(null);
        setSnackbar('Job added');
        refresh();
      } catch (error: any) {
        console.error('Error adding job from the schedule:', error);
        setSnackbar(`Could not add the job: ${error.message}`);
      } finally {
        setSavingJob(false);
      }
    },
    [refresh],
  );

  const eventActions: EventAction[] = [
    { label: 'Send invite', icon: 'calendar-export', onPress: sendInvite, loading: sendingInvite },
    { label: 'Open job', icon: 'open-in-new', onPress: openJob, primary: true },
  ];

  return (
    <View style={styles.container}>
      <Calendar
        events={events}
        initialView="week"
        loading={loading}
        onRangeChange={handleRangeChange}
        onEventPress={setSelected}
        onSlotPress={startNewJob}
        onNew={() => startNewJob()}
      />

      <EventDialog event={selected} onDismiss={() => setSelected(null)} actions={eventActions} />

      <JobDialog
        visible={newJobDefaults !== null}
        subtitle="Schedule work for a client"
        defaults={newJobDefaults ?? undefined}
        submitting={savingJob}
        onDismiss={() => !savingJob && setNewJobDefaults(null)}
        onSubmit={handleAddJob}
      />

      <Snackbar visible={snackbar !== null} onDismiss={() => setSnackbar(null)} duration={4000}>
        {snackbar ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#ffffff',
  },
});
