import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Image } from 'react-native';
import { Text, Button, TextInput, Snackbar, Card } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { styles as globalStyles } from '../../styles';

// Define the CompanyInfo type
type CompanyInfo = {
  id?: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  website: string;
  logo_url: string;
};

// Use a data URL for the default logo (a simple placeholder)
const DEFAULT_LOGO_URL = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMjAwIiB2aWV3Qm94PSIwIDAgNDAwIDIwMCI+PHJlY3Qgd2lkdGg9IjQwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiM0Q0FGNTAiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjI0IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPllvdXIgQ29tcGFueSBMb2dvPC90ZXh0Pjwvc3ZnPg==';

export default function AdminScreen() {
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [formData, setFormData] = useState<CompanyInfo>({
    name: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    phone: '',
    email: '',
    website: '',
    logo_url: '',
  });
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchCompanyInfo();
  }, []);

  async function fetchCompanyInfo() {
    try {
      const { data, error } = await supabase
        .from('company_info')
        .select('*')
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        console.log('Original company data:', data);
        
        // Check if logo_url is null, undefined, or empty string
        const hasValidLogo = data.logo_url && data.logo_url.trim() !== '';
        
        // Create normalized data with default logo if needed
        const normalizedData = {
          ...data,
          logo_url: hasValidLogo ? data.logo_url : DEFAULT_LOGO_URL
        };
        
        console.log('Normalized company data:', normalizedData);
        
        setCompanyInfo(normalizedData);
        setFormData(normalizedData);
        
        // Update the database if logo was empty
        if (!hasValidLogo && data.id) {
          console.log('Updating database with default logo URL');
          
          const { error: updateError } = await supabase
            .from('company_info')
            .update({ logo_url: DEFAULT_LOGO_URL })
            .eq('id', data.id);
            
          if (updateError) {
            console.error('Error updating default logo URL:', updateError);
          } else {
            console.log('Successfully updated logo URL in database');
          }
        }
      } else {
        // No company info exists yet, create default
        console.log('No company info found, creating default');
        
        const defaultInfo = {
          ...formData,
          logo_url: DEFAULT_LOGO_URL
        };
        
        const { data: newData, error: insertError } = await supabase
          .from('company_info')
          .insert([defaultInfo])
          .select();
          
        if (insertError) {
          console.error('Error creating default company info:', insertError);
        } else if (newData) {
          console.log('Created default company info:', newData[0]);
          setCompanyInfo(newData[0]);
          setFormData(newData[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching company info:', error);
    }
  }

  const handleChange = (field: keyof CompanyInfo, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      
      // Create a copy of the form data
      const updatedInfo = { ...formData };
      
      // If logo_url is empty, use the default
      if (!updatedInfo.logo_url || updatedInfo.logo_url.trim() === '') {
        console.log('Setting default logo URL in form submission');
        updatedInfo.logo_url = DEFAULT_LOGO_URL;
      }
      
      console.log('Submitting updated company info:', updatedInfo);
      
      const { error } = await supabase
        .from('company_info')
        .upsert(updatedInfo);

      if (error) {
        throw error;
      }

      setCompanyInfo(updatedInfo);
      showSnackbar('Company information updated successfully');
    } catch (error) {
      console.error('Error updating company info:', error);
      showSnackbar('Failed to update company information');
    } finally {
      setSubmitting(false);
    }
  };

  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  // Get the logo URL with fallback to default
  const logoUrl = companyInfo?.logo_url || DEFAULT_LOGO_URL;

  return (
    <View style={styles.container}>
      <Text variant="headlineMedium" style={styles.title}>Company Settings</Text>
      
      <ScrollView style={styles.scrollView}>
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.sectionTitle}>Company Information</Text>
            
            <TextInput
              label="Company Name"
              value={formData.name}
              onChangeText={(value) => handleChange('name', value)}
              style={styles.input}
              mode="outlined"
            />
            
            <TextInput
              label="Address"
              value={formData.address}
              onChangeText={(value) => handleChange('address', value)}
              style={styles.input}
              mode="outlined"
            />
            
            <View style={styles.row}>
              <TextInput
                label="City"
                value={formData.city}
                onChangeText={(value) => handleChange('city', value)}
                style={[styles.input, styles.cityInput]}
                mode="outlined"
              />
              
              <TextInput
                label="State"
                value={formData.state}
                onChangeText={(value) => handleChange('state', value)}
                style={[styles.input, styles.stateInput]}
                mode="outlined"
              />
              
              <TextInput
                label="ZIP"
                value={formData.zip}
                onChangeText={(value) => handleChange('zip', value)}
                style={[styles.input, styles.zipInput]}
                mode="outlined"
              />
            </View>
            
            <TextInput
              label="Phone"
              value={formData.phone}
              onChangeText={(value) => handleChange('phone', value)}
              style={styles.input}
              mode="outlined"
            />
            
            <TextInput
              label="Email"
              value={formData.email}
              onChangeText={(value) => handleChange('email', value)}
              style={styles.input}
              mode="outlined"
            />
            
            <TextInput
              label="Website"
              value={formData.website}
              onChangeText={(value) => handleChange('website', value)}
              style={styles.input}
              mode="outlined"
            />
            
            <View>
              <TextInput
                label="Logo URL"
                value={formData.logo_url}
                onChangeText={(value) => handleChange('logo_url', value)}
                style={styles.input}
                mode="outlined"
              />
              
              <Button
                mode="contained"
                onPress={handleSubmit}
                style={{ marginBottom: 8 }}
              >
                Save Logo URL
              </Button>
              
              <Button
                mode="outlined"
                icon="image"
                onPress={() => {
                  handleChange('logo_url', DEFAULT_LOGO_URL);
                  handleSubmit();
                }}
                style={{ marginBottom: 16 }}
              >
                Use Default Logo
              </Button>
            </View>
            
            {logoUrl && (
              <View style={styles.logoContainer}>
                <Text variant="titleMedium" style={styles.logoTitle}>Logo Preview:</Text>
                <Image 
                  source={{ uri: logoUrl }}
                  style={styles.logoPreview}
                  resizeMode="contain"
                  defaultSource={{ uri: DEFAULT_LOGO_URL }}
                  onError={(e) => {
                    console.error('Error loading logo image:', e.nativeEvent.error);
                    // If there's an error loading the image, update the state to use the default
                    if (companyInfo && companyInfo.logo_url !== DEFAULT_LOGO_URL) {
                      setCompanyInfo({
                        ...companyInfo,
                        logo_url: DEFAULT_LOGO_URL
                      });
                      setFormData({
                        ...formData,
                        logo_url: DEFAULT_LOGO_URL
                      });
                      // Also update the database
                      if (companyInfo.id) {
                        supabase
                          .from('company_info')
                          .update({ logo_url: DEFAULT_LOGO_URL })
                          .eq('id', companyInfo.id)
                          .then(({ error }) => {
                            if (error) {
                              console.error('Error updating logo URL after load failure:', error);
                            } else {
                              console.log('Updated logo URL after load failure');
                            }
                          });
                      }
                    }
                  }}
                  onLoad={() => console.log('Logo image loaded successfully')}
                />
              </View>
            )}
            
            <Button
              mode="contained"
              onPress={handleSubmit}
              style={styles.submitButton}
              loading={submitting}
              disabled={submitting}
            >
              Save Changes
            </Button>
          </Card.Content>
        </Card>
      </ScrollView>
      
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...globalStyles.container,
  },
  title: {
    ...globalStyles.title,
  },
  scrollView: {
    flex: 1,
  },
  card: {
    marginBottom: 16,
    borderRadius: 8,
  },
  sectionTitle: {
    marginBottom: 16,
  },
  input: {
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cityInput: {
    flex: 2,
    marginRight: 8,
  },
  stateInput: {
    flex: 1,
    marginRight: 8,
  },
  zipInput: {
    flex: 1,
  },
  submitButton: {
    marginTop: 16,
  },
  logoContainer: {
    marginTop: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  logoTitle: {
    marginBottom: 8,
  },
  logoPreview: {
    width: 200,
    height: 100,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
  },
}); 