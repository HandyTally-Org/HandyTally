import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text, Button, IconButton, ActivityIndicator, Portal, Dialog, Snackbar, TextInput } from 'react-native-paper';
import { supabase } from '../lib/supabase';
import { FormDialog, FormDialogFooter, FormField, formTheme, inputStyle } from './FormDialog';

// The Notes entry under DOCUMENTATION on a client or a job: a list of titled
// notes, an Add note button that opens a compact popup, and edit/delete on
// each note. Pass exactly one of clientId or jobId.

export type Note = {
  id: number;
  title: string;
  body: string;
  created_at: string;
  updated_at: string | null;
};

type NotesSectionProps = {
  clientId?: string | number;
  jobId?: string | number;
};

type DialogState = { mode: 'add' } | { mode: 'edit'; note: Note } | null;

function formatWhen(note: Note): string {
  const iso = note.updated_at || note.created_at;
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return note.updated_at ? `Edited ${label}` : label;
}

export function NotesSection({ clientId, jobId }: NotesSectionProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const parentColumn = clientId != null ? 'client_id' : 'job_id';
  const parentId = clientId != null ? clientId : jobId;

  const fetchNotes = useCallback(async () => {
    if (parentId == null) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('notes')
        .select('id, title, body, created_at, updated_at')
        .eq(parentColumn, parentId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setNotes(data || []);
    } catch (error: any) {
      console.error('Error loading notes:', error);
      setMessage(`Could not load notes: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [parentColumn, parentId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const saveNote = async (draft: { title: string; body: string }) => {
    if (!dialog) return;
    try {
      setSubmitting(true);
      if (dialog.mode === 'add') {
        const { error } = await supabase
          .from('notes')
          .insert([{ ...draft, [parentColumn]: parentId }]);
        if (error) throw error;
        setMessage('Note added');
      } else {
        const { error } = await supabase
          .from('notes')
          .update({ ...draft, updated_at: new Date().toISOString() })
          .eq('id', dialog.note.id);
        if (error) throw error;
        setMessage('Note saved');
      }
      setDialog(null);
      await fetchNotes();
    } catch (error: any) {
      console.error('Error saving note:', error);
      setMessage(`Could not save note: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteNote = async () => {
    if (!noteToDelete) return;
    try {
      setSubmitting(true);
      const { error } = await supabase.from('notes').delete().eq('id', noteToDelete.id);
      if (error) throw error;
      setNotes((current) => current.filter((note) => note.id !== noteToDelete.id));
      setMessage('Note deleted');
    } catch (error: any) {
      console.error('Error deleting note:', error);
      setMessage(`Could not delete note: ${error.message}`);
    } finally {
      setSubmitting(false);
      setNoteToDelete(null);
    }
  };

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.heading}>Notes</Text>
        <Button mode="contained" icon="plus" onPress={() => setDialog({ mode: 'add' })} style={styles.addButton}>
          Add note
        </Button>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" />
          <Text style={styles.loadingText}>Loading notes...</Text>
        </View>
      ) : notes.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No notes yet</Text>
          <Text style={styles.emptyText}>Keep site details, reminders and anything worth remembering here.</Text>
        </View>
      ) : (
        notes.map((note) => (
          <Pressable
            key={note.id}
            onPress={() => setDialog({ mode: 'edit', note })}
            style={(state) => [styles.note, (state as { hovered?: boolean }).hovered && styles.noteHover]}
            accessibilityRole="button"
            accessibilityLabel={`Edit note ${note.title}`}
          >
            <View style={styles.noteText}>
              <Text style={styles.noteTitle}>{note.title}</Text>
              <Text style={styles.noteWhen}>{formatWhen(note)}</Text>
              {note.body ? (
                <Text style={styles.noteBody} numberOfLines={4}>
                  {note.body}
                </Text>
              ) : null}
            </View>
            <View style={styles.noteActions}>
              <IconButton icon="pencil" size={18} onPress={() => setDialog({ mode: 'edit', note })} accessibilityLabel="Edit note" />
              <IconButton icon="delete" size={18} iconColor="#DC2626" onPress={() => setNoteToDelete(note)} accessibilityLabel="Delete note" />
            </View>
          </Pressable>
        ))
      )}

      <NoteDialog
        visible={dialog !== null}
        note={dialog?.mode === 'edit' ? dialog.note : null}
        submitting={submitting}
        onDismiss={() => setDialog(null)}
        onSubmit={saveNote}
      />

      <Portal>
        <Dialog visible={noteToDelete !== null} onDismiss={() => setNoteToDelete(null)} style={styles.confirm}>
          <Dialog.Title>Delete note</Dialog.Title>
          <Dialog.Content>
            <Text>Delete "{noteToDelete?.title}"? This cannot be undone.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setNoteToDelete(null)} disabled={submitting}>Cancel</Button>
            <Button onPress={deleteNote} textColor="#DC2626" loading={submitting} disabled={submitting}>
              Delete
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar visible={message !== ''} onDismiss={() => setMessage('')} duration={3000}>
        {message}
      </Snackbar>
    </View>
  );
}

type NoteDialogProps = {
  visible: boolean;
  /** The note being edited; null for a blank add form. */
  note: Note | null;
  submitting: boolean;
  onDismiss: () => void;
  onSubmit: (draft: { title: string; body: string }) => void;
};

function NoteDialog({ visible, note, submitting, onDismiss, onSubmit }: NoteDialogProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [titleError, setTitleError] = useState<string | undefined>();

  // Start from the note (or blank) every time the popup opens.
  useEffect(() => {
    if (!visible) return;
    setTitle(note?.title ?? '');
    setBody(note?.body ?? '');
    setTitleError(undefined);
  }, [visible, note]);

  const submit = () => {
    if (!title.trim()) {
      setTitleError('Give the note a title');
      return;
    }
    onSubmit({ title: title.trim(), body: body.trim() });
  };

  return (
    <FormDialog
      visible={visible}
      title={note ? 'Edit note' : 'New note'}
      subtitle={note ? formatWhen(note) : undefined}
      onDismiss={onDismiss}
      maxWidth={560}
      footer={
        <FormDialogFooter
          onCancel={onDismiss}
          onSubmit={submit}
          submitLabel={note ? 'Save changes' : 'Add note'}
          submitting={submitting}
        />
      }
    >
      <FormField error={titleError}>
        <TextInput
          mode="outlined"
          label="Title"
          value={title}
          onChangeText={(text) => {
            setTitle(text);
            if (titleError) setTitleError(undefined);
          }}
          error={!!titleError}
          style={inputStyle}
          autoFocus
        />
      </FormField>
      <FormField>
        <TextInput
          mode="outlined"
          label="Note"
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={8}
          style={[inputStyle, styles.bodyInput]}
        />
      </FormField>
    </FormDialog>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  heading: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  addButton: {
    borderRadius: 8,
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
  },
  loadingText: {
    color: formTheme.mutedText,
  },
  empty: {
    padding: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: formTheme.border,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: formTheme.text,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 13,
    color: formTheme.mutedText,
    textAlign: 'center',
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: formTheme.border,
    borderRadius: 12,
    backgroundColor: formTheme.background,
  },
  noteHover: {
    backgroundColor: '#F9FAFB',
  },
  noteText: {
    flex: 1,
  },
  noteTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: formTheme.text,
  },
  noteWhen: {
    fontSize: 12,
    color: formTheme.mutedText,
    marginTop: 2,
    marginBottom: 6,
  },
  noteBody: {
    fontSize: 14,
    lineHeight: 20,
    color: formTheme.text,
  },
  noteActions: {
    flexDirection: 'row',
    marginLeft: 8,
    marginTop: -8,
    marginRight: -8,
  },
  confirm: {
    maxWidth: 420,
    alignSelf: 'center',
    borderRadius: 14,
    backgroundColor: formTheme.background,
  },
  bodyInput: {
    minHeight: 160,
  },
});
