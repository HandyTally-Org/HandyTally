import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Image, ScrollView } from 'react-native';
import { TextInput, Button, Text, Card, ActivityIndicator, IconButton } from 'react-native-paper';
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

const PLACEHOLDER_LOGO = 'https://i.imgur.com/Ixu6WiQ.png'; // or any other placeholder URL
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
        alert('Company information saved successfully!');
      }
    } catch (err) {
      console.error('Error saving company:', err);
      setError('Error saving company information. Please try again.');
    }
  };

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
        alert('Logo URL saved successfully!');
      }
    } catch (err) {
      console.error('Error saving logo URL:', err);
      setError('Error saving logo URL');
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled) {
        setLoading(true);
        const file = result.assets[0];
        const fileExt = file.uri.split('.').pop();
        const fileName = `logo-${Date.now()}.${fileExt}`;
        const filePath = `logos/${fileName}`;

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
          .from('public')
          .upload(filePath, {
            uri: file.uri,
            type: file.type || 'image/jpeg', // Provide a default type if undefined
            name: fileName,
          });

        if (error) throw error;

        // Get public URL
        const { data: publicUrlData } = supabase.storage
          .from('public')
          .getPublicUrl(filePath);

        const publicUrl = publicUrlData.publicUrl;

        // Update settings
        await upsertSettings(publicUrl);
        setLogoUrl(publicUrl);

        // After uploading the image
        console.log("Logo URL saved:", publicUrl);
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Error uploading image. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const upsertSettings = async (url: string) => {
    try {
      setLoading(true);
      
      // Update the company record with the new logo URL
      const { error } = await supabase
        .from('company')
        .upsert({
          ...company,
          logo_url: url,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error updating company logo:', error);
        throw error;
      }
      
      // Update local state
      setLogoUrl(url);
      setCompany({...company, logo_url: url});
      
      alert('Logo URL saved successfully!');
      
      // Force reload to update sidebar
      window.location.reload();
    } catch (error: any) {
      console.error('Error saving logo URL:', error);
      alert('Error saving logo URL: ' + (error.message || 'Unknown error'));
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
                  onPress={() => upsertSettings(logoUrl)}
                  style={{ marginRight: 8 }}
                >
                  Change Logo
                </Button>
                
                <Button 
                  mode="outlined" 
                  onPress={() => {
                    setLogoUrl(DEFAULT_LOGO_URL);
                    handleSubmit();
                  }}
                >
                  Default
                </Button>
              </View>
              
              <TextInput
                label="Logo URL"
                value={logoUrl}
                onChangeText={setLogoUrl}
                placeholder="Enter logo image URL"
                style={{ 
                  marginTop: 8, 
                  width: '100%',
                  maxWidth: 500,
                  backgroundColor: '#ffffff',
                }}
              />
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