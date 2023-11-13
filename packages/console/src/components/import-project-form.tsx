import { Button, PasswordInput, Input, FormField } from '@triplit/ui';
import { useForm } from '@mantine/form';
import { useCallback, useEffect, useState } from 'react';
import {
  getProjectIdFromApiKey,
  JWTPayloadIsOfCorrectForm,
} from '../utils/server';
import { consoleClient, formConsolePrimaryKey } from '../../triplit/client';
import { TokenReadError } from '@triplit/server-core';

export interface ImportProjectFormValues {
  token: string;
  displayName: string;
  server: string;
}

export async function addProjectToConsole(formValues: ImportProjectFormValues) {
  const { displayName, token, server } = formValues;
  try {
    const projectId = getProjectIdFromApiKey(token);
    const [protocol, origin] = server.split('://');
    const primaryKey = formConsolePrimaryKey(projectId, server);
    await consoleClient.insert('projects', {
      displayName,
      token,
      projectId,
      server: origin,
      secure: protocol === 'https',
      id: primaryKey,
    });
    return primaryKey;
  } catch (e) {
    console.error(e);
    throw new TokenReadError();
  }
}

export function ImportProjectForm({
  onSubmit,
  projectHint,
}: {
  onSubmit: (values: ImportProjectFormValues) => void;
  projectHint?: ImportProjectFormValues;
}) {
  const [imported, setImported] = useState(false);
  const {
    token: tokenHint,
    server: serverHint,
    displayName: displayNameHint,
  } = projectHint ?? {};
  const form = useForm<ImportProjectFormValues>({
    initialValues: {
      token: '',
      displayName: '',
      server: '',
    },

    validate: {
      token: (value) =>
        !JWTPayloadIsOfCorrectForm(value)
          ? 'Secret key has malformed metadata'
          : null,

      displayName: (value) =>
        value.length < 3 ? 'Display name is too short' : null,
    },
  });

  useEffect(() => {
    if (!projectHint) return;
    if (
      form.values.token === tokenHint &&
      form.values.server === serverHint &&
      form.values.displayName === displayNameHint
    ) {
      return;
    }
    form.setValues(projectHint ?? {});
    if (tokenHint && JWTPayloadIsOfCorrectForm(tokenHint)) {
      setImported(true);
    } else {
      form.setFieldError(
        'token',
        'Secret key has malformed metadata, please check that it is correct'
      );
    }
  }, [projectHint, tokenHint, serverHint, displayNameHint, form]);

  const importSecretKey = useCallback(() => {
    try {
      const { hasError, error } = form.validateField('token');
      if (hasError) {
        form.setFieldError('token', error);
        return;
      }
      const projectId = getProjectIdFromApiKey(form.values.token);
      form.setValues({ server: `https://${projectId}.triplit.io` });
      setImported(true);
    } catch (e) {
      form.setFieldError(
        'token',
        'Unabled to parse secret key, please check that it is correct'
      );
    }
  }, [form]);

  return (
    <form className="flex flex-col gap-6" onSubmit={form.onSubmit(onSubmit)}>
      <FormField
        label="Triplit secret key"
        description="The secret key for your Triplit project can be found at triplit.dev/console"
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
