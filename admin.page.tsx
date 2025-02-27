const DEFAULT_LOGO_URL = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMjAwIiB2aWV3Qm94PSIwIDAgNDAwIDIwMCI+PHJlY3Qgd2lkdGg9IjQwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiM0Q0FGNTAiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjI0IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPllvdXIgQ29tcGFueSBMb2dvPC90ZXh0Pjwvc3ZnPg==';

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