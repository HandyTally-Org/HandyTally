import { useState, useRef } from 'react';
import { View } from 'react-native';
import { Button, Menu, Text } from 'react-native-paper';
import { styles } from '../styles';
import { useLabels } from '../hooks/useLabels';

type JobStatusSelectorProps = {
  status: string;
  onStatusChange: (status: string) => void;
  disabled?: boolean;
};

export function JobStatusSelector({ status, onStatusChange, disabled = false }: JobStatusSelectorProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [buttonLayout, setButtonLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const buttonRef = useRef(null);

  // HT-49: rendered upper-case, as this selector always was.
  const statusOptions = useLabels('job_status').map(def => ({ value: def.value, label: def.label.toUpperCase() }));

  const getStatusLabel = (value: string) => {
    const option = statusOptions.find(opt => opt.value === value);
    return option ? option.label : (value || 'PENDING').replace(/_/g, ' ').toUpperCase();
  };

  const measureButton = () => {
    if (buttonRef.current) {
      buttonRef.current.measure((x, y, width, height, pageX, pageY) => {
        setButtonLayout({ x: pageX, y: pageY + height, width, height });
      });
    }
  };

  return (
    <View>
      <Button 
        ref={buttonRef}
        mode="outlined" 
        onPress={() => {
          measureButton();
          setShowMenu(true);
        }}
        disabled={disabled}
        style={styles.input}
        icon="flag"
      >
        {getStatusLabel(status)}
      </Button>
      
      <Menu
        visible={showMenu}
        onDismiss={() => setShowMenu(false)}
        anchor={buttonLayout}
        style={{ width: buttonLayout.width || 300, maxHeight: 300 }}
      >
        {statusOptions.map(option => (
          <Menu.Item
            key={option.value}
            title={option.label}
            onPress={() => {
              onStatusChange(option.value);
              setShowMenu(false);
            }}
          />
        ))}
      </Menu>
    </View>
  );
} 