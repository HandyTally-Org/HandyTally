import { useRef } from 'react';
import { FormDialog, FormDialogFooter } from './FormDialog';
import { JobForm, JobFormHandle, JobFormDefaults } from './JobForm';

// The New Job popup: the existing JobForm (client picker, dates, status,
// assignee) inside the shared dialog shell, with the buttons in the footer.

type JobDialogProps = {
  visible: boolean;
  title?: string;
  subtitle?: string;
  /** Start/end to prefill, e.g. from a calendar cell. */
  defaults?: JobFormDefaults;
  submitting: boolean;
  onDismiss: () => void;
  onSubmit: (job: any) => void;
};

export function JobDialog({
  visible,
  title = 'Add job',
  subtitle,
  defaults,
  submitting,
  onDismiss,
  onSubmit,
}: JobDialogProps) {
  const formRef = useRef<JobFormHandle>(null);

  return (
    <FormDialog
      visible={visible}
      title={title}
      subtitle={subtitle}
      onDismiss={onDismiss}
      maxWidth={640}
      footer={
        <FormDialogFooter
          onCancel={onDismiss}
          onSubmit={() => formRef.current?.submit()}
          submitLabel="Add job"
          submitting={submitting}
        />
      }
    >
      {/* Mounted only while open so the form starts blank each time. */}
      {visible ? (
        <JobForm ref={formRef} embedded defaults={defaults} submitting={submitting} onSubmit={onSubmit} onCancel={onDismiss} />
      ) : null}
    </FormDialog>
  );
}
