import React, { Children, createContext } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radius } from '../../constants/theme';

/** Internal context lets ListRow retain its stand-alone API outside a group. */
export const ListGroupContext = createContext(false);

export function ListGroup({ children, style }: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ListGroupContext.Provider value>
      <View style={[styles.group, style]}>
        {Children.toArray(children).map((child, index) => (
          <View key={React.isValidElement(child) ? child.key ?? index : index} style={index ? styles.divider : undefined}>
            {child}
          </View>
        ))}
      </View>
    </ListGroupContext.Provider>
  );
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
