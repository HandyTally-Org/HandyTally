import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Image, ScrollView } from 'react-native';
import { TextInput, Button, Text, Card, ActivityIndicator, IconButton, Snackbar } from 'react-native-paper';
import { supabase } from '../lib/api';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';

interface CompanyData {
  uid?: string;
  business_name: string;
  address: string;
  email: string | null;
  phone: string | null;
  ein: string | null;
  logo_url: string | null;
}

// Added attachment interface
interface CompanyAttachment {
  id?: string;
  company_id: string;
  name: string;
  file_type: string;
  file_data: string;
  created_at?: string;
  is_logo?: boolean;
}

const DEFAULT_LOGO_URL = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMjAwIiB2aWV3Qm94PSIwIDAgNDAwIDIwMCI+PHJlY3Qgd2lkdGg9IjQwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiM0Q0FGNTAiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjI0IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPllvdXIgQ29tcGFueSBMb2dvPC90ZXh0Pjwvc3ZnPg==';

export default function AdminPage() {
  const [company, setCompany] = useState<CompanyData>({
    business_name: '',
    address: '',
    email: '',
    phone: '',
    ein: '',
    logo_url: null
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetchCompanyInfo();
    fetchSettings();
  }, []);

  const fetchCompanyInfo = async () => {
    try {
      const { data, error } = await supabase
        .from('company')
        .select('*')
        .single();

      // If no company exists yet, that's okay - just use empty form
      if (error && error.code === 'PGRST116') {
        setLoading(false);
        return; // Keep the default empty state
      }

      // For other errors, throw
      if (error) throw error;
      
      if (data) {
        setCompany(data);
        // Set the logo URL from company data
        if (data.logo_url) {
          setLogoUrl(data.logo_url);
        }
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching company:', err);
      setError('Error fetching company information');
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      // Check if settings table exists
      const { data: tableExists } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_name', 'settings')
        .single();

      if (!tableExists) {
        // Create settings table if it doesn't exist
        await supabase.rpc('create_settings_table');
      }

      // Get current settings
      const { data, error } = await supabase
        .from('settings')
        .select('logo_url')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setLogoUrl(data.logo_url || '');
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  const handleSubmit = async () => {
    try {
      // Validate required fields
      if (!company.business_name || !company.address) {
        setError('Business name and address are required');
        return;
      }

      const { data, error } = await supabase
        .from('company')
        .upsert({
          ...company,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      if (data) {
        setCompany(data);
        setError(''); // Clear any existing errors
        showSnackbar('Company information saved successfully!');
      }
    } catch (err) {
      console.error('Error saving company:', err);
      setError('Error saving company information. Please try again.');
      showSnackbar('Error saving company information');
    }
  };

  // Modified function to save logo URL to company table
  const handleLogoSubmit = async (url: string) => {
    try {
      const { data, error } = await supabase
        .from('company')
        .upsert({
          ...company,
          logo_url: url,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setCompany(data);
        setLogoUrl(url);
        showSnackbar('Logo URL saved successfully!');
      }
    } catch (err) {
      console.error('Error saving logo URL:', err);
      setError('Error saving logo URL');
      showSnackbar('Error saving logo URL');
    }
  };

  // New function to convert file to base64
  const fileToBase64 = async (uri: string): Promise<string> => {
    try {
      // For web, we need to fetch the file and convert to base64
      const response = await fetch(uri);
      const blob = await response.blob();
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          // We want just the base64 data part
          const base64String = reader.result as string;
          // Remove the data:image/jpeg;base64, part if it exists
          const base64Data = base64String.includes(',') 
            ? base64String.split(',')[1] 
            : base64String;
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error converting to base64:', error);
      throw error;
    }
  };

  // Modified function to pick image and save to company_attachments
  const pickImage = async () => {
    try {
      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8, // Lower quality to reduce size
      });

      if (result.canceled) {
        return;
      }

      setLoading(true);
      const file = result.assets[0];
      
      console.log("Selected image:", file.uri);
      
      // Get file extension
      const fileExt = file.uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `company-logo-${Date.now()}.${fileExt}`;
      
      // Convert image to base64
      const base64Data = await fileToBase64(file.uri);
      
      // Determine file type from extension
      let fileType = 'image/jpeg';
      if (fileExt === 'png') fileType = 'image/png';
      if (fileExt === 'gif') fileType = 'image/gif';
      if (fileExt === 'svg') fileType = 'image/svg+xml';
      
      // First, ensure we have a company ID
      let companyId = company.uid;
      
      if (!companyId) {
        // Create company record if it doesn't exist
        const { data: newCompany, error: companyError } = await supabase
          .from('company')
          .upsert({
            business_name: company.business_name || 'My Company',
            address: company.address || '',
            updated_at: new Date().toISOString()
          })
          .select()
          .single();
          
        if (companyError) throw companyError;
        
        if (newCompany) {
          companyId = newCompany.uid;
          setCompany(newCompany);
        } else {
          throw new Error('Failed to create company record');
        }
      }
      
      // Insert into company_attachments with corrected field names
      const attachment: CompanyAttachment = {
        company_id: companyId as string,
        name: fileName,
        file_type: fileType,
        file_data: base64Data,
        is_logo: true
      };
      
      console.log("Saving attachment with fields:", Object.keys(attachment));
      
      // Save attachment
      const { data: savedAttachment, error: attachmentError } = await supabase
        .from('company_attachments')
        .insert(attachment)
        .select()
        .single();
        
      if (attachmentError) {
        console.error('Attachment error details:', attachmentError);
        
        // Check if the table doesn't exist
        if (attachmentError.message?.includes('relation "company_attachments" does not exist')) {
          console.error('The company_attachments table does not exist. Please create it first.');
          showSnackbar('The company_attachments table does not exist. Please contact the system administrator.');
          setLoading(false);
          return;
        }
        throw attachmentError;
      }
      
      // Create a data URL for immediate display
      const dataUrl = `data:${fileType};base64,${base64Data}`;
      
      // Update company with new logo URL
      await handleLogoSubmit(dataUrl);
      
      showSnackbar('Logo uploaded and saved successfully!');
      
      // Force reload to update sidebar
      setTimeout(() => window.location.reload(), 1500); // Give time to see the snackbar before reload
    } catch (error: any) {
      console.error('Error uploading image:', error);
      showSnackbar('Error uploading image: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // Function to use default logo
  const useDefaultLogo = async () => {
    try {
      setLoading(true);
      await handleLogoSubmit(DEFAULT_LOGO_URL);
      setLogoUrl(DEFAULT_LOGO_URL);
      showSnackbar('Default logo set successfully!');
      
      // Force reload to update sidebar
      setTimeout(() => window.location.reload(), 1500); // Give time to see the snackbar before reload
    } catch (error: any) {
      console.error('Error setting default logo:', error);
      showSnackbar('Error setting default logo: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 16 }}>Loading company profile...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <ScrollView style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <View style={{ 
          flex: 1, 
          backgroundColor: '#ffffff',
          alignItems: 'center',
          paddingVertical: 24,
        }}>
          <View style={{ 
            width: '100%', 
            maxWidth: 800, 
            paddingHorizontal: 24,
            backgroundColor: '#ffffff',
          }}>
            <Text style={{
              fontFamily: 'System',
              fontSize: 26,
              fontWeight: '600',
              marginBottom: 24,
              color: '#333333',
              backgroundColor: '#ffffff',
            }}>Company</Text>
            
            <View style={{ 
              alignItems: 'center', 
              marginBottom: 32,
              backgroundColor: '#ffffff',
            }}>
              <View style={{ 
                width: 200, 
                height: 200, 
                backgroundColor: '#ffffff',
                borderRadius: 8,
                justifyContent: 'center',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: '#e0e0e0',
                marginBottom: 16,
                overflow: 'hidden',
              }}>
                {logoUrl ? (
                  <Image
                    source={{ uri: logoUrl }}
                    style={{ width: '100%', height: '100%', resizeMode: 'contain' }}
                  />
                ) : (
                  <Text style={{ color: '#999', backgroundColor: '#ffffff' }}>Your Company Logo</Text>
                )}
              </View>
              
              <View style={{ 
                flexDirection: 'row', 
                justifyContent: 'center',
                backgroundColor: '#ffffff',
                marginBottom: 16,
              }}>
                <Button 
                  mode="contained" 
                  onPress={pickImage}
                  style={{ marginRight: 8 }}
                >
                  Change Logo
                </Button>
                
                <Button 
                  mode="outlined" 
                  onPress={useDefaultLogo}
                >
                  Default
                </Button>
              </View>
              
              <Text style={{ 
                fontSize: 12, 
                color: '#666',
                textAlign: 'center', 
                maxWidth: 400,
                marginBottom: 8,
              }}>
                Upload an image to use as your company logo. The image will be stored in your company attachments.
              </Text>
            </View>
            
            <Card style={{ 
              marginBottom: 24,
              backgroundColor: '#ffffff',
              borderRadius: 8,
              elevation: 2,
              shadowColor: 'rgba(0,0,0,0.1)',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.8,
              shadowRadius: 1,
            }}>
              <Card.Content style={{ backgroundColor: '#ffffff', padding: 24 }}>
                <Text style={{ 
                  fontSize: 18, 
                  fontWeight: 'bold', 
                  marginBottom: 24,
                  backgroundColor: '#ffffff',
                }}>Business Information</Text>
                
                <TextInput
                  label="Business Name"
                  value={company.business_name}
                  onChangeText={(text) => setCompany({ ...company, business_name: text })}
                  style={{ marginBottom: 16, backgroundColor: '#ffffff' }}
                />
                
                <TextInput
                  label="Address"
                  value={company.address}
                  onChangeText={(text) => setCompany({ ...company, address: text })}
                  multiline
                  numberOfLines={3}
                  style={{ marginBottom: 16, backgroundColor: '#ffffff' }}
                />
                
                <TextInput
                  label="Email"
                  value={company.email || ''}
                  onChangeText={(text) => setCompany({ ...company, email: text })}
                  keyboardType="email-address"
                  style={{ marginBottom: 16, backgroundColor: '#ffffff' }}
                />
                
                <TextInput
                  label="Phone Number"
                  value={company.phone || ''}
                  onChangeText={(text) => setCompany({ ...company, phone: text })}
                  keyboardType="phone-pad"
                  style={{ marginBottom: 16, backgroundColor: '#ffffff' }}
                />
                
                <TextInput
                  label="EIN Number"
                  value={company.ein || ''}
                  onChangeText={(text) => setCompany({ ...company, ein: text })}
                  style={{ backgroundColor: '#ffffff' }}
                />
              </Card.Content>
            </Card>
            
            <View style={{ 
              alignItems: 'center',
              marginBottom: 32,
              backgroundColor: '#ffffff',
            }}>
              <Button
                mode="contained"
                onPress={handleSubmit}
                loading={loading}
                disabled={loading}
                style={{ 
                  width: '100%',
                  maxWidth: 300,
                  backgroundColor: loading ? '#cccccc' : undefined,
                }}
              >
                Save All Changes
              </Button>
            </View>
          </View>
        </View>
      </ScrollView>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        style={{
          backgroundColor: '#333333',
          borderRadius: 4
        }}
        action={{
          label: 'Dismiss',
          onPress: () => setSnackbarVisible(false)
        }}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentWrapper: {
    padding: 20,
    alignItems: 'center',
    minHeight: '100%',
  },
  title: {
    marginBottom: 20,
    textAlign: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 800,
    elevation: 4,
    marginBottom: 20,
  },
  input: {
    marginBottom: 16,
  },
  button: {
    marginTop: 16,
  },
  error: {
    color: 'red',
    marginBottom: 16,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoPreview: {
    width: 219,
    height: 195,
    marginBottom: 16,
    resizeMode: 'contain',
  },
}); 