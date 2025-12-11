import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

type Props = {
  title: string;
  subtitle?: string;
  meta?: string;
  onPress?: () => void;
  style?: ViewStyle;
};

const ListItem = ({ title, subtitle, meta, onPress, style }: Props) => (
  <Pressable
    onPress={onPress}
    disabled={!onPress}
    style={({ pressed }) => [styles.container, style, pressed && styles.pressed]}
  >
    <View style={styles.textContainer}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
    {meta ? <Text style={styles.meta}>{meta}</Text> : null}
  </Pressable>
);

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e3e3e3',
  },
  pressed: {
    opacity: 0.9,
  },
  textContainer: {
    flex: 1,
    paddingRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  subtitle: {
    marginTop: 4,
    color: '#4B5563',
    fontSize: 14,
  },
  meta: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default ListItem;
