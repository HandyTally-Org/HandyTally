import { useState, useEffect } from 'react';
import { View, StyleSheet, Platform, Image, TouchableOpacity } from 'react-native';
import { Text, Button, Dialog, Portal } from 'react-native-paper';
import { Invoice, InvoiceItem } from '../app/(app)/invoices';
import { supabase } from '../lib/supabase';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatCurrency, formatDate } from '../utils/formatting';
import { generateInvoiceHTML } from '../utils/invoiceHtml';
import { doc, GREEN, NAVY, BORDER, LABEL, INK } from './invoiceDocStyles';

// Documents that can be emailed to a client: the ones that have not yet turned
// into money owed. Estimates are included deliberately - for a contractor,
// emailing an estimate is usually how the job is won. The payment states are
// excluded because there is no reason to re-issue a paid or overdue invoice
// from here. See HT-4.
const SENDABLE_STATUSES: Invoice['status'][] = ['draft', 'estimate', 'work_order'];

export interface InvoiceDetailsProps {
  invoice: Invoice;
  items: InvoiceItem[];
  onClose: () => void;
  onEdit?: (invoice: Invoice) => void;
  onDelete?: (invoiceId: string) => void;
  onStatusChange?: (status: Invoice['status']) => void;
  // Called after the invoice has been emailed, so the caller can refresh.
  onSent?: () => void;
  isEditable?: boolean;
  isEditing?: boolean;
  companyLogo?: string | null;
}

export function InvoiceDetails({ 
  invoice, 
  items, 
  onClose, 
  onEdit, 
  onDelete, 
  onStatusChange,
  onSent,
  isEditable = true,
  isEditing = false,
  companyLogo
}: InvoiceDetailsProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [companyInfo, setCompanyInfo] = useState(null);
  const [printLoading, setPrintLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(invoice?.sent_at ?? null);
  
  // Ensure invoice_items exists with a default empty array
  const safeInvoice = {
    ...invoice,
    invoice_items: invoice?.invoice_items || []
  };
  
  useEffect(() => {
    console.log('Invoice object in component:', safeInvoice);
    console.log('Job information:', safeInvoice.job);
    fetchCompanyInfo();
  }, [safeInvoice.id]);

  async function fetchCompanyInfo() {
    try {
      const { data, error } = await supabase
        .from('company')
        .select('*')
        .single();
      
      if (!error && data) {
        setCompanyInfo(data);
      }
    } catch (error) {
      console.error('Error fetching company info:', error);
    }
  }

  const handleStatusChange = (status: Invoice['status']) => {
    // Optional prop: guard it, or the status buttons crash when it is omitted.
    onStatusChange?.(status);
  };

  const handleDelete = () => {
    if (onDelete) {
      console.log('Deleting invoice with ID:', safeInvoice.uid);
      onDelete(safeInvoice.uid);
    }
    setShowDeleteDialog(false);
  };

  // Only documents that are invoices but have not gone out yet can be sent.
  // Estimates are excluded deliberately, and anything already paid or overdue
  // is left alone so sending can never walk a payment state backwards.
  const recipientEmail = safeInvoice.client?.email;
  const isSendableStatus = SENDABLE_STATUSES.includes(safeInvoice.status);
  const canSend = isSendableStatus && !!recipientEmail;

  const sendDisabledReason = !isSendableStatus
    ? `A "${safeInvoice.status}" document cannot be emailed from here.`
    : !recipientEmail
      ? 'This client has no email address on file.'
      : null;

  const handleSend = async () => {
    setShowSendDialog(false);

    try {
      setSendLoading(true);

      // Render exactly what the Print action renders, so the client receives
      // the same document the sender just looked at.
      const html = generateInvoiceHTML(safeInvoice, items, companyInfo);

      const { data, error } = await supabase.functions.invoke('send-invoice', {
        body: {
          to: recipientEmail,
          subject: `Invoice #${safeInvoice.invoice_number} from ${companyInfo?.business_name || 'HandyTally'}`,
          html,
        },
      });

      if (error) {
        // On a non-2xx, supabase-js only says "Edge Function returned a
        // non-2xx status code"; the function's { error } body is on
        // error.context. Read it so the user sees the provider's reason.
        let reason = error.message;
        try {
          const body = await error.context?.json();
          if (body?.error) reason = body.error;
        } catch {
          // Body was not JSON; keep the generic message.
        }
        throw new Error(reason);
      }
      if (data?.error) {
        throw new Error(data.error);
      }

      // Only record the send once the provider has accepted the message.
      // sent_at is written rather than the status, so an estimate stays an
      // estimate and a payment state is never overwritten.
      const sentTimestamp = new Date().toISOString();
      const { error: stampError } = await supabase
        .from('invoices')
        .update({ sent_at: sentTimestamp })
        .eq('uid', safeInvoice.uid);

      if (stampError) {
        // The client has the email; failing to record that is not worth
        // presenting as a failed send, but it must not pass silently either.
        console.error('Invoice was emailed but sent_at could not be saved:', stampError);
        alert(`Invoice sent to ${recipientEmail}, but recording the send failed. It may still show as unsent.`);
      } else {
        setSentAt(sentTimestamp);
        alert(`Invoice sent to ${recipientEmail}.`);
      }

      onSent?.();
    } catch (error) {
      console.error('Error sending invoice:', error);
      alert(`Failed to send the invoice: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSendLoading(false);
    }
  };

  const handlePrint = async () => {
    try {
      setPrintLoading(true);
      
      // Generate HTML for the invoice
      const html = generateInvoiceHTML(safeInvoice, items, companyInfo);
      
      // For web, create a new window with just the invoice HTML
      if (Platform.OS === 'web') {
        // Open a new window with only the invoice content
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          
          // Wait for resources to load then print
          setTimeout(() => {
            printWindow.print();
          }, 500);
        }
      } 
      // For mobile, generate PDF and share
      else {
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, {
          UTI: '.pdf',
          mimeType: 'application/pdf',
        });
      }
    } catch (error) {
      console.error('Error printing invoice:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setPrintLoading(false);
    }
  };

  // Items arrive through the `items` prop (the list row does not carry them);
  // the JSON column on the invoice is only a fallback.
  const lineItems: InvoiceItem[] = items && items.length > 0 ? items : safeInvoice.invoice_items;

  const documentLabel = (safeInvoice.status === 'estimate' || safeInvoice.status === 'work_order')
    ? 'Estimate'
    : 'Invoice';

  const client = safeInvoice.client;
  const clientAddressLines = client
    ? [
        client.address,
        [client.city, client.state].filter(Boolean).join(', '),
        client.zip,
        client.email,
        client.phone,
      ].filter(Boolean)
    : [];

  const jobName = safeInvoice.job
    ? (safeInvoice.job.title || (safeInvoice.job as any).name || `Job #${safeInvoice.job.uid}`)
    : 'No job';

  const feeValue = Number(safeInvoice.fee_value) || 0;
  const feeAmount = Number(safeInvoice.fee_amount) || 0;
  const hasFee = feeValue > 0 || feeAmount > 0;
  const feeLabel = safeInvoice.fee_type === 'percent'
    ? `Fee (${feeValue}%)`
    : 'Fee';

  return (
    <View style={doc.screen}>
      {/* Action bar, mirroring the Cancel / Save pair on the editor. Status
          changes live on the left so the sheet itself stays read-only. */}
      <View style={[doc.actionBar, { justifyContent: 'space-between', flexWrap: 'wrap' }]}>
        <View style={styles.statusRow}>
          <Text style={styles.statusRowLabel}>Status</Text>
          {STATUS_OPTIONS.map(({ value, label }) => {
            const active = safeInvoice.status === value;
            return (
              <TouchableOpacity
                key={value}
                style={[styles.statusPill, active ? styles.statusPillActive : null]}
                onPress={() => handleStatusChange(value)}
              >
                <Text style={[styles.statusPillText, active ? styles.statusPillTextActive : null]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.actionGroup}>
          {onDelete && isEditable && !isEditing && (
            <Button
              mode="text"
              onPress={() => {
                if (confirm('Are you sure you want to delete this invoice?')) {
                  handleDelete();
                }
              }}
              textColor="#dc2626"
              icon="delete"
              style={{ borderRadius: 4 }}
              labelStyle={{ fontSize: 14, fontWeight: '600' }}
            >
              Delete
            </Button>
          )}
          <Button
            mode="contained"
            onPress={onClose}
            buttonColor="#c9cdd2"
            textColor={INK}
            style={{ borderRadius: 4, minWidth: 120 }}
            labelStyle={{ fontSize: 14, fontWeight: '600' }}
          >
            Back
          </Button>
          {isEditable && onEdit && (
            <Button
              mode="contained"
              onPress={() => onEdit(safeInvoice)}
              buttonColor={NAVY}
              textColor="#ffffff"
              icon="pencil"
              style={{ borderRadius: 4, minWidth: 120 }}
              labelStyle={{ fontSize: 14, fontWeight: '600' }}
            >
              Edit
            </Button>
          )}
          <Button
            mode="contained"
            onPress={handlePrint}
            loading={printLoading}
            buttonColor={NAVY}
            textColor="#ffffff"
            icon="printer"
            style={{ borderRadius: 4, minWidth: 120 }}
            labelStyle={{ fontSize: 14, fontWeight: '600' }}
          >
            Print
          </Button>
          <Button
            mode="contained"
            onPress={() => setShowSendDialog(true)}
            loading={sendLoading}
            disabled={!canSend || sendLoading}
            buttonColor={GREEN}
            textColor="#ffffff"
            icon="email-send"
            style={{ borderRadius: 4, minWidth: 140 }}
            labelStyle={{ fontSize: 14, fontWeight: '600' }}
          >
            {sentAt ? 'Send Again' : `Send ${documentLabel}`}
          </Button>
        </View>
      </View>

      {(sendDisabledReason || sentAt) && (
        <View style={styles.sendHintRow}>
          {sendDisabledReason && <Text style={styles.sendHint}>{sendDisabledReason}</Text>}
          {sentAt && <Text style={styles.sendHint}>Last sent {formatDate(sentAt)}</Text>}
        </View>
      )}

      <View style={{ paddingHorizontal: 16 }}>
        <View style={doc.sheet}>
          {/* ── Header: company block on the left, document meta on the right ── */}
          <View style={doc.headerRow}>
            <View style={doc.headerLeft}>
              {companyLogo ? (
                <Image
                  source={{ uri: `data:image/png;base64,${companyLogo}` }}
                  style={doc.logo}
                />
              ) : (
                <View style={doc.logoPlaceholder}>
                  <Text style={{ color: '#b0b6bd', fontSize: 12 }}>Company logo</Text>
                </View>
              )}

              {companyInfo?.address ? (
                String(companyInfo.address)
                  .split('\n')
                  .map((line: string, i: number) => (
                    <Text key={`addr-${i}`} style={doc.companyLine}>{line}</Text>
                  ))
              ) : null}
              {companyInfo?.email ? (
                <Text style={doc.companyLink}>{companyInfo.email}</Text>
              ) : null}
              {companyInfo?.phone ? (
                <Text style={doc.companyLine}>{companyInfo.phone}</Text>
              ) : null}
            </View>

            <View style={doc.headerRight}>
              {/* Client */}
              <View style={doc.clientBox}>
                {client ? (
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: INK }}>
                      {client.name}
                    </Text>
                    {clientAddressLines.map((line, i) => (
                      <Text key={`client-line-${i}`} style={{ fontSize: 13, lineHeight: 19, color: '#4b5563' }}>
                        {line}
                      </Text>
                    ))}
                  </View>
                ) : (
                  <View style={doc.clientBoxEmpty}>
                    <Text style={{ color: LABEL, fontSize: 13 }}>No client</Text>
                  </View>
                )}
              </View>

              <View style={doc.field}>
                <Text style={doc.fieldLabel}>{documentLabel} #</Text>
                <Text style={styles.fieldValue}>{safeInvoice.invoice_number}</Text>
              </View>

              <View style={doc.field}>
                <Text style={doc.fieldLabel}>Date</Text>
                <Text style={styles.fieldValue}>{formatDate(safeInvoice.issue_date) || '-'}</Text>
              </View>

              <View style={doc.field}>
                <Text style={doc.fieldLabel}>Due Date</Text>
                <Text style={styles.fieldValue}>{formatDate(safeInvoice.due_date) || '-'}</Text>
              </View>

              <View style={doc.field}>
                <Text style={doc.fieldLabel}>Job</Text>
                <Text style={styles.fieldValue}>{jobName}</Text>
              </View>

              <View style={doc.field}>
                <Text style={doc.fieldLabel}>Status</Text>
                <Text style={styles.fieldValue}>{statusLabel(safeInvoice.status)}</Text>
              </View>
            </View>
          </View>

          {/* ── Line items ── */}
          <View style={doc.columnHeader}>
            <View style={doc.colDescription}>
              <Text style={doc.columnHeaderText}>Description</Text>
            </View>
            <View style={doc.colNumeric}>
              <Text style={doc.columnHeaderText}>Rate</Text>
            </View>
            <View style={doc.colNumeric}>
              <Text style={doc.columnHeaderText}>Quantity</Text>
            </View>
            <View style={doc.colTotal}>
              <Text style={doc.columnHeaderText}>Total</Text>
            </View>
          </View>

          {lineItems.length === 0 ? (
            <View style={styles.emptyItems}>
              <Text style={{ color: LABEL, fontSize: 13 }}>No line items</Text>
            </View>
          ) : (
            lineItems.map((item, index) => {
              const photos = Array.isArray(item.photos) ? item.photos : [];
              return (
                <View key={item.uid || `item-${index}`} style={doc.itemRow}>
                  <View style={doc.itemCard}>
                    <View style={doc.itemCells}>
                      <View style={[doc.cellDescription, { paddingVertical: 12, paddingRight: 12 }]}>
                        <Text style={{ fontSize: 14, color: INK, flex: 1 }}>{item.description}</Text>
                      </View>
                      <View style={[doc.cell, { alignItems: 'center' }]}>
                        <Text style={{ fontSize: 14, color: INK }}>{formatCurrency(item.unit_price)}</Text>
                      </View>
                      <View style={[doc.cell, { alignItems: 'center' }]}>
                        <Text style={{ fontSize: 14, color: INK }}>{item.quantity}</Text>
                      </View>
                      <View style={[doc.cell, { alignItems: 'center' }]}>
                        <Text style={{ fontSize: 14, color: INK }}>{formatCurrency(item.amount)}</Text>
                      </View>
                    </View>

                    {item.notes ? (
                      <View style={[doc.itemNotesRow, { paddingVertical: 12 }]}>
                        <Text style={{ fontSize: 14, color: INK }}>{item.notes}</Text>
                      </View>
                    ) : null}

                    {photos.length > 0 ? (
                      <View style={doc.itemPhotosRow}>
                        {photos.map((photo, photoIndex) => (
                          <Image
                            key={`photo-${index}-${photoIndex}`}
                            source={{ uri: `data:${photo.file_type || 'image/jpeg'};base64,${photo.file_data}` }}
                            style={doc.thumb}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}

          {/* ── Totals ── */}
          <View style={[doc.totalsWrap, { marginTop: 24 }]}>
            <View style={doc.totals}>
              <View style={doc.totalsRow}>
                <Text style={doc.totalsLabel}>Subtotal</Text>
                <Text style={doc.totalsValue}>{formatCurrency(safeInvoice.subtotal)}</Text>
              </View>

              {hasFee && (
                <View style={doc.totalsRow}>
                  <Text style={doc.totalsLabel}>{feeLabel}</Text>
                  <Text style={doc.totalsValue}>{formatCurrency(feeAmount)}</Text>
                </View>
              )}

              <View style={doc.totalsRow}>
                <Text style={doc.totalsLabel}>Tax Rate</Text>
                <Text style={doc.totalsValue}>{Number(safeInvoice.tax_rate) || 0} %</Text>
              </View>

              <View style={doc.totalsRow}>
                <Text style={doc.totalsLabel}>Tax</Text>
                <Text style={doc.totalsValue}>{formatCurrency(safeInvoice.tax_amount)}</Text>
              </View>

              <View style={doc.grandTotalRow}>
                <Text style={doc.grandTotalLabel}>Total (USD)</Text>
                <Text style={doc.grandTotalValue}>{formatCurrency(safeInvoice.total)}</Text>
              </View>
            </View>
          </View>

          {/* ── Notes ── */}
          <View style={doc.notesSection}>
            <Text style={doc.sectionLabel}>Notes</Text>
            <View style={styles.notesBox}>
              <Text style={{ fontSize: 14, color: safeInvoice.notes ? INK : LABEL }}>
                {safeInvoice.notes || 'No notes'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <Portal>
        <Dialog visible={showDeleteDialog} onDismiss={() => setShowDeleteDialog(false)}>
          <Dialog.Title>Delete Invoice</Dialog.Title>
          <Dialog.Content>
            <Text>Are you sure you want to delete Invoice #{safeInvoice.invoice_number}? This action cannot be undone.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button onPress={handleDelete}>Delete</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={showSendDialog} onDismiss={() => setShowSendDialog(false)}>
          <Dialog.Title>Send Invoice</Dialog.Title>
          <Dialog.Content>
            <Text>
              Email Invoice #{safeInvoice.invoice_number} to {recipientEmail}?
            </Text>
            <Text style={styles.sendHint}>
              {sentAt
                ? `This was already sent on ${formatDate(sentAt)}. Sending again will email it a second time.`
                : 'The status is left as it is; only the sent date is recorded.'}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowSendDialog(false)}>Cancel</Button>
            <Button onPress={handleSend}>Send</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

// Same set, same order, as the status dropdown on the editor.
const STATUS_OPTIONS: { value: Invoice['status']; label: string }[] = [
  { value: 'estimate', label: 'Estimate' },
  { value: 'work_order', label: 'Work Order' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'partial_paid', label: 'Partial Paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
];

function statusLabel(status: Invoice['status']): string {
  return STATUS_OPTIONS.find(option => option.value === status)?.label ?? status;
}

// Only what the read-only view needs on top of the shared document styles.
const styles = StyleSheet.create({
  fieldValue: {
    fontSize: 14,
    color: INK,
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  statusRowLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: LABEL,
    marginRight: 4,
  },
  statusPill: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#ffffff',
  },
  statusPillActive: {
    backgroundColor: NAVY,
    borderColor: NAVY,
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: LABEL,
  },
  statusPillTextActive: {
    color: '#ffffff',
  },
  sendHintRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    alignItems: 'flex-end',
  },
  sendHint: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 4,
  },
  emptyItems: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 3,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 14,
  },
  notesBox: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 3,
    padding: 10,
    backgroundColor: '#ffffff',
  },
});
