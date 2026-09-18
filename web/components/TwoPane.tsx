import { type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { themed } from '../constants/Colors';

// HT-50: master-detail layout — a list on the left, the selected item's
// content on the right, as part of the page rather than an overlay. Built
// for Admin > Settings and meant to be reused (HT-47 puts the Company page
// sections on it). Below the breakpoint the right pane becomes a full-height
// sheet over the list with a close button, so narrow screens still work.

/** Width below which the detail pane is shown as a sheet instead of beside the list. */
export const TWO_PANE_BREAKPOINT = 900;

type TwoPaneProps = {
  /** The left pane: a list, a menu, a table of rows. */
  list: ReactNode;
  /** The right pane. Null renders the placeholder (or nothing on a narrow screen). */
  detail: ReactNode | null;
  /** Heading of the detail pane, rendered by this component in both modes. */
  detailTitle?: string;
  /** One quieter line under the heading. */
  detailSubtitle?: string;
  /** Called by the sheet's close button on narrow screens. */
  onCloseDetail?: () => void;
  /** Shown in the right pane while nothing is selected. */
  placeholder?: string;
  listWidth?: number;
};

export function TwoPane({
  list,
  detail,
  detailTitle,
  detailSubtitle,
  onCloseDetail,
  placeholder = 'Select an item to see its settings.',
  listWidth = 380,
}: TwoPaneProps) {
  const { width } = useWindowDimensions();
  const narrow = width < TWO_PANE_BREAKPOINT;

  if (narrow) {
    return (
      <View style={styles.root}>
        <View style={styles.narrowList}>{list}</View>
        {detail !== null && (
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitle}>
                <Text style={styles.headerTitle}>{detailTitle ?? ''}</Text>
                {detailSubtitle ? <Text style={styles.headerSubtitle}>{detailSubtitle}</Text> : null}
              </View>
              <IconButton icon="close" size={18} accessibilityLabel="Close" onPress={onCloseDetail} />
            </View>
            <View style={styles.sheetBody}>{detail}</View>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.root, styles.wide]}>
      <View style={[styles.list, { width: listWidth }]}>{list}</View>
      <View style={styles.detail}>
        {detail !== null ? (
          <>
            {detailTitle ? (
              <View style={styles.detailHeader}>
                <View style={styles.detailHeaderText}>
                  <Text style={styles.headerTitle}>{detailTitle}</Text>
                  {detailSubtitle ? <Text style={styles.headerSubtitle}>{detailSubtitle}</Text> : null}
                </View>
                {onCloseDetail ? <IconButton icon="close" size={18} accessibilityLabel="Close" onPress={onCloseDetail} /> : null}
              </View>
            ) : null}
            <View style={styles.detailBody}>{detail}</View>
          </>
        ) : (
          <Text style={styles.placeholder}>{placeholder}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  wide: { flexDirection: 'row' },
  list: {
    borderRightWidth: 1,
    borderRightColor: themed.line,
    backgroundColor: themed.panel,
  },
  detail: { flex: 1, backgroundColor: themed.panel, minWidth: 0 },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 22,
    paddingRight: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: themed.line,
  },
  detailHeaderText: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: themed.text },
  headerSubtitle: { fontSize: 12.5, color: themed.muted, marginTop: 1 },
  detailBody: { flex: 1, minHeight: 0 },
  placeholder: { color: themed.muted, padding: 24 },
  narrowList: { flex: 1, backgroundColor: themed.panel },
  sheet: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: themed.panel,
    borderLeftWidth: 1,
    borderLeftColor: themed.line,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    borderBottomWidth: 1,
    borderBottomColor: themed.line,
  },
  sheetTitle: { flex: 1 },
  sheetBody: { flex: 1, minHeight: 0 },
});
