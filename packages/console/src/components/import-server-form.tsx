import { Button, PasswordInput, Input, FormField } from '@triplit/ui';
import { useForm } from '@mantine/form';
import { useCallback, useState } from 'react';
import {
  JWTPayloadIsOfCorrectForm,
  isServiceToken,
} from '../utils/remote-helpers';

export interface ImportServerFormValues {
  serviceToken: string;
  displayName: string;
  serverUrl: string;
}

export function ImportServerForm({
  onSubmit,
  serverHint,
}: {
  onSubmit: (values: ImportServerFormValues) => void;
  serverHint?: ImportServerFormValues;
}) {
  const {
    serviceToken: tokenHint,
    serverUrl: serverUrlHint,
    displayName: displayNameHint,
  } = serverHint ?? {};

  const [imported, setImported] = useState(
    tokenHint && isServiceToken(tokenHint)
  );

  const form = useForm<ImportServerFormValues>({
    initialValues: {
      serviceToken: tokenHint ?? '',
      displayName: displayNameHint ?? '',
      serverUrl: serverUrlHint ?? '',
    },

    validate: {
      serviceToken: (value) =>
        !isServiceToken(value)
          ? 'Provided token is not a service token, please verify that it has the { "x-triplit-token-type" : "secret" } claim set.'
          : null,

      displayName: (value) =>
        value.length < 3 ? 'Display name is too short' : null,
    },
    initialErrors: {
      token:
        tokenHint && !isServiceToken(tokenHint)
          ? 'Provided token is not a service token, please verify that it has the { "x-triplit-token-type" : "secret" } claim set.'
          : null,
    },
  });
  console.log({ values: form.values, errors: form.errors });

  const importSecretKey = useCallback(() => {
    try {
      const { hasError, error } = form.validateField('serviceToken');
      if (hasError) {
        form.setFieldError('serviceToken', error);
        return;
      }
      setImported(true);
    } catch (e) {
      form.setFieldError(
        'serviceToken',
        'Provided token is not a service token, please verify that it has the { "x-triplit-token-type" : "secret" } claim set.'
      );
    }
  }, [form]);

  return (
    <form className="flex flex-col gap-6" onSubmit={form.onSubmit(onSubmit)}>
      <FormField
        label="Triplit Service Token"
        description="The Service Token for your Triplit project can be found at https://triplit.dev/dashboard"
        error={form.getInputProps('serviceToken').error}
      >
        <PasswordInput
          autoComplete="off"
          placeholder="*****"
          {...form.getInputProps('serviceToken')}
        />
      </FormField>
      {!imported && (
        <Button
          disabled={form.values.serviceToken.length === 0}
          onClick={importSecretKey}
        >
          Import
        </Button>
      )}
      {imported && (
        <>
          <FormField
            label="Database server"
            description="The URL of the server to sync with."
            error={form.getInputProps('serverUrl').error}
          >
            <Input
              placeholder="https://project-id.triplit:io"
              {...form.getInputProps('serverUrl')}
            />
          </FormField>
          <FormField
            label="Project alias"
            description="A name for managing this instance of the project that will only be used for display in the console"
            error={form.getInputProps('displayName').error}
          >
            <Input
              placeholder="prod-todos"
              {...form.getInputProps('displayName')}
            />
          </FormField>
          <Button type="submit">Submit</Button>
        </>
      )}
    </form>
  );
}
