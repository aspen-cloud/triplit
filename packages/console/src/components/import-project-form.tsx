import { Button, PasswordInput, Input, FormField } from '@triplit/ui';
import { useForm } from '@mantine/form';
import { useCallback, useState } from 'react';
import { JWTPayloadIsOfCorrectForm } from '../utils/server';

export interface ImportProjectFormValues {
  token: string;
  displayName: string;
  server: string;
}

export function ImportProjectForm({
  onSubmit,
  projectHint,
}: {
  onSubmit: (values: ImportProjectFormValues) => void;
  projectHint?: ImportProjectFormValues;
}) {
  const {
    token: tokenHint,
    server: serverHint,
    displayName: displayNameHint,
  } = projectHint ?? {};

  const [imported, setImported] = useState(
    tokenHint && JWTPayloadIsOfCorrectForm(tokenHint)
  );

  const form = useForm<ImportProjectFormValues>({
    initialValues: {
      token: tokenHint ?? '',
      displayName: displayNameHint ?? '',
      server: serverHint ?? '',
    },

    validate: {
      token: (value) =>
        !JWTPayloadIsOfCorrectForm(value)
          ? 'Service token has malformed metadata'
          : null,

      displayName: (value) =>
        value.length < 3 ? 'Display name is too short' : null,
    },
    initialErrors: {
      token:
        tokenHint && !JWTPayloadIsOfCorrectForm(tokenHint)
          ? 'Service token has malformed metadata, please check that it is correct'
          : null,
    },
  });

  const importSecretKey = useCallback(() => {
    try {
      const { hasError, error } = form.validateField('token');
      if (hasError) {
        form.setFieldError('token', error);
        return;
      }
      setImported(true);
    } catch (e) {
      form.setFieldError(
        'token',
        'Unabled to parse Service Token, please check that it is correct'
      );
    }
  }, [form]);

  return (
    <form className="flex flex-col gap-6" onSubmit={form.onSubmit(onSubmit)}>
      <FormField
        label="Triplit Service Token"
        description="The Service Token for your Triplit project can be found at https://triplit.dev/dashboard"
        error={form.getInputProps('token').error}
      >
        <PasswordInput
          autoComplete="off"
          placeholder="*****"
          {...form.getInputProps('token')}
        />
      </FormField>
      {!imported && (
        <Button
          disabled={form.values.token.length === 0}
          onClick={importSecretKey}
        >
          Import
        </Button>
      )}
      {imported && (
        <>
          <FormField
            label="Sync server address"
            description="The URL of the server to sync with."
            error={form.getInputProps('server').error}
          >
            <Input
              placeholder="project-id.localhost:8787"
              {...form.getInputProps('server')}
            />
          </FormField>
          <FormField
            label="Project alias"
            description="A name for managing this instance of the project that will only be used for display in the console"
            error={form.getInputProps('displayName').error}
          >
            <Input
              placeholder="local-staging"
              {...form.getInputProps('displayName')}
            />
          </FormField>
          <Button type="submit">Submit</Button>
        </>
      )}
    </form>
  );
}
