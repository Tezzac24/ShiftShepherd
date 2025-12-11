import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';

type Props = ViewProps & {
  children: React.ReactNode;
};

const Card = ({ style, children, ...rest }: Props) => (
  <View style={[styles.card, style]} {...rest}>
    {children}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e3e3e3',
  },
});

export default Card;
