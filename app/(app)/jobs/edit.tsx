import { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/api';

export default function EditJob() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [job, setJob] = useState({
    name: '',
    description: '',
    client_id: '',
    start_date: '',
    end_date: '',
    status: ''
  });

  useEffect(() => {
    fetchJob();
  }, [id]);

  async function fetchJob() {
    const { data } = await supabase
      .from('jobs')
      .select(`
        *,
        client:client_id (name)
      `)
      .eq('id', id)
      .single();
    
    if (data) {
      setJob(data);
    }
  }

  async function handleSubmit() {
    const { error } = await supabase
      .from('jobs')
      .update(job)
      .eq('id', id);

    if (!error) {
      router.back();
    }
  }

  return (
    <View style={styles.container}>
      <Text variant="headlineMedium">Edit Job</Text>

      <TextInput
        label="Name"
        value={job.name}
        onChangeText={(text) => setJob({ ...job, name: text })}
        style={styles.input}
      />

      <TextInput
        label="Description"
        value={job.description}
        onChangeText={(text) => setJob({ ...job, description: text })}
        style={styles.input}
        multiline
      />

      <TextInput
        label="Start Date"
        value={job.start_date}
        onChangeText={(text) => setJob({ ...job, start_date: text })}
        style={styles.input}
      />

      <TextInput
        label="End Date"
        value={job.end_date}
        onChangeText={(text) => setJob({ ...job, end_date: text })}
        style={styles.input}
      />

      <Button mode="contained" onPress={handleSubmit}>
        Save Changes
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  input: {
    marginBottom: 16,
  }
}); 