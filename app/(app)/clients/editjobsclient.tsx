import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, ActivityIndicator, Snackbar } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { JobForm } from '../../../components/JobForm';

export default function EditJobClientScreen() {
  const { id: jobId, client_id: clientId } = useLocalSearchParams();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [clients, setClients] = useState([]);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  useEffect(() => {
    if (jobId) {
      fetchJobData();
    }
    fetchClients();
  }, [jobId]);

  const fetchJobData = async () => {
    try {
      setLoading(true);
      
      // Fetch job details
      const { data: jobData, error: jobError } = await supabase
        .from('jobs')
        .select('*')
        .eq('uid', jobId)
        .single();
      
      if (jobError) throw jobError;
      
      console.log('Job data fetched:', jobData);
      setJob(jobData);
      
    } catch (err) {
      console.error('Error fetching job details:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name');

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const handleSaveJob = async (jobData) => {
    try {
      setSubmitting(true);
      
      // Prepare updated job data
      const updatedJob = {
        title: jobData.title,
        description: jobData.description,
        client_id: jobData.client_id,
        status: jobData.status,
        start_date: jobData.start_date,
        end_date: jobData.end_date,
        start_time: jobData.start_time,
        end_time: jobData.end_time,
      };
      
      // Update job in database
      const { error: updateError } = await supabase
        .from('jobs')
        .update(updatedJob)
        .eq('uid', jobId);
      
      if (updateError) throw updateError;
      
      // Show success message
      showSnackbar('Job updated successfully');
      
      // Navigate back to client details page
      setTimeout(() => {
        router.push(`/client-details?id=${job.client_id}`);
      }, 1500);
      
    } catch (error) {
      console.error('Error updating job:', error);
      showSnackbar(`Error: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const showSnackbar = (message) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }}>
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <ActivityIndicator size="large" />
          <Text style={{ marginTop: 16 }}>Loading job details...</Text>
        </View>
      ) : error ? (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={{ color: 'red', marginBottom: 20 }}>{error}</Text>
          <Button mode="contained" onPress={() => router.back()}>
            Go Back
          </Button>
        </View>
      ) : job ? (
        <View style={{ padding: 16 }}>
          <View style={{ backgroundColor: '#ffffff', padding: 16, marginBottom: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold' }}>
              Editing Job: {job.title}
            </Text>
          </View>
          
          <JobForm
            job={job}
            onSubmit={handleSaveJob}
            onCancel={() => router.push(`/client-details?id=${job.client_id}`)}
            submitting={submitting}
          />
        </View>
      ) : (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={{ marginBottom: 20 }}>Job not found</Text>
          <Button mode="contained" onPress={() => router.back()}>
            Go Back
          </Button>
        </View>
      )}
      
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        action={{
          label: 'OK',
          onPress: () => setSnackbarVisible(false),
        }}
      >
        {snackbarMessage}
      </Snackbar>
    </ScrollView>
  );
} 