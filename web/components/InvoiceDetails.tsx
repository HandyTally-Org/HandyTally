import { useState, useEffect } from 'react';
import { View, StyleSheet, Platform, Image } from 'react-native';
import { Text, Button, Dialog, Portal, TextInput } from 'react-native-paper';
import { Invoice, InvoiceItem } from '../app/(app)/invoices';
import { supabase } from '../lib/supabase';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatCurrency, formatDate } from '../utils/formatting';
import { generateInvoiceHTML, renderInvoiceDocument } from '../utils/invoiceHtml';
import { doc, GREEN, NAVY, BORDER, LABEL, INK } from './invoiceDocStyles';
import { invoiceDocumentLabel } from '../constants/invoiceStatus';
import { labelText } from '../constants/labels';
import { useLabels } from '../hooks/useLabels';
import { useCustomFields } from '../hooks/useCustomFields';
import { CustomFieldsView } from './CustomFields';
import { useFeedback } from '../contexts/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';
import { fetchCompanyProfile, type CompanyProfile } from '../utils/companyProfile';

// Documents that can be emailed to a client: the ones that have not yet turned
// into money owed. The payment states are excluded because there is no reason
// to re-issue a paid or overdue invoice from here. See HT-4.
//
// An estimate is sent differently (HT-10): "Send for Approval" lets the user
// write a subject and a message, copies the user who created the estimate,
// and puts an Approve button in the email that turns it into a work order.
//
// Behaviour, not display: these literals gate what the buttons do and stay
// hard-coded on purpose (HT-49). Names and colours come from useLabels.
const SENDABLE_STATUSES: Invoice['status'][] = ['estimate', 'work_order'];

// Read the estimate's job as "Job #12, Kitchen rewire" for the email body.
// Jobs have no number of their own, so the row id stands in.
function describeJob(job: Invoice['job'] | undefined): string | null {
  if (!job) return null;
  const id = (job as any).uid ?? (job as any).id;
  const title = job.title || (job as any).name;
  if (id && title) return `Job #${id}, ${title}`;
  if (title) return title;
  if (id) return `Job #${id}`;
  return null;
}

export interface InvoiceDetailsProps {
  invoice: Invoice;
  items: InvoiceItem[];
  onClose: () => void;
  onEdit?: (invoice: Invoice) => void;
  onDelete?: (invoiceId: string) => void;
  // Called after the invoice has been emailed, so the caller can refresh.
  onSent?: () => void;
  isEditable?: boolean;
  isEditing?: boolean;
  /** The company logo as a data: URL (HT-88). Falls back to the company row's logo_url. */
  companyLogo?: string | null;
  /** HT-78: Company > Documents rows marked "On invoices" (label + details; HT-87 attaches fileName's file when sending). */
  companyDocuments?: { label: string; value: string; fileName: string | null }[];
}

export function InvoiceDetails({ 
  invoice, 
  items, 
  onClose, 
  onEdit,
  onDelete,
  onSent,
  isEditable = true,
  isEditing = false,
  companyLogo,
  companyDocuments = []
}: InvoiceDetailsProps) {
  const invoiceStatuses = useLabels('invoice_status');
  const invoiceCustomFields = useCustomFields('invoices');
  const { notify, confirm } = useFeedback();
  const { organization } = useAuth();
  const [companyInfo, setCompanyInfo] = useState<CompanyProfile | null>(null);
  const [printLoading, setPrintLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(invoice?.sent_at ?? null);
  // HT-10: the editable subject and message of the approval email.
  const [approvalSubject, setApprovalSubject] = useState('');
  const [approvalMessage, setApprovalMessage] = useState('');

  // Ensure invoice_items exists with a default empty array
  const safeInvoice = {
    ...invoice,
    invoice_items: invoice?.invoice_items || []
  };
  
  useEffect(() => {
    fetchCompanyProfile(organization?.id)
      .then(setCompanyInfo)
      .catch(error => console.error('Error fetching company info:', error));
  }, [organization?.id]);

  const logoUri = companyLogo || companyInfo?.logo_url || null;
  // What Print, PDF and both emails put in the header.
  const documentCompany = { ...(companyInfo ?? {}), logo_url: logoUri };

  // HT-89: asks through the shared confirm dialog (HT-84). Note that no
  // caller passes onDelete today, so the Delete button never renders; if it
  // is wired up inside invoices.tsx's RN Modal, FeedbackHost's dialog will
  // sit under that modal's layer (see the Portal.Host note there).
  const handleDelete = async () => {
    if (!onDelete) return;
    const ok = await confirm({
      title: 'Delete invoice',
      message: `Delete invoice #${safeInvoice.invoice_number}? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    console.log('Deleting invoice with ID:', safeInvoice.uid);
    onDelete(safeInvoice.uid);
  };

  // Anything already paid or overdue is left alone so sending can never walk
  // a payment state backwards.
  const recipientEmail = safeInvoice.client?.email;
  const isSendableStatus = SENDABLE_STATUSES.includes(safeInvoice.status);
  const canSend = isSendableStatus && !!recipientEmail;
  const isEstimate = safeInvoice.status === 'estimate';
  const approvedAt = safeInvoice.approved_at ?? null;

  const sendDisabledReason = !isSendableStatus
    ? `A "${labelText(invoiceStatuses, safeInvoice.status)}" document cannot be emailed from here.`
    : !recipientEmail
      ? 'This client has no email address on file.'
      : null;

  // The approval email starts from these two lines; both stay editable.
  const openSendDialog = () => {
    if (isEstimate) {
      const clientName = safeInvoice.client?.name?.trim() || 'there';
      const jobRef = describeJob(safeInvoice.job);
      setApprovalSubject(`#${safeInvoice.invoice_number}: Estimate for Approval`);
      setApprovalMessage(
        jobRef
          ? `Hi ${clientName}, Please see your estimate for ${jobRef} below:`
          : `Hi ${clientName}, Please see your estimate below:`,
      );
    }
    setShowSendDialog(true);
  };

  // Calls an edge function and turns its { error } body into a thrown Error.
  // On a non-2xx, supabase-js only says "Edge Function returned a non-2xx
  // status code"; the function's reason is on error.context.
  const invokeSendFunction = async (name: string, body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) {
      let reason = error.message;
      try {
        const payload = await error.context?.json();
        if (payload?.error) reason = payload.error;
      } catch {
        // Body was not JSON; keep the generic message.
      }
      throw new Error(reason);
    }
    if (data?.error) {
      throw new Error(data.error);
    }
    return data;
  };

  const handleSend = async () => {
    setShowSendDialog(false);
    const documentLabel = invoiceDocumentLabel(safeInvoice.status);

    try {
      setSendLoading(true);

      let sentTo = recipientEmail;

      if (isEstimate) {
        // HT-10: the function wraps the rendered estimate in the approval
        // email (subject, message, total, Approve button) and sends it to the
        // client and to the user who created the estimate. It builds the
        // approval link itself so the token never leaves the server.
        const subject = approvalSubject.trim();
        if (!subject) throw new Error('The email needs a subject.');
        const data = await invokeSendFunction('send-estimate-approval', {
          invoiceId: safeInvoice.uid,
          subject,
          message: approvalMessage,
          document: renderInvoiceDocument(safeInvoice, items, documentCompany, companyDocuments),
        });
        if (Array.isArray(data?.sentTo) && data.sentTo.length > 0) {
          sentTo = data.sentTo.join(' and ');
        }
      } else {
        // Render exactly what the Print action renders, so the client receives
        // the same document the sender just looked at.
        const html = generateInvoiceHTML(safeInvoice, items, documentCompany, companyDocuments);
        // HT-87: the function attaches the company documents itself, so the
        // files never come down to the browser.
        await invokeSendFunction('send-invoice', {
          invoiceId: safeInvoice.uid,
          to: recipientEmail,
          subject: `${documentLabel} #${safeInvoice.invoice_number} from ${companyInfo?.business_name || 'HandyTally'}`,
          html,
        });
      }

      // Only record the send once the provider has accepted the message.
      // sent_at is written rather than the status, so an estimate stays an
      // estimate (until the client approves it) and a payment state is never
      // overwritten.
      const sentTimestamp = new Date().toISOString();
      const { error: stampError } = await supabase
        .from('invoices')
        .update({ sent_at: sentTimestamp })
        .eq('uid', safeInvoice.uid);

      if (stampError) {
        // The client has the email; failing to record that is not worth
        // presenting as a failed send, but it must not pass silently either.
        console.error('Document was emailed but sent_at could not be saved:', stampError);
        notify(`${documentLabel} sent to ${sentTo}, but recording the send failed. It may still show as unsent.`, 'error');
      } else {
        setSentAt(sentTimestamp);
        notify(`${documentLabel} sent to ${sentTo}.`, 'success');
      }

      onSent?.();
    } catch (error) {
      console.error('Error sending document:', error);
      notify(`Failed to send the ${documentLabel.toLowerCase()}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      setSendLoading(false);
    }
  };

  const handlePrint = async () => {
    try {
      setPrintLoading(true);
      
      // Generate HTML for the invoice
      const html = generateInvoiceHTML(safeInvoice, items, documentCompany, companyDocuments);
      
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
      notify('Failed to generate PDF. Please try again.', 'error');
    } finally {
      setPrintLoading(false);
    }
  };

  // Items arrive through the `items` prop (the list row does not carry them);
  // the JSON column on the invoice is only a fallback.
  const lineItems: InvoiceItem[] = items && items.length > 0 ? items : safeInvoice.invoice_items;

  const documentLabel = invoiceDocumentLabel(safeInvoice.status);

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
      {/* Action bar, mirroring the Cancel / Save pair on the editor. */}
      <View style={[doc.actionBar, { justifyContent: 'flex-end', flexWrap: 'wrap' }]}>
        <View style={styles.actionGroup}>
          {onDelete && isEditable && !isEditing && (
            <Button
              mode="text"
              onPress={handleDelete}
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
            onPress={openSendDialog}
            loading={sendLoading}
            disabled={!canSend || sendLoading}
            buttonColor={GREEN}
            textColor="#ffffff"
            icon="email-send"
            style={{ borderRadius: 4, minWidth: 140 }}
            labelStyle={{ fontSize: 14, fontWeight: '600' }}
          >
            {isEstimate
              ? (sentAt ? 'Send for Approval Again' : 'Send for Approval')
              : (sentAt ? 'Send Again' : `Send ${documentLabel}`)}
          </Button>
        </View>
      </View>

      {(sendDisabledReason || sentAt || approvedAt) && (
        <View style={styles.sendHintRow}>
          {sendDisabledReason && <Text style={styles.sendHint}>{sendDisabledReason}</Text>}
          {sentAt && <Text style={styles.sendHint}>Last sent {formatDate(sentAt)}</Text>}
          {approvedAt && <Text style={styles.sendHint}>Approved by the client {formatDate(approvedAt)}</Text>}
        </View>
      )}

      <View style={{ paddingHorizontal: 16 }}>
        <View style={doc.sheet}>
          {/* ── Header: company block on the left, document meta on the right ── */}
          <View style={doc.headerRow}>
            <View style={doc.headerLeft}>
              {logoUri ? (
                <Image
                  source={{ uri: logoUri }}
                  style={doc.logo}
                />
              ) : null}
              {companyInfo?.business_name ? (
                <Text style={doc.companyName}>{companyInfo.business_name}</Text>
              ) : null}

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
                <Text style={styles.fieldValue}>{labelText(invoiceStatuses, safeInvoice.status)}</Text>
              </View>
            </View>
          </View>

          <CustomFieldsView defs={invoiceCustomFields} values={(safeInvoice as any).custom_fields} />

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

          {/* ── Licences & Insurance (HT-78) ── */}
          {companyDocuments.length > 0 && (
            <View style={doc.notesSection}>
              <Text style={doc.sectionLabel}>Licences &amp; Insurance</Text>
              <View style={styles.notesBox}>
                {companyDocuments.map((companyDoc, i) => (
                  <Text key={i} style={{ fontSize: 14, color: INK, marginBottom: i < companyDocuments.length - 1 ? 4 : 0 }}>
                    <Text style={{ fontWeight: '600' }}>{companyDoc.label}</Text>
                    {companyDoc.value ? ` — ${companyDoc.value}` : ''}
                    {companyDoc.fileName ? ` (attached: ${companyDoc.fileName})` : ''}
                  </Text>
                ))}
              </View>
            </View>
          )}

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
        {isEstimate ? (
          // HT-10: the approval email. Subject and message are the user's to
          // change; the rendered estimate, the total and the Approve button
          // are added by the send-estimate-approval function.
          <Dialog visible={showSendDialog} onDismiss={() => setShowSendDialog(false)} style={styles.approvalDialog}>
            <Dialog.Title>Send for Approval</Dialog.Title>
            <Dialog.Content>
              <TextInput
                mode="outlined"
                label="Subject"
                value={approvalSubject}
                onChangeText={setApprovalSubject}
                style={styles.approvalField}
                dense
              />
              <TextInput
                mode="outlined"
                label="Message"
                value={approvalMessage}
                onChangeText={setApprovalMessage}
                multiline
                numberOfLines={5}
                style={[styles.approvalField, styles.approvalMessage]}
              />
              <Text style={styles.sendHint}>
                Goes to {recipientEmail} and to the user who created this estimate, with the
                estimate, its total and an Approve button. Approving turns it into a work order.
              </Text>
              {sentAt && (
                <Text style={styles.sendHint}>
                  Already sent on {formatDate(sentAt)}. Sending again emails it a second time with the same link.
                </Text>
              )}
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setShowSendDialog(false)}>Cancel</Button>
              <Button onPress={handleSend} disabled={!approvalSubject.trim()}>Send</Button>
            </Dialog.Actions>
          </Dialog>
        ) : (
          <Dialog visible={showSendDialog} onDismiss={() => setShowSendDialog(false)}>
            <Dialog.Title>Send {documentLabel}</Dialog.Title>
            <Dialog.Content>
              <Text>
                Email {documentLabel} #{safeInvoice.invoice_number} to {recipientEmail}?
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
        )}
      </Portal>
    </View>
  );
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
  approvalDialog: {
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  approvalField: {
    marginBottom: 12,
    backgroundColor: '#ffffff',
  },
  approvalMessage: {
    minHeight: 110,
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
