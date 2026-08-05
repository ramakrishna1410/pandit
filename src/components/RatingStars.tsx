import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../constants/theme';

interface Props {
  value: number;
  onChange: (value: number) => void;
  size?: number;
}

export function RatingStars({ value, onChange, size = 32 }: Props) {
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable key={star} onPress={() => onChange(star)} hitSlop={8}>
          <Ionicons
            name={star <= value ? 'star' : 'star-outline'}
            size={size}
            color={colors.accent}
            style={{ marginRight: spacing.xs }}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
});
